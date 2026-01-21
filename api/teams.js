// API: Teams Management
// GET /api/teams - Get teams (filter by tournament, league, user)
// POST /api/teams - Create new team
// PUT /api/teams - Update team
// DELETE /api/teams - Delete team

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
    // GET - Fetch teams
    // ============================================
    if (req.method === 'GET') {
      const { teamId, userId, tournamentId, leagueId } = req.query;

      let sql = `
        SELECT ft.*, 
               u.name as user_name, u.email as user_email,
               l.name as league_name, l.draft_status
        FROM fantasy_teams ft
        LEFT JOIN users u ON ft.user_id = u.id
        LEFT JOIN leagues l ON ft.league_id = l.id
        WHERE 1=1
      `;
      const args = [];

      if (teamId) {
        sql += ' AND ft.id = ?';
        args.push(teamId);
      }

      if (userId) {
        sql += ' AND ft.user_id = ?';
        args.push(userId);
      }

      if (tournamentId) {
        sql += ' AND ft.tournament_id = ?';
        args.push(tournamentId);
      }

      if (leagueId) {
        sql += ' AND ft.league_id = ?';
        args.push(leagueId);
      }

      sql += ' ORDER BY ft.created_at DESC';

      const result = await db.execute({ sql, args });

      // Get roster for each team
      const teams = await Promise.all(result.rows.map(async (t) => {
        const rosterResult = await db.execute({
          sql: `SELECT r.*, p.name as player_name, p.team as player_team, p.position as player_position
                FROM roster r
                LEFT JOIN players p ON r.player_id = p.id
                WHERE r.fantasy_team_id = ?`,
          args: [t.id]
        });

        const roster = rosterResult.rows.map(r => ({
          id: r.player_id,
          playerId: r.player_id,
          name: r.player_name || 'Unknown Player',
          playerName: r.player_name,
          team: r.player_team || 'Unknown',
          playerTeam: r.player_team,
          position: r.player_position || r.position || 'flex',
          slot: r.position || 'flex', // position column stores slot in DB schema
          acquiredVia: r.acquired_via,
          acquiredAt: r.acquired_date
        }));

        return {
          id: t.id,
          name: t.name,
          owner: t.owner_name,
          userId: t.user_id,
          userEmail: t.user_email,
          userName: t.user_name,
          tournamentId: t.tournament_id,
          leagueId: t.league_id,
          leagueName: t.league_name,
          draftStatus: t.draft_status,
          draftPosition: t.draft_position,
          logoUrl: t.logo_url,
          totalPoints: t.total_points,
          weeklyPickups: t.weekly_pickups,
          weeklyPickupsResetDate: t.weekly_pickups_reset_date,
          roster,
          createdAt: t.created_at
        };
      }));

      if (teamId) {
        return res.status(200).json({ success: true, team: teams[0] || null });
      }

      return res.status(200).json({ success: true, teams });
    }

    // ============================================
    // POST - Create team
    // ============================================
    if (req.method === 'POST') {
      const { userId, tournamentId, name, ownerName, logoUrl } = req.body;

      if (!userId || !tournamentId || !name) {
        return res.status(400).json({ error: 'userId, tournamentId, and name required' });
      }

      // Check if user already has a team in this tournament
      const existing = await db.execute({
        sql: 'SELECT id FROM fantasy_teams WHERE user_id = ? AND tournament_id = ?',
        args: [userId, tournamentId]
      });

      if (existing.rows.length > 0) {
        return res.status(409).json({ error: 'You already have a team in this tournament' });
      }

      // Find the default league for this tournament
      const leagueResult = await db.execute({
        sql: 'SELECT id FROM leagues WHERE tournament_id = ? ORDER BY created_at ASC LIMIT 1',
        args: [tournamentId]
      });

      const leagueId = leagueResult.rows[0]?.id || null;

      // Get current team count for draft position
      let draftPosition = 1;
      if (leagueId) {
        const countResult = await db.execute({
          sql: 'SELECT COUNT(*) as count FROM fantasy_teams WHERE league_id = ?',
          args: [leagueId]
        });
        draftPosition = (countResult.rows[0]?.count || 0) + 1;
      }

      const teamId = generateId();

      await db.execute({
        sql: `INSERT INTO fantasy_teams (id, name, owner_name, user_id, tournament_id, league_id, draft_position, logo_url, total_points, weekly_pickups, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, datetime('now'))`,
        args: [teamId, name, ownerName || name, userId, tournamentId, leagueId, draftPosition, logoUrl || null]
      });

      return res.status(201).json({ 
        success: true, 
        teamId,
        leagueId,
        draftPosition
      });
    }

    // ============================================
    // PUT - Update team
    // ============================================
    if (req.method === 'PUT') {
      const { id, name, totalPoints, weeklyPickups, weeklyPickupsResetDate, roster } = req.body;

      if (!id) {
        return res.status(400).json({ error: 'Team ID required' });
      }

      const updates = [];
      const args = [];

      if (name !== undefined) {
        updates.push('name = ?');
        args.push(name);
      }

      if (totalPoints !== undefined) {
        updates.push('total_points = ?');
        args.push(totalPoints);
      }

      if (weeklyPickups !== undefined) {
        updates.push('weekly_pickups = ?');
        args.push(weeklyPickups);
      }

      if (weeklyPickupsResetDate !== undefined) {
        updates.push('weekly_pickups_reset_date = ?');
        args.push(weeklyPickupsResetDate);
      }

      if (updates.length > 0) {
        args.push(id);
        await db.execute({
          sql: `UPDATE fantasy_teams SET ${updates.join(', ')} WHERE id = ?`,
          args
        });
      }

      // Update roster if provided
      if (roster && Array.isArray(roster)) {
        // Clear existing roster
        await db.execute({ sql: 'DELETE FROM roster WHERE fantasy_team_id = ?', args: [id] });

        // Insert new roster
        for (const player of roster) {
          await db.execute({
            sql: `INSERT INTO roster (id, fantasy_team_id, player_id, position, acquired_via)
                  VALUES (?, ?, ?, ?, ?)`,
            args: [generateId(), id, player.id || player.playerId, player.slot || player.position || 'flex', player.acquiredVia || 'draft']
          });
        }
      }

      return res.status(200).json({ success: true, message: 'Team updated' });
    }

    // ============================================
    // DELETE - Delete team
    // ============================================
    if (req.method === 'DELETE') {
      const { teamId } = req.query;

      if (!teamId) {
        return res.status(400).json({ error: 'Team ID required' });
      }

      // Delete associated data
      await db.execute({ sql: 'DELETE FROM roster WHERE fantasy_team_id = ?', args: [teamId] });
      await db.execute({ sql: 'DELETE FROM draft_picks WHERE fantasy_team_id = ?', args: [teamId] });
      await db.execute({ sql: 'DELETE FROM fantasy_teams WHERE id = ?', args: [teamId] });

      return res.status(200).json({ success: true, message: 'Team deleted' });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('Teams API error:', error);
    return res.status(500).json({ error: 'Server error', details: error.message });
  }
}
