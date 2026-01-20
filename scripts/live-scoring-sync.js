/**
 * Live Scoring Sync Script
 * ========================
 * Syncs live match data from CricketData.org and calculates fantasy points
 * using YOUR custom scoring rules.
 * 
 * Usage:
 *   node scripts/live-scoring-sync.js
 *   node scripts/live-scoring-sync.js --match <match_id>
 *   node scripts/live-scoring-sync.js --tournament test_ind_nz
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
  getCurrentMatches,
  getMatchScorecard,
  getMatchInfo,
} from './cricket-api.js';
import {
  calculateFantasyPoints,
  transformScorecardToStats,
} from './fantasy-scoring.js';

// ============================================
// DATABASE CONNECTION
// ============================================

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// ============================================
// MATCH PROCESSING
// ============================================

/**
 * Process a single match and calculate fantasy points for all players
 */
async function processMatch(matchId) {
  console.log(`\n📊 Processing match: ${matchId}`);
  
  try {
    // Get match scorecard from CricketData.org
    const scorecard = await getMatchScorecard(matchId);
    
    if (!scorecard) {
      console.log(`   ⚠️ No scorecard data available`);
      return null;
    }
    
    const results = {
      matchId,
      matchInfo: scorecard.matchInfo || {},
      playerStats: [],
      processedAt: new Date().toISOString(),
    };
    
    // Process each team's scorecard
    const teams = scorecard.scorecard || [];
    
    for (const teamData of teams) {
      const teamName = teamData.teamName || 'Unknown';
      console.log(`   📋 Processing ${teamName} innings...`);
      
      // Process batsmen
      const batsmen = teamData.batsman || teamData.batting || [];
      for (const batsman of batsmen) {
        const playerName = batsman.name || batsman.batName;
        if (!playerName) continue;
        
        // Find this player in our database
        const playerRecord = await findPlayerByName(playerName);
        
        // Extract stats
        const stats = {
          runs: parseInt(batsman.r || batsman.runs || 0),
          balls: parseInt(batsman.b || batsman.balls || 0),
          fours: parseInt(batsman['4s'] || batsman.fours || 0),
          sixes: parseInt(batsman['6s'] || batsman.sixes || 0),
          isOut: batsman.dismissal !== 'not out' && batsman.dismissal !== '-',
          // Initialize bowling/fielding - will be merged later
          wickets: 0,
          overs: 0,
          runsConceded: 0,
          maidens: 0,
          catches: 0,
          runOuts: 0,
          stumpings: 0,
        };
        
        // Check if this batsman is also in the bowling list (for all-rounders)
        const bowlers = teamData.bowler || teamData.bowling || [];
        const bowlerRecord = bowlers.find(b => 
          (b.name || b.bowlName)?.toLowerCase() === playerName.toLowerCase()
        );
        
        if (bowlerRecord) {
          const oversRaw = bowlerRecord.o || bowlerRecord.overs || 0;
          if (typeof oversRaw === 'string' && oversRaw.includes('.')) {
            const [full, extra] = oversRaw.split('.');
            stats.overs = parseInt(full) + (parseInt(extra) / 6);
          } else {
            stats.overs = parseFloat(oversRaw);
          }
          stats.wickets = parseInt(bowlerRecord.w || bowlerRecord.wickets || 0);
          stats.runsConceded = parseInt(bowlerRecord.r || bowlerRecord.runs || 0);
          stats.maidens = parseInt(bowlerRecord.m || bowlerRecord.maidens || 0);
        }
        
        // Calculate fantasy points using YOUR scoring rules
        const fantasyPoints = calculateFantasyPoints(stats);
        
        results.playerStats.push({
          playerId: playerRecord?.id || null,
          playerName,
          team: teamName,
          stats,
          fantasyPoints,
        });
        
        console.log(`      ✓ ${playerName}: ${fantasyPoints.total} pts`);
        console.log(`        (Bat: ${fantasyPoints.batting}, Bowl: ${fantasyPoints.bowling}, Field: ${fantasyPoints.fielding})`);
      }
      
      // Process bowlers who didn't bat
      const bowlers = teamData.bowler || teamData.bowling || [];
      for (const bowler of bowlers) {
        const playerName = bowler.name || bowler.bowlName;
        if (!playerName) continue;
        
        // Skip if already processed as batsman
        const alreadyProcessed = results.playerStats.some(p => 
          p.playerName.toLowerCase() === playerName.toLowerCase()
        );
        if (alreadyProcessed) continue;
        
        const playerRecord = await findPlayerByName(playerName);
        
        const oversRaw = bowler.o || bowler.overs || 0;
        let overs = 0;
        if (typeof oversRaw === 'string' && oversRaw.includes('.')) {
          const [full, extra] = oversRaw.split('.');
          overs = parseInt(full) + (parseInt(extra) / 6);
        } else {
          overs = parseFloat(oversRaw);
        }
        
        const stats = {
          runs: 0,
          balls: 0,
          fours: 0,
          sixes: 0,
          isOut: false,
          wickets: parseInt(bowler.w || bowler.wickets || 0),
          overs,
          runsConceded: parseInt(bowler.r || bowler.runs || 0),
          maidens: parseInt(bowler.m || bowler.maidens || 0),
          catches: 0,
          runOuts: 0,
          stumpings: 0,
        };
        
        const fantasyPoints = calculateFantasyPoints(stats);
        
        results.playerStats.push({
          playerId: playerRecord?.id || null,
          playerName,
          team: teamName,
          stats,
          fantasyPoints,
        });
        
        if (stats.wickets > 0) {
          console.log(`      ✓ ${playerName}: ${fantasyPoints.total} pts (${stats.wickets} wickets)`);
        }
      }
    }
    
    return results;
    
  } catch (error) {
    console.error(`   ❌ Error processing match: ${error.message}`);
    return null;
  }
}

