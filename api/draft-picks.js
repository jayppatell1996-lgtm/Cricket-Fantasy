// API: Draft Picks
import { getDb, generateId } from './_db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const db = getDb();
  const { leagueId } = req.query;

  try {
    // GET: Get draft picks for a league
    if (req.method === 'GET') {
      if (!leagueId) {
        return res.status(400).json({ error: 'leagueId is required' });
      }

      const result = await db.execute({
        sql: `SELECT dp.*, p.name as player_name, p.team as player_team, p.position as player_position,
                     ft.name as team_name, ft.owner_name
              FROM draft_picks dp
              JOIN players p ON dp.player_id = p.id
              JOIN fantasy_teams ft ON dp.fantasy_team_id = ft.id
              WHERE dp.league_id = ?
              ORDER BY dp.overall_pick ASC`,
        args: [leagueId]
      });

      const picks = result.rows.map(p => ({
        id: p.id,
        leagueId: p.league_id,
        fantasyTeamId: p.fantasy_team_id,
        playerId: p.player_id,
        round: p.round,
        pickInRound: p.pick_in_round,
        overallPick: p.overall_pick,
        pickTime: p.pick_time,
        playerName: p.player_name,
        playerTeam: p.player_team,
        playerPosition: p.player_position,
        teamName: p.team_name,
        ownerName: p.owner_name
      }));

      return res.status(200).json({ success: true, picks });
    }

    // POST: Record a draft pick
    if (req.method === 'POST') {
      const { leagueId, fantasyTeamId, playerId, round, pickInRound, overallPick, slot } = req.body;

      if (!leagueId || !fantasyTeamId || !playerId || round === undefined || pickInRound === undefined || overallPick === undefined) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      // Check if player is already drafted in this league
      const existingPick = await db.execute({
        sql: 'SELECT id FROM draft_picks WHERE league_id = ? AND player_id = ?',
        args: [leagueId, playerId]
      });

      if (existingPick.rows.length > 0) {
        return res.status(400).json({ error: 'Player already drafted' });
      }

      const pickId = generateId();
      const rosterId = generateId();

      // Record the draft pick
      await db.execute({
        sql: `INSERT INTO draft_picks (id, league_id, fantasy_team_id, player_id, round, pick_in_round, overall_pick, pick_time)
              VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        args: [pickId, leagueId, fantasyTeamId, playerId, round, pickInRound, overallPick]
      });

      // Add player to roster
      await db.execute({
        sql: `INSERT INTO roster (id, fantasy_team_id, player_id, position, acquired_via, acquired_date)
              VALUES (?, ?, ?, ?, 'draft', datetime('now'))`,
        args: [rosterId, fantasyTeamId, playerId, slot || 'flex']
      });

      // Update league current pick
      await db.execute({
        sql: 'UPDATE leagues SET current_pick = ?, current_round = ? WHERE id = ?',
        args: [overallPick, round, leagueId]
      });

      return res.status(201).json({ success: true, pickId, rosterId });
    }

    // DELETE: Reset draft (admin only)
    if (req.method === 'DELETE') {
      const leagueIdToReset = req.query.leagueId || req.body?.leagueId;

      if (!leagueIdToReset) {
        return res.status(400).json({ error: 'leagueId is required' });
      }

      // Delete all draft picks for this league
      await db.execute({
        sql: 'DELETE FROM draft_picks WHERE league_id = ?',
        args: [leagueIdToReset]
      });

      // Delete all roster entries acquired via draft for teams in this league
      await db.execute({
        sql: `DELETE FROM roster WHERE fantasy_team_id IN (
                SELECT id FROM fantasy_teams WHERE league_id = ?
              ) AND acquired_via = 'draft'`,
        args: [leagueIdToReset]
      });

      // Reset league draft status
      await db.execute({
        sql: "UPDATE leagues SET draft_status = 'pending', current_pick = 0, current_round = 1 WHERE id = ?",
        args: [leagueIdToReset]
      });

      return res.status(200).json({ success: true, message: 'Draft reset' });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('Draft Picks API error:', error);
    return res.status(500).json({ error: 'Database error', details: error.message });
  }
}
