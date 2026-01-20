/**
 * Vercel API Route: Sync Tournament Players
 * ==========================================
 * POST /api/sync/players
 * 
 * Syncs players from CricketData.org to Turso database.
 * Protected by CRON_SECRET for automated calls.
 * 
 * Query params:
 *   ?tournament=test_ind_nz  (optional, syncs specific tournament)
 */

import { createClient } from '@libsql/client';

const CRICKET_API_BASE = 'https://api.cricapi.com/v1';

// Database connection
const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// Tournament configurations with correct Series IDs
const TOURNAMENTS = {
  test_ind_nz: {
    id: 'test_ind_nz',
    name: 'India vs NZ T20 Series',
    shortName: 'IND vs NZ T20',
    type: 't20',
    matchFormat: 't20', // Ensures only T20 format matches/squads
    startDate: '2026-01-15',
    endDate: '2026-01-25',
    teams: ['IND', 'NZ'],
    seriesId: null, // Will search for active IND vs NZ T20 series
    searchTerms: ['india', 'zealand', 't20'], // For dynamic series search
    isTest: true,
  },
  t20_wc_2026: {
    id: 't20_wc_2026',
    name: 'T20 World Cup 2026',
    shortName: 'T20 WC 2026',
    type: 't20',
    matchFormat: 't20',
    startDate: '2026-02-09',
    endDate: '2026-03-07',
    teams: ['IND', 'AUS', 'ENG', 'PAK', 'NZ', 'SA', 'WI', 'SL', 'BAN', 'AFG', 'ZIM', 'IRE', 'SCO', 'NAM', 'USA', 'NEP'],
    seriesId: '0cdf6736-ad9b-4e95-a647-5ee3a99c5510', // Men's T20 WC 2026
    isTest: false,
  },
  ipl_2026: {
    id: 'ipl_2026',
    name: 'IPL 2026',
    shortName: 'IPL 2026',
    type: 't20',
    matchFormat: 't20',
    startDate: '2026-03-22',
    endDate: '2026-05-26',
    teams: ['CSK', 'MI', 'RCB', 'KKR', 'DC', 'PBKS', 'RR', 'SRH', 'GT', 'LSG'],
    seriesId: '87c62aac-bc3c-4738-ab93-19da0690488f', // IPL 2026
    isTest: false,
  },
};

