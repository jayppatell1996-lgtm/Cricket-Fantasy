/**
 * Player Sync API - Simplified for Manual Data Entry
 * ===================================================
 * 
 * POST /api/sync/players - Add players to database (manual entry)
 *   Body: { tournament: "t20_wc_2026", players: [...] }
 * 
 * DELETE /api/sync/players?tournament=t20_wc_2026 - Clear tournament players
 * 
 * GET /api/sync/players?tournament=t20_wc_2026 - Get sync status
 */

import { createClient } from '@libsql/client';

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

// Tournament configs (for validation)
const TOURNAMENTS = {
  test_ind_nz: {
    id: 'test_ind_nz',
    name: 'India vs NZ T20 Series',
    shortName: 'IND vs NZ T20',
    type: 't20',
    startDate: '2026-01-15',
    endDate: '2026-01-25',
    teamCodes: ['IND', 'NZ'],
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
    isTest: false,
  },
};

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

// Clear players for a tournament
async function clearPlayers(tournamentId) {
  await db.execute({
    sql: `DELETE FROM players WHERE tournament_id = ?`,
    args: [tournamentId],
  });
}

// Add players to database
async function addPlayers(players, tournamentId) {
  let saved = 0, failed = 0;
  const errors = [];
  
  for (const p of players) {
    try {
      const id = p.id || `p_${p.team}_${tournamentId}_${saved}_${Date.now()}`;
      await db.execute({
        sql: `INSERT OR REPLACE INTO players (id, name, team, position, price, avg_points, total_points, matches_played, tournament_id)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [id, p.name, p.team, p.position, 0, 0, 0, 0, tournamentId],
      });
      saved++;
    } catch (e) {
      failed++;
      errors.push(`${p.name}: ${e.message}`);
    }
  }
  
  return { saved, failed, errors: errors.slice(0, 5) };
}

// Get player count for tournament
async function getPlayerCount(tournamentId) {
  const result = await db.execute({
    sql: `SELECT COUNT(*) as count FROM players WHERE tournament_id = ?`,
    args: [tournamentId],
  });
  return result.rows[0]?.count || 0;
}

// Get teams with player counts
async function getTeamCounts(tournamentId) {
  const result = await db.execute({
    sql: `SELECT team, COUNT(*) as count FROM players WHERE tournament_id = ? GROUP BY team ORDER BY team`,
    args: [tournamentId],
  });
  return result.rows.map(r => ({ team: r.team, count: r.count }));
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  if (dbError || !db) {
    return res.status(500).json({ error: dbError || 'Database not configured' });
  }
  
  try {
    await db.execute('SELECT 1');
    
    const { tournament } = req.query;
    
    // GET - Return sync status
    if (req.method === 'GET') {
      if (!tournament) {
        // Return status for all tournaments
        const results = [];
        for (const [id, config] of Object.entries(TOURNAMENTS)) {
          const count = await getPlayerCount(id);
          const teams = await getTeamCounts(id);
          results.push({
            tournament: id,
            name: config.name,
            playerCount: count,
            teams,
          });
        }
        return res.status(200).json({ success: true, tournaments: results });
      }
      
      // Return status for specific tournament
      const count = await getPlayerCount(tournament);
      const teams = await getTeamCounts(tournament);
      return res.status(200).json({
        success: true,
        tournament,
        playerCount: count,
        teams,
      });
    }
    
    // DELETE - Clear players for tournament
    if (req.method === 'DELETE') {
      if (!tournament) {
        return res.status(400).json({ error: 'Tournament ID required' });
      }
      
      await clearPlayers(tournament);
      return res.status(200).json({
        success: true,
        message: `Cleared all players for ${tournament}`,
      });
    }
    
    // POST - Add players (manual entry)
    if (req.method === 'POST') {
      const { tournament: bodyTournament, players, clearFirst } = req.body || {};
      const tournamentId = bodyTournament || tournament;
      
      if (!tournamentId) {
        return res.status(400).json({ error: 'Tournament ID required' });
      }
      
      if (!players || !Array.isArray(players) || players.length === 0) {
        return res.status(400).json({ 
          error: 'Players array required',
          example: {
            tournament: 'test_ind_nz',
            clearFirst: true,
            players: [
              { name: 'Virat Kohli', team: 'IND', position: 'batter' },
              { name: 'Rohit Sharma', team: 'IND', position: 'batter' },
              { name: 'Jasprit Bumrah', team: 'IND', position: 'bowler' },
              { name: 'Rishabh Pant', team: 'IND', position: 'keeper' },
              { name: 'Hardik Pandya', team: 'IND', position: 'allrounder' },
            ]
          },
          positions: ['batter', 'keeper', 'bowler', 'allrounder']
        });
      }
      
      const config = TOURNAMENTS[tournamentId];
      if (!config) {
        return res.status(400).json({ 
          error: `Unknown tournament: ${tournamentId}`,
          validTournaments: Object.keys(TOURNAMENTS),
        });
      }
      
      // Ensure tournament exists
      await ensureTournament(config);
      
      // Clear existing players if requested
      if (clearFirst) {
        await clearPlayers(tournamentId);
      }
      
      // Add players
      const result = await addPlayers(players, tournamentId);
      const teams = await getTeamCounts(tournamentId);
      
      return res.status(200).json({
        success: true,
        tournament: tournamentId,
        results: [{
          tournament: tournamentId,
          name: config.name,
          saved: result.saved,
          failed: result.failed,
          errors: result.errors,
          teams,
        }],
        totalPlayersSaved: result.saved,
      });
    }
    
    return res.status(405).json({ error: 'Method not allowed' });
    
  } catch (e) {
    console.error('API Error:', e);
    res.status(500).json({ error: e.message });
  }
}