/**
 * Find player in database by name (fuzzy match)
 */
async function findPlayerByName(playerName) {
  try {
    // Try exact match first
    let result = await db.execute({
      sql: `SELECT * FROM players WHERE LOWER(name) = LOWER(?)`,
      args: [playerName],
    });
    
    if (result.rows.length > 0) {
      return result.rows[0];
    }
    
    // Try partial match
    result = await db.execute({
      sql: `SELECT * FROM players WHERE LOWER(name) LIKE LOWER(?)`,
      args: [`%${playerName}%`],
    });
    
    if (result.rows.length > 0) {
      return result.rows[0];
    }
    
    return null;
  } catch (error) {
    console.error(`   Error finding player ${playerName}: ${error.message}`);
    return null;
  }
}

/**
 * Save player stats to database
 */
async function savePlayerStats(matchId, playerStats) {
  console.log(`\n💾 Saving ${playerStats.length} player stats to database...`);
  
  let successCount = 0;
  let errorCount = 0;
  
  for (const ps of playerStats) {
    if (!ps.playerId) {
      console.log(`   ⚠️ Skipping ${ps.playerName} - not in database`);
      continue;
    }
    
    try {
      await db.execute({
        sql: `INSERT OR REPLACE INTO player_stats 
              (id, player_id, match_id, runs, balls_faced, wickets, overs_bowled, 
               catches, run_outs, stumpings, fantasy_points)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          `${matchId}_${ps.playerId}`,
          ps.playerId,
          matchId,
          ps.stats.runs,
          ps.stats.balls,
          ps.stats.wickets,
          ps.stats.overs,
          ps.stats.catches,
          ps.stats.runOuts,
          ps.stats.stumpings,
          ps.fantasyPoints.total,
        ],
      });
      
      // Update player's total points
      await db.execute({
        sql: `UPDATE players SET total_points = total_points + ? WHERE id = ?`,
        args: [ps.fantasyPoints.total, ps.playerId],
      });
      
      successCount++;
    } catch (error) {
      console.error(`   ✗ Failed: ${ps.playerName} - ${error.message}`);
      errorCount++;
    }
  }
  
  console.log(`   ✅ Saved: ${successCount} records`);
  if (errorCount > 0) {
    console.log(`   ❌ Failed: ${errorCount} records`);
  }
}

/**
 * Sync all live matches
 */
async function syncLiveMatches() {
  console.log('🔴 Syncing live matches...\n');
  
  const matches = await getCurrentMatches();
  const liveMatches = matches.filter(m => m.matchStarted && !m.matchEnded);
  
  console.log(`Found ${liveMatches.length} live matches\n`);
  
  for (const match of liveMatches) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🏏 ${match.name}`);
    console.log(`   Status: ${match.status}`);
    console.log(`${'='.repeat(60)}`);
    
    const results = await processMatch(match.id);
    
    if (results && results.playerStats.length > 0) {
      await savePlayerStats(match.id, results.playerStats);
    }
    
    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

// ============================================
// MAIN EXECUTION
// ============================================

async function main() {
  const args = process.argv.slice(2);
  
  console.log('🏏 T20 Fantasy - Live Scoring Sync');
  console.log('Using YOUR custom scoring rules');
  console.log('='.repeat(60));
  
  // Check environment variables
  if (!process.env.CRICKET_API_KEY) {
    console.error('❌ CRICKET_API_KEY not set');
    console.log('\nTo get an API key:');
    console.log('1. Go to https://cricketdata.org/signup.aspx');
    console.log('2. Create a free account');
    console.log('3. Copy your API key from the dashboard');
    console.log('4. Add to .env: CRICKET_API_KEY=your_key_here');
    process.exit(1);
  }
  
  // Parse arguments
  let matchId = null;
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--match' && args[i + 1]) {
      matchId = args[i + 1];
    }
  }
  
  if (matchId) {
    // Process specific match
    const results = await processMatch(matchId);
    if (results) {
      console.log('\n📊 Summary:');
      console.log(`   Total players: ${results.playerStats.length}`);
      
      // Top performers
      const sorted = [...results.playerStats].sort((a, b) => 
        b.fantasyPoints.total - a.fantasyPoints.total
      );
      
      console.log('\n🏆 Top 5 Performers:');
      sorted.slice(0, 5).forEach((p, i) => {
        console.log(`   ${i + 1}. ${p.playerName}: ${p.fantasyPoints.total} pts`);
      });
      
      // Save to database if configured
      if (process.env.TURSO_DATABASE_URL) {
        await savePlayerStats(matchId, results.playerStats);
      }
    }
  } else {
    // Sync all live matches
    await syncLiveMatches();
  }
  
  console.log('\n✅ Sync complete!');
}

// Run if called directly
main().catch(console.error);

export {
  processMatch,
  syncLiveMatches,
  findPlayerByName,
  savePlayerStats,
};
