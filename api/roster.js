// API: Roster Management (Add/Drop Players)
import { getDb, generateId } from './_db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const db = getDb();
  const { teamId } = req.query;

  try {
    // GET: Get roster for a team
    if (req.method === 'GET') {
      if (!teamId) {
        return res.status(400).json({ error: 'teamId is required' });
      }

      const result = await db.execute({
        sql: `SELECT r.*, p.name, p.team, p.position as player_position, p.total_points, p.matches_played, p.image_url, p.is_injured
              FROM roster r
              JOIN players p ON r.player_id = p.id
              WHERE r.fantasy_team_id = ?
              ORDER BY r.position`,
        args: [teamId]
      });

      const roster = result.rows.map(r => ({
        id: r.player_id,
        rosterId: r.id,
        name: r.name,
        team: r.team,
        position: r.player_position,
        slot: r.position,
        totalPoints: r.total_points || 0,
        matchesPlayed: r.matches_played || 0,
        imageUrl: r.image_url,
        isOnIR: Boolean(r.is_on_ir),
        isInjured: Boolean(r.is_injured),
        acquiredVia: r.acquired_via,
        acquiredDate: r.acquired_date
      }));

      return res.status(200).json({ success: true, roster });
    }

    // POST: Add player to roster
    if (req.method === 'POST') {
      const { teamId, playerId, slot, acquiredVia = 'draft' } = req.body;

      if (!teamId || !playerId || !slot) {
        return res.status(400).json({ error: 'teamId, playerId, and slot are required' });
      }

      // Check if player is already on this team
      const existing = await db.execute({
        sql: 'SELECT id FROM roster WHERE fantasy_team_id = ? AND player_id = ?',
        args: [teamId, playerId]
      });

      if (existing.rows.length > 0) {
        return res.status(400).json({ error: 'Player is already on your roster' });
      }

      // Check if player is on another team in the same league
      const teamResult = await db.execute({
        sql: 'SELECT league_id FROM fantasy_teams WHERE id = ?',
        args: [teamId]
      });

      if (teamResult.rows.length === 0) {
        return res.status(404).json({ error: 'Team not found' });
      }

      const leagueId = teamResult.rows[0].league_id;

      const onOtherTeam = await db.execute({
        sql: `SELECT r.id FROM roster r
              JOIN fantasy_teams ft ON r.fantasy_team_id = ft.id
              WHERE ft.league_id = ? AND r.player_id = ?`,
        args: [leagueId, playerId]
      });

      if (onOtherTeam.rows.length > 0) {
        return res.status(400).json({ error: 'Player is already on another team in this league' });
      }

      const rosterId = generateId();

      await db.execute({
        sql: `INSERT INTO roster (id, fantasy_team_id, player_id, position, acquired_via, acquired_date)
              VALUES (?, ?, ?, ?, ?, datetime('now'))`,
        args: [rosterId, teamId, playerId, slot, acquiredVia]
      });

      // If this is a free agency pickup, increment weekly pickups
      if (acquiredVia === 'free_agency') {
        await db.execute({
          sql: 'UPDATE fantasy_teams SET weekly_pickups = weekly_pickups + 1 WHERE id = ?',
          args: [teamId]
        });
      }

      return res.status(201).json({ success: true, rosterId });
    }

    // DELETE: Drop player from roster
    if (req.method === 'DELETE') {
      const { teamId: bodyTeamId, playerId } = req.body;
      const finalTeamId = teamId || bodyTeamId;

      if (!finalTeamId || !playerId) {
        return res.status(400).json({ error: 'teamId and playerId are required' });
      }

      await db.execute({
        sql: 'DELETE FROM roster WHERE fantasy_team_id = ? AND player_id = ?',
        args: [finalTeamId, playerId]
      });

      return res.status(200).json({ success: true, message: 'Player dropped' });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('Roster API error:', error);
    return res.status(500).json({ error: 'Database error', details: error.message });
  }
}
