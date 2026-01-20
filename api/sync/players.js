/**
 * Sync Players from CricketData.org API
 * ======================================
 * GET/POST /api/sync/players?tournament=ipl_2026
 * 
 * API Endpoints Used (api.cricapi.com/v1):
 *   /series              → Find tournament by name
 *   /series_info?id=X    → Get match list for series
 *   /match_squad?id=X    → Get player squads for a match
 *   /matches             → Get current/upcoming matches
 * 
 * NO FALLBACK - API is the only data source.
 */

import { createClient } from '@libsql/client';

const API_BASE = 'https://api.cricapi.com/v1';

// Database
let db = null;
let dbError = null;

try {
  if (process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN) {
    db = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  } else {
    dbError = 'Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN';
  }
} catch (e) {
  dbError = e.message;
}

// Tournament configs
const TOURNAMENTS = {
  test_ind_nz: {
    id: 'test_ind_nz',
    name: 'India vs NZ T20 Series',
    shortName: 'IND vs NZ T20',
    type: 't20',
    startDate: '2026-01-15',
    endDate: '2026-01-25',
    teamCodes: ['IND', 'NZ'],
    searchTerms: ['india', 'new zealand', 't20', 'ind vs nz', 'nz vs ind'],
    isTest: true,
  },
  t20_wc_2026: {
    id: 't20_wc_2026',
    name: 'T20 World Cup 2026',
    shortName: 'T20 WC 2026',
    type: 't20',
    startDate: '2026-02-09',
    endDate: '2026-03-07',
    teamCodes: ['IND', 'AUS', 'ENG', 'PAK', 'SA', 'NZ', 'WI', 'SL', 'BAN', 'AFG', 'IRE', 'ZIM', 'NED', 'SCO', 'NAM', 'USA', 'NEP', 'UGA', 'PNG', 'OMA'],
    searchTerms: ['t20 world cup', 'icc t20', 'world cup t20', 't20 wc'],
    isTest: false,
  },
  ipl_2026: {
    id: 'ipl_2026',
    name: 'IPL 2026',
    shortName: 'IPL 2026',
    type: 't20',
    startDate: '2026-03-22',
    endDate: '2026-05-26',
    teamCodes: ['CSK', 'MI', 'RCB', 'KKR', 'DC', 'PBKS', 'RR', 'SRH', 'GT', 'LSG'],
    searchTerms: ['indian premier league', 'ipl 2026', 'ipl 2025', 'ipl'],
    isTest: false,
  },
};

// Team name → code mapping
const TEAM_CODES = {
  'india': 'IND', 'australia': 'AUS', 'england': 'ENG', 'pakistan': 'PAK',
  'south africa': 'SA', 'new zealand': 'NZ', 'west indies': 'WI', 'sri lanka': 'SL',
  'bangladesh': 'BAN', 'afghanistan': 'AFG', 'ireland': 'IRE', 'zimbabwe': 'ZIM',
  'netherlands': 'NED', 'scotland': 'SCO', 'namibia': 'NAM', 'usa': 'USA',
  'nepal': 'NEP', 'uganda': 'UGA', 'papua new guinea': 'PNG', 'oman': 'OMA',
  'chennai super kings': 'CSK', 'mumbai indians': 'MI', 'royal challengers bangalore': 'RCB',
  'royal challengers bengaluru': 'RCB', 'kolkata knight riders': 'KKR', 'delhi capitals': 'DC',
  'punjab kings': 'PBKS', 'rajasthan royals': 'RR', 'sunrisers hyderabad': 'SRH',
  'gujarat titans': 'GT', 'lucknow super giants': 'LSG',
  'csk': 'CSK', 'mi': 'MI', 'rcb': 'RCB', 'kkr': 'KKR', 'dc': 'DC',
  'pbks': 'PBKS', 'rr': 'RR', 'srh': 'SRH', 'gt': 'GT', 'lsg': 'LSG',
};

// API request helper
async function apiRequest(endpoint, params = {}) {
  const apiKey = process.env.CRICKET_API_KEY;
  if (!apiKey) throw new Error('CRICKET_API_KEY required - get it from https://cricketdata.org');
  
  const url = new URL(`${API_BASE}/${endpoint}`);
  url.searchParams.set('apikey', apiKey);
  url.searchParams.set('offset', '0');
  Object.entries(params).forEach(([k, v]) => v && url.searchParams.set(k, v));
  
  console.log(`🌐 ${endpoint}`, params);
  const res = await fetch(url);
  const data = await res.json();
  
  if (data.status !== 'success') {
    throw new Error(data.reason || data.message || `${endpoint} failed`);
  }
  return data.data || [];
}

