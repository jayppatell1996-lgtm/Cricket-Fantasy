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
 *   POST /api/live-sync - Preview scorecard (calculates points but doesn't apply)
 *   POST /api/live-sync?action=apply - Apply previously fetched stats to database
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
const TOURNAMENT_SERIES_MAP = {
  'test_ind_nz': 'New Zealand tour of India, 2026',
  't20_wc_2026': 'ICC Mens T20 World Cup 2026',
  'ipl_2026': 'Indian Premier League 2026',
};

// ============================================
// TEAM NAME ABBREVIATIONS
// ============================================
const TEAM_ABBREV_MAP = {
  'ind': ['india', 'ind'],
  'nz': ['new zealand', 'newzealand', 'nz'],
  'aus': ['australia', 'aus'],
  'eng': ['england', 'eng'],
  'pak': ['pakistan', 'pak'],
  'sa': ['south africa', 'southafrica', 'sa'],
  'wi': ['west indies', 'westindies', 'wi'],
  'sl': ['sri lanka', 'srilanka', 'sl'],
  'ban': ['bangladesh', 'ban'],
  'afg': ['afghanistan', 'afg'],
  'ire': ['ireland', 'ire'],
  'zim': ['zimbabwe', 'zim'],
  'ned': ['netherlands', 'ned'],
  'sco': ['scotland', 'sco'],
  'uae': ['united arab emirates', 'uae'],
  'nam': ['namibia', 'nam'],
  'nep': ['nepal', 'nep'],
  'oma': ['oman', 'oma'],
  'can': ['canada', 'can'],
  'usa': ['united states', 'usa'],
};

// Normalize team name and check if two teams match
function teamsMatch(team1, team2) {
  const normalize = t => t.toLowerCase().replace(/[^a-z]/g, '');
  const n1 = normalize(team1);
  const n2 = normalize(team2);
  
  // Direct match
  if (n1 === n2 || n1.includes(n2) || n2.includes(n1)) return true;
  
  // Check abbreviation map
  for (const [abbrev, variants] of Object.entries(TEAM_ABBREV_MAP)) {
    const allVariants = [abbrev, ...variants.map(v => v.replace(/\s/g, ''))];
    const t1Matches = allVariants.some(v => v === n1 || v.includes(n1) || n1.includes(v));
    const t2Matches = allVariants.some(v => v === n2 || v.includes(n2) || n2.includes(v));
    if (t1Matches && t2Matches) return true;
  }
  
  return false;
}

// ============================================
// FANTASY POINTS CALCULATION (Your Rules)
// ============================================

const FANTASY_RULES = {
  // Batting
  runPoints: 1,           // +1 per run
  
  // Strike Rate Bonus (min 20 runs)
  srMin20Runs: 20,        // Minimum runs to qualify for SR bonus
  srBonus160: 25,         // SR >= 160: +25 pts
  srBonus150: 20,         // SR 150-159.99: +20 pts
  srBonus140: 15,         // SR 140-149.99: +15 pts
  srBonus130: 10,         // SR 130-139.99: +10 pts
  srBonus120: 5,          // SR 120-129.99: +5 pts
  
  // Bowling
  wicketPoints: 25,       // +25 per wicket
  maidenPoints: 20,       // +20 per maiden
  
  // Economy Rate Bonus (min 3 overs)
  erMinOvers: 3,          // Minimum overs to qualify for ER bonus
  erBonus5: 25,           // ER <= 5: +25 pts
  erBonus6: 20,           // ER 5.01-6: +20 pts
  erBonus7: 15,           // ER 6.01-7: +15 pts
  erBonus8: 10,           // ER 7.01-8: +10 pts
  
  // Fielding
  catchPoints: 12,        // +12 per catch
  runOutPoints: 20,       // +20 per run out
  stumpingPoints: 15,     // +15 per stumping (WK only)
};

function calculateFantasyPoints(stats, position = 'batter') {
  let points = 0;
  
  // Batting points
  if (stats.runs !== undefined && stats.runs !== null) {
    points += stats.runs * FANTASY_RULES.runPoints;
    
    // Strike Rate Bonus (min 20 runs AND SR must be valid)
    // Accept SR directly or calculate from balls faced
    if (stats.runs >= FANTASY_RULES.srMin20Runs) {
      let sr = stats.SR || stats.strikeRate || 0;
      if (!sr && stats.ballsFaced > 0) {
        sr = (stats.runs / stats.ballsFaced) * 100;
      }
      
      // Only apply bonus if SR is valid (> 0)
      if (sr > 0) {
        if (sr >= 160) points += FANTASY_RULES.srBonus160;
        else if (sr >= 150) points += FANTASY_RULES.srBonus150;
        else if (sr >= 140) points += FANTASY_RULES.srBonus140;
        else if (sr >= 130) points += FANTASY_RULES.srBonus130;
        else if (sr >= 120) points += FANTASY_RULES.srBonus120;
      }
    }
  }
  
  // Bowling points
  if (stats.wickets !== undefined && stats.wickets !== null) {
    points += stats.wickets * FANTASY_RULES.wicketPoints;
  }
  
  if (stats.maidens > 0) {
    points += stats.maidens * FANTASY_RULES.maidenPoints;
  }
  
  // Economy Rate Bonus (min 3 overs AND ER must be valid)
  // Accept ER directly or calculate from runs/overs
  const overs = stats.oversBowled || stats.overs || 0;
  if (overs >= FANTASY_RULES.erMinOvers) {
    let economy = stats.ER || stats.economy || 0;
    if (!economy && stats.runsConceded !== undefined && overs > 0) {
      economy = stats.runsConceded / overs;
    }
    
    // Only apply bonus if ER is valid (> 0)
    if (economy > 0) {
      if (economy <= 5) points += FANTASY_RULES.erBonus5;
      else if (economy <= 6) points += FANTASY_RULES.erBonus6;
      else if (economy <= 7) points += FANTASY_RULES.erBonus7;
      else if (economy <= 8) points += FANTASY_RULES.erBonus8;
    }
  }
  
  // Fielding points
  points += (stats.catches || 0) * FANTASY_RULES.catchPoints;
  points += (stats.runOuts || stats.runouts || stats.runOutsDirect || 0) * FANTASY_RULES.runOutPoints;
  
  // Stumping (position check - only keepers should get this in practice)
  if (stats.stumpings > 0) {
    points += stats.stumpings * FANTASY_RULES.stumpingPoints;
  }
  
  return Math.round(points);
}

/**
 * Get detailed breakdown of how points were calculated
 */
function getPointsBreakdown(stats) {
  const breakdown = [];
  
  // Batting
  if (stats.runs !== undefined && stats.runs !== null && stats.runs > 0) {
    breakdown.push({ label: `${stats.runs} runs`, points: stats.runs * FANTASY_RULES.runPoints });
    
    // Strike Rate Bonus - accept SR directly or calculate
    if (stats.runs >= FANTASY_RULES.srMin20Runs) {
      let sr = stats.SR || stats.strikeRate || 0;
      if (!sr && stats.ballsFaced > 0) {
        sr = (stats.runs / stats.ballsFaced) * 100;
      }
      
      if (sr > 0) {
        const srDisplay = typeof sr === 'number' ? sr.toFixed(1) : sr;
        if (sr >= 160) breakdown.push({ label: `SR ${srDisplay} (≥160)`, points: FANTASY_RULES.srBonus160 });
        else if (sr >= 150) breakdown.push({ label: `SR ${srDisplay} (150-159)`, points: FANTASY_RULES.srBonus150 });
        else if (sr >= 140) breakdown.push({ label: `SR ${srDisplay} (140-149)`, points: FANTASY_RULES.srBonus140 });
        else if (sr >= 130) breakdown.push({ label: `SR ${srDisplay} (130-139)`, points: FANTASY_RULES.srBonus130 });
        else if (sr >= 120) breakdown.push({ label: `SR ${srDisplay} (120-129)`, points: FANTASY_RULES.srBonus120 });
      }
    }
  }
  
  // Bowling
  if (stats.wickets > 0) {
    breakdown.push({ label: `${stats.wickets} wickets`, points: stats.wickets * FANTASY_RULES.wicketPoints });
  }
  
  if (stats.maidens > 0) {
    breakdown.push({ label: `${stats.maidens} maidens`, points: stats.maidens * FANTASY_RULES.maidenPoints });
  }
  
  // Economy Bonus - accept ER directly or calculate
  const overs = stats.oversBowled || stats.overs || 0;
  if (overs >= FANTASY_RULES.erMinOvers) {
    let economy = stats.ER || stats.economy || 0;
    if (!economy && stats.runsConceded !== undefined && overs > 0) {
      economy = stats.runsConceded / overs;
    }
    
    if (economy > 0) {
      const erDisplay = typeof economy === 'number' ? economy.toFixed(2) : economy;
      if (economy <= 5) breakdown.push({ label: `ER ${erDisplay} (≤5)`, points: FANTASY_RULES.erBonus5 });
      else if (economy <= 6) breakdown.push({ label: `ER ${erDisplay} (5-6)`, points: FANTASY_RULES.erBonus6 });
      else if (economy <= 7) breakdown.push({ label: `ER ${erDisplay} (6-7)`, points: FANTASY_RULES.erBonus7 });
      else if (economy <= 8) breakdown.push({ label: `ER ${erDisplay} (7-8)`, points: FANTASY_RULES.erBonus8 });
    }
  }
  
  // Fielding
  if (stats.catches > 0) breakdown.push({ label: `${stats.catches} catches`, points: stats.catches * FANTASY_RULES.catchPoints });
  const runOuts = stats.runOuts || stats.runouts || stats.runOutsDirect || 0;
  if (runOuts > 0) {
    breakdown.push({ label: `${runOuts} run outs`, points: runOuts * FANTASY_RULES.runOutPoints });
  }
  if (stats.stumpings > 0) breakdown.push({ label: `${stats.stumpings} stumpings`, points: stats.stumpings * FANTASY_RULES.stumpingPoints });
  
  return breakdown;
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
      teamInfo: m.teamInfo,
      status: m.status,
      matchType: m.matchType,
      matchStarted: m.matchStarted,
      matchEnded: m.matchEnded,
      // Important flags for data availability
      fantasyEnabled: m.fantasyEnabled || false,
      bbbEnabled: m.bbbEnabled || false,
      hasSquad: m.hasSquad || false,
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
 * Only works for matches with fantasyEnabled: true (IPL, some domestic leagues)
 * Returns detailed player statistics for fantasy points calculation
 */
async function getMatchScorecard(apiKey, cricketApiMatchId, matchInfo = {}) {
  // Use fantasy scorecard endpoint (match_scorecard)
  // This only returns data for fantasyEnabled matches
  const result = await cricketApiCall(`match_scorecard?id=${cricketApiMatchId}`, apiKey);
  
  if (!result.success) {
    return {
      success: false,
      error: result.error || 'Scorecard not available',
      fantasyEnabled: matchInfo.fantasyEnabled || false,
      tip: matchInfo.fantasyEnabled === false 
        ? 'This match does not have fantasy data. Use Manual Entry instead.'
        : 'Scorecard may not be available yet. Try again after match completes.',
    };
  }
  
  return {
    success: true,
    matchInfo: {
      name: result.data.name,
      status: result.data.status,
      venue: result.data.venue,
      date: result.data.date,
      matchEnded: result.data.matchEnded,
      fantasyEnabled: matchInfo.fantasyEnabled || true,
    },
    scorecard: result.data.scorecard || [],
    score: result.data.score || [],
  };
}

/**
 * Parse scorecard into player stats for fantasy points
 * Handles both fantasy and regular scorecard formats
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
        runs: parseInt(batter.r) || 0,
        ballsFaced: parseInt(batter.b) || 0,
        fours: parseInt(batter['4s']) || 0,
        sixes: parseInt(batter['6s']) || 0,
        strikeRate: parseFloat(batter.sr) || 0,
        dismissal: batter.dismissal || batter['dismissal-text'],
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
        wickets: parseInt(bowler.w) || 0,
        oversBowled: parseFloat(bowler.o) || 0,
        runsConceded: parseInt(bowler.r) || 0,
        maidens: parseInt(bowler.m) || 0,
        economy: parseFloat(bowler.eco) || 0,
        noBalls: parseInt(bowler.nb) || 0,
        wides: parseInt(bowler.wd) || 0,
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
    
    // Process catches/fielding from dismissal strings or fielding data
    // Example: "c Kohli b Bumrah" -> Kohli gets a catch
    for (const batter of (innings.batting || [])) {
      const dismissal = batter.dismissal || batter['dismissal-text'] || '';
      
      // Caught: "c FielderName b BowlerName"
      const caughtMatch = dismissal.match(/^c\s+([^b]+)\s+b\s+/i);
      if (caughtMatch) {
        const catcherName = caughtMatch[1].trim();
        const existing = playerStats.find(p => 
          p.playerName?.toLowerCase() === catcherName.toLowerCase()
        );
        if (existing) {
          existing.catches = (existing.catches || 0) + 1;
        }
      }
      
      // Stumped: "st FielderName b BowlerName"
      const stumpedMatch = dismissal.match(/^st\s+([^b]+)\s+b\s+/i);
      if (stumpedMatch) {
        const keeperName = stumpedMatch[1].trim();
        const existing = playerStats.find(p => 
          p.playerName?.toLowerCase() === keeperName.toLowerCase()
        );
        if (existing) {
          existing.stumpings = (existing.stumpings || 0) + 1;
        }
      }
      
      // Run out: "run out (FielderName)" or "run out FielderName"
      const runOutMatch = dismissal.match(/run\s+out\s+\(?([^)]+)\)?/i);
      if (runOutMatch) {
        const fielderName = runOutMatch[1].trim().split('/')[0].trim(); // Handle "Player1/Player2"
        const existing = playerStats.find(p => 
          p.playerName?.toLowerCase() === fielderName.toLowerCase()
        );
        if (existing) {
          existing.runOuts = (existing.runOuts || 0) + 1;
        }
      }
    }
    
    // Also check explicit fielding data if available
    for (const catcher of (innings.catching || innings.fielding || [])) {
      const name = catcher.catcher?.name || catcher.fielder?.name || catcher.name;
      if (!name) continue;
      
      const existing = playerStats.find(p => 
        p.playerName?.toLowerCase() === name.toLowerCase()
      );
      
      if (existing) {
        existing.catches = (existing.catches || 0) + (catcher.catches || catcher.catch || 0);
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

async function syncMatchScores(db, tournamentId, playerStats, matchId, matchDate) {
  console.log(`📊 syncMatchScores called:`);
  console.log(`   - tournamentId: ${tournamentId}`);
  console.log(`   - matchId: ${matchId}`);
  console.log(`   - matchDate: ${matchDate}`);
  console.log(`   - playerStats count: ${playerStats?.length || 0}`);
  
  const results = [];
  
  // First, check if this match has already been scored
  const existingStats = await db.execute({
    sql: `SELECT COUNT(*) as count FROM player_stats WHERE match_id = ?`,
    args: [matchId || 'unknown']
  });
  
  if (existingStats.rows[0]?.count > 0) {
    console.log(`⚠️ Match ${matchId} already scored - skipping to prevent double points`);
    return { alreadyScored: true, matchId };
  }
  
  for (const stat of playerStats) {
    if (!stat.playerName) continue;
    
    const points = calculateFantasyPoints(stat, stat.position);
    const playerName = stat.playerName.trim();
    
    // Find the player ID
    let playerResult = await db.execute({
      sql: `SELECT id FROM players WHERE tournament_id = ? AND LOWER(TRIM(name)) = LOWER(?)`,
      args: [tournamentId, playerName]
    });
    
    // Try fuzzy match if exact match fails
    if (playerResult.rows.length === 0) {
      const nameParts = playerName.split(' ');
      const lastName = nameParts[nameParts.length - 1];
      
      playerResult = await db.execute({
        sql: `SELECT id FROM players WHERE tournament_id = ? AND LOWER(TRIM(name)) LIKE LOWER(?) LIMIT 1`,
        args: [tournamentId, `%${lastName}`]
      });
    }
    
    if (playerResult.rows.length === 0) {
      console.log(`   ❌ Player not found: ${playerName}`);
      results.push({ playerName, points, updated: false, reason: 'not found' });
      continue;
    }
    
    const playerId = playerResult.rows[0].id;
    
    // Insert into player_stats for this specific match
    const statsId = `${matchId || 'manual'}-${playerId}-${Date.now()}`;
    
    console.log(`   📝 Inserting stats for ${playerName} (${playerId}):`);
    console.log(`      - matchDate: ${matchDate || new Date().toISOString().split('T')[0]}`);
    console.log(`      - runs: ${stat.runs}, SR: ${stat.SR || stat.strikeRate || 0}`);
    console.log(`      - wickets: ${stat.wickets}, overs: ${stat.overs}, ER: ${stat.ER || stat.economy || 0}`);
    console.log(`      - fantasyPoints: ${points}`);
    
    await db.execute({
      sql: `INSERT OR REPLACE INTO player_stats (id, player_id, match_id, match_date, opponent, runs, balls_faced, strike_rate, overs_bowled, runs_conceded, wickets, maiden_overs, economy_rate, catches, run_outs, stumpings, fantasy_points)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        statsId, 
        playerId, 
        matchId || 'manual-entry', 
        matchDate || new Date().toISOString().split('T')[0],
        stat.opponent || '',
        stat.runs || 0,
        stat.ballsFaced || 0,
        stat.SR || stat.strikeRate || 0,
        stat.overs || stat.oversBowled || 0,
        stat.runsConceded || 0,
        stat.wickets || 0,
        stat.maidens || 0,
        stat.ER || stat.economy || 0,
        stat.catches || 0,
        stat.runouts || stat.runOuts || 0,
        stat.stumpings || 0,
        points
      ]
    });
    
    // Update player's total_points (for display in free agents)
    await db.execute({
      sql: `UPDATE players SET total_points = (
              SELECT COALESCE(SUM(fantasy_points), 0) FROM player_stats WHERE player_id = ?
            ), matches_played = (
              SELECT COUNT(*) FROM player_stats WHERE player_id = ?
            ) WHERE id = ?`,
      args: [playerId, playerId, playerId]
    });
    
    results.push({
      playerName: stat.playerName,
      playerId,
      points,
      updated: true,
      stats: stat
    });
  }
  
  // Update fantasy team totals based on roster acquisition dates
  await updateTeamTotals(db, tournamentId);
  
  return results;
}

// Calculate team totals based on roster-earned points
// Points only count for matches played WHILE player was on the team
async function updateTeamTotals(db, tournamentId) {
  console.log(`📊 Updating team totals for tournament: ${tournamentId}`);
  
  const teamsResult = await db.execute({
    sql: `SELECT id FROM fantasy_teams WHERE tournament_id = ?`,
    args: [tournamentId]
  });
  
  for (const team of teamsResult.rows) {
    try {
      // Get ALL roster entries for this team (including dropped players - they earned points)
      // Each roster entry represents a period when a player was on the team
      const rosterHistory = await db.execute({
        sql: `SELECT player_id, acquired_date, dropped_date FROM roster WHERE fantasy_team_id = ?`,
        args: [team.id]
      });
      
      let teamTotal = 0;
      
      // Track which player_id + period combinations we've already counted
      // This prevents double-counting if there are duplicate roster entries
      const countedPeriods = new Set();
      
      for (const roster of rosterHistory.rows) {
        // For each roster period, sum the player_stats where match_date is within the period
        const acquiredDate = roster.acquired_date || '2000-01-01'; // Default to old date if not set
        const droppedDate = roster.dropped_date || '2099-12-31'; // Default to future if not dropped
        
        // Create a unique key for this player + period to detect duplicates
        const periodKey = `${roster.player_id}-${acquiredDate}-${droppedDate}`;
        if (countedPeriods.has(periodKey)) {
          console.log(`   ⚠️ Skipping duplicate roster entry: ${periodKey}`);
          continue;
        }
        countedPeriods.add(periodKey);
        
        const statsResult = await db.execute({
          sql: `SELECT COALESCE(SUM(fantasy_points), 0) as period_points
                FROM player_stats 
                WHERE player_id = ?
                  AND DATE(match_date) >= DATE(?)
                  AND DATE(match_date) <= DATE(?)`,
          args: [roster.player_id, acquiredDate, droppedDate]
        });
        
        const periodPoints = statsResult.rows[0]?.period_points || 0;
        teamTotal += periodPoints;
      }
      
      await db.execute({
        sql: `UPDATE fantasy_teams SET total_points = ? WHERE id = ?`,
        args: [teamTotal, team.id]
      });
      
      console.log(`   Updated team ${team.id} total: ${teamTotal} (from ${rosterHistory.rows.length} roster periods, ${countedPeriods.size} unique)`);
    } catch (e) {
      console.error('Error updating team total:', e);
    }
  }
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
      
      // Filter to T20 matches only (our app is for T20 fantasy)
      const isT20Match = (matchName) => {
        if (!matchName) return false;
        const name = matchName.toLowerCase();
        return name.includes('t20') || name.includes('twenty20');
      };
      const t20Matches = matchesResult.matches.filter(m => isT20Match(m.name) || m.matchType === 't20');
      
      return res.json({
        success: true,
        seriesId: seriesResult.seriesId,
        seriesName: seriesResult.seriesName,
        totalMatches: matchesResult.matches.length,
        t20Matches: t20Matches.length,
        matchCount: t20Matches.length,
        matches: t20Matches.length > 0 ? t20Matches : matchesResult.matches,
        allMatches: matchesResult.matches // Include all for debugging
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
        seriesName: customSeriesName,
        playerStats: providedStats  // For apply action - pre-calculated stats
      } = req.body;
      
      if (!tournamentId) {
        return res.status(400).json({ error: 'tournamentId required' });
      }
      
      const action = req.query.action;
      
      // ===== ACTION: APPLY - Save previously fetched stats to database =====
      if (action === 'apply') {
        if (!providedStats || providedStats.length === 0) {
          return res.status(400).json({ error: 'playerStats array required for apply action' });
        }
        
        console.log(`📊 APPLY ACTION - matchId: ${matchId}, matchDate: ${matchDate}, tournamentId: ${tournamentId}`);
        console.log(`📊 Received ${providedStats.length} player stats to apply`);
        
        // Apply stats to database with match context
        const results = await syncMatchScores(db, tournamentId, providedStats, matchId, matchDate);
        
        // Check if already scored
        if (results.alreadyScored) {
          return res.json({
            success: false,
            error: `Match ${matchId} has already been scored. Points not applied to prevent duplicates.`,
            alreadyScored: true
          });
        }
        
        // Update match status
        if (matchId) {
          await updateMatchInTournament(db, tournamentId, matchId, cricketApiMatchId, 'completed');
        }
        
        return res.json({
          success: true,
          applied: true,
          matchId,
          cricketApiId: cricketApiMatchId,
          playersUpdated: results.filter(r => r.updated).length,
          playersNotFound: results.filter(r => !r.updated).length,
          totalPoints: results.reduce((sum, r) => sum + r.points, 0),
          results: results.slice(0, 30)
        });
      }
      
      // ===== DEFAULT: PREVIEW - Fetch scorecard and calculate points (don't save) =====
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
        
        // Normalize date for comparison
        const normalizeDate = (d) => {
          if (!d) return null;
          // Handle various formats: "2026-01-15", "2026-01-15T00:00:00", etc.
          return String(d).substring(0, 10); // Take first 10 chars (YYYY-MM-DD)
        };
        
        // Check if match name indicates it's a T20
        const isT20Match = (matchName) => {
          if (!matchName) return false;
          const name = matchName.toLowerCase();
          return name.includes('t20') || name.includes('twenty20');
        };
        
        // Filter to T20 matches only (our app is for T20 fantasy)
        const t20Matches = matchesResult.matches.filter(m => isT20Match(m.name) || m.matchType === 't20');
        const matchesToSearch = t20Matches.length > 0 ? t20Matches : matchesResult.matches;
        
        console.log('=== MATCH FINDING DEBUG ===');
        console.log('Looking for:', { teams, matchDate, normalizedDate: normalizeDate(matchDate) });
        console.log(`All matches: ${matchesResult.matches.length}, T20 matches: ${t20Matches.length}`);
        matchesToSearch.forEach((m, i) => {
          console.log(`  ${i}: "${m.name}" | date=${normalizeDate(m.date)} | teams=${JSON.stringify(m.teams)}`);
        });
        
        // Strategy 1: Match by date (most reliable for same series)
        if (matchDate) {
          const targetDateNorm = normalizeDate(matchDate);
          
          targetMatch = matchesToSearch.find(m => {
            const matchDateNorm = normalizeDate(m.date);
            return matchDateNorm === targetDateNorm;
          });
          
          if (targetMatch) {
            console.log('✅ Found by date:', targetMatch.name);
          }
        }
        
        // Strategy 2: Match by teams using our smart matching
        if (!targetMatch && teams) {
          const teamList = Array.isArray(teams) 
            ? teams 
            : teams.split(/\s+vs\s+|,/).map(t => t.trim());
          
          const t1 = teamList[0];
          const t2 = teamList[1] || t1;
          
          console.log('Trying team match:', t1, 'vs', t2);
          
          // If we have a date, try to find matches on that date first
          const candidates = matchDate 
            ? matchesToSearch.filter(m => normalizeDate(m.date) === normalizeDate(matchDate))
            : matchesToSearch;
          
          targetMatch = candidates.find(m => {
            const mTeams = m.teams || [];
            const mName = m.name || '';
            
            const hasT1 = mTeams.some(mt => teamsMatch(t1, mt)) || teamsMatch(t1, mName);
            const hasT2 = mTeams.some(mt => teamsMatch(t2, mt)) || teamsMatch(t2, mName);
            
            return hasT1 && hasT2;
          });
          
          if (targetMatch) {
            console.log('✅ Found by teams:', targetMatch.name);
          }
        }
        
        // Strategy 3: First available T20I match if we're desperate
        if (!targetMatch && matchesToSearch.length > 0) {
          // If there's only one match in the series, use it
          if (matchesToSearch.length === 1) {
            targetMatch = matchesToSearch[0];
            console.log('✅ Only one T20 match in series, using it:', targetMatch.name);
          }
        }
        
        if (!targetMatch) {
          console.log('❌ No match found');
          return res.status(404).json({
            success: false,
            error: 'Match not found in series',
            searched: { teams, matchDate, normalizedDate: normalizeDate(matchDate) },
            t20MatchesFound: t20Matches.length,
            availableMatches: matchesToSearch.map(m => ({
              name: m.name,
              date: m.date,
              normalizedDate: normalizeDate(m.date),
              cricketApiId: m.cricketApiId,
              teams: m.teams
            }))
          });
        }
        
        console.log('=== MATCH FOUND ===', targetMatch.name, targetMatch.cricketApiId);
        
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
      
      // Parse scorecard to player stats with calculated points
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
      
      // Calculate fantasy points for each player (PREVIEW ONLY - don't save)
      const statsWithPoints = playerStats.map(stat => ({
        ...stat,
        fantasyPoints: calculateFantasyPoints(stat, stat.position),
        pointsBreakdown: getPointsBreakdown(stat)
      }));
      
      // Sort by fantasy points descending
      statsWithPoints.sort((a, b) => b.fantasyPoints - a.fantasyPoints);
      
      // Return preview data - NOT saved to database yet
      return res.json({
        success: true,
        preview: true,  // Indicates this is just a preview
        matchId,
        cricketApiId: actualCricketApiId,
        matchInfo: scorecardResult.matchInfo || matchInfo,
        matchStatus: scorecardResult.matchInfo?.status,
        matchEnded: scorecardResult.matchInfo?.matchEnded,
        fantasyEnabled: scorecardResult.matchInfo?.fantasyEnabled || false,
        totalPlayers: statsWithPoints.length,
        totalFantasyPoints: statsWithPoints.reduce((sum, s) => sum + s.fantasyPoints, 0),
        scoringRules: FANTASY_RULES,
        playerStats: statsWithPoints,
        message: 'Preview only - click "Apply Points" to save to database'
      });
    }
    
    return res.status(405).json({ error: 'Method not allowed' });
    
  } catch (error) {
    console.error('Live Sync API Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