// T20 Squad Fallback Players (only T20 specialists and regulars)
const FALLBACK_PLAYERS = {
  test_ind_nz: [
    // India T20 Squad (based on typical T20I selections)
    { name: 'Suryakumar Yadav', team: 'IND', position: 'batter', price: 12.0, avgPoints: 45 }, // T20I Captain
    { name: 'Shubman Gill', team: 'IND', position: 'batter', price: 10.5, avgPoints: 40 },
    { name: 'Yashasvi Jaiswal', team: 'IND', position: 'batter', price: 10.0, avgPoints: 38 },
    { name: 'Tilak Varma', team: 'IND', position: 'batter', price: 9.5, avgPoints: 36 },
    { name: 'Rinku Singh', team: 'IND', position: 'batter', price: 9.0, avgPoints: 35 },
    { name: 'Sanju Samson', team: 'IND', position: 'keeper', price: 10.0, avgPoints: 38 },
    { name: 'Rishabh Pant', team: 'IND', position: 'keeper', price: 10.5, avgPoints: 40 },
    { name: 'Hardik Pandya', team: 'IND', position: 'allrounder', price: 11.0, avgPoints: 42 },
    { name: 'Axar Patel', team: 'IND', position: 'allrounder', price: 9.5, avgPoints: 36 },
    { name: 'Washington Sundar', team: 'IND', position: 'allrounder', price: 8.5, avgPoints: 32 },
    { name: 'Arshdeep Singh', team: 'IND', position: 'bowler', price: 10.0, avgPoints: 38 },
    { name: 'Mohammed Siraj', team: 'IND', position: 'bowler', price: 9.0, avgPoints: 34 },
    { name: 'Ravi Bishnoi', team: 'IND', position: 'bowler', price: 9.0, avgPoints: 35 },
    { name: 'Varun Chakravarthy', team: 'IND', position: 'bowler', price: 8.5, avgPoints: 33 },
    { name: 'Mayank Yadav', team: 'IND', position: 'bowler', price: 8.0, avgPoints: 30 },
    // New Zealand T20 Squad
    { name: 'Mitchell Santner', team: 'NZ', position: 'allrounder', price: 9.5, avgPoints: 36 }, // T20I Captain
    { name: 'Devon Conway', team: 'NZ', position: 'batter', price: 10.0, avgPoints: 38 },
    { name: 'Finn Allen', team: 'NZ', position: 'batter', price: 9.5, avgPoints: 37 },
    { name: 'Glenn Phillips', team: 'NZ', position: 'batter', price: 10.0, avgPoints: 40 },
    { name: 'Daryl Mitchell', team: 'NZ', position: 'batter', price: 9.5, avgPoints: 36 },
    { name: 'Mark Chapman', team: 'NZ', position: 'batter', price: 8.5, avgPoints: 32 },
    { name: 'Tim Seifert', team: 'NZ', position: 'keeper', price: 8.5, avgPoints: 32 },
    { name: 'Rachin Ravindra', team: 'NZ', position: 'allrounder', price: 9.5, avgPoints: 36 },
    { name: 'Michael Bracewell', team: 'NZ', position: 'allrounder', price: 8.5, avgPoints: 32 },
    { name: 'Lockie Ferguson', team: 'NZ', position: 'bowler', price: 10.0, avgPoints: 38 },
    { name: 'Trent Boult', team: 'NZ', position: 'bowler', price: 9.5, avgPoints: 35 },
    { name: 'Tim Southee', team: 'NZ', position: 'bowler', price: 9.0, avgPoints: 33 },
    { name: 'Matt Henry', team: 'NZ', position: 'bowler', price: 8.5, avgPoints: 32 },
    { name: 'Ish Sodhi', team: 'NZ', position: 'bowler', price: 8.5, avgPoints: 31 },
    { name: 'Adam Milne', team: 'NZ', position: 'bowler', price: 8.0, avgPoints: 30 },
  ],
  t20_wc_2026: [], // Will be fetched from API
  ipl_2026: [
    // CSK
    { name: 'MS Dhoni', team: 'CSK', position: 'keeper', price: 10.0, avgPoints: 35 },
    { name: 'Ruturaj Gaikwad', team: 'CSK', position: 'batter', price: 10.5, avgPoints: 40 },
    { name: 'Devon Conway', team: 'CSK', position: 'batter', price: 10.0, avgPoints: 38 },
    { name: 'Shivam Dube', team: 'CSK', position: 'flex', price: 9.5, avgPoints: 36 },
    { name: 'Ravindra Jadeja', team: 'CSK', position: 'flex', price: 10.5, avgPoints: 38 },
    { name: 'Deepak Chahar', team: 'CSK', position: 'bowler', price: 9.0, avgPoints: 32 },
    // MI
    { name: 'Rohit Sharma', team: 'MI', position: 'batter', price: 11.5, avgPoints: 42 },
    { name: 'Ishan Kishan', team: 'MI', position: 'keeper', price: 10.0, avgPoints: 38 },
    { name: 'Suryakumar Yadav', team: 'MI', position: 'batter', price: 11.0, avgPoints: 44 },
    { name: 'Hardik Pandya', team: 'MI', position: 'flex', price: 11.0, avgPoints: 40 },
    { name: 'Jasprit Bumrah', team: 'MI', position: 'bowler', price: 12.0, avgPoints: 42 },
    { name: 'Tim David', team: 'MI', position: 'batter', price: 9.5, avgPoints: 35 },
    // RCB
    { name: 'Virat Kohli', team: 'RCB', position: 'batter', price: 12.5, avgPoints: 45 },
    { name: 'Faf du Plessis', team: 'RCB', position: 'batter', price: 10.5, avgPoints: 40 },
    { name: 'Glenn Maxwell', team: 'RCB', position: 'flex', price: 10.5, avgPoints: 38 },
    { name: 'Dinesh Karthik', team: 'RCB', position: 'keeper', price: 9.0, avgPoints: 34 },
    { name: 'Mohammed Siraj', team: 'RCB', position: 'bowler', price: 9.5, avgPoints: 34 },
    { name: 'Wanindu Hasaranga', team: 'RCB', position: 'flex', price: 10.0, avgPoints: 36 },
    // KKR
    { name: 'Shreyas Iyer', team: 'KKR', position: 'batter', price: 10.5, avgPoints: 38 },
    { name: 'Venkatesh Iyer', team: 'KKR', position: 'flex', price: 9.5, avgPoints: 36 },
    { name: 'Nitish Rana', team: 'KKR', position: 'batter', price: 9.0, avgPoints: 34 },
    { name: 'Andre Russell', team: 'KKR', position: 'flex', price: 11.5, avgPoints: 42 },
    { name: 'Sunil Narine', team: 'KKR', position: 'flex', price: 10.5, avgPoints: 38 },
    { name: 'Varun Chakravarthy', team: 'KKR', position: 'bowler', price: 9.0, avgPoints: 34 },
    // DC
    { name: 'David Warner', team: 'DC', position: 'batter', price: 11.0, avgPoints: 42 },
    { name: 'Rishabh Pant', team: 'DC', position: 'keeper', price: 11.0, avgPoints: 40 },
    { name: 'Axar Patel', team: 'DC', position: 'flex', price: 9.5, avgPoints: 35 },
    { name: 'Mitchell Marsh', team: 'DC', position: 'flex', price: 10.0, avgPoints: 36 },
    { name: 'Anrich Nortje', team: 'DC', position: 'bowler', price: 9.5, avgPoints: 34 },
    { name: 'Kuldeep Yadav', team: 'DC', position: 'bowler', price: 9.0, avgPoints: 33 },
    // PBKS
    { name: 'Shikhar Dhawan', team: 'PBKS', position: 'batter', price: 10.0, avgPoints: 38 },
    { name: 'Jonny Bairstow', team: 'PBKS', position: 'keeper', price: 10.5, avgPoints: 40 },
    { name: 'Liam Livingstone', team: 'PBKS', position: 'flex', price: 10.0, avgPoints: 36 },
    { name: 'Sam Curran', team: 'PBKS', position: 'flex', price: 10.5, avgPoints: 38 },
    { name: 'Kagiso Rabada', team: 'PBKS', position: 'bowler', price: 10.5, avgPoints: 36 },
    { name: 'Arshdeep Singh', team: 'PBKS', position: 'bowler', price: 9.0, avgPoints: 32 },
    // RR
    { name: 'Jos Buttler', team: 'RR', position: 'keeper', price: 12.0, avgPoints: 44 },
    { name: 'Sanju Samson', team: 'RR', position: 'keeper', price: 10.5, avgPoints: 40 },
    { name: 'Yashasvi Jaiswal', team: 'RR', position: 'batter', price: 10.5, avgPoints: 42 },
    { name: 'Shimron Hetmyer', team: 'RR', position: 'batter', price: 9.5, avgPoints: 35 },
    { name: 'Ravichandran Ashwin', team: 'RR', position: 'bowler', price: 9.0, avgPoints: 32 },
    { name: 'Trent Boult', team: 'RR', position: 'bowler', price: 10.0, avgPoints: 35 },
    // SRH
    { name: 'Aiden Markram', team: 'SRH', position: 'batter', price: 9.5, avgPoints: 36 },
    { name: 'Abhishek Sharma', team: 'SRH', position: 'batter', price: 9.0, avgPoints: 34 },
    { name: 'Heinrich Klaasen', team: 'SRH', position: 'keeper', price: 10.5, avgPoints: 40 },
    { name: 'Travis Head', team: 'SRH', position: 'batter', price: 10.5, avgPoints: 42 },
    { name: 'Pat Cummins', team: 'SRH', position: 'bowler', price: 10.5, avgPoints: 36 },
    { name: 'Bhuvneshwar Kumar', team: 'SRH', position: 'bowler', price: 9.0, avgPoints: 32 },
    // GT
    { name: 'Shubman Gill', team: 'GT', position: 'batter', price: 11.0, avgPoints: 42 },
    { name: 'Wriddhiman Saha', team: 'GT', position: 'keeper', price: 8.5, avgPoints: 32 },
    { name: 'Vijay Shankar', team: 'GT', position: 'flex', price: 8.5, avgPoints: 30 },
    { name: 'Rashid Khan', team: 'GT', position: 'bowler', price: 11.0, avgPoints: 40 },
    { name: 'Mohammed Shami', team: 'GT', position: 'bowler', price: 10.0, avgPoints: 36 },
    { name: 'Noor Ahmad', team: 'GT', position: 'bowler', price: 8.5, avgPoints: 30 },
    // LSG
    { name: 'KL Rahul', team: 'LSG', position: 'keeper', price: 11.0, avgPoints: 42 },
    { name: 'Quinton de Kock', team: 'LSG', position: 'keeper', price: 10.5, avgPoints: 40 },
    { name: 'Kyle Mayers', team: 'LSG', position: 'flex', price: 9.0, avgPoints: 34 },
    { name: 'Marcus Stoinis', team: 'LSG', position: 'flex', price: 10.0, avgPoints: 36 },
    { name: 'Mark Wood', team: 'LSG', position: 'bowler', price: 9.5, avgPoints: 34 },
    { name: 'Ravi Bishnoi', team: 'LSG', position: 'bowler', price: 9.0, avgPoints: 33 },
  ],
};

