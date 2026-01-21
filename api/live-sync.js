/**
 * Live Match Sync API
 * ====================
 * Fetches live match data and updates fantasy points
 * 
 * Endpoints:
 *   GET /api/live-sync - Get current live matches and sync scores
 *   POST /api/live-sync - Sync scores for a specific match (live or completed)
 *   POST /api/live-sync?action=simulate - Simulate match scores (for testing)
 *   POST /api/live-sync?action=complete - Complete a match and finalize scores
 * 
 * Deploy to: api/live-sync.js (Vercel serverless function)
 */

import { createClient } from '@libsql/client';

function getDb() {
  return createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
}

const CRICKET_API_BASE = 'https://api.cricapi.com/v1';

// ============================================
// FANTASY POINTS CALCULATION
// ============================================

const FANTASY_RULES = {
  // Batting
  runPoints: 1,           // +1 per run
  fourBonus: 1,           // +1 per boundary
  sixBonus: 2,            // +2 per six
  thirtyBonus: 4,         // +4 for scoring 30+
  fiftyBonus: 8,          // +8 for scoring 50+
  centuryBonus: 16,       // +16 for scoring 100+
  duckPenalty: -2,        // -2 for duck (batters only)
  strikeRateBonus150: 6,  // +6 for SR > 150
  strikeRateBonus170: 10, // +10 for SR > 170
  
  // Bowling
  wicketPoints: 25,       // +25 per wicket
  maidenPoints: 12,       // +12 per maiden
  threeWicketBonus: 8,    // +8 for 3+ wickets
  fourWicketBonus: 12,    // +12 for 4+ wickets
  fiveWicketBonus: 16,    // +16 for 5+ wickets
  economyBonusBelow6: 6,  // +6 for ER < 6
  economyBonusBelow5: 10, // +10 for ER < 5
  economyPenaltyOver10: -4, // -4 for ER > 10
  economyPenaltyOver12: -8, // -8 for ER > 12
  
  // Fielding
  catchPoints: 8,         // +8 per catch
  stumpingPoints: 12,     // +12 per stumping
  runOutDirect: 12,       // +12 for direct run out
  runOutIndirect: 6,      // +6 for indirect run out
};

/**
 * Calculate fantasy points from player stats
 */
function calculateFantasyPoints(stats, position = 'batter') {
  let points = 0;
  
  // Batting points
  if (stats.runs !== undefined && stats.runs !== null) {
    points += stats.runs * FANTASY_RULES.runPoints;
    points += (stats.fours || 0) * FANTASY_RULES.fourBonus;
    points += (stats.sixes || 0) * FANTASY_RULES.sixBonus;
    
    // Milestone bonuses
    if (stats.runs >= 100) points += FANTASY_RULES.centuryBonus;
    else if (stats.runs >= 50) points += FANTASY_RULES.fiftyBonus;
    else if (stats.runs >= 30) points += FANTASY_RULES.thirtyBonus;
    
    // Duck penalty (only for non-bowlers who faced a ball)
    if (stats.runs === 0 && stats.ballsFaced > 0 && position !== 'bowler') {
      points += FANTASY_RULES.duckPenalty;
    }
    
    // Strike rate bonus (min 10 balls faced)
    if (stats.ballsFaced >= 10) {
      const sr = (stats.runs / stats.ballsFaced) * 100;
      if (sr >= 170) points += FANTASY_RULES.strikeRateBonus170;
      else if (sr >= 150) points += FANTASY_RULES.strikeRateBonus150;
    }
  }
  
  // Bowling points
  if (stats.wickets !== undefined && stats.wickets !== null) {
    points += stats.wickets * FANTASY_RULES.wicketPoints;
    points += (stats.maidens || 0) * FANTASY_RULES.maidenPoints;
    
    // Wicket bonuses
    if (stats.wickets >= 5) points += FANTASY_RULES.fiveWicketBonus;
    else if (stats.wickets >= 4) points += FANTASY_RULES.fourWicketBonus;
    else if (stats.wickets >= 3) points += FANTASY_RULES.threeWicketBonus;
    
    // Economy rate (min 2 overs bowled)
    const overs = stats.oversBowled || stats.overs || 0;
    const runsConceded = stats.runsConceded || 0;
    if (overs >= 2) {
      const economy = runsConceded / overs;
      if (economy < 5) points += FANTASY_RULES.economyBonusBelow5;
      else if (economy < 6) points += FANTASY_RULES.economyBonusBelow6;
      else if (economy > 12) points += FANTASY_RULES.economyPenaltyOver12;
      else if (economy > 10) points += FANTASY_RULES.economyPenaltyOver10;
    }
  }
  
  // Fielding points
  points += (stats.catches || 0) * FANTASY_RULES.catchPoints;
  points += (stats.stumpings || 0) * FANTASY_RULES.stumpingPoints;
  points += (stats.runOutsDirect || 0) * FANTASY_RULES.runOutDirect;
  points += (stats.runOutsIndirect || stats.runOuts || 0) * FANTASY_RULES.runOutIndirect;
  
  return Math.round(points);
}

