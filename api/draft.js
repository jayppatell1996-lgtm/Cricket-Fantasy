// API: Roster Management
// GET /api/draft?type=roster - Get team roster
// POST /api/draft?type=roster - Add player to roster
// DELETE /api/draft?type=roster - Drop player from roster

import { createClient } from '@libsql/client';

function getDb() {
  return createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
}

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  const db = getDb();
  const { type } = req.query;

  try {
    if (type === 'roster') {
      // GET - Fetch roster
      if (req.method === 'GET') {
        const { teamId } = req.query;

        if (!teamId) {
          return res.status(400).json({ error: 'teamId required' });
        }

        const result = await db.execute({
          sql: `SELECT r.*, p.name as player_name, p.team as player_team, p.position as player_position,
                       p.total_points, p.avg_points, p.matches_played
                FROM roster r
                LEFT JOIN players p ON r.player_id = p.id
                WHERE r.fantasy_team_id = ?`,
          args: [teamId]
        });

        const roster = result.rows.map(r => ({
          id: r.player_id,
          name: r.player_name || 'Unknown Player',
          team: r.player_team || 'Unknown',
          position: r.player_position || r.position,
          slot: r.position,
          totalPoints: r.total_points || 0,
          avgPoints: r.avg_points || 0,
          matchesPlayed: r.matches_played || 0,
          acquiredVia: r.acquired_via,
          acquiredAt: r.acquired_date
        }));

        return res.status(200).json({ success: true, roster });
      }

      // POST - Add player to roster
      if (req.method === 'POST') {
        const { teamId, playerId, slot, acquiredVia = 'free_agency' } = req.body;

        if (!teamId || !playerId) {
          return res.status(400).json({ error: 'teamId and playerId required' });
        }

        // Check if player is already on a roster in this league
        const teamResult = await db.execute({
          sql: 'SELECT league_id FROM fantasy_teams WHERE id = ?',
          args: [teamId]
        });

        if (teamResult.rows.length > 0) {
          const leagueId = teamResult.rows[0].league_id;
          const existing = await db.execute({
            sql: `SELECT r.id FROM roster r
                  JOIN fantasy_teams ft ON r.fantasy_team_id = ft.id
                  WHERE ft.league_id = ? AND r.player_id = ?`,
            args: [leagueId, playerId]
          });

          if (existing.rows.length > 0) {
            return res.status(409).json({ error: 'Player already on a roster in this league' });
          }
        }

        await db.execute({
          sql: `INSERT INTO roster (id, fantasy_team_id, player_id, position, acquired_via)
                VALUES (?, ?, ?, ?, ?)`,
          args: [generateId(), teamId, playerId, slot || 'flex', acquiredVia]
        });

        if (acquiredVia === 'free_agency') {
          await db.execute({
            sql: 'UPDATE fantasy_teams SET weekly_pickups = weekly_pickups + 1 WHERE id = ?',
            args: [teamId]
          });
        }

        return res.status(201).json({ success: true, message: 'Player added to roster' });
      }

      // DELETE - Drop player from roster
      if (req.method === 'DELETE') {
        const { teamId, playerId } = req.body || req.query;

        if (!teamId || !playerId) {
          return res.status(400).json({ error: 'teamId and playerId required' });
        }

        await db.execute({
          sql: 'DELETE FROM roster WHERE fantasy_team_id = ? AND player_id = ?',
          args: [teamId, playerId]
        });

        return res.status(200).json({ success: true, message: 'Player dropped' });
      }
    }

    return res.status(400).json({ error: 'Invalid type. Use ?type=roster' });

  } catch (error) {
    console.error('Roster API error:', error);
    return res.status(500).json({ error: 'Server error', details: error.message });
  }
}