// Get team code from name
function getTeamCode(name) {
  if (!name) return 'UNK';
  const n = name.toLowerCase().trim();
  if (TEAM_CODES[n]) return TEAM_CODES[n];
  for (const [k, v] of Object.entries(TEAM_CODES)) {
    if (n.includes(k) || k.includes(n)) return v;
  }
  return name.substring(0, 3).toUpperCase();
}

// Determine player position from API data
function getPosition(player) {
  const role = (player.role || player.playingRole || '').toLowerCase();
  if (role.includes('keeper') || role.includes('wk')) return 'keeper';
  if (role.includes('allrounder') || role.includes('all-rounder')) return 'allrounder';
  if (role.includes('bowl')) return 'bowler';
  return 'batter';
}

// Calculate price based on role
function getPrice(position, playerName) {
  const stars = ['virat kohli', 'rohit sharma', 'jasprit bumrah', 'babar azam', 'jos buttler', 
    'pat cummins', 'rashid khan', 'suryakumar yadav', 'ms dhoni', 'hardik pandya'];
  let price = 8.0;
  if (stars.some(s => playerName.toLowerCase().includes(s))) price += 3.5;
  if (position === 'allrounder') price += 1.5;
  if (position === 'keeper') price += 1.0;
  return Math.round(price * 2) / 2;
}

// ============================================
// MAIN API FETCHING
// ============================================

async function fetchPlayers(config) {
  const players = new Map();
  
  console.log(`\n${'='.repeat(50)}`);
  console.log(`🏆 ${config.name}`);
  console.log(`${'='.repeat(50)}`);
  
  // Step 1: GET /series - find matching tournament
  console.log(`\n📡 Step 1: GET /series`);
  const allSeries = await apiRequest('series');
  
  const matchingSeries = allSeries.filter(s => {
    const name = (s.name || '').toLowerCase();
    return config.searchTerms.some(term => name.includes(term.toLowerCase()));
  });
  
  console.log(`   Found ${matchingSeries.length} matching series`);
  matchingSeries.slice(0, 3).forEach(s => console.log(`   - ${s.name} (${s.id})`));
  
  // Step 2: GET /series_info - get match list
  for (const series of matchingSeries.slice(0, 3)) {
    console.log(`\n📡 Step 2: GET /series_info?id=${series.id}`);
    
    try {
      const info = await apiRequest('series_info', { id: series.id });
      const matches = info.matchList || info.matches || [];
      console.log(`   Matches: ${matches.length}`);
      
      // Step 3: GET /match_squad for each match
      for (const match of matches.slice(0, 10)) {
        const matchId = match.id || match.matchId;
        if (!matchId) continue;
        
        console.log(`\n📡 Step 3: GET /match_squad?id=${matchId}`);
        console.log(`   Match: ${match.name || matchId}`);
        
        try {
          const squads = await apiRequest('match_squad', { id: matchId });
          
          for (const team of squads) {
            const teamCode = getTeamCode(team.teamName);
            console.log(`   ${team.teamName} (${teamCode}): ${team.players?.length || 0} players`);
            
            for (const p of (team.players || [])) {
              const key = p.id || `${p.name}_${teamCode}`;
              if (!players.has(key)) {
                const pos = getPosition(p);
                players.set(key, {
                  id: p.id || `p_${teamCode}_${players.size}`,
                  name: p.name,
                  team: teamCode,
                  position: pos,
                  price: getPrice(pos, p.name),
                  avgPoints: pos === 'bowler' ? 35 : pos === 'allrounder' ? 38 : 32,
                  totalPoints: 0,
                  tournamentId: config.id,
                });
              }
            }
          }
        } catch (e) {
          console.log(`   ⚠️ Squad error: ${e.message}`);
        }
        
        await new Promise(r => setTimeout(r, 300)); // Rate limit
      }
      
      if (players.size >= 100) break;
    } catch (e) {
      console.log(`   ⚠️ Series error: ${e.message}`);
    }
  }
  
  // Alternative: GET /matches if we don't have enough players
  if (players.size < 20) {
    console.log(`\n📡 Alternative: GET /matches`);
    try {
      const matches = await apiRequest('matches');
      const relevant = matches.filter(m => {
        const name = (m.name || '').toLowerCase();
        return config.searchTerms.some(t => name.includes(t.toLowerCase()));
      });
      
      console.log(`   Relevant matches: ${relevant.length}`);
      
      for (const match of relevant.slice(0, 10)) {
        if (!match.id) continue;
        try {
          const squads = await apiRequest('match_squad', { id: match.id });
          for (const team of squads) {
            const teamCode = getTeamCode(team.teamName);
            for (const p of (team.players || [])) {
              const key = p.id || `${p.name}_${teamCode}`;
              if (!players.has(key)) {
                const pos = getPosition(p);
                players.set(key, {
                  id: p.id || `p_${teamCode}_${players.size}`,
                  name: p.name,
                  team: teamCode,
                  position: pos,
                  price: getPrice(pos, p.name),
                  avgPoints: pos === 'bowler' ? 35 : pos === 'allrounder' ? 38 : 32,
                  totalPoints: 0,
                  tournamentId: config.id,
                });
              }
            }
          }
        } catch (e) {
          console.log(`   ⚠️ ${e.message}`);
        }
        await new Promise(r => setTimeout(r, 300));
      }
    } catch (e) {
      console.log(`   ⚠️ Matches error: ${e.message}`);
    }
  }
  
  console.log(`\n✅ Total players: ${players.size}`);
  return Array.from(players.values());
}