/**
 * Generate simulated stats for a player (for testing)
 */
function generateSimulatedStats(player) {
  const isBatter = player.position === 'batter' || player.position === 'keeper' || player.position === 'allrounder';
  const isBowler = player.position === 'bowler' || player.position === 'allrounder';
  
  // Use player name as seed for consistent results
  const seed = (player.id || player.name || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const seededRandom = (offset = 0) => {
    const x = Math.sin(seed + offset + Date.now() % 1000) * 10000;
    return x - Math.floor(x);
  };
  
  const stats = {
    runs: null,
    ballsFaced: null,
    fours: null,
    sixes: null,
    wickets: null,
    oversBowled: null,
    runsConceded: null,
    maidens: null,
    catches: seededRandom(20) > 0.7 ? Math.floor(seededRandom(21) * 2) + 1 : 0,
    runOuts: seededRandom(22) > 0.9 ? 1 : 0,
    stumpings: 0,
  };
  
  if (isBatter) {
    stats.runs = Math.floor(seededRandom(1) * 70) + (seededRandom(2) > 0.3 ? 10 : 0);
    stats.ballsFaced = Math.max(stats.runs, Math.floor(stats.runs * (0.7 + seededRandom(3) * 0.6)));
    stats.fours = Math.floor(seededRandom(4) * (stats.runs / 10));
    stats.sixes = Math.floor(seededRandom(5) * (stats.runs / 20));
  }
  
  if (isBowler) {
    stats.oversBowled = Math.floor(seededRandom(6) * 4) + 1;
    stats.wickets = seededRandom(7) > 0.4 ? Math.floor(seededRandom(8) * 3) + 1 : 0;
    stats.runsConceded = Math.floor(stats.oversBowled * (5 + seededRandom(9) * 5));
    stats.maidens = seededRandom(10) > 0.85 ? 1 : 0;
  }
  
  if (player.position === 'keeper') {
    stats.stumpings = seededRandom(11) > 0.85 ? 1 : 0;
  }
  
  return stats;
}

// ============================================
// API FUNCTIONS
// ============================================

/**
 * Fetch current matches from CricketData.org API
 */
async function fetchCurrentMatches() {
  const apiKey = process.env.CRICKET_API_KEY;
  
  if (!apiKey) {
    console.log('CRICKET_API_KEY not configured - using mock data');
    return [];
  }
  
  try {
    const response = await fetch(
      `${CRICKET_API_BASE}/currentMatches?apikey=${apiKey}`
    );
    const data = await response.json();
    
    if (data.status !== 'success') {
      console.error('Cricket API error:', data.reason);
      return [];
    }
    
    return data.data || [];
  } catch (error) {
    console.error('Failed to fetch from Cricket API:', error);
    return [];
  }
}

/**
 * Fetch scorecard for a specific match from Cricket API
 */
async function fetchMatchScorecard(matchId) {
  const apiKey = process.env.CRICKET_API_KEY;
  
  if (!apiKey) {
    return null;
  }
  
  try {
    const response = await fetch(
      `${CRICKET_API_BASE}/match_scorecard?apikey=${apiKey}&id=${matchId}`
    );
    const data = await response.json();
    
    if (data.status !== 'success') {
      return null;
    }
    
    return data.data;
  } catch (error) {
    console.error('Failed to fetch scorecard:', error);
    return null;
  }
}

/**
 * Sync player stats and update fantasy team points
 */
async function syncMatchScores(db, matchId, tournamentId, playerStats) {
  console.log(`Syncing ${playerStats.length} player stats for match: ${matchId}`);
  
  const results = [];
  
  for (const stat of playerStats) {
    if (!stat.playerId) continue;
    
    const points = calculateFantasyPoints(stat, stat.position);
    
    // Update player in players table
    await db.execute({
      sql: `UPDATE players 
            SET total_points = COALESCE(total_points, 0) + ?,
                matches_played = COALESCE(matches_played, 0) + 1
            WHERE id = ? AND tournament_id = ?`,
      args: [points, stat.playerId, tournamentId]
    });
    
    // Also try to update by name if ID doesn't match
    await db.execute({
      sql: `UPDATE players 
            SET total_points = COALESCE(total_points, 0) + ?,
                matches_played = COALESCE(matches_played, 0) + 1
            WHERE name = ? AND tournament_id = ? AND id != ?`,
      args: [points, stat.playerName, tournamentId, stat.playerId]
    });
    
    results.push({
      playerId: stat.playerId,
      playerName: stat.playerName,
      points,
      stats: stat
    });
  }
  
  // Update fantasy team totals
  // Get all teams in this tournament
  const teamsResult = await db.execute({
    sql: `SELECT id, roster FROM fantasy_teams WHERE tournament_id = ?`,
    args: [tournamentId]
  });
  
  for (const team of teamsResult.rows) {
    let roster = [];
    try {
      roster = JSON.parse(team.roster || '[]');
    } catch (e) {
      continue;
    }
    
    let teamMatchPoints = 0;
    const updatedRoster = roster.map(rosterPlayer => {
      const matchStat = results.find(r => 
        r.playerId === rosterPlayer.id || 
        r.playerName === rosterPlayer.name
      );
      
      if (matchStat) {
        teamMatchPoints += matchStat.points;
        return {
          ...rosterPlayer,
          totalPoints: (rosterPlayer.totalPoints || 0) + matchStat.points,
          matchesPlayed: (rosterPlayer.matchesPlayed || 0) + 1
        };
      }
      return rosterPlayer;
    });
    
    // Update team roster and total points
    if (teamMatchPoints > 0) {
      await db.execute({
        sql: `UPDATE fantasy_teams 
              SET roster = ?, 
                  total_points = COALESCE(total_points, 0) + ?,
                  matches_processed = COALESCE(matches_processed, 0) + 1
              WHERE id = ?`,
        args: [JSON.stringify(updatedRoster), teamMatchPoints, team.id]
      });
    }
  }
  
  return results;
}

/**
 * Update match status in tournament
 */
async function updateMatchStatus(db, tournamentId, matchId, newStatus) {
  // Get current tournament
  const result = await db.execute({
    sql: `SELECT matches FROM tournaments WHERE id = ?`,
    args: [tournamentId]
  });
  
  if (result.rows.length === 0) return;
  
  let matches = [];
  try {
    matches = JSON.parse(result.rows[0].matches || '[]');
  } catch (e) {
    return;
  }
  
  // Update the specific match
  const updatedMatches = matches.map(m => {
    if (m.id === matchId) {
      return { ...m, status: newStatus };
    }
    return m;
  });
  
  await db.execute({
    sql: `UPDATE tournaments SET matches = ? WHERE id = ?`,
    args: [JSON.stringify(updatedMatches), tournamentId]
  });
}

// ============================================
// API HANDLER
// ============================================

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  const db = getDb();
  const action = req.query.action;
  
  try {
    // GET - Fetch current live matches
    if (req.method === 'GET') {
      const matches = await fetchCurrentMatches();
      
      // Filter to only T20 matches
      const t20Matches = matches.filter(m => 
        m.matchType === 't20' || 
        m.name?.toLowerCase().includes('t20') ||
        m.name?.toLowerCase().includes('ipl')
      );
      
      return res.json({
        success: true,
        count: t20Matches.length,
        matches: t20Matches.map(m => ({
          id: m.id,
          name: m.name,
          status: m.status,
          venue: m.venue,
          date: m.date,
          teams: m.teams,
          score: m.score,
          matchStarted: m.matchStarted,
          matchEnded: m.matchEnded,
        })),
      });
    }
    
    // POST - Sync match scores
    if (req.method === 'POST') {
      const { matchId, tournamentId, playerStats, players } = req.body;
      
      if (!tournamentId) {
        return res.status(400).json({ error: 'tournamentId required' });
      }
      
      // SIMULATE action - Generate simulated stats for players
      if (action === 'simulate') {
        if (!players || players.length === 0) {
          return res.status(400).json({ error: 'players array required for simulation' });
        }
        
        const simulatedStats = players.map(player => {
          const stats = generateSimulatedStats(player);
          const points = calculateFantasyPoints(stats, player.position);
          return {
            playerId: player.id,
            playerName: player.name,
            position: player.position,
            ...stats,
            fantasyPoints: points
          };
        });
        
        // Sync the simulated stats
        const results = await syncMatchScores(db, matchId || 'simulated', tournamentId, simulatedStats);
        
        // Update match status to completed if matchId provided
        if (matchId) {
          await updateMatchStatus(db, tournamentId, matchId, 'completed');
        }
        
        return res.json({
          success: true,
          matchId: matchId || 'simulated',
          playersUpdated: results.length,
          totalPoints: results.reduce((sum, r) => sum + r.points, 0),
          stats: results
        });
      }
      
      // COMPLETE action - Mark match as completed and sync any provided stats
      if (action === 'complete') {
        if (!matchId) {
          return res.status(400).json({ error: 'matchId required to complete match' });
        }
        
        await updateMatchStatus(db, tournamentId, matchId, 'completed');
        
        // If player stats provided, sync them
        if (playerStats && playerStats.length > 0) {
          const results = await syncMatchScores(db, matchId, tournamentId, playerStats);
          return res.json({
            success: true,
            matchId,
            status: 'completed',
            playersUpdated: results.length,
            stats: results
          });
        }
        
        return res.json({
          success: true,
          matchId,
          status: 'completed',
          message: 'Match marked as completed'
        });
      }
      
      // Default POST - Sync provided player stats
      if (playerStats && playerStats.length > 0) {
        const results = await syncMatchScores(db, matchId || 'manual', tournamentId, playerStats);
        
        return res.json({
          success: true,
          matchId,
          playersUpdated: results.length,
          stats: results
        });
      }
      
      // Try to fetch from Cricket API if matchId provided
      if (matchId) {
        const scorecard = await fetchMatchScorecard(matchId);
        
        if (!scorecard) {
          return res.status(404).json({ 
            error: 'Could not fetch match scorecard. Provide playerStats manually or use ?action=simulate',
            suggestion: 'Use POST with action=simulate and players array for testing'
          });
        }
        
        // Parse scorecard and sync
        const parsedStats = [];
        for (const innings of (scorecard.scorecard || [])) {
          for (const batter of (innings.batting || [])) {
            parsedStats.push({
              playerId: batter.batsman?.id,
              playerName: batter.batsman?.name,
              runs: batter.r || 0,
              ballsFaced: batter.b || 0,
              fours: batter['4s'] || 0,
              sixes: batter['6s'] || 0,
            });
          }
          
          for (const bowler of (innings.bowling || [])) {
            const existing = parsedStats.find(p => p.playerId === bowler.bowler?.id);
            if (existing) {
              existing.wickets = bowler.w || 0;
              existing.oversBowled = bowler.o || 0;
              existing.runsConceded = bowler.r || 0;
              existing.maidens = bowler.m || 0;
            } else {
              parsedStats.push({
                playerId: bowler.bowler?.id,
                playerName: bowler.bowler?.name,
                wickets: bowler.w || 0,
                oversBowled: bowler.o || 0,
                runsConceded: bowler.r || 0,
                maidens: bowler.m || 0,
              });
            }
          }
        }
        
        const results = await syncMatchScores(db, matchId, tournamentId, parsedStats);
        
        return res.json({
          success: true,
          matchId,
          source: 'cricket-api',
          playersUpdated: results.length,
          stats: results
        });
      }
      
      return res.status(400).json({ 
        error: 'Provide matchId with playerStats, or use action=simulate with players array'
      });
    }
    
    return res.status(405).json({ error: 'Method not allowed' });
    
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}
