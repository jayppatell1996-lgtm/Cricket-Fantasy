/**
 * Nightly Sync Cron Job
 * =====================
 * Runs daily at 2:00 AM IST to sync player stats
 * 
 * Vercel Cron Schedule: 0 20 * * * (8:30 PM UTC = 2:00 AM IST)
 * 
 * Configure in vercel.json:
 * {
 *   "crons": [{
 *     "path": "/api/cron/nightly-sync",
 *     "schedule": "0 20 * * *"
 *   }]
 * }
 */

import { createClient } from '@libsql/client';

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const CRICKET_API_BASE = 'https://api.cricapi.com/v1';

export default async function handler(req, res) {
  // Verify cron secret (Vercel automatically adds this header)
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    // Also accept Vercel's cron signature
    if (!req.headers['x-vercel-cron']) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }
  
  const startTime = Date.now();
  const results = {
    timestamp: new Date().toISOString(),
    matchesProcessed: 0,
    playersUpdated: 0,
    errors: [],
  };
  
  try {
    console.log('🌙 Starting nightly sync...');
    
    // 1. Fetch recent matches from API
    const apiKey = process.env.CRICKET_API_KEY;
    if (!apiKey) {
      throw new Error('CRICKET_API_KEY not configured');
    }
    
    // Get matches from the last 24 hours
    const response = await fetch(
      `${CRICKET_API_BASE}/matches?apikey=${apiKey}&offset=0`
    );
    const data = await response.json();
    
    if (data.status !== 'success') {
      throw new Error(data.reason || 'Failed to fetch matches');
    }
    
    const matches = data.data || [];
    
    // Filter to completed T20 matches
    const completedT20s = matches.filter(m => 
      m.matchEnded && 
      (m.matchType === 't20' || m.name?.toLowerCase().includes('t20'))
    );
    
    console.log(`Found ${completedT20s.length} completed T20 matches`);
    
    // 2. Process each match
    for (const match of completedT20s.slice(0, 10)) { // Limit to 10 to avoid timeouts
      try {
        // Fetch scorecard
        const scorecardRes = await fetch(
          `${CRICKET_API_BASE}/match_scorecard?apikey=${apiKey}&id=${match.id}`
        );
        const scorecardData = await scorecardRes.json();
        
        if (scorecardData.status !== 'success') continue;
        
        const scorecard = scorecardData.data;
        
        // Process player stats
        for (const innings of (scorecard.scorecard || [])) {
          // Batting
          for (const batter of (innings.batting || [])) {
            if (!batter.batsman?.id) continue;
            
            await db.execute({
              sql: `UPDATE players 
                    SET total_points = total_points + ? 
                    WHERE api_id = ?`,
              args: [
                calculateBattingPoints(batter),
                batter.batsman.id,
              ],
            });
            results.playersUpdated++;
          }
          
          // Bowling
          for (const bowler of (innings.bowling || [])) {
            if (!bowler.bowler?.id) continue;
            
            await db.execute({
              sql: `UPDATE players 
                    SET total_points = total_points + ? 
                    WHERE api_id = ?`,
              args: [
                calculateBowlingPoints(bowler),
                bowler.bowler.id,
              ],
            });
            results.playersUpdated++;
          }
        }
        
        results.matchesProcessed++;
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (matchError) {
        results.errors.push(`Match ${match.id}: ${matchError.message}`);
      }
    }
    
    // 3. Update sync log
    await db.execute({
      sql: `INSERT INTO sync_log (id, timestamp, matches_processed, players_updated, status) 
            VALUES (?, ?, ?, ?, ?)`,
      args: [
        `sync_${Date.now()}`,
        results.timestamp,
        results.matchesProcessed,
        results.playersUpdated,
        results.errors.length === 0 ? 'success' : 'partial',
      ],
    });
    
    results.duration = `${Date.now() - startTime}ms`;
    
    console.log('✅ Nightly sync complete:', results);
    
    return res.json({
      success: true,
      ...results,
    });
    
  } catch (error) {
    console.error('❌ Nightly sync failed:', error);
    results.errors.push(error.message);
    
    return res.status(500).json({
      success: false,
      error: error.message,
      ...results,
    });
  }
}

function calculateBattingPoints(batter) {
  let points = 0;
  const runs = batter.r || 0;
  const fours = batter['4s'] || 0;
  const sixes = batter['6s'] || 0;
  const balls = batter.b || 0;
  
  points += runs; // 1 point per run
  points += fours; // +1 for boundaries
  points += sixes * 2; // +2 for sixes
  
  // Milestones
  if (runs >= 100) points += 16;
  else if (runs >= 50) points += 8;
  else if (runs >= 30) points += 4;
  
  // Strike rate bonus
  if (balls >= 10) {
    const sr = (runs / balls) * 100;
    if (sr >= 170) points += 10;
    else if (sr >= 150) points += 6;
  }
  
  return Math.round(points);
}

function calculateBowlingPoints(bowler) {
  let points = 0;
  const wickets = bowler.w || 0;
  const overs = bowler.o || 0;
  const runsConceded = bowler.r || 0;
  const maidens = bowler.m || 0;
  
  points += wickets * 25; // 25 per wicket
  points += maidens * 12; // 12 per maiden
  
  // Wicket bonuses
  if (wickets >= 5) points += 16;
  else if (wickets >= 4) points += 12;
  else if (wickets >= 3) points += 8;
  
  // Economy bonus/penalty
  if (overs >= 2) {
    const economy = runsConceded / overs;
    if (economy < 5) points += 10;
    else if (economy < 6) points += 6;
    else if (economy > 12) points -= 8;
    else if (economy > 10) points -= 4;
  }
  
  return Math.round(points);
}

export const config = {
  maxDuration: 60, // Allow up to 60 seconds for this function
};