// ============================================
// HELPER FUNCTIONS
// ============================================

async function cricketApiRequest(endpoint, params = {}) {
  const apiKey = process.env.CRICKET_API_KEY;
  if (!apiKey) throw new Error('CRICKET_API_KEY not configured');
  
  const url = new URL(`${CRICKET_API_BASE}/${endpoint}`);
  url.searchParams.append('apikey', apiKey);
  Object.entries(params).forEach(([k, v]) => v && url.searchParams.append(k, v));
  
  const response = await fetch(url.toString());
  const data = await response.json();
  
  if (data.status !== 'success') {
    throw new Error(data.reason || 'API request failed');
  }
  
  return data;
}

// Search for T20 series dynamically
async function findT20Series(searchTerms) {
  try {
    const data = await cricketApiRequest('series');
    
    if (!data.data || data.data.length === 0) {
      return null;
    }
    
    // Filter for T20 series matching search terms
    const t20Series = data.data.filter(series => {
      const name = (series.name || '').toLowerCase();
      const matchType = (series.matchType || '').toLowerCase();
      
      // Must be T20 format
      if (!name.includes('t20') && matchType !== 't20') {
        return false;
      }
      
      // Must match all search terms
      return searchTerms.every(term => name.includes(term.toLowerCase()));
    });
    
    // Return the most recent matching series
    if (t20Series.length > 0) {
      // Sort by start date descending
      t20Series.sort((a, b) => new Date(b.startDate) - new Date(a.startDate));
      return t20Series[0];
    }
    
    return null;
  } catch (error) {
    console.error('Error searching for T20 series:', error.message);
    return null;
  }
}