// Save to database
async function savePlayers(players, tournamentId) {
  let saved = 0, failed = 0;
  
  for (const p of players) {
    try {
      await db.execute({
        sql: `INSERT OR REPLACE INTO players (id, name, team, position, price, avg_points, total_points, tournament_id)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [p.id, p.name, p.team, p.position, p.price, p.avgPoints, p.totalPoints, tournamentId],
      });
      saved++;
    } catch (e) {
      failed++;
    }
  }
  
  return { saved, failed };
}

// Ensure tournament exists
async function ensureTournament(config) {
  try {
    const existing = await db.execute({ sql: `SELECT id FROM tournaments WHERE id = ?`, args: [config.id] });
    if (existing.rows.length > 0) return;
    
    await db.execute({
      sql: `INSERT INTO tournaments (id, name, short_name, type, start_date, end_date, teams, is_test, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      args: [config.id, config.name, config.shortName, config.type, config.startDate, config.endDate, 
             JSON.stringify(config.teamCodes), config.isTest ? 1 : 0],
    });
  } catch (e) {
    console.log(`Tournament error: ${e.message}`);
  }
}

// ============================================
// API HANDLER
// ============================================

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  // Validate requirements
  if (!process.env.CRICKET_API_KEY) {
    return res.status(500).json({ 
      error: 'CRICKET_API_KEY is required',
      help: 'Get your API key from https://cricketdata.org and add to Vercel env vars',
    });
  }
  
  if (dbError || !db) {
    return res.status(500).json({ error: dbError || 'Database not configured' });
  }
  
  try {
    await db.execute('SELECT 1');
    
    const { tournament } = req.query;
    const results = [];
    
    const tournamentsToSync = tournament ? [tournament] : Object.keys(TOURNAMENTS);
    
    for (const tid of tournamentsToSync) {
      const config = TOURNAMENTS[tid];
      if (!config) {
        results.push({ tournament: tid, error: 'Unknown tournament' });
        continue;
      }
      
      try {
        await ensureTournament(config);
        const players = await fetchPlayers(config);
        
        if (players.length === 0) {
          results.push({
            tournament: tid,
            name: config.name,
            players: 0,
            saved: 0,
            message: 'No players found - tournament may not be active yet',
          });
          continue;
        }
        
        const { saved, failed } = await savePlayers(players, tid);
        results.push({
          tournament: tid,
          name: config.name,
          players: players.length,
          saved,
          failed,
          teams: [...new Set(players.map(p => p.team))],
        });
      } catch (e) {
        results.push({ tournament: tid, error: e.message });
      }
      
      await new Promise(r => setTimeout(r, 1000));
    }
    
    res.status(200).json({
      success: true,
      source: 'CricketData.org API',
      timestamp: new Date().toISOString(),
      results,
      totalSaved: results.reduce((s, r) => s + (r.saved || 0), 0),
    });
    
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
