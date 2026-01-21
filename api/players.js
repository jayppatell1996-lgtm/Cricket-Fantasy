/**
 * API Route: Players CRUD
 * GET /api/players?tournament=t20_wc_2026
 * GET /api/players?tournament=ind_nz_test&leagueId=xxx&available=true
 * POST /api/players (single or bulk)
 * PUT /api/players (update player)
 * DELETE /api/players?playerId=xxx
 */

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  const db = getDb();
  const { tournament, tournamentId, leagueId, playerId, available } = req.query;
  const effectiveTournamentId = tournament || tournamentId;

  try {
    // GET: Fetch players
    if (req.method === 'GET') {
      let sql, args;

      if (playerId) {
        // Get specific player
        sql = 'SELECT * FROM players WHERE id = ?';
        args = [playerId];
      } else if (effectiveTournamentId) {
        if (available === 'true' && leagueId) {
          // Get available players (not on any roster in this league)
          sql = `SELECT p.* FROM players p
                 WHERE p.tournament_id = ?
                 AND p.is_active = 1
                 AND p.id NOT IN (
                   SELECT r.player_id FROM roster r
                   JOIN fantasy_teams ft ON r.fantasy_team_id = ft.id
                   WHERE ft.league_id = ?
                 )
                 ORDER BY p.total_points DESC, p.name ASC`;
          args = [effectiveTournamentId, leagueId];
        } else {
          // Get all players for tournament
          sql = 'SELECT * FROM players WHERE tournament_id = ? AND is_active = 1 ORDER BY total_points DESC, name ASC';
          args = [effectiveTournamentId];
        }
      } else {
        // Get all players
        sql = 'SELECT * FROM players WHERE is_active = 1 ORDER BY tournament_id, total_points DESC, name ASC';
        args = [];
      }

      const result = await db.execute({ sql, args });

      const players = result.rows.map(p => ({
        id: p.id,
        name: p.name,
        team: p.team,
        position: p.position,
        tournamentId: p.tournament_id,
        imageUrl: p.image_url,
        price: p.price || 0,
        avgPoints: p.avg_points || 0,
        totalPoints: p.total_points || 0,
        matchesPlayed: p.matches_played || 0,
        isActive: p.is_active === 1 || p.is_active === true,
        isInjured: p.is_injured === 1 || p.is_injured === true,
        injuryDetails: p.injury_details
      }));

      return res.status(200).json({ 
        success: true, 
        tournament: effectiveTournamentId || 'all',
        player: playerId ? players[0] : undefined,
        players: playerId ? undefined : players,
        count: players.length
      });
    }

    // POST: Add player(s)
    if (req.method === 'POST') {
      const body = req.body;

      // Bulk insert
      if (body.players && Array.isArray(body.players)) {
        const tournamentIdForBulk = body.tournamentId;
        let inserted = 0;
        
        for (const p of body.players) {
          const id = p.id || generateId();
          try {
            await db.execute({
              sql: `INSERT OR REPLACE INTO players (id, name, team, position, tournament_id, image_url, price, avg_points, total_points, matches_played, is_active, is_injured)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
              args: [id, p.name, p.team, p.position, tournamentIdForBulk || p.tournamentId, p.imageUrl || null, p.price || 0, p.avgPoints || 0, p.totalPoints || 0, p.matchesPlayed || 0]
            });
            inserted++;
          } catch (err) {
            console.error(`Failed to insert player ${p.name}:`, err.message);
          }
        }

        return res.status(201).json({ success: true, inserted, total: body.players.length });
      }

      // Single insert
      const { name, team, position, imageUrl, price } = body;
      const singleTournamentId = body.tournamentId;

      if (!name || !team || !position) {
        return res.status(400).json({ error: 'name, team, and position are required' });
      }

      const id = generateId();

      await db.execute({
        sql: `INSERT INTO players (id, name, team, position, tournament_id, image_url, price, avg_points, total_points, matches_played, is_active, is_injured)
              VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 1, 0)`,
        args: [id, name, team, position, singleTournamentId, imageUrl || null, price || 0]
      });

      return res.status(201).json({ success: true, playerId: id });
    }

    // PUT: Update a player
    if (req.method === 'PUT') {
      const { id, totalPoints, avgPoints, matchesPlayed, isInjured, injuryDetails, isActive } = req.body;

      if (!id) {
        return res.status(400).json({ error: 'Player ID is required' });
      }

      const updates = [];
      const values = [];

      if (totalPoints !== undefined) {
        updates.push('total_points = ?');
        values.push(totalPoints);
      }
      if (avgPoints !== undefined) {
        updates.push('avg_points = ?');
        values.push(avgPoints);
      }
      if (matchesPlayed !== undefined) {
        updates.push('matches_played = ?');
        values.push(matchesPlayed);
      }
      if (isInjured !== undefined) {
        updates.push('is_injured = ?');
        values.push(isInjured ? 1 : 0);
      }
      if (injuryDetails !== undefined) {
        updates.push('injury_details = ?');
        values.push(injuryDetails);
      }
      if (isActive !== undefined) {
        updates.push('is_active = ?');
        values.push(isActive ? 1 : 0);
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No updates provided' });
      }

      values.push(id);

      await db.execute({
        sql: `UPDATE players SET ${updates.join(', ')} WHERE id = ?`,
        args: values
      });

      return res.status(200).json({ success: true, message: 'Player updated' });
    }

    // DELETE: Remove a player (soft delete)
    if (req.method === 'DELETE') {
      const id = playerId || req.body?.id;

      if (!id) {
        return res.status(400).json({ error: 'Player ID is required' });
      }

      await db.execute({
        sql: 'UPDATE players SET is_active = 0 WHERE id = ?',
        args: [id]
      });

      return res.status(200).json({ success: true, message: 'Player deactivated' });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('Players API error:', error);
    return res.status(500).json({ error: 'Database error', details: error.message });
  }
}
