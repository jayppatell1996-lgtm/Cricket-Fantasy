// API: Users (Admin only)
import { getDb } from './_db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const db = getDb();

  try {
    // GET: Get all users
    if (req.method === 'GET') {
      const result = await db.execute(
        'SELECT id, email, name, created_at, updated_at FROM users ORDER BY created_at DESC'
      );

      // Get team info for each user
      const users = await Promise.all(result.rows.map(async (u) => {
        const teamsResult = await db.execute({
          sql: 'SELECT id, name, tournament_id, total_points FROM fantasy_teams WHERE user_id = ?',
          args: [u.id]
        });

        return {
          id: u.id,
          email: u.email,
          name: u.name,
          isAdmin: u.email.toLowerCase() === 'admin@t20fantasy.com',
          createdAt: u.created_at,
          lastLogin: u.updated_at,
          teams: teamsResult.rows.map(t => ({
            id: t.id,
            name: t.name,
            tournamentId: t.tournament_id,
            totalPoints: t.total_points
          })),
          hasTeam: teamsResult.rows.length > 0
        };
      }));

      return res.status(200).json({ success: true, users });
    }

    // DELETE: Delete a user (admin only)
    if (req.method === 'DELETE') {
      const userId = req.query.id || req.body?.id;

      if (!userId) {
        return res.status(400).json({ error: 'User ID is required' });
      }

      // Don't allow deleting admin
      const userResult = await db.execute({
        sql: 'SELECT email FROM users WHERE id = ?',
        args: [userId]
      });

      if (userResult.rows.length > 0 && 
          userResult.rows[0].email.toLowerCase() === 'admin@t20fantasy.com') {
        return res.status(403).json({ error: 'Cannot delete admin user' });
      }

      // Delete user's teams and related data first
      const teams = await db.execute({
        sql: 'SELECT id FROM fantasy_teams WHERE user_id = ?',
        args: [userId]
      });

      for (const team of teams.rows) {
        await db.execute({ sql: 'DELETE FROM roster WHERE fantasy_team_id = ?', args: [team.id] });
        await db.execute({ sql: 'DELETE FROM draft_picks WHERE fantasy_team_id = ?', args: [team.id] });
        await db.execute({ sql: 'DELETE FROM transactions WHERE fantasy_team_id = ?', args: [team.id] });
        await db.execute({ sql: 'DELETE FROM weekly_scores WHERE fantasy_team_id = ?', args: [team.id] });
      }

      await db.execute({ sql: 'DELETE FROM fantasy_teams WHERE user_id = ?', args: [userId] });
      await db.execute({ sql: 'DELETE FROM leagues WHERE created_by = ?', args: [userId] });
      await db.execute({ sql: 'DELETE FROM users WHERE id = ?', args: [userId] });

      return res.status(200).json({ success: true, message: 'User deleted' });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('Users API error:', error);
    return res.status(500).json({ error: 'Database error', details: error.message });
  }
}
