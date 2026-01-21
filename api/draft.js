// API: Draft Management (Picks + Roster)
// /api/draft?type=picks - Draft picks
// /api/draft?type=roster - Roster management

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

  const db = getDb();
  const { type, leagueId, teamId } = req.query;

  try {
    // ============================================
    // DRAFT PICKS
    // ============================================
    if (type === 'picks') {
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

        if (!leagueId || !fantasyTeamId || !playerId || round === undefined) {
          return res.status(400).json({ error: 'Missing required fields' });
        }

        // Check if player is already drafted
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
          args: [pickId, leagueId, fantasyTeamId, playerId, round, pickInRound || 1, overallPick || 1]
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
          args: [overallPick || 1, round, leagueId]
        });

        return res.status(201).json({ success: true, pickId, rosterId });
      }

      // DELETE: Reset draft
      if (req.method === 'DELETE') {
        const leagueIdToReset = leagueId || req.body?.leagueId;

        if (!leagueIdToReset) {
          return res.status(400).json({ error: 'leagueId is required' });
        }

        await db.execute({ sql: 'DELETE FROM draft_picks WHERE league_id = ?', args: [leagueIdToReset] });
        
        await db.execute({
          sql: `DELETE FROM roster WHERE fantasy_team_id IN (
                  SELECT id FROM fantasy_teams WHERE league_id = ?
                ) AND acquired_via = 'draft'`,
          args: [leagueIdToReset]
        });

        await db.execute({
          sql: "UPDATE leagues SET draft_status = 'pending', current_pick = 0, current_round = 1 WHERE id = ?",
          args: [leagueIdToReset]
        });

        return res.status(200).json({ success: true, message: 'Draft reset' });
      }
    }

    // ============================================
    // ROSTER MANAGEMENT
    // ============================================
    if (type === 'roster') {
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

      // POST: Add player to roster (free agency)
      if (req.method === 'POST') {
        const { teamId, playerId, slot, acquiredVia = 'free_agency' } = req.body;

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

        const rosterId = generateId();

        await db.execute({
          sql: `INSERT INTO roster (id, fantasy_team_id, player_id, position, acquired_via, acquired_date)
                VALUES (?, ?, ?, ?, ?, datetime('now'))`,
          args: [rosterId, teamId, playerId, slot, acquiredVia]
        });

        // Increment weekly pickups if free agency
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
    }

    return res.status(400).json({ error: 'Invalid type. Use ?type=picks or ?type=roster' });

  } catch (error) {
    console.error('Draft API error:', error);
    return res.status(500).json({ error: 'Database error', details: error.message });
  }
}
