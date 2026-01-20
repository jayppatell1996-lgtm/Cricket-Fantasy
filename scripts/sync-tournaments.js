/**
 * Tournament Sync Script
 * =======================
 * Syncs player data from CricketData.org to Turso database
 * 
 * Usage:
 *   node scripts/sync-tournaments.js
 *   node scripts/sync-tournaments.js --tournament t20_wc_2026
 *   node scripts/sync-tournaments.js --search "India vs New Zealand"
 * 
 * Environment Variables Required:
 *   CRICKET_API_KEY - Your CricketData.org API key
 *   TURSO_DATABASE_URL - Your Turso database URL
 *   TURSO_AUTH_TOKEN - Your Turso auth token
 */

// Load .env file FIRST
import dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@libsql/client';
import {
  searchSeries,
  getSeriesSquad,
  getSeriesInfo,
  getCurrentMatches,
  transformPlayer,
} from './cricket-api.js';

// ============================================
// DATABASE CONNECTION
// ============================================

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// ============================================
// TOURNAMENT CONFIGURATIONS
// ============================================

/**
 * Map of our tournament IDs to search terms for CricketData.org
 * Update these with actual series IDs once you find them
 */
const TOURNAMENT_CONFIG = {
  test_ind_nz: {
    name: 'India vs NZ T20 Series',
    searchTerms: ['India vs New Zealand T20', 'IND vs NZ T20 2026'],
    seriesId: null, // Will be populated after search
    teams: ['IND', 'NZ'],
    isTest: true,
  },
  t20_wc_2026: {
    name: 'T20 World Cup 2026',
    searchTerms: ['ICC Mens T20 World Cup 2026', 'T20 World Cup 2026', 'T20 WC 2026'],
    // Known Series ID from CricketData.org for Men's T20 WC 2026
    seriesId: '0cdf6736-ad9b-4e95-a647-5ee3a99c5510',
    teams: ['IND', 'AUS', 'ENG', 'PAK', 'NZ', 'SA', 'WI', 'SL', 'BAN', 'AFG', 'ZIM', 'IRE', 'SCO', 'NAM', 'USA', 'NEP'],
    isTest: false,
  },
  ipl_2026: {
    name: 'IPL 2026',
    searchTerms: ['Indian Premier League 2026', 'IPL 2026'],
    // Known Series ID from CricketData.org for IPL 2026
    seriesId: '87c62aac-bc3c-4738-ab93-19da0690488f',
    teams: ['CSK', 'MI', 'RCB', 'KKR', 'DC', 'PBKS', 'RR', 'SRH', 'GT', 'LSG'],
    isTest: false,
  },
};

// ============================================
// SYNC FUNCTIONS
// ============================================

/**
 * Find series ID by searching CricketData.org
 * Prefers Men's tournaments and excludes Women's/Qualifiers
 */
