// API: Leagues (Fantasy Leagues with Draft Management)
import { getDb, generateId } from './_db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const db = getDb();
  const { tournamentId, leagueId } = req.query;

  try {
    // GET: Fetch league(s)
    if (req.method === 'GET') {
      let sql, args;

      if (leagueId) {
        // Get specific league
        sql = 'SELECT * FROM leagues WHERE id = ?';
        args = [leagueId];
      } else if (tournamentId) {
        // Get leagues for a tournament
        sql = 'SELECT * FROM leagues WHERE tournament_id = ?';
        args = [tournamentId];
      } else {
        // Get all leagues
        sql = 'SELECT * FROM leagues';
        args = [];
      }

      const result = await db.execute({ sql, args });

      const leagues = result.rows.map(l => ({
        id: l.id,
        name: l.name,
        tournamentId: l.tournament_id,
        draftType: l.draft_type,
        draftStatus: l.draft_status,
        draftDate: l.draft_date,
        draftOrder: l.draft_order ? JSON.parse(l.draft_order) : [],
        currentPick: l.current_pick,
        currentRound: l.current_round,
        maxTeams: l.max_teams,
        rosterSize: l.roster_size,
        isPublic: Boolean(l.is_public),
        createdBy: l.created_by,
        createdAt: l.created_at
      }));

      return res.status(200).json({ 
        success: true, 
        league: leagueId ? leagues[0] : undefined,
        leagues: leagueId ? undefined : leagues 
      });
    }

    // POST: Create a new league
    if (req.method === 'POST') {
      const { 
        name, 
        tournamentId, 
        draftType = 'snake', 
        maxTeams = 10, 
        rosterSize = 12,
        isPublic = false,
        createdBy 
      } = req.body;

      if (!name || !tournamentId) {
        return res.status(400).json({ error: 'Name and tournamentId are required' });
      }

      const id = generateId();

      await db.execute({
        sql: `INSERT INTO leagues (id, name, tournament_id, draft_type, draft_status, max_teams, roster_size, is_public, created_by, created_at)
              VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, datetime('now'))`,
        args: [id, name, tournamentId, draftType, maxTeams, rosterSize, isPublic ? 1 : 0, createdBy]
      });

      return res.status(201).json({ success: true, leagueId: id });
    }

    // PUT: Update league (including draft status)
    if (req.method === 'PUT') {
      const { id, draftStatus, draftOrder, currentPick, currentRound, name } = req.body;

      if (!id) {
        return res.status(400).json({ error: 'League ID is required' });
      }

      const updates = [];
      const values = [];

      if (draftStatus) {
        updates.push('draft_status = ?');
        values.push(draftStatus);
      }
      if (draftOrder !== undefined) {
        updates.push('draft_order = ?');
        values.push(JSON.stringify(draftOrder));
      }
      if (currentPick !== undefined) {
        updates.push('current_pick = ?');
        values.push(currentPick);
      }
      if (currentRound !== undefined) {
        updates.push('current_round = ?');
        values.push(currentRound);
      }
      if (name) {
        updates.push('name = ?');
        values.push(name);
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No updates provided' });
      }

      values.push(id);

      await db.execute({
        sql: `UPDATE leagues SET ${updates.join(', ')} WHERE id = ?`,
        args: values
      });

      return res.status(200).json({ success: true, message: 'League updated' });
    }

    // DELETE: Delete a league
    if (req.method === 'DELETE') {
      const id = req.query.id || req.body?.id;

      if (!id) {
        return res.status(400).json({ error: 'League ID is required' });
      }

      // Delete related data first
      await db.execute({ sql: 'DELETE FROM draft_picks WHERE league_id = ?', args: [id] });
      await db.execute({ sql: 'DELETE FROM transactions WHERE league_id = ?', args: [id] });
      await db.execute({ sql: 'DELETE FROM weekly_scores WHERE league_id = ?', args: [id] });
      
      // Delete rosters for teams in this league
      const teams = await db.execute({ 
        sql: 'SELECT id FROM fantasy_teams WHERE league_id = ?', 
        args: [id] 
      });
      for (const team of teams.rows) {
        await db.execute({ sql: 'DELETE FROM roster WHERE fantasy_team_id = ?', args: [team.id] });
      }
      
      await db.execute({ sql: 'DELETE FROM fantasy_teams WHERE league_id = ?', args: [id] });
      await db.execute({ sql: 'DELETE FROM leagues WHERE id = ?', args: [id] });

      return res.status(200).json({ success: true, message: 'League deleted' });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('Leagues API error:', error);
    return res.status(500).json({ error: 'Database error', details: error.message });
  }
}
