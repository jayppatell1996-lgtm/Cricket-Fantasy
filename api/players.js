/**
 * API Route: Get Players
 * GET /api/players?tournament=t20_wc_2026
 * 
 * Returns players from the database for a specific tournament.
 */

import { createClient } from '@libsql/client';

let db = null;
let dbError = null;

try {
  if (process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN) {
    db = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  } else {
    dbError = 'Database not configured';
  }
} catch (error) {
  dbError = error.message;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  
  if (dbError || !db) {
    return res.status(500).json({ error: dbError || 'Database not available' });
  }
  
  try {
    const { tournament } = req.query;
    
    let result;
    if (tournament) {
      result = await db.execute({
        sql: `SELECT id, name, team, position, total_points as totalPoints, matches_played as matchesPlayed, tournament_id as tournamentId
              FROM players WHERE tournament_id = ? ORDER BY total_points DESC, name ASC`,
        args: [tournament],
      });
    } else {
      result = await db.execute({
        sql: `SELECT id, name, team, position, total_points as totalPoints, matches_played as matchesPlayed, tournament_id as tournamentId
              FROM players ORDER BY tournament_id, total_points DESC, name ASC`,
        args: [],
      });
    }
    
    const players = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      team: row.team,
      position: row.position,
      totalPoints: row.totalPoints || 0,
      matchesPlayed: row.matchesPlayed || 0,
      tournamentId: row.tournamentId,
    }));
    
    res.status(200).json({
      success: true,
      tournament: tournament || 'all',
      count: players.length,
      players,
    });
    
  } catch (error) {
    console.error('Error fetching players:', error);
    res.status(500).json({ error: error.message });
  }
}