async function findSeriesId(tournamentId) {
  const config = TOURNAMENT_CONFIG[tournamentId];
  if (!config) {
    throw new Error(`Unknown tournament: ${tournamentId}`);
  }
  
  console.log(`\n🔍 Searching for series: ${config.name}`);
  
  for (const searchTerm of config.searchTerms) {
    console.log(`   Trying: "${searchTerm}"`);
    
    try {
      const results = await searchSeries(searchTerm);
      
      if (results && results.length > 0) {
        console.log(`   Found ${results.length} results:`);
        results.slice(0, 5).forEach((series, i) => {
          console.log(`   ${i + 1}. ${series.name} (ID: ${series.id})`);
        });
        
        // Filter results: prefer "Mens", exclude "Women", "Qualifier", "Regional"
        const filteredResults = results.filter(series => {
          const name = series.name.toLowerCase();
          // Exclude women's tournaments
          if (name.includes('women') || name.includes("women's")) return false;
          // Exclude qualifiers and regional tournaments  
          if (name.includes('qualifier') || name.includes('regional')) return false;
          return true;
        });
        
        // Prefer results with "Mens" in the name
        const mensResults = filteredResults.filter(s => 
          s.name.toLowerCase().includes('mens') || s.name.toLowerCase().includes("men's")
        );
        
        if (mensResults.length > 0) {
          console.log(`   ✅ Selected: ${mensResults[0].name}`);
          return mensResults[0];
        }
        
        if (filteredResults.length > 0) {
          console.log(`   ✅ Selected: ${filteredResults[0].name}`);
          return filteredResults[0];
        }
        
        // Fallback to first result if no better match
        console.log(`   ⚠️ No ideal match, using: ${results[0].name}`);
        return results[0];
      }
    } catch (error) {
      console.log(`   Error: ${error.message}`);
    }
    
    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log(`   ❌ No series found for ${config.name}`);
  return null;
}

/**
 * Ensure tournament exists in database before inserting players
 */
async function ensureTournamentExists(tournamentId) {
  const config = TOURNAMENT_CONFIG[tournamentId];
  if (!config) {
    throw new Error(`Unknown tournament: ${tournamentId}`);
  }
  
  console.log(`\n📋 Ensuring tournament exists in database: ${tournamentId}`);
  
  try {
    // Check if tournament already exists
    const existing = await db.execute({
      sql: `SELECT id FROM tournaments WHERE id = ?`,
      args: [tournamentId],
    });
    
    if (existing.rows.length > 0) {
      console.log(`   ✓ Tournament already exists`);
      return true;
    }
    
    // Insert tournament
    const tournamentData = {
      test_ind_nz: {
        name: 'India vs NZ T20 Series',
        shortName: 'IND vs NZ',
        type: 'test',
        startDate: '2026-01-15',
        endDate: '2026-01-25',
        isTest: 1,
      },
      t20_wc_2026: {
        name: 'T20 World Cup 2026',
        shortName: 'T20 WC 2026',
        type: 'worldcup',
        startDate: '2026-02-09',
        endDate: '2026-03-07',
        isTest: 0,
      },
      ipl_2026: {
        name: 'IPL 2026',
        shortName: 'IPL 2026',
        type: 'league',
        startDate: '2026-03-22',
        endDate: '2026-05-26',
        isTest: 0,
      },
    };
    
    const data = tournamentData[tournamentId];
    if (!data) {
      console.log(`   ⚠️ No tournament data for ${tournamentId}`);
      return false;
    }
    
    await db.execute({
      sql: `INSERT OR REPLACE INTO tournaments 
            (id, name, short_name, type, start_date, end_date, teams, is_test, is_active) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      args: [
        tournamentId,
        data.name,
        data.shortName,
        data.type,
        data.startDate,
        data.endDate,
        JSON.stringify(config.teams),
        data.isTest,
      ],
    });
    
    console.log(`   ✓ Tournament created: ${data.name}`);
    return true;
    
  } catch (error) {
    console.error(`   ✗ Failed to ensure tournament: ${error.message}`);
    return false;
  }
}

/**
 * Sync players for a specific tournament
 */
async function syncTournamentPlayers(tournamentId, seriesId = null) {
  const config = TOURNAMENT_CONFIG[tournamentId];
  if (!config) {
    throw new Error(`Unknown tournament: ${tournamentId}`);
  }
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🏏 Syncing: ${config.name}`);
  console.log(`${'='.repeat(60)}`);
  
  // IMPORTANT: Ensure tournament exists in database first (for foreign key)
  const tournamentCreated = await ensureTournamentExists(tournamentId);
  if (!tournamentCreated) {
    console.log(`❌ Could not create tournament. Aborting player sync.`);
    return [];
  }
  
  // Use series ID from: 1) parameter, 2) pre-configured, 3) search
  if (!seriesId && config.seriesId) {
    seriesId = config.seriesId;
    console.log(`\n📋 Using pre-configured series ID: ${seriesId}`);
  }
  
  if (!seriesId) {
    const series = await findSeriesId(tournamentId);
    if (series) {
      seriesId = series.id;
      config.seriesId = seriesId;
    }
  }
  
  if (!seriesId) {
    console.log(`⚠️ No series ID available. Using fallback player data.`);
    return await syncFallbackPlayers(tournamentId);
  }
  
  // Fetch squad from API
  console.log(`\n📡 Fetching squad for series: ${seriesId}`);
  
  try {
    const squadData = await getSeriesSquad(seriesId);
    
    if (!squadData || squadData.length === 0) {
      console.log(`⚠️ No squad data returned. Using fallback.`);
      return await syncFallbackPlayers(tournamentId);
    }
    
    const allPlayers = [];
    
    // Process each team's squad
    for (const team of squadData) {
      const teamCode = team.teamName?.substring(0, 3).toUpperCase() || 'UNK';
      console.log(`\n👥 Processing ${team.teamName} (${teamCode})`);
      
      if (team.players && team.players.length > 0) {
        for (const player of team.players) {
          const transformedPlayer = transformPlayer(player, teamCode, tournamentId);
          allPlayers.push(transformedPlayer);
          console.log(`   ✓ ${player.name} (${transformedPlayer.position})`);
        }
      }
      
      // Rate limiting between teams
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    // Save to database
    await savePlayersToDb(allPlayers);
    
    return allPlayers;
    
  } catch (error) {
    console.log(`❌ API Error: ${error.message}`);
    console.log(`Using fallback player data...`);
    return await syncFallbackPlayers(tournamentId);
  }
}

/**
 * Save players to Turso database
 */
async function savePlayersToDb(players) {
  console.log(`\n💾 Saving ${players.length} players to database...`);
  
  let successCount = 0;
  let errorCount = 0;
  
  for (const player of players) {
    try {
      await db.execute({
        sql: `INSERT OR REPLACE INTO players 
              (id, name, team, position, price, avg_points, total_points, tournament_id) 
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          player.id,
          player.name,
          player.team,
          player.position,
          player.price,
          player.avgPoints,
          player.totalPoints,
          player.tournamentId,
        ],
      });
      successCount++;
    } catch (error) {
      console.error(`   ✗ Failed: ${player.name} - ${error.message}`);
      errorCount++;
    }
  }
  
  console.log(`\n✅ Saved: ${successCount} players`);
  if (errorCount > 0) {
    console.log(`❌ Failed: ${errorCount} players`);
  }
}

/**
 * Sync fallback player data when API doesn't have the series
 */
async function syncFallbackPlayers(tournamentId) {
  console.log(`\n📋 Using fallback player data for ${tournamentId}`);
  
  const fallbackPlayers = getFallbackPlayers(tournamentId);
  await savePlayersToDb(fallbackPlayers);
  
  return fallbackPlayers;
}

// ============================================
// FALLBACK PLAYER DATA
// ============================================

function getFallbackPlayers(tournamentId) {
  const players = [];
  
  if (tournamentId === 'test_ind_nz' || tournamentId === 't20_wc_2026') {
    // India Squad
    const indiaPlayers = [
      { name: 'Rohit Sharma', position: 'batter', price: 12.0, avgPoints: 42 },
      { name: 'Virat Kohli', position: 'batter', price: 12.5, avgPoints: 45 },
      { name: 'Suryakumar Yadav', position: 'batter', price: 11.0, avgPoints: 48 },
      { name: 'Shubman Gill', position: 'batter', price: 10.0, avgPoints: 38 },
      { name: 'Yashasvi Jaiswal', position: 'batter', price: 9.5, avgPoints: 36 },
      { name: 'Rishabh Pant', position: 'keeper', price: 10.5, avgPoints: 40 },
      { name: 'KL Rahul', position: 'keeper', price: 10.0, avgPoints: 38 },
      { name: 'Hardik Pandya', position: 'flex', price: 11.0, avgPoints: 52 },
      { name: 'Ravindra Jadeja', position: 'flex', price: 10.0, avgPoints: 48 },
      { name: 'Axar Patel', position: 'flex', price: 9.0, avgPoints: 42 },
      { name: 'Jasprit Bumrah', position: 'bowler', price: 11.5, avgPoints: 55 },
      { name: 'Mohammed Shami', position: 'bowler', price: 9.5, avgPoints: 45 },
      { name: 'Mohammed Siraj', position: 'bowler', price: 9.0, avgPoints: 42 },
      { name: 'Kuldeep Yadav', position: 'bowler', price: 8.5, avgPoints: 40 },
      { name: 'Arshdeep Singh', position: 'bowler', price: 8.0, avgPoints: 38 },
    ];
    
    indiaPlayers.forEach((p, i) => {
      players.push({
        id: `p_ind_${i + 1}`,
        ...p,
        team: 'IND',
        totalPoints: 0,
        tournamentId,
      });
    });
    
    // New Zealand Squad
    const nzPlayers = [
      { name: 'Kane Williamson', position: 'batter', price: 11.0, avgPoints: 40 },
      { name: 'Devon Conway', position: 'batter', price: 10.0, avgPoints: 38 },
      { name: 'Finn Allen', position: 'batter', price: 9.0, avgPoints: 35 },
      { name: 'Glenn Phillips', position: 'batter', price: 9.5, avgPoints: 42 },
      { name: 'Daryl Mitchell', position: 'batter', price: 9.0, avgPoints: 36 },
      { name: 'Tom Latham', position: 'keeper', price: 8.5, avgPoints: 32 },
      { name: 'Mark Chapman', position: 'flex', price: 8.0, avgPoints: 35 },
      { name: 'Rachin Ravindra', position: 'flex', price: 9.0, avgPoints: 40 },
      { name: 'Mitchell Santner', position: 'flex', price: 8.5, avgPoints: 38 },
      { name: 'Trent Boult', position: 'bowler', price: 10.0, avgPoints: 48 },
      { name: 'Tim Southee', position: 'bowler', price: 9.5, avgPoints: 45 },
      { name: 'Lockie Ferguson', position: 'bowler', price: 9.0, avgPoints: 42 },
      { name: 'Matt Henry', position: 'bowler', price: 8.5, avgPoints: 38 },
      { name: 'Ish Sodhi', position: 'bowler', price: 8.0, avgPoints: 35 },
    ];
    
    nzPlayers.forEach((p, i) => {
      players.push({
        id: `p_nz_${i + 1}`,
        ...p,
        team: 'NZ',
        totalPoints: 0,
        tournamentId,
      });
    });
  }
  
  if (tournamentId === 't20_wc_2026') {
    // Australia Squad
    const ausPlayers = [
      { name: 'David Warner', position: 'batter', price: 11.0, avgPoints: 42 },
      { name: 'Travis Head', position: 'batter', price: 10.5, avgPoints: 45 },
      { name: 'Steve Smith', position: 'batter', price: 10.0, avgPoints: 35 },
      { name: 'Mitchell Marsh', position: 'flex', price: 10.0, avgPoints: 42 },
      { name: 'Glenn Maxwell', position: 'flex', price: 11.5, avgPoints: 50 },
      { name: 'Marcus Stoinis', position: 'flex', price: 9.5, avgPoints: 42 },
      { name: 'Josh Inglis', position: 'keeper', price: 8.5, avgPoints: 32 },
      { name: 'Pat Cummins', position: 'bowler', price: 10.5, avgPoints: 48 },
      { name: 'Mitchell Starc', position: 'bowler', price: 10.0, avgPoints: 45 },
      { name: 'Adam Zampa', position: 'bowler', price: 9.0, avgPoints: 42 },
      { name: 'Josh Hazlewood', position: 'bowler', price: 9.5, avgPoints: 40 },
    ];
    
    ausPlayers.forEach((p, i) => {
      players.push({
        id: `p_aus_${i + 1}`,
        ...p,
        team: 'AUS',
        totalPoints: 0,
        tournamentId,
      });
    });
    
    // England Squad
    const engPlayers = [
      { name: 'Jos Buttler', position: 'keeper', price: 11.5, avgPoints: 45 },
      { name: 'Phil Salt', position: 'batter', price: 9.5, avgPoints: 40 },
      { name: 'Harry Brook', position: 'batter', price: 10.0, avgPoints: 42 },
      { name: 'Jonny Bairstow', position: 'batter', price: 9.5, avgPoints: 38 },
      { name: 'Ben Stokes', position: 'flex', price: 11.0, avgPoints: 48 },
      { name: 'Moeen Ali', position: 'flex', price: 9.0, avgPoints: 40 },
      { name: 'Liam Livingstone', position: 'flex', price: 9.5, avgPoints: 42 },
      { name: 'Jofra Archer', position: 'bowler', price: 10.0, avgPoints: 45 },
      { name: 'Mark Wood', position: 'bowler', price: 9.5, avgPoints: 42 },
      { name: 'Adil Rashid', position: 'bowler', price: 9.0, avgPoints: 40 },
      { name: 'Chris Jordan', position: 'bowler', price: 8.0, avgPoints: 35 },
    ];
    
    engPlayers.forEach((p, i) => {
      players.push({
        id: `p_eng_${i + 1}`,
        ...p,
        team: 'ENG',
        totalPoints: 0,
        tournamentId,
      });
    });
    
    // Pakistan Squad
    const pakPlayers = [
      { name: 'Babar Azam', position: 'batter', price: 12.0, avgPoints: 45 },
      { name: 'Mohammad Rizwan', position: 'keeper', price: 11.0, avgPoints: 42 },
      { name: 'Fakhar Zaman', position: 'batter', price: 9.0, avgPoints: 35 },
      { name: 'Iftikhar Ahmed', position: 'flex', price: 8.5, avgPoints: 35 },
      { name: 'Shadab Khan', position: 'flex', price: 9.0, avgPoints: 40 },
      { name: 'Shaheen Afridi', position: 'bowler', price: 10.5, avgPoints: 48 },
      { name: 'Haris Rauf', position: 'bowler', price: 9.0, avgPoints: 42 },
      { name: 'Naseem Shah', position: 'bowler', price: 9.0, avgPoints: 40 },
    ];
    
    pakPlayers.forEach((p, i) => {
      players.push({
        id: `p_pak_${i + 1}`,
        ...p,
        team: 'PAK',
        totalPoints: 0,
        tournamentId,
      });
    });
    
    // South Africa Squad
    const saPlayers = [
      { name: 'Quinton de Kock', position: 'keeper', price: 11.0, avgPoints: 42 },
      { name: 'Aiden Markram', position: 'batter', price: 9.5, avgPoints: 38 },
      { name: 'Reeza Hendricks', position: 'batter', price: 8.5, avgPoints: 32 },
      { name: 'David Miller', position: 'batter', price: 10.0, avgPoints: 42 },
      { name: 'Heinrich Klaasen', position: 'keeper', price: 10.5, avgPoints: 45 },
      { name: 'Marco Jansen', position: 'flex', price: 9.0, avgPoints: 40 },
      { name: 'Kagiso Rabada', position: 'bowler', price: 10.5, avgPoints: 48 },
      { name: 'Anrich Nortje', position: 'bowler', price: 9.5, avgPoints: 42 },
      { name: 'Lungi Ngidi', position: 'bowler', price: 8.5, avgPoints: 38 },
    ];
    
    saPlayers.forEach((p, i) => {
      players.push({
        id: `p_sa_${i + 1}`,
        ...p,
        team: 'SA',
        totalPoints: 0,
        tournamentId,
      });
    });
    
    // West Indies Squad
    const wiPlayers = [
      { name: 'Nicholas Pooran', position: 'keeper', price: 10.5, avgPoints: 45 },
      { name: 'Brandon King', position: 'batter', price: 9.0, avgPoints: 38 },
      { name: 'Shai Hope', position: 'batter', price: 9.0, avgPoints: 35 },
      { name: 'Rovman Powell', position: 'batter', price: 9.5, avgPoints: 40 },
      { name: 'Andre Russell', position: 'flex', price: 11.0, avgPoints: 50 },
      { name: 'Jason Holder', position: 'flex', price: 9.0, avgPoints: 42 },
      { name: 'Alzarri Joseph', position: 'bowler', price: 9.0, avgPoints: 40 },
      { name: 'Akeal Hosein', position: 'bowler', price: 8.5, avgPoints: 38 },
    ];
    
    wiPlayers.forEach((p, i) => {
      players.push({
        id: `p_wi_${i + 1}`,
        ...p,
        team: 'WI',
        totalPoints: 0,
        tournamentId,
      });
    });
  }
  
  if (tournamentId === 'ipl_2026') {
    // IPL Teams - Sample players for each franchise
    const iplTeams = {
      CSK: [
        { name: 'MS Dhoni', position: 'keeper', price: 10.0, avgPoints: 35 },
        { name: 'Ruturaj Gaikwad', position: 'batter', price: 10.5, avgPoints: 42 },
        { name: 'Devon Conway', position: 'batter', price: 10.0, avgPoints: 40 },
        { name: 'Shivam Dube', position: 'flex', price: 9.5, avgPoints: 42 },
        { name: 'Ravindra Jadeja', position: 'flex', price: 10.5, avgPoints: 48 },
        { name: 'Deepak Chahar', position: 'bowler', price: 9.0, avgPoints: 40 },
      ],
      MI: [
        { name: 'Rohit Sharma', position: 'batter', price: 11.0, avgPoints: 42 },
        { name: 'Ishan Kishan', position: 'keeper', price: 10.0, avgPoints: 40 },
        { name: 'Suryakumar Yadav', position: 'batter', price: 11.0, avgPoints: 48 },
        { name: 'Hardik Pandya', position: 'flex', price: 11.0, avgPoints: 50 },
        { name: 'Jasprit Bumrah', position: 'bowler', price: 11.5, avgPoints: 55 },
        { name: 'Tim David', position: 'batter', price: 9.5, avgPoints: 42 },
      ],
      RCB: [
        { name: 'Virat Kohli', position: 'batter', price: 12.0, avgPoints: 45 },
        { name: 'Faf du Plessis', position: 'batter', price: 10.5, avgPoints: 42 },
        { name: 'Glenn Maxwell', position: 'flex', price: 11.0, avgPoints: 48 },
        { name: 'Dinesh Karthik', position: 'keeper', price: 9.0, avgPoints: 35 },
        { name: 'Mohammed Siraj', position: 'bowler', price: 9.0, avgPoints: 42 },
        { name: 'Wanindu Hasaranga', position: 'bowler', price: 9.5, avgPoints: 45 },
      ],
      KKR: [
        { name: 'Shreyas Iyer', position: 'batter', price: 10.5, avgPoints: 42 },
        { name: 'Venkatesh Iyer', position: 'flex', price: 9.5, avgPoints: 40 },
        { name: 'Nitish Rana', position: 'batter', price: 8.5, avgPoints: 35 },
        { name: 'Andre Russell', position: 'flex', price: 11.0, avgPoints: 50 },
        { name: 'Sunil Narine', position: 'flex', price: 10.0, avgPoints: 45 },
        { name: 'Varun Chakravarthy', position: 'bowler', price: 9.0, avgPoints: 40 },
      ],
      DC: [
        { name: 'David Warner', position: 'batter', price: 11.0, avgPoints: 42 },
        { name: 'Rishabh Pant', position: 'keeper', price: 10.5, avgPoints: 42 },
        { name: 'Axar Patel', position: 'flex', price: 9.5, avgPoints: 42 },
        { name: 'Mitchell Marsh', position: 'flex', price: 10.0, avgPoints: 42 },
        { name: 'Anrich Nortje', position: 'bowler', price: 9.5, avgPoints: 42 },
        { name: 'Kuldeep Yadav', position: 'bowler', price: 9.0, avgPoints: 40 },
      ],
      PBKS: [
        { name: 'Shikhar Dhawan', position: 'batter', price: 9.5, avgPoints: 38 },
        { name: 'Jonny Bairstow', position: 'keeper', price: 10.0, avgPoints: 40 },
        { name: 'Liam Livingstone', position: 'flex', price: 10.0, avgPoints: 42 },
        { name: 'Sam Curran', position: 'flex', price: 9.5, avgPoints: 42 },
        { name: 'Kagiso Rabada', position: 'bowler', price: 10.5, avgPoints: 48 },
        { name: 'Arshdeep Singh', position: 'bowler', price: 9.0, avgPoints: 40 },
      ],
      RR: [
        { name: 'Jos Buttler', position: 'keeper', price: 11.5, avgPoints: 48 },
        { name: 'Sanju Samson', position: 'keeper', price: 10.5, avgPoints: 42 },
        { name: 'Yashasvi Jaiswal', position: 'batter', price: 10.0, avgPoints: 42 },
        { name: 'Shimron Hetmyer', position: 'batter', price: 9.0, avgPoints: 38 },
        { name: 'Ravichandran Ashwin', position: 'bowler', price: 9.0, avgPoints: 40 },
        { name: 'Trent Boult', position: 'bowler', price: 10.0, avgPoints: 45 },
      ],
      SRH: [
        { name: 'Aiden Markram', position: 'batter', price: 9.5, avgPoints: 40 },
        { name: 'Abhishek Sharma', position: 'batter', price: 9.0, avgPoints: 38 },
        { name: 'Heinrich Klaasen', position: 'keeper', price: 10.5, avgPoints: 45 },
        { name: 'Travis Head', position: 'batter', price: 10.5, avgPoints: 45 },
        { name: 'Pat Cummins', position: 'bowler', price: 10.5, avgPoints: 48 },
        { name: 'Bhuvneshwar Kumar', position: 'bowler', price: 9.0, avgPoints: 40 },
      ],
      GT: [
        { name: 'Shubman Gill', position: 'batter', price: 11.0, avgPoints: 45 },
        { name: 'Wriddhiman Saha', position: 'keeper', price: 8.5, avgPoints: 32 },
        { name: 'Vijay Shankar', position: 'flex', price: 8.0, avgPoints: 32 },
        { name: 'Rashid Khan', position: 'bowler', price: 10.5, avgPoints: 48 },
        { name: 'Mohammed Shami', position: 'bowler', price: 10.0, avgPoints: 45 },
        { name: 'Noor Ahmad', position: 'bowler', price: 8.5, avgPoints: 38 },
      ],
      LSG: [
        { name: 'KL Rahul', position: 'keeper', price: 11.0, avgPoints: 42 },
        { name: 'Quinton de Kock', position: 'keeper', price: 10.5, avgPoints: 42 },
        { name: 'Kyle Mayers', position: 'flex', price: 9.0, avgPoints: 38 },
        { name: 'Marcus Stoinis', position: 'flex', price: 9.5, avgPoints: 42 },
        { name: 'Mark Wood', position: 'bowler', price: 9.5, avgPoints: 42 },
        { name: 'Ravi Bishnoi', position: 'bowler', price: 9.0, avgPoints: 40 },
      ],
    };
    
    Object.entries(iplTeams).forEach(([teamCode, teamPlayers]) => {
      teamPlayers.forEach((p, i) => {
        players.push({
          id: `p_${teamCode.toLowerCase()}_${i + 1}`,
          ...p,
          team: teamCode,
          totalPoints: 0,
          tournamentId,
        });
      });
    });
  }
  
  return players;
}

// ============================================
// MATCH SYNC FUNCTIONS
// ============================================

/**
 * Sync matches for a tournament
 */
async function syncTournamentMatches(tournamentId, seriesId) {
  console.log(`\n📅 Syncing matches for ${tournamentId}`);
  
  if (!seriesId) {
    console.log(`⚠️ No series ID provided. Skipping match sync.`);
    return [];
  }
  
  try {
    const seriesInfo = await getSeriesInfo(seriesId);
    const matches = seriesInfo.matchList || [];
    
    console.log(`Found ${matches.length} matches`);
    
    for (const match of matches) {
      await db.execute({
        sql: `INSERT OR REPLACE INTO matches 
              (id, tournament_id, name, teams, venue, date, status) 
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [
          match.id,
          tournamentId,
          match.name,
          `${match.teams?.[0] || 'TBD'} vs ${match.teams?.[1] || 'TBD'}`,
          match.venue,
          match.date,
          match.matchStarted ? (match.matchEnded ? 'completed' : 'live') : 'upcoming',
        ],
      });
      console.log(`   ✓ ${match.name}`);
    }
    
    return matches;
    
  } catch (error) {
    console.error(`❌ Error syncing matches: ${error.message}`);
    return [];
  }
}

// ============================================
// MAIN EXECUTION
// ============================================

async function main() {
  const args = process.argv.slice(2);
  
  console.log('🏏 T20 Fantasy - Tournament Sync');
  console.log('='.repeat(60));
  
  // Check environment variables
  if (!process.env.CRICKET_API_KEY) {
    console.error('❌ CRICKET_API_KEY not set. Please add it to your .env file');
    console.log('\nTo get an API key:');
    console.log('1. Go to https://cricketdata.org/signup.aspx');
    console.log('2. Create a free account');
    console.log('3. Copy your API key from the dashboard');
    console.log('4. Add to .env: CRICKET_API_KEY=your_key_here');
    process.exit(1);
  }
  
  if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
    console.error('❌ Turso credentials not set. Please add them to your .env file');
    process.exit(1);
  }
  
  // Parse arguments
  let tournamentId = null;
  let searchTerm = null;
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--tournament' && args[i + 1]) {
      tournamentId = args[i + 1];
    }
    if (args[i] === '--search' && args[i + 1]) {
      searchTerm = args[i + 1];
    }
  }
  
  // If search term provided, just search and display results
  if (searchTerm) {
    console.log(`\n🔍 Searching for: "${searchTerm}"`);
    const results = await searchSeries(searchTerm);
    
    if (results && results.length > 0) {
      console.log(`\nFound ${results.length} series:`);
      results.forEach((series, i) => {
        console.log(`${i + 1}. ${series.name}`);
        console.log(`   ID: ${series.id}`);
        console.log(`   Dates: ${series.startDate} - ${series.endDate}`);
        console.log('');
      });
    } else {
      console.log('No results found.');
    }
    return;
  }
  
  // Sync specific tournament or all
  if (tournamentId) {
    await syncTournamentPlayers(tournamentId);
  } else {
    // Sync all tournaments
    for (const tid of Object.keys(TOURNAMENT_CONFIG)) {
      await syncTournamentPlayers(tid);
      // Rate limiting between tournaments
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('✅ Sync Complete!');
  
  // Show database stats
  const stats = await db.execute(`
    SELECT tournament_id, COUNT(*) as count 
    FROM players 
    GROUP BY tournament_id
  `);
  
  console.log('\n📊 Database Summary:');
  stats.rows.forEach(row => {
    console.log(`   ${row.tournament_id}: ${row.count} players`);
  });
}

// Run if called directly
main().catch(console.error);

export {
  syncTournamentPlayers,
  syncTournamentMatches,
  findSeriesId,
  getFallbackPlayers,
};
