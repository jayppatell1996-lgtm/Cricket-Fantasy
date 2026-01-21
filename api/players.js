// API: Players Management
// GET /api/players - Get players (filter by tournament, position, team)
// POST /api/players - Create player or bulk insert
// PUT /api/players - Update player stats

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  const db = getDb();

  try {
    // ============================================
    // GET - Fetch players
    // ============================================
    if (req.method === 'GET') {
      const { tournament, playerId, position, team, leagueId, available } = req.query;

      let sql = 'SELECT * FROM players WHERE 1=1';
      const args = [];

      if (playerId) {
        sql += ' AND id = ?';
        args.push(playerId);
      }

      if (tournament) {
        sql += ' AND tournament_id = ?';
        args.push(tournament);
      }

      if (position) {
        sql += ' AND position = ?';
        args.push(position);
      }

      if (team) {
        sql += ' AND team = ?';
        args.push(team);
      }

      // Filter out drafted players if available=true
      if (available === 'true' && leagueId) {
        sql += ` AND id NOT IN (
          SELECT player_id FROM roster r
          JOIN fantasy_teams ft ON r.fantasy_team_id = ft.id
          WHERE ft.league_id = ?
        )`;
        args.push(leagueId);
      }

      sql += ' ORDER BY total_points DESC, name ASC';

      const result = await db.execute({ sql, args });

      const players = result.rows.map(p => ({
        id: p.id,
        name: p.name,
        team: p.team,
        position: p.position,
        tournamentId: p.tournament_id,
        price: p.price || 0,
        avgPoints: p.avg_points || 0,
        totalPoints: p.total_points || 0,
        matchesPlayed: p.matches_played || 0,
        isActive: Boolean(p.is_active),
        isInjured: Boolean(p.is_injured)
      }));

      if (playerId) {
        return res.status(200).json({ success: true, player: players[0] || null });
      }

      return res.status(200).json({ success: true, players });
    }

    // ============================================
    // POST - Create player(s)
    // ============================================
    if (req.method === 'POST') {
      const { players, tournamentId, name, team, position } = req.body;

      // Bulk insert
      if (players && Array.isArray(players)) {
        let inserted = 0;

        for (const p of players) {
          const pid = p.id || generateId();
          try {
            await db.execute({
              sql: `INSERT OR REPLACE INTO players (id, name, team, position, tournament_id, price, avg_points, total_points, matches_played, is_active, is_injured)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
              args: [pid, p.name, p.team, p.position, tournamentId || p.tournamentId, p.price || 0, p.avgPoints || 0, p.totalPoints || 0, p.matchesPlayed || 0]
            });
            inserted++;
          } catch (err) {
            console.error(`Failed to insert player ${p.name}:`, err.message);
          }
        }

        return res.status(201).json({ success: true, inserted });
      }

      // Single insert
      if (!name || !team || !position || !tournamentId) {
        return res.status(400).json({ error: 'name, team, position, and tournamentId required' });
      }

      const playerId = generateId();

      await db.execute({
        sql: `INSERT INTO players (id, name, team, position, tournament_id, price, avg_points, total_points, matches_played, is_active, is_injured)
              VALUES (?, ?, ?, ?, ?, 0, 0, 0, 0, 1, 0)`,
        args: [playerId, name, team, position, tournamentId]
      });

      return res.status(201).json({ success: true, playerId });
    }

    // ============================================
    // PUT - Update player
    // ============================================
    if (req.method === 'PUT') {
      const { id, totalPoints, avgPoints, matchesPlayed, isActive, isInjured } = req.body;

      if (!id) {
        return res.status(400).json({ error: 'Player ID required' });
      }

      const updates = [];
      const args = [];

      if (totalPoints !== undefined) {
        updates.push('total_points = ?');
        args.push(totalPoints);
      }

      if (avgPoints !== undefined) {
        updates.push('avg_points = ?');
        args.push(avgPoints);
      }

      if (matchesPlayed !== undefined) {
        updates.push('matches_played = ?');
        args.push(matchesPlayed);
      }

      if (isActive !== undefined) {
        updates.push('is_active = ?');
        args.push(isActive ? 1 : 0);
      }

      if (isInjured !== undefined) {
        updates.push('is_injured = ?');
        args.push(isInjured ? 1 : 0);
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      args.push(id);

      await db.execute({
        sql: `UPDATE players SET ${updates.join(', ')} WHERE id = ?`,
        args
      });

      return res.status(200).json({ success: true, message: 'Player updated' });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('Players API error:', error);
    return res.status(500).json({ error: 'Server error', details: error.message });
  }
}
