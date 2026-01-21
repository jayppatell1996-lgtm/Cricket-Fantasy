// API: Leagues Management
// GET /api/leagues - Get all leagues (optionally filter by tournament)
// POST /api/leagues - Create new league
// PUT /api/leagues - Update league (including draft status)
// DELETE /api/leagues - Delete league

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

  try {
    // ============================================
    // GET - Fetch leagues
    // ============================================
    if (req.method === 'GET') {
      const { tournamentId, leagueId } = req.query;

      let sql = 'SELECT * FROM leagues WHERE 1=1';
      const args = [];

      if (leagueId) {
        sql += ' AND id = ?';
        args.push(leagueId);
      }

      if (tournamentId) {
        sql += ' AND tournament_id = ?';
        args.push(tournamentId);
      }

      sql += ' ORDER BY created_at DESC';

      const result = await db.execute({ sql, args });

      const leagues = result.rows.map(l => {
        let draftOrder = null;
        if (l.draft_order) {
          try {
            draftOrder = JSON.parse(l.draft_order);
            console.log(`League ${l.id}: draftOrder has ${draftOrder?.length || 0} picks`);
          } catch (e) {
            console.error('Failed to parse draft_order:', e);
          }
        }
        
        return {
          id: l.id,
          name: l.name,
          tournamentId: l.tournament_id,
          draftType: l.draft_type,
          draftStatus: l.draft_status,
          draftOrder: draftOrder,
          currentPick: l.current_pick || 0,
          maxTeams: l.max_teams,
          rosterSize: l.roster_size,
          isPublic: Boolean(l.is_public),
          createdAt: l.created_at
        };
      });

      if (leagueId) {
        return res.status(200).json({ success: true, league: leagues[0] || null });
      }

      return res.status(200).json({ success: true, leagues });
    }

    // ============================================
    // POST - Create league
    // ============================================
    if (req.method === 'POST') {
      const { name, tournamentId, draftType = 'snake', maxTeams = 10, rosterSize = 12 } = req.body;

      if (!name || !tournamentId) {
        return res.status(400).json({ error: 'Name and tournamentId required' });
      }

      const leagueId = generateId();

      await db.execute({
        sql: `INSERT INTO leagues (id, name, tournament_id, draft_type, draft_status, max_teams, roster_size, is_public, created_at)
              VALUES (?, ?, ?, ?, 'pending', ?, ?, 1, datetime('now'))`,
        args: [leagueId, name, tournamentId, draftType, maxTeams, rosterSize]
      });

      return res.status(201).json({ success: true, leagueId });
    }

    // ============================================
    // PUT - Update league
    // ============================================
    if (req.method === 'PUT') {
      const { id, name, draftStatus, draftOrder, currentPick } = req.body;

      if (!id) {
        return res.status(400).json({ error: 'League ID required' });
      }

      const updates = [];
      const args = [];

      if (name !== undefined) {
        updates.push('name = ?');
        args.push(name);
      }

      if (draftStatus !== undefined) {
        updates.push('draft_status = ?');
        args.push(draftStatus);
      }

      if (draftOrder !== undefined) {
        updates.push('draft_order = ?');
        const orderJson = JSON.stringify(draftOrder);
        args.push(orderJson);
        console.log(`Saving draftOrder with ${draftOrder?.length || 0} picks`);
      }

      if (currentPick !== undefined) {
        updates.push('current_pick = ?');
        args.push(currentPick);
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      args.push(id);

      await db.execute({
        sql: `UPDATE leagues SET ${updates.join(', ')} WHERE id = ?`,
        args
      });

      return res.status(200).json({ success: true, message: 'League updated' });
    }

    // ============================================
    // DELETE - Delete league
    // ============================================
    if (req.method === 'DELETE') {
      const { id } = req.query;

      if (!id) {
        return res.status(400).json({ error: 'League ID required' });
      }

      // Delete associated data first
      const teams = await db.execute({
        sql: 'SELECT id FROM fantasy_teams WHERE league_id = ?',
        args: [id]
      });

      for (const team of teams.rows) {
        await db.execute({ sql: 'DELETE FROM roster WHERE fantasy_team_id = ?', args: [team.id] });
        await db.execute({ sql: 'DELETE FROM draft_picks WHERE fantasy_team_id = ?', args: [team.id] });
      }

      await db.execute({ sql: 'DELETE FROM fantasy_teams WHERE league_id = ?', args: [id] });
      await db.execute({ sql: 'DELETE FROM draft_picks WHERE league_id = ?', args: [id] });
      await db.execute({ sql: 'DELETE FROM leagues WHERE id = ?', args: [id] });

      return res.status(200).json({ success: true, message: 'League deleted' });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('Leagues API error:', error);
    return res.status(500).json({ error: 'Server error', details: error.message });
  }
}
