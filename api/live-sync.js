/**
 * Live Match Sync API
 * ====================
 * Fetches live match data and updates fantasy points
 * 
 * Endpoints:
 *   GET /api/live-sync - Get current live matches and sync scores
 *   POST /api/live-sync - Manually trigger sync for a specific match
 * 
 * Deploy to: api/live-sync.js (Vercel serverless function)
 */

import { createClient } from '@libsql/client';

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

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
function calculateFantasyPoints(stats) {
  let points = 0;
  
  // Batting points
  if (stats.runs !== undefined) {
    points += stats.runs * FANTASY_RULES.runPoints;
    points += (stats.fours || 0) * FANTASY_RULES.fourBonus;
    points += (stats.sixes || 0) * FANTASY_RULES.sixBonus;
    
    // Milestone bonuses
    if (stats.runs >= 100) points += FANTASY_RULES.centuryBonus;
    else if (stats.runs >= 50) points += FANTASY_RULES.fiftyBonus;
    else if (stats.runs >= 30) points += FANTASY_RULES.thirtyBonus;
    
    // Duck penalty (only for non-bowlers who faced a ball)
    if (stats.runs === 0 && stats.ballsFaced > 0 && stats.position !== 'bowler') {
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
  if (stats.wickets !== undefined) {
    points += stats.wickets * FANTASY_RULES.wicketPoints;
    points += (stats.maidens || 0) * FANTASY_RULES.maidenPoints;
    
    // Wicket bonuses
    if (stats.wickets >= 5) points += FANTASY_RULES.fiveWicketBonus;
    else if (stats.wickets >= 4) points += FANTASY_RULES.fourWicketBonus;
    else if (stats.wickets >= 3) points += FANTASY_RULES.threeWicketBonus;
    
    // Economy rate (min 2 overs bowled)
    if (stats.oversBowled >= 2) {
      const economy = stats.runsConceded / stats.oversBowled;
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
  points += (stats.runOutsIndirect || 0) * FANTASY_RULES.runOutIndirect;
  
  return Math.round(points);
}

// ============================================
// API FUNCTIONS
// ============================================

/**
 * Fetch current matches from CricketData.org
 */
async function fetchCurrentMatches() {
  const apiKey = process.env.CRICKET_API_KEY;
  
  if (!apiKey) {
    throw new Error('CRICKET_API_KEY not configured');
  }
  
  const response = await fetch(
    `${CRICKET_API_BASE}/currentMatches?apikey=${apiKey}`
  );
  const data = await response.json();
  
  if (data.status !== 'success') {
    throw new Error(data.reason || 'Failed to fetch matches');
  }
  
  return data.data || [];
}

/**
 * Fetch scorecard for a specific match
 */
async function fetchMatchScorecard(matchId) {
  const apiKey = process.env.CRICKET_API_KEY;
  
  const response = await fetch(
    `${CRICKET_API_BASE}/match_scorecard?apikey=${apiKey}&id=${matchId}`
  );
  const data = await response.json();
  
  if (data.status !== 'success') {
    throw new Error(data.reason || 'Failed to fetch scorecard');
  }
  
  return data.data;
}

/**
 * Sync player stats from a match scorecard
 */
async function syncMatchStats(matchId, tournamentId) {
  console.log(`Syncing stats for match: ${matchId}`);
  
  const scorecard = await fetchMatchScorecard(matchId);
  const playerStats = [];
  
  // Process batting stats
  for (const innings of (scorecard.scorecard || [])) {
    for (const batter of (innings.batting || [])) {
      const stats = {
        playerId: batter.batsman?.id,
        playerName: batter.batsman?.name,
        runs: batter.r || 0,
        ballsFaced: batter.b || 0,
        fours: batter['4s'] || 0,
        sixes: batter['6s'] || 0,
        strikeRate: batter.sr || 0,
        matchId: matchId,
      };
      
      stats.fantasyPoints = calculateFantasyPoints(stats);
      playerStats.push(stats);
    }
    
    // Process bowling stats
    for (const bowler of (innings.bowling || [])) {
      const stats = {
        playerId: bowler.bowler?.id,
        playerName: bowler.bowler?.name,
        oversBowled: bowler.o || 0,
        runsConceded: bowler.r || 0,
        wickets: bowler.w || 0,
        maidens: bowler.m || 0,
        economy: bowler.eco || 0,
        matchId: matchId,
      };
      
      // Find existing entry and add bowling points
      const existing = playerStats.find(p => p.playerId === stats.playerId);
      if (existing) {
        existing.wickets = stats.wickets;
        existing.oversBowled = stats.oversBowled;
        existing.runsConceded = stats.runsConceded;
        existing.maidens = stats.maidens;
        existing.fantasyPoints = calculateFantasyPoints(existing);
      } else {
        stats.fantasyPoints = calculateFantasyPoints(stats);
        playerStats.push(stats);
      }
    }
  }
  
  // Save stats to database
  for (const stats of playerStats) {
    if (!stats.playerId) continue;
    
    // Save player stats
    await db.execute({
      sql: `INSERT OR REPLACE INTO player_stats 
            (id, player_id, match_id, runs, balls_faced, wickets, overs_bowled, 
             runs_conceded, catches, run_outs, stumpings, fantasy_points, created_at) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      args: [
        `${matchId}_${stats.playerId}`,
        stats.playerId,
        matchId,
        stats.runs || 0,
        stats.ballsFaced || 0,
        stats.wickets || 0,
        stats.oversBowled || 0,
        stats.runsConceded || 0,
        stats.catches || 0,
        stats.runOuts || 0,
        stats.stumpings || 0,
        stats.fantasyPoints,
      ],
    });
    
    // Update player total points
    await db.execute({
      sql: `UPDATE players 
            SET total_points = total_points + ? 
            WHERE id = ? OR api_id = ?`,
      args: [stats.fantasyPoints, stats.playerId, stats.playerId],
    });
  }
  
  return playerStats;
}

// ============================================
// API HANDLER
// ============================================

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  try {
    if (req.method === 'GET') {
      // Get current live matches
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
    
    if (req.method === 'POST') {
      const { matchId, tournamentId } = req.body;
      
      if (!matchId) {
        return res.status(400).json({ error: 'matchId required' });
      }
      
      const stats = await syncMatchStats(matchId, tournamentId);
      
      return res.json({
        success: true,
        matchId,
        playersUpdated: stats.length,
        stats: stats.map(s => ({
          player: s.playerName,
          points: s.fantasyPoints,
        })),
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
