/**
 * Live Match Sync API
 * ====================
 * Syncs real match data from Cricket API (cricapi.com/cricketdata.org)
 * 
 * API Flow:
 *   1. Series Search: /v1/series?search=SERIES_NAME → Get series ID
 *   2. Series Info: /v1/series_info?id=SERIES_ID → Get match list with match IDs
 *   3. Fantasy Scorecard: /v1/match_scorecard?id=MATCH_ID → Get player stats
 * 
 * Endpoints:
 *   GET /api/live-sync?tournamentId=X - Get matches for tournament from Cricket API
 *   POST /api/live-sync - Sync specific match scorecard
 * 
 * Required env: CRICKET_API_KEY from cricapi.com
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
// TOURNAMENT TO SERIES MAPPING
// ============================================
// Maps our tournament IDs to Cricket API series search names
const TOURNAMENT_SERIES_MAP = {
  'test_ind_nz': 'New Zealand tour of India, 2026',
  't20_wc_2026': 'ICC Mens T20 World Cup 2026',
  'ipl_2026': 'Indian Premier League 2026',
};

// ============================================
// FANTASY POINTS CALCULATION
// ============================================

const FANTASY_RULES = {
  runPoints: 1, fourBonus: 1, sixBonus: 2,
  thirtyBonus: 4, fiftyBonus: 8, centuryBonus: 16,
  duckPenalty: -2, strikeRateBonus150: 6, strikeRateBonus170: 10,
  wicketPoints: 25, maidenPoints: 12,
  threeWicketBonus: 8, fourWicketBonus: 12, fiveWicketBonus: 16,
  economyBonusBelow6: 6, economyBonusBelow5: 10,
  economyPenaltyOver10: -4, economyPenaltyOver12: -8,
  catchPoints: 8, stumpingPoints: 12, runOutDirect: 12, runOutIndirect: 6,
};

function calculateFantasyPoints(stats, position = 'batter') {
  let points = 0;
  
  if (stats.runs !== undefined && stats.runs !== null) {
    points += stats.runs * FANTASY_RULES.runPoints;
    points += (stats.fours || 0) * FANTASY_RULES.fourBonus;
    points += (stats.sixes || 0) * FANTASY_RULES.sixBonus;
    
    if (stats.runs >= 100) points += FANTASY_RULES.centuryBonus;
    else if (stats.runs >= 50) points += FANTASY_RULES.fiftyBonus;
    else if (stats.runs >= 30) points += FANTASY_RULES.thirtyBonus;
    
    if (stats.runs === 0 && stats.ballsFaced > 0 && position !== 'bowler') {
      points += FANTASY_RULES.duckPenalty;
    }
    
    if (stats.ballsFaced >= 10) {
      const sr = (stats.runs / stats.ballsFaced) * 100;
      if (sr >= 170) points += FANTASY_RULES.strikeRateBonus170;
      else if (sr >= 150) points += FANTASY_RULES.strikeRateBonus150;
    }
  }
  
  if (stats.wickets !== undefined && stats.wickets !== null) {
    points += stats.wickets * FANTASY_RULES.wicketPoints;
    points += (stats.maidens || 0) * FANTASY_RULES.maidenPoints;
    
    if (stats.wickets >= 5) points += FANTASY_RULES.fiveWicketBonus;
    else if (stats.wickets >= 4) points += FANTASY_RULES.fourWicketBonus;
    else if (stats.wickets >= 3) points += FANTASY_RULES.threeWicketBonus;
    
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
  
  points += (stats.catches || 0) * FANTASY_RULES.catchPoints;
  points += (stats.stumpings || 0) * FANTASY_RULES.stumpingPoints;
  points += (stats.runOutsDirect || 0) * FANTASY_RULES.runOutDirect;
  points += (stats.runOutsIndirect || stats.runOuts || 0) * FANTASY_RULES.runOutIndirect;
  
  return Math.round(points);
}

// ============================================
// CRICKET API FUNCTIONS
// ============================================

async function cricketApiCall(endpoint, apiKey) {
  if (!apiKey) {
    return { success: false, error: 'CRICKET_API_KEY not configured in Vercel environment variables' };
  }
  
  const url = `${CRICKET_API_BASE}/${endpoint}${endpoint.includes('?') ? '&' : '?'}apikey=${apiKey}`;
  console.log(`Cricket API: ${endpoint.split('?')[0]}`);
  
  try {
    const response = await fetch(url);
    const contentType = response.headers.get('content-type') || '';
    
    if (!contentType.includes('application/json')) {
      const text = await response.text();
      console.error('Non-JSON response:', text.substring(0, 200));
      return { success: false, error: 'Cricket API returned non-JSON response' };
    }
    
    const data = await response.json();
    
    if (data.status !== 'success') {
      return { success: false, error: data.reason || data.status || 'API error' };
    }
    
    return { success: true, data: data.data, info: data.info };
  } catch (error) {
    console.error('Cricket API error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Step 1: Search for series by name
 * Returns series ID that matches the search name
 */