function transformPlayer(apiPlayer, teamCode, tournamentId) {
  let position = 'allrounder'; // Default to allrounder
  const role = (apiPlayer.role || apiPlayer.battingStyle || '').toLowerCase();
  const bowlStyle = (apiPlayer.bowlingStyle || '').toLowerCase();
  
  if (role.includes('wicket') || role.includes('keeper')) {
    position = 'keeper';
  } else if (role.includes('allrounder') || role.includes('all-rounder')) {
    position = 'allrounder';
  } else if (bowlStyle && !role.includes('bat')) {
    position = 'bowler';
  } else if (role.includes('bat') || role.includes('opening')) {
    position = 'batter';
  }
  
  // Price based on reputation
  let price = 8.0;
  const starPlayers = ['suryakumar yadav', 'hardik pandya', 'jasprit bumrah', 'glenn phillips', 'lockie ferguson', 'trent boult'];
  if (starPlayers.includes(apiPlayer.name?.toLowerCase())) price += 3.0;
  if (position === 'keeper') price += 1.0;
  if (position === 'allrounder') price += 1.5;
  
  return {
    id: apiPlayer.id || `p_${teamCode.toLowerCase()}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    name: apiPlayer.name,
    team: teamCode,
    position,
    price: Math.round(price * 2) / 2,
    avgPoints: position === 'bowler' ? 35 : position === 'allrounder' ? 38 : position === 'keeper' ? 36 : 32,
    totalPoints: 0,
    tournamentId,
  };
}

async function ensureTournamentExists(tournamentId) {
  const config = TOURNAMENTS[tournamentId];
  if (!config) return false;
  
  try {
    const existing = await db.execute({
      sql: `SELECT id FROM tournaments WHERE id = ?`,
      args: [tournamentId],
    });
    
    if (existing.rows.length > 0) return true;
    
    await db.execute({
      sql: `INSERT INTO tournaments (id, name, short_name, type, start_date, end_date, teams, is_test, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      args: [
        config.id,
        config.name,
        config.shortName,
        config.type,
        config.startDate,
        config.endDate,
        JSON.stringify(config.teams),
        config.isTest ? 1 : 0,
      ],
    });
    
    return true;
  } catch (error) {
    console.error('Error ensuring tournament:', error);
    return false;
  }
}

