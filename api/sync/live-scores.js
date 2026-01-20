/**
 * Vercel API Route: Live Scoring Sync
 * ====================================
 * POST /api/sync/live-scores
 * 
 * Fetches live match data and calculates fantasy points.
 * Designed for the $5.99/month CricketData.org plan.
 * 
 * Query params:
 *   ?match=abc123  (optional, sync specific match)
 */

import { createClient } from '@libsql/client';

const CRICKET_API_BASE = 'https://api.cricapi.com/v1';

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// ============================================
// YOUR CUSTOM SCORING RULES
// ============================================

const SCORING_RULES = {
  batting: {
    runsPerPoint: 1,
    strikeRateBonus: [
      { min: 160, max: Infinity, points: 25 },
      { min: 150, max: 159.99, points: 20 },
      { min: 140, max: 149.99, points: 15 },
      { min: 130, max: 139.99, points: 10 },
      { min: 120, max: 129.99, points: 5 },
    ],
    minRunsForSRBonus: 20,
    halfCenturyBonus: 10,
    centuryBonus: 25,
    duckPenalty: -5,
  },
  bowling: {
    wicketPoints: 25,
    maidenOverPoints: 20,
    economyRateBonus: [
      { min: 0, max: 5, points: 25 },
      { min: 5.01, max: 6, points: 20 },
      { min: 6.01, max: 7, points: 15 },
      { min: 7.01, max: 8, points: 10 },
    ],
    minOversForERBonus: 3,
    threeWicketBonus: 10,
    fiveWicketBonus: 25,
  },
  fielding: {
    catchPoints: 12,
    runOutPoints: 20,
    stumpingPoints: 15,
  },
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

function calculateFantasyPoints(stats) {
  let points = 0;
  const breakdown = { batting: 0, bowling: 0, fielding: 0 };
  
  // Batting points
  const { runs = 0, balls = 0, isOut = false } = stats;
  breakdown.batting += runs * SCORING_RULES.batting.runsPerPoint;
  
  // Strike rate bonus (20+ runs)
  if (runs >= SCORING_RULES.batting.minRunsForSRBonus && balls > 0) {
    const sr = (runs / balls) * 100;
    for (const tier of SCORING_RULES.batting.strikeRateBonus) {
      if (sr >= tier.min && sr <= tier.max) {
        breakdown.batting += tier.points;
        break;
      }
    }
  }
  
  // Milestones
  if (runs >= 100) breakdown.batting += SCORING_RULES.batting.centuryBonus;
  else if (runs >= 50) breakdown.batting += SCORING_RULES.batting.halfCenturyBonus;
  
  // Duck penalty
  if (runs === 0 && isOut) breakdown.batting += SCORING_RULES.batting.duckPenalty;
  
  // Bowling points
  const { wickets = 0, overs = 0, runsConceded = 0, maidens = 0 } = stats;
  breakdown.bowling += wickets * SCORING_RULES.bowling.wicketPoints;
  breakdown.bowling += maidens * SCORING_RULES.bowling.maidenOverPoints;
  
  // Economy bonus (3+ overs)
  if (overs >= SCORING_RULES.bowling.minOversForERBonus && overs > 0) {
    const economy = runsConceded / overs;
    for (const tier of SCORING_RULES.bowling.economyRateBonus) {
      if (economy >= tier.min && economy <= tier.max) {
        breakdown.bowling += tier.points;
        break;
      }
    }
  }
  
  // Wicket haul bonuses
  if (wickets >= 5) breakdown.bowling += SCORING_RULES.bowling.fiveWicketBonus;
  else if (wickets >= 3) breakdown.bowling += SCORING_RULES.bowling.threeWicketBonus;
  
  // Fielding points
  const { catches = 0, runOuts = 0, stumpings = 0 } = stats;
  breakdown.fielding += catches * SCORING_RULES.fielding.catchPoints;
  breakdown.fielding += runOuts * SCORING_RULES.fielding.runOutPoints;
  breakdown.fielding += stumpings * SCORING_RULES.fielding.stumpingPoints;
  
  points = breakdown.batting + breakdown.bowling + breakdown.fielding;
  
  return { total: points, breakdown };
}

async function processMatchScorecard(matchId) {
  const data = await cricketApiRequest('match_scorecard', { id: matchId });
  const scorecard = data.data;
  
  if (!scorecard || !scorecard.scorecard) {
    return { matchId, players: [], error: 'No scorecard data' };
  }
  
  const playerStats = [];
  
  for (const innings of scorecard.scorecard) {
    // Process batsmen
    const batsmen = innings.batting || [];
    for (const bat of batsmen) {
      const stats = {
        runs: parseInt(bat.r || bat.runs || 0),
        balls: parseInt(bat.b || bat.balls || 0),
        isOut: bat.dismissal && bat.dismissal !== 'not out',
        wickets: 0,
        overs: 0,
        runsConceded: 0,
        maidens: 0,
        catches: 0,
        runOuts: 0,
        stumpings: 0,
      };
      
      const points = calculateFantasyPoints(stats);
      
      playerStats.push({
        name: bat.batsman?.name || bat.name,
        stats,
        points: points.total,
        breakdown: points.breakdown,
      });
    }
    
    // Process bowlers
    const bowlers = innings.bowling || [];
    for (const bowl of bowlers) {
      // Check if already added as batsman
      const existingIdx = playerStats.findIndex(p => 
        p.name?.toLowerCase() === (bowl.bowler?.name || bowl.name)?.toLowerCase()
      );
      
      const oversRaw = bowl.o || bowl.overs || 0;
      let overs = 0;
      if (typeof oversRaw === 'string' && oversRaw.includes('.')) {
        const [full, extra] = oversRaw.split('.');
        overs = parseInt(full) + (parseInt(extra) / 6);
      } else {
        overs = parseFloat(oversRaw);
      }
      
      const bowlStats = {
        wickets: parseInt(bowl.w || bowl.wickets || 0),
        overs,
        runsConceded: parseInt(bowl.r || bowl.runs || 0),
        maidens: parseInt(bowl.m || bowl.maidens || 0),
      };
      
      if (existingIdx >= 0) {
        // Merge with batting stats
        Object.assign(playerStats[existingIdx].stats, bowlStats);
        const newPoints = calculateFantasyPoints(playerStats[existingIdx].stats);
        playerStats[existingIdx].points = newPoints.total;
        playerStats[existingIdx].breakdown = newPoints.breakdown;
      } else {
        const stats = {
          runs: 0,
          balls: 0,
          isOut: false,
          ...bowlStats,
          catches: 0,
          runOuts: 0,
          stumpings: 0,
        };
        const points = calculateFantasyPoints(stats);
        
        playerStats.push({
          name: bowl.bowler?.name || bowl.name,
          stats,
          points: points.total,
          breakdown: points.breakdown,
        });
      }
    }
  }
  
  return {
    matchId,
    matchInfo: scorecard.matchInfo || {},
    players: playerStats,
  };
}

async function getLiveMatches() {
  const data = await cricketApiRequest('currentMatches');
  
  // Filter for T20 matches that are live or recently completed
  const matches = (data.data || []).filter(m => 
    m.matchType === 't20' || m.name?.toLowerCase().includes('t20')
  );
  
  return matches;
}

async function updatePlayerPoints(matchId, playerStats) {
  let updated = 0;
  
  for (const ps of playerStats) {
    try {
      // Find player in database
      const result = await db.execute({
        sql: `SELECT id FROM players WHERE LOWER(name) LIKE LOWER(?)`,
        args: [`%${ps.name}%`],
      });
      
      if (result.rows.length > 0) {
        const playerId = result.rows[0].id;
        
        // Update or insert player stats
        await db.execute({
          sql: `INSERT OR REPLACE INTO player_stats 
                (id, player_id, match_id, match_date, runs, balls_faced, wickets, overs_bowled, 
                 catches, run_outs, stumpings, fantasy_points)
                VALUES (?, ?, ?, datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            `${matchId}_${playerId}`,
            playerId,
            matchId,
            ps.stats.runs,
            ps.stats.balls,
            ps.stats.wickets,
            ps.stats.overs,
            ps.stats.catches,
            ps.stats.runOuts,
            ps.stats.stumpings,
            ps.points,
          ],
        });
        
        // Update player's total points
        await db.execute({
          sql: `UPDATE players SET total_points = total_points + ? WHERE id = ?`,
          args: [ps.points, playerId],
        });
        
        updated++;
      }
    } catch (error) {
      console.error(`Error updating ${ps.name}:`, error.message);
    }
  }
  
  return updated;
}

// ============================================
// API HANDLER
// ============================================

export default async function handler(req, res) {
  // CORS headers for browser requests
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Authorization check - only required for automated cron jobs
  // Manual sync from browser is allowed without auth
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;
  const isVercelCron = req.headers['x-vercel-cron']; // Vercel cron header
  
  // Only enforce auth for automated cron requests, not manual browser requests
  if (isVercelCron && cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized cron request' });
  }
  
  try {
    const { match } = req.query;
    const results = [];
    
    if (match) {
      // Process specific match
      const result = await processMatchScorecard(match);
      if (result.players.length > 0) {
        const updated = await updatePlayerPoints(match, result.players);
        results.push({ ...result, updated });
      } else {
        results.push(result);
      }
    } else {
      // Process all live matches
      const liveMatches = await getLiveMatches();
      
      for (const m of liveMatches.slice(0, 5)) { // Limit to 5 matches
        if (m.matchStarted) {
          const result = await processMatchScorecard(m.id);
          if (result.players.length > 0) {
            const updated = await updatePlayerPoints(m.id, result.players);
            results.push({
              matchId: m.id,
              matchName: m.name,
              playersProcessed: result.players.length,
              updated,
            });
          }
        }
        // Rate limiting
        await new Promise(r => setTimeout(r, 300));
      }
    }
    
    res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      results,
    });
    
  } catch (error) {
    console.error('Live sync error:', error);
    res.status(500).json({ error: error.message });
  }
}