async function searchSeries(apiKey, seriesName) {
  const encoded = encodeURIComponent(seriesName);
  const result = await cricketApiCall(`series?offset=0&search=${encoded}`, apiKey);
  
  if (!result.success) return result;
  
  // Find exact or closest match
  const series = result.data.find(s => 
    s.name.toLowerCase() === seriesName.toLowerCase()
  ) || result.data[0];
  
  if (!series) {
    return { success: false, error: `Series not found: ${seriesName}`, searched: result.data };
  }
  
  return { 
    success: true, 
    seriesId: series.id, 
    seriesName: series.name,
    matchCount: series.matches || series.t20 || 0
  };
}

/**
 * Step 2: Get series info with match list
 * Returns all matches in the series with their Cricket API match IDs
 */
async function getSeriesMatches(apiKey, seriesId) {
  const result = await cricketApiCall(`series_info?id=${seriesId}`, apiKey);
  
  if (!result.success) return result;
  
  const matchList = result.data.matchList || result.data.matches || [];
  
  return {
    success: true,
    seriesInfo: result.data.info || {},
    matches: matchList.map(m => ({
      cricketApiId: m.id,
      name: m.name,
      date: m.date || m.dateTimeGMT,
      venue: m.venue,
      teams: m.teams || extractTeamsFromName(m.name),
      status: m.status,
      matchType: m.matchType,
      matchStarted: m.matchStarted,
      matchEnded: m.matchEnded,
    }))
  };
}

function extractTeamsFromName(name) {
  if (!name) return [];
  // "India vs New Zealand, 1st T20I" -> ["India", "New Zealand"]
  const vsMatch = name.match(/^(.+?)\s+vs\s+(.+?),/i);
  if (vsMatch) return [vsMatch[1].trim(), vsMatch[2].trim()];
  return [];
}

/**
 * Step 3: Get fantasy scorecard for a specific match
 * Returns detailed player statistics
 */
async function getMatchScorecard(apiKey, cricketApiMatchId) {
  const result = await cricketApiCall(`match_scorecard?id=${cricketApiMatchId}`, apiKey);
  
  if (!result.success) return result;
  
  return {
    success: true,
    matchInfo: {
      name: result.data.name,
      status: result.data.status,
      venue: result.data.venue,
      date: result.data.date,
      matchEnded: result.data.matchEnded,
    },
    scorecard: result.data.scorecard || [],
    score: result.data.score || [],
  };
}

/**
 * Parse scorecard into player stats for fantasy points
 */