async function syncTournamentPlayers(tournamentId) {
  const config = TOURNAMENTS[tournamentId];
  if (!config) throw new Error(`Unknown tournament: ${tournamentId}`);
  
  // Ensure tournament exists first
  await ensureTournamentExists(tournamentId);
  
  let players = [];
  let seriesId = config.seriesId;
  let seriesInfo = null;
  
  // If no series ID, try to find T20 series dynamically
  if (!seriesId && config.searchTerms) {
    seriesInfo = await findT20Series(config.searchTerms);
    if (seriesInfo) {
      seriesId = seriesInfo.id;
      console.log(`Found T20 series: ${seriesInfo.name} (${seriesId})`);
    }
  }
  
  // Try to fetch from API if we have a series ID
  if (seriesId) {
    try {
      const data = await cricketApiRequest('series_squad', { id: seriesId });
      
      if (data.data && data.data.length > 0) {
        for (const team of data.data) {
          const teamCode = team.teamName?.substring(0, 3).toUpperCase() || 'UNK';
          
          // Skip women's teams
          if (team.teamName?.toLowerCase().includes('women')) continue;
          
          // Only include teams that are part of this tournament
          const normalizedTeamName = team.teamName?.toLowerCase() || '';
          const isValidTeam = config.teams.some(t => 
            normalizedTeamName.includes(t.toLowerCase()) || 
            t.toLowerCase().includes(teamCode.toLowerCase())
          );
          
          if (!isValidTeam && config.teams.length <= 2) {
            // For bilateral series, be strict about team matching
            continue;
          }
          
          if (team.players) {
            for (const player of team.players) {
              players.push(transformPlayer(player, teamCode, tournamentId));
            }
          }
        }
      }
    } catch (error) {
      console.error('API fetch failed:', error.message);
    }
  }
  
  // Use fallback if no API data
  if (players.length === 0) {
    const fallback = FALLBACK_PLAYERS[tournamentId] || [];
    players = fallback.map((p, i) => ({
      id: `p_${p.team.toLowerCase()}_${tournamentId}_${i}`,
      ...p,
      totalPoints: 0,
      tournamentId,
    }));
  }
  
  // Save to database
  let saved = 0;
  let failed = 0;
  
  for (const player of players) {
    try {
      await db.execute({
        sql: `INSERT OR REPLACE INTO players (id, name, team, position, price, avg_points, total_points, tournament_id)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [player.id, player.name, player.team, player.position, player.price, player.avgPoints, player.totalPoints, player.tournamentId],
      });
      saved++;
    } catch (error) {
      failed++;
    }
  }
  
  return { 
    tournament: tournamentId, 
    total: players.length, 
    saved, 
    failed,
    source: seriesId ? 'api' : 'fallback',
    seriesName: seriesInfo?.name || null,
  };
}

// ============================================
// API HANDLER
// ============================================

export default async function handler(req, res) {
  // Verify authorization
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;
  
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    // Allow without auth in development
    if (process.env.NODE_ENV === 'production') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }
  
  try {
    const { tournament } = req.query;
    const results = [];
    
    if (tournament) {
      // Sync specific tournament
      const result = await syncTournamentPlayers(tournament);
      results.push(result);
    } else {
      // Sync all tournaments
      for (const tid of Object.keys(TOURNAMENTS)) {
        const result = await syncTournamentPlayers(tid);
        results.push(result);
        // Rate limiting
        await new Promise(r => setTimeout(r, 500));
      }
    }
    
    res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      results,
    });
    
  } catch (error) {
    console.error('Sync error:', error);
    res.status(500).json({ error: error.message });
  }
}
