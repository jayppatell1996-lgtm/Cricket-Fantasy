// API: Draft (Picks & Roster)
// GET /api/draft?type=picks - Get draft picks for a league
// POST /api/draft?type=picks - Make a draft pick
// DELETE /api/draft?type=picks - Reset draft
// GET /api/draft?type=roster - Get team roster
// POST /api/draft?type=roster - Add player to roster
// DELETE /api/draft?type=roster - Drop player from roster

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

  if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  const db = getDb();
  const { type } = req.query;

  try {
    // ============================================
    // DRAFT PICKS
    // ============================================
    if (type === 'picks') {
      // GET - Fetch draft picks
      if (req.method === 'GET') {
        const { leagueId } = req.query;

        if (!leagueId) {
          return res.status(400).json({ error: 'leagueId required' });
        }

        const result = await db.execute({
          sql: `SELECT dp.*, p.name as player_name, p.team as player_team, p.position as player_position,
                       ft.name as team_name
                FROM draft_picks dp
                LEFT JOIN players p ON dp.player_id = p.id
                LEFT JOIN fantasy_teams ft ON dp.fantasy_team_id = ft.id
                WHERE dp.league_id = ?
                ORDER BY dp.pick_number ASC`,
          args: [leagueId]
        });

        const picks = result.rows.map(p => ({
          id: p.id,
          leagueId: p.league_id,
          teamId: p.fantasy_team_id,
          teamName: p.team_name,
          playerId: p.player_id,
          playerName: p.player_name,
          playerTeam: p.player_team,
          playerPosition: p.player_position,
          round: p.round,
          pickNumber: p.pick_number,
          createdAt: p.created_at
        }));

        return res.status(200).json({ success: true, picks });
      }

      // POST - Make a draft pick
      if (req.method === 'POST') {
        const { leagueId, teamId, playerId, round, pickNumber, slot } = req.body;

        if (!leagueId || !teamId || !playerId) {
          return res.status(400).json({ error: 'leagueId, teamId, and playerId required' });
        }

        // Check if player is already drafted
        const existing = await db.execute({
          sql: 'SELECT id FROM draft_picks WHERE league_id = ? AND player_id = ?',
          args: [leagueId, playerId]
        });

        if (existing.rows.length > 0) {
          return res.status(409).json({ error: 'Player already drafted' });
        }

        const pickId = generateId();

        // Record the draft pick
        await db.execute({
          sql: `INSERT INTO draft_picks (id, league_id, fantasy_team_id, player_id, round, pick_number, created_at)
                VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
          args: [pickId, leagueId, teamId, playerId, round || 1, pickNumber || 0]
        });

        // Add to roster
        await db.execute({
          sql: `INSERT INTO roster (id, fantasy_team_id, player_id, slot, acquired_via, acquired_at)
                VALUES (?, ?, ?, ?, 'draft', datetime('now'))`,
          args: [generateId(), teamId, playerId, slot || 'flex']
        });

        // Update league current pick
        await db.execute({
          sql: 'UPDATE leagues SET current_pick = current_pick + 1 WHERE id = ?',
          args: [leagueId]
        });

        return res.status(201).json({ success: true, pickId });
      }

      // DELETE - Reset draft
      if (req.method === 'DELETE') {
        const { leagueId } = req.query;

        if (!leagueId) {
          return res.status(400).json({ error: 'leagueId required' });
        }

        // Get all teams in this league
        const teams = await db.execute({
          sql: 'SELECT id FROM fantasy_teams WHERE league_id = ?',
          args: [leagueId]
        });

        // Clear rosters
        for (const team of teams.rows) {
          await db.execute({
            sql: "DELETE FROM roster WHERE fantasy_team_id = ? AND acquired_via = 'draft'",
            args: [team.id]
          });
        }

        // Clear draft picks
        await db.execute({
          sql: 'DELETE FROM draft_picks WHERE league_id = ?',
          args: [leagueId]
        });

        // Reset league draft status
        await db.execute({
          sql: "UPDATE leagues SET draft_status = 'pending', current_pick = 0 WHERE id = ?",
          args: [leagueId]
        });

        return res.status(200).json({ success: true, message: 'Draft reset' });
      }
    }

    // ============================================
    // ROSTER
    // ============================================
    if (type === 'roster') {
      // GET - Fetch roster
      if (req.method === 'GET') {
        const { teamId } = req.query;

        if (!teamId) {
          return res.status(400).json({ error: 'teamId required' });
        }

        const result = await db.execute({
          sql: `SELECT r.*, p.name as player_name, p.team as player_team, p.position as player_position,
                       p.total_points, p.avg_points, p.matches_played
                FROM roster r
                LEFT JOIN players p ON r.player_id = p.id
                WHERE r.fantasy_team_id = ?`,
          args: [teamId]
        });

        const roster = result.rows.map(r => ({
          id: r.player_id,
          name: r.player_name,
          team: r.player_team,
          position: r.player_position,
          slot: r.slot,
          totalPoints: r.total_points || 0,
          avgPoints: r.avg_points || 0,
          matchesPlayed: r.matches_played || 0,
          acquiredVia: r.acquired_via,
          acquiredAt: r.acquired_at
        }));

        return res.status(200).json({ success: true, roster });
      }

      // POST - Add player to roster
      if (req.method === 'POST') {
        const { teamId, playerId, slot, acquiredVia = 'free_agency' } = req.body;

        if (!teamId || !playerId) {
          return res.status(400).json({ error: 'teamId and playerId required' });
        }

        // Check if player is already on a roster in this league
        const teamResult = await db.execute({
          sql: 'SELECT league_id FROM fantasy_teams WHERE id = ?',
          args: [teamId]
        });

        if (teamResult.rows.length > 0) {
          const leagueId = teamResult.rows[0].league_id;
          const existing = await db.execute({
            sql: `SELECT r.id FROM roster r
                  JOIN fantasy_teams ft ON r.fantasy_team_id = ft.id
                  WHERE ft.league_id = ? AND r.player_id = ?`,
            args: [leagueId, playerId]
          });

          if (existing.rows.length > 0) {
            return res.status(409).json({ error: 'Player already on a roster in this league' });
          }
        }

        await db.execute({
          sql: `INSERT INTO roster (id, fantasy_team_id, player_id, slot, acquired_via, acquired_at)
                VALUES (?, ?, ?, ?, ?, datetime('now'))`,
          args: [generateId(), teamId, playerId, slot || 'flex', acquiredVia]
        });

        // Increment weekly pickups if free agency
        if (acquiredVia === 'free_agency') {
          await db.execute({
            sql: 'UPDATE fantasy_teams SET weekly_pickups = weekly_pickups + 1 WHERE id = ?',
            args: [teamId]
          });
        }

        return res.status(201).json({ success: true, message: 'Player added to roster' });
      }

      // DELETE - Drop player from roster
      if (req.method === 'DELETE') {
        const { teamId, playerId } = req.body || req.query;

        if (!teamId || !playerId) {
          return res.status(400).json({ error: 'teamId and playerId required' });
        }

        await db.execute({
          sql: 'DELETE FROM roster WHERE fantasy_team_id = ? AND player_id = ?',
          args: [teamId, playerId]
        });

        return res.status(200).json({ success: true, message: 'Player dropped' });
      }
    }

    return res.status(400).json({ error: 'Invalid type. Use ?type=picks or ?type=roster' });

  } catch (error) {
    console.error('Draft API error:', error);
    return res.status(500).json({ error: 'Server error', details: error.message });
  }
}