function parseScorecardToStats(scorecard) {
  const playerStats = [];
  
  if (!scorecard || !Array.isArray(scorecard)) return playerStats;
  
  for (const innings of scorecard) {
    // Process batting
    for (const batter of (innings.batting || [])) {
      const name = batter.batsman?.name || batter.batsman;
      if (!name) continue;
      
      playerStats.push({
        playerName: name,
        playerId: batter.batsman?.id,
        runs: batter.r || 0,
        ballsFaced: batter.b || 0,
        fours: batter['4s'] || 0,
        sixes: batter['6s'] || 0,
      });
    }
    
    // Process bowling
    for (const bowler of (innings.bowling || [])) {
      const name = bowler.bowler?.name || bowler.bowler;
      if (!name) continue;
      
      // Check if player already exists (was also a batter)
      const existing = playerStats.find(p => 
        p.playerName?.toLowerCase() === name.toLowerCase()
      );
      
      const bowlStats = {
        wickets: bowler.w || 0,
        oversBowled: parseFloat(bowler.o) || 0,
        runsConceded: bowler.r || 0,
        maidens: bowler.m || 0,
      };
      
      if (existing) {
        Object.assign(existing, bowlStats);
      } else {
        playerStats.push({
          playerName: name,
          playerId: bowler.bowler?.id,
          ...bowlStats
        });
      }
    }
    
    // Process catches from fielding data if available
    for (const catcher of (innings.catching || innings.fielding || [])) {
      const name = catcher.catcher?.name || catcher.fielder?.name || catcher.name;
      if (!name) continue;
      
      const existing = playerStats.find(p => 
        p.playerName?.toLowerCase() === name.toLowerCase()
      );
      
      if (existing) {
        existing.catches = (existing.catches || 0) + (catcher.catches || catcher.catch || 1);
        existing.stumpings = (existing.stumpings || 0) + (catcher.stumped || 0);
        existing.runOuts = (existing.runOuts || 0) + (catcher.runOut || catcher.runout || 0);
      }
    }
  }
  
  return playerStats;
}

// ============================================
// DATABASE SYNC FUNCTIONS
// ============================================

const normalizeTeam = (t) => (t || '').toLowerCase().replace(/[^a-z]/g, '');

