// API: Fantasy Teams
import { getDb, generateId } from './_db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const db = getDb();
  const { tournamentId, leagueId, userId, teamId } = req.query;

  try {
    // GET: Fetch teams
    if (req.method === 'GET') {
      let sql, args;

      if (teamId) {
        // Get specific team with roster
        const teamResult = await db.execute({
          sql: 'SELECT * FROM fantasy_teams WHERE id = ?',
          args: [teamId]
        });

        if (teamResult.rows.length === 0) {
          return res.status(404).json({ error: 'Team not found' });
        }

        const team = teamResult.rows[0];

        // Get roster
        const rosterResult = await db.execute({
          sql: `SELECT r.*, p.name, p.team, p.position as player_position, p.total_points, p.matches_played, p.image_url
                FROM roster r
                JOIN players p ON r.player_id = p.id
                WHERE r.fantasy_team_id = ?`,
          args: [teamId]
        });

        const roster = rosterResult.rows.map(r => ({
          id: r.player_id,
          name: r.name,
          team: r.team,
          position: r.player_position,
          slot: r.position, // The slot this player is in (batters, keepers, etc)
          totalPoints: r.total_points || 0,
          matchesPlayed: r.matches_played || 0,
          imageUrl: r.image_url,
          isOnIR: Boolean(r.is_on_ir),
          acquiredVia: r.acquired_via,
          acquiredDate: r.acquired_date
        }));

        return res.status(200).json({
          success: true,
          team: {
            id: team.id,
            userId: team.user_id,
            leagueId: team.league_id,
            tournamentId: team.tournament_id,
            name: team.name,
            ownerName: team.owner_name,
            logoUrl: team.logo_url,
            totalPoints: team.total_points || 0,
            weeklyPickups: team.weekly_pickups || 0,
            weeklyPickupLimit: team.weekly_pickup_limit || 4,
            lastPickupReset: team.last_pickup_reset,
            draftPosition: team.draft_position,
            roster
          }
        });
      }

      // Build query based on filters
      const conditions = [];
      args = [];

      if (tournamentId) {
        conditions.push('tournament_id = ?');
        args.push(tournamentId);
      }
      if (leagueId) {
        conditions.push('league_id = ?');
        args.push(leagueId);
      }
      if (userId) {
        conditions.push('user_id = ?');
        args.push(userId);
      }

      sql = 'SELECT * FROM fantasy_teams' + 
            (conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : '') +
            ' ORDER BY total_points DESC';

      const result = await db.execute({ sql, args });

      const teams = result.rows.map(t => ({
        id: t.id,
        userId: t.user_id,
        leagueId: t.league_id,
        tournamentId: t.tournament_id,
        name: t.name,
        ownerName: t.owner_name,
        owner: t.owner_name, // Alias for compatibility
        logoUrl: t.logo_url,
        totalPoints: t.total_points || 0,
        weeklyPickups: t.weekly_pickups || 0,
        weeklyPickupLimit: t.weekly_pickup_limit || 4,
        draftPosition: t.draft_position,
        createdAt: t.created_at
      }));

      return res.status(200).json({ success: true, teams });
    }

    // POST: Create a new team
    if (req.method === 'POST') {
      const { 
        userId, 
        leagueId, 
        tournamentId, 
        name, 
        ownerName, 
        logoUrl 
      } = req.body;

      if (!userId || !tournamentId || !name || !ownerName) {
        return res.status(400).json({ error: 'userId, tournamentId, name, and ownerName are required' });
      }

      // Check if user already has a team in this tournament
      const existing = await db.execute({
        sql: 'SELECT id FROM fantasy_teams WHERE user_id = ? AND tournament_id = ?',
        args: [userId, tournamentId]
      });

      if (existing.rows.length > 0) {
        return res.status(400).json({ 
          error: 'You already have a team in this tournament',
          existingTeamId: existing.rows[0].id
        });
      }

      const teamId = generateId();
      
      // Find or create a default league for this tournament
      let actualLeagueId = leagueId;
      if (!actualLeagueId) {
        const leagueResult = await db.execute({
          sql: 'SELECT id FROM leagues WHERE tournament_id = ? LIMIT 1',
          args: [tournamentId]
        });
        
        if (leagueResult.rows.length === 0) {
          // Create default league
          actualLeagueId = `league_${tournamentId}`;
          await db.execute({
            sql: `INSERT INTO leagues (id, name, tournament_id, draft_type, draft_status, max_teams, roster_size, is_public, created_at)
                  VALUES (?, ?, ?, 'snake', 'pending', 10, 12, 1, datetime('now'))`,
            args: [actualLeagueId, `${tournamentId} League`, tournamentId]
          });
        } else {
          actualLeagueId = leagueResult.rows[0].id;
        }
      }

      // Get draft position (count of existing teams + 1)
      const countResult = await db.execute({
        sql: 'SELECT COUNT(*) as count FROM fantasy_teams WHERE league_id = ?',
        args: [actualLeagueId]
      });
      const draftPosition = (countResult.rows[0]?.count || 0) + 1;

      await db.execute({
        sql: `INSERT INTO fantasy_teams (id, user_id, league_id, tournament_id, name, owner_name, logo_url, total_points, weekly_pickups, weekly_pickup_limit, draft_position, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 4, ?, datetime('now'), datetime('now'))`,
        args: [teamId, userId, actualLeagueId, tournamentId, name, ownerName, logoUrl, draftPosition]
      });

      return res.status(201).json({ 
        success: true, 
        teamId,
        leagueId: actualLeagueId,
        draftPosition
      });
    }

    // PUT: Update a team
    if (req.method === 'PUT') {
      const { id, name, ownerName, logoUrl, totalPoints, weeklyPickups, lastPickupReset } = req.body;

      if (!id) {
        return res.status(400).json({ error: 'Team ID is required' });
      }

      const updates = [];
      const values = [];

      if (name !== undefined) {
        updates.push('name = ?');
        values.push(name);
      }
      if (ownerName !== undefined) {
        updates.push('owner_name = ?');
        values.push(ownerName);
      }
      if (logoUrl !== undefined) {
        updates.push('logo_url = ?');
        values.push(logoUrl);
      }
      if (totalPoints !== undefined) {
        updates.push('total_points = ?');
        values.push(totalPoints);
      }
      if (weeklyPickups !== undefined) {
        updates.push('weekly_pickups = ?');
        values.push(weeklyPickups);
      }
      if (lastPickupReset !== undefined) {
        updates.push('last_pickup_reset = ?');
        values.push(lastPickupReset);
      }

      updates.push("updated_at = datetime('now')");
      values.push(id);

      await db.execute({
        sql: `UPDATE fantasy_teams SET ${updates.join(', ')} WHERE id = ?`,
        args: values
      });

      return res.status(200).json({ success: true, message: 'Team updated' });
    }

    // DELETE: Delete a team
    if (req.method === 'DELETE') {
      const id = req.query.teamId || req.body?.id;

      if (!id) {
        return res.status(400).json({ error: 'Team ID is required' });
      }

      // Delete roster first
      await db.execute({ sql: 'DELETE FROM roster WHERE fantasy_team_id = ?', args: [id] });
      await db.execute({ sql: 'DELETE FROM draft_picks WHERE fantasy_team_id = ?', args: [id] });
      await db.execute({ sql: 'DELETE FROM transactions WHERE fantasy_team_id = ?', args: [id] });
      await db.execute({ sql: 'DELETE FROM weekly_scores WHERE fantasy_team_id = ?', args: [id] });
      await db.execute({ sql: 'DELETE FROM fantasy_teams WHERE id = ?', args: [id] });

      return res.status(200).json({ success: true, message: 'Team deleted' });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('Teams API error:', error);
    return res.status(500).json({ error: 'Database error', details: error.message });
  }
}