async function syncMatchScores(db, tournamentId, playerStats) {
  console.log(`Syncing ${playerStats.length} player stats for tournament: ${tournamentId}`);
  
  const results = [];
  
  for (const stat of playerStats) {
    if (!stat.playerName) continue;
    
    const points = calculateFantasyPoints(stat, stat.position);
    
    // Update player by name (fuzzy match)
    const updateResult = await db.execute({
      sql: `UPDATE players 
            SET total_points = COALESCE(total_points, 0) + ?,
                matches_played = COALESCE(matches_played, 0) + 1
            WHERE tournament_id = ? AND (
              LOWER(TRIM(name)) = LOWER(TRIM(?)) OR 
              LOWER(TRIM(name)) LIKE LOWER(?)
            )`,
      args: [points, tournamentId, stat.playerName, `%${stat.playerName}%`]
    });
    
    results.push({
      playerName: stat.playerName,
      points,
      updated: updateResult.rowsAffected > 0,
      stats: stat
    });
  }
  
  // Update fantasy team totals
  const teamsResult = await db.execute({
    sql: `SELECT id, roster FROM fantasy_teams WHERE tournament_id = ?`,
    args: [tournamentId]
  });
  
  for (const team of teamsResult.rows) {
    let roster = [];
    try { roster = JSON.parse(team.roster || '[]'); } catch (e) { continue; }
    
    let teamMatchPoints = 0;
    const updatedRoster = roster.map(rosterPlayer => {
      const matchStat = results.find(r => {
        const rName = normalizeTeam(r.playerName);
        const pName = normalizeTeam(rosterPlayer.name);
        return rName === pName || rName.includes(pName) || pName.includes(rName);
      });
      
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
    
    if (teamMatchPoints > 0) {
      await db.execute({
        sql: `UPDATE fantasy_teams 
              SET roster = ?, total_points = COALESCE(total_points, 0) + ?
              WHERE id = ?`,
        args: [JSON.stringify(updatedRoster), teamMatchPoints, team.id]
      });
    }
  }
  
  return results;
}

async function updateMatchInTournament(db, tournamentId, ourMatchId, cricketApiId, status) {
  const result = await db.execute({
    sql: `SELECT matches FROM tournaments WHERE id = ?`,
    args: [tournamentId]
  });
  
  if (result.rows.length === 0) return;
  
  let matches = [];
  try { matches = JSON.parse(result.rows[0].matches || '[]'); } catch (e) { return; }
  
  const updatedMatches = matches.map(m => {
    if (m.id === ourMatchId) {
      return { ...m, cricketApiId, status: status || m.status };
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
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  const db = getDb();
  const apiKey = process.env.CRICKET_API_KEY;
  
  if (!apiKey) {
    return res.status(500).json({ 
      success: false, 
      error: 'CRICKET_API_KEY not configured in Vercel environment variables' 
    });
  }
  
  try {
    // ========== GET: Fetch matches for tournament from Cricket API ==========
    if (req.method === 'GET') {
      const { tournamentId, seriesName: customSeriesName } = req.query;
      
      // Determine series name to search
      const seriesName = customSeriesName || TOURNAMENT_SERIES_MAP[tournamentId];
      
      if (!seriesName) {
        return res.status(400).json({ 
          error: 'Unknown tournament. Provide seriesName query param or use known tournamentId',
          knownTournaments: Object.keys(TOURNAMENT_SERIES_MAP),
          example: '?tournamentId=test_ind_nz or ?seriesName=New%20Zealand%20tour%20of%20India%2C%202026'
        });
      }
      
      // Step 1: Search for series
      const seriesResult = await searchSeries(apiKey, seriesName);
      if (!seriesResult.success) {
        return res.status(404).json(seriesResult);
      }
      
      // Step 2: Get matches in series
      const matchesResult = await getSeriesMatches(apiKey, seriesResult.seriesId);
      if (!matchesResult.success) {
        return res.status(404).json(matchesResult);
      }
      
      return res.json({
        success: true,
        seriesId: seriesResult.seriesId,
        seriesName: seriesResult.seriesName,
        matchCount: matchesResult.matches.length,
        matches: matchesResult.matches
      });
    }
    
    // ========== POST: Sync specific match scorecard ==========
    if (req.method === 'POST') {
      const { 
        tournamentId, 
        matchId,           // Our internal match ID (match1, match2, etc)
        cricketApiMatchId, // Cricket API match ID (if known)
        teams,             // e.g., "IND vs NZ" to help find match
        matchDate,         // e.g., "2026-01-15" to help find match
        seriesName: customSeriesName
      } = req.body;
      
      if (!tournamentId) {
        return res.status(400).json({ error: 'tournamentId required' });
      }
      
      let actualCricketApiId = cricketApiMatchId;
      let matchInfo = null;
      
      // If no Cricket API ID provided, find it from series
      if (!actualCricketApiId) {
        const seriesName = customSeriesName || TOURNAMENT_SERIES_MAP[tournamentId];
        
        if (!seriesName) {
          return res.status(400).json({ 
            error: 'Cannot determine series. Provide cricketApiMatchId or seriesName',
            knownTournaments: Object.keys(TOURNAMENT_SERIES_MAP)
          });
        }
        
        // Step 1: Search series
        const seriesResult = await searchSeries(apiKey, seriesName);
        if (!seriesResult.success) {
          return res.status(404).json({ 
            success: false, 
            error: `Series not found: ${seriesName}`,
            details: seriesResult 
          });
        }
        
        // Step 2: Get matches
        const matchesResult = await getSeriesMatches(apiKey, seriesResult.seriesId);
        if (!matchesResult.success) {
          return res.status(404).json({ 
            success: false, 
            error: 'Could not get series matches',
            details: matchesResult 
          });
        }
        
        // Find the right match by teams or date
        let targetMatch = null;
        
        if (teams) {
          // Parse teams (e.g., "IND vs NZ" or ["India", "New Zealand"])
          const teamList = Array.isArray(teams) 
            ? teams 
            : teams.split(/\s+vs\s+|,/).map(t => t.trim());
          
          const normalizeTeam = t => t.toLowerCase().replace(/[^a-z]/g, '');
          const t1 = normalizeTeam(teamList[0]);
          const t2 = normalizeTeam(teamList[1]);
          
          targetMatch = matchesResult.matches.find(m => {
            const mTeams = (m.teams || []).map(normalizeTeam);
            const mName = normalizeTeam(m.name);
            
            const hasT1 = mTeams.some(mt => mt.includes(t1) || t1.includes(mt)) || mName.includes(t1);
            const hasT2 = mTeams.some(mt => mt.includes(t2) || t2.includes(mt)) || mName.includes(t2);
            
            // If date provided, also match on date
            if (matchDate && m.date) {
              const mDate = new Date(m.date).toISOString().split('T')[0];
              const targetDate = new Date(matchDate).toISOString().split('T')[0];
              return hasT1 && hasT2 && mDate === targetDate;
            }
            
            return hasT1 && hasT2;
          });
        } else if (matchDate) {
          // Find by date only
          targetMatch = matchesResult.matches.find(m => {
            if (!m.date) return false;
            const mDate = new Date(m.date).toISOString().split('T')[0];
            const targetDate = new Date(matchDate).toISOString().split('T')[0];
            return mDate === targetDate;
          });
        }
        
        if (!targetMatch) {
          return res.status(404).json({
            success: false,
            error: 'Match not found in series',
            searched: { teams, matchDate },
            availableMatches: matchesResult.matches.map(m => ({
              name: m.name,
              date: m.date,
              cricketApiId: m.cricketApiId,
              teams: m.teams
            }))
          });
        }
        
        actualCricketApiId = targetMatch.cricketApiId;
        matchInfo = targetMatch;
        console.log(`Found match: ${targetMatch.name} (${actualCricketApiId})`);
      }
      
      // Step 3: Fetch scorecard
      const scorecardResult = await getMatchScorecard(apiKey, actualCricketApiId);
      
      if (!scorecardResult.success) {
        return res.status(404).json({
          success: false,
          error: scorecardResult.error,
          cricketApiId: actualCricketApiId,
          matchInfo,
          tip: 'Scorecard may not be available yet if match has not started'
        });
      }
      
      // Parse scorecard to player stats
      const playerStats = parseScorecardToStats(scorecardResult.scorecard);
      
      if (playerStats.length === 0) {
        return res.json({
          success: true,
          warning: 'No player stats found in scorecard',
          cricketApiId: actualCricketApiId,
          matchInfo: scorecardResult.matchInfo,
          scorecard: scorecardResult.scorecard
        });
      }
      
      // Sync to database
      const results = await syncMatchScores(db, tournamentId, playerStats);
      
      // Update match in tournament with Cricket API ID
      if (matchId) {
        const status = scorecardResult.matchInfo?.matchEnded ? 'completed' : 'live';
        await updateMatchInTournament(db, tournamentId, matchId, actualCricketApiId, status);
      }
      
      return res.json({
        success: true,
        matchId,
        cricketApiId: actualCricketApiId,
        matchInfo: scorecardResult.matchInfo || matchInfo,
        source: 'cricket-api',
        playersUpdated: results.filter(r => r.updated).length,
        playersNotFound: results.filter(r => !r.updated).length,
        totalPoints: results.reduce((sum, r) => sum + r.points, 0),
        stats: results.slice(0, 25) // Limit response
      });
    }
    
    return res.status(405).json({ error: 'Method not allowed' });
    
  } catch (error) {
    console.error('Live Sync API Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
