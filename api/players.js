// API: Players Management
// GET /api/players - Get players (filter by tournament, position, team)
// POST /api/players - Create player or bulk insert
// PUT /api/players - Update player stats

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
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
    // GET - Fetch players
    // ============================================
    if (req.method === 'GET') {
      const { tournament, playerId, position, team, leagueId, available, action } = req.query;

      // === GET PLAYER GAME LOG ===
      if (action === 'gamelog' && playerId) {
        console.log(`📊 Getting game log for player: ${playerId}`);
        
        // Simple query - just get stats directly from player_stats table
        const statsResult = await db.execute({
          sql: `SELECT id, player_id, match_id, match_date, opponent, runs, balls_faced, fours, sixes, strike_rate, overs_bowled, runs_conceded, wickets, maiden_overs, economy_rate, catches, run_outs, stumpings, fantasy_points 
                FROM player_stats 
                WHERE player_id = ? 
                ORDER BY match_date DESC`,
          args: [playerId]
        });
        
        console.log(`📊 Found ${statsResult.rows.length} stats entries for ${playerId}`);
        
        const gameLog = statsResult.rows.map(s => ({
          matchId: s.match_id,
          matchDate: s.match_date,
          opponent: s.opponent || 'Unknown',
          runs: s.runs || 0,
          ballsFaced: s.balls_faced || 0,
          fours: s.fours || 0,
          sixes: s.sixes || 0,
          strikeRate: s.strike_rate || 0,
          overs: s.overs_bowled || 0,
          runsConceded: s.runs_conceded || 0,
          wickets: s.wickets || 0,
          maidens: s.maiden_overs || 0,
          economy: s.economy_rate || 0,
          catches: s.catches || 0,
          runOuts: s.run_outs || 0,
          stumpings: s.stumpings || 0,
          fantasyPoints: s.fantasy_points || 0
        }));
        
        return res.status(200).json({ 
          success: true, 
          playerId,
          count: gameLog.length,
          gameLog 
        });
      }

      let sql = 'SELECT * FROM players WHERE 1=1';
      const args = [];

      if (playerId) {
        sql += ' AND id = ?';
        args.push(playerId);
      }

      if (tournament) {
        sql += ' AND tournament_id = ?';
        args.push(tournament);
      }

      if (position) {
        sql += ' AND position = ?';
        args.push(position);
      }

      if (team) {
        sql += ' AND team = ?';
        args.push(team);
      }

      // Filter out drafted players if available=true
      if (available === 'true' && leagueId) {
        sql += ` AND id NOT IN (
          SELECT player_id FROM roster r
          JOIN fantasy_teams ft ON r.fantasy_team_id = ft.id
          WHERE ft.league_id = ?
        )`;
        args.push(leagueId);
      }

      sql += ' ORDER BY total_points DESC, name ASC';

      const result = await db.execute({ sql, args });

      const players = result.rows.map(p => ({
        id: p.id,
        name: p.name,
        team: p.team,
        position: p.position,
        tournamentId: p.tournament_id,
        price: p.price || 0,
        avgPoints: p.avg_points || 0,
        totalPoints: p.total_points || 0,
        matchesPlayed: p.matches_played || 0,
        isActive: Boolean(p.is_active),
        isInjured: Boolean(p.is_injured)
      }));

      if (playerId) {
        return res.status(200).json({ success: true, player: players[0] || null });
      }

      return res.status(200).json({ success: true, players });
    }

    // ============================================
    // POST - Create player(s)
    // ============================================
    if (req.method === 'POST') {
      const { players, tournamentId, name, team, position } = req.body;

      // Bulk insert
      if (players && Array.isArray(players)) {
        let inserted = 0;

        for (const p of players) {
          const pid = p.id || generateId();
          try {
            await db.execute({
              sql: `INSERT OR REPLACE INTO players (id, name, team, position, tournament_id, price, avg_points, total_points, matches_played, is_active, is_injured)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
              args: [pid, p.name, p.team, p.position, tournamentId || p.tournamentId, p.price || 0, p.avgPoints || 0, p.totalPoints || 0, p.matchesPlayed || 0]
            });
            inserted++;
          } catch (err) {
            console.error(`Failed to insert player ${p.name}:`, err.message);
          }
        }

        return res.status(201).json({ success: true, inserted });
      }

      // Single insert
      if (!name || !team || !position || !tournamentId) {
        return res.status(400).json({ error: 'name, team, position, and tournamentId required' });
      }

      const playerId = generateId();

      await db.execute({
        sql: `INSERT INTO players (id, name, team, position, tournament_id, price, avg_points, total_points, matches_played, is_active, is_injured)
              VALUES (?, ?, ?, ?, ?, 0, 0, 0, 0, 1, 0)`,
        args: [playerId, name, team, position, tournamentId]
      });

      return res.status(201).json({ success: true, playerId });
    }

    // ============================================
    // PUT - Update player
    // ============================================
    if (req.method === 'PUT') {
      const { action } = req.query;
      
      // Special action: Adjust fantasy points
      if (action === 'adjust-points') {
        const { playerId, newPoints, tournamentId } = req.body;
        
        if (!playerId || newPoints === undefined) {
          return res.status(400).json({ error: 'playerId and newPoints required' });
        }
        
        const newPointsNum = parseInt(newPoints);
        if (isNaN(newPointsNum)) {
          return res.status(400).json({ error: 'newPoints must be a number' });
        }
        
        // Get current player points for logging
        const currentResult = await db.execute({
          sql: 'SELECT name, total_points FROM players WHERE id = ?',
          args: [playerId]
        });
        
        if (currentResult.rows.length === 0) {
          return res.status(404).json({ error: 'Player not found' });
        }
        
        const currentPoints = currentResult.rows[0].total_points || 0;
        const playerName = currentResult.rows[0].name;
        const pointsDiff = newPointsNum - currentPoints;
        
        // Update player points in players table
        await db.execute({
          sql: 'UPDATE players SET total_points = ? WHERE id = ?',
          args: [newPointsNum, playerId]
        });
        
        // Find all teams that have this player in their roster and recalculate team totals
        // Get teams from roster table that have this player
        const teamsWithPlayer = await db.execute({
          sql: `SELECT DISTINCT r.fantasy_team_id, ft.id as team_id
                FROM roster r
                JOIN fantasy_teams ft ON r.fantasy_team_id = ft.id
                WHERE r.player_id = ? AND ft.tournament_id = ?`,
          args: [playerId, tournamentId || 'test_ind_nz']
        });
        
        // For each team, recalculate total points from all their players
        for (const teamRow of teamsWithPlayer.rows) {
          try {
            // Get all players on this team's roster with their current points
            const rosterResult = await db.execute({
              sql: `SELECT p.total_points
                    FROM roster r
                    JOIN players p ON r.player_id = p.id
                    WHERE r.fantasy_team_id = ?`,
              args: [teamRow.fantasy_team_id]
            });
            
            // Sum up all player points
            const teamTotal = rosterResult.rows.reduce((sum, p) => sum + (p.total_points || 0), 0);
            
            // Update team total
            await db.execute({
              sql: 'UPDATE fantasy_teams SET total_points = ? WHERE id = ?',
              args: [teamTotal, teamRow.fantasy_team_id]
            });
            
            console.log(`   Updated team ${teamRow.fantasy_team_id} total: ${teamTotal}`);
          } catch (e) {
            console.error('Error updating team total:', e);
          }
        }
        
        console.log(`✅ Points adjusted: ${playerName} ${currentPoints} → ${newPointsNum} (${pointsDiff >= 0 ? '+' : ''}${pointsDiff})`);
        
        return res.status(200).json({ 
          success: true, 
          message: `Updated ${playerName} points: ${currentPoints} → ${newPointsNum}`,
          oldPoints: currentPoints,
          newPoints: newPointsNum,
          diff: pointsDiff,
          teamsUpdated: teamsWithPlayer.rows.length
        });
      }
      
      // Regular update
      const { id, totalPoints, avgPoints, matchesPlayed, isActive, isInjured } = req.body;

      if (!id) {
        return res.status(400).json({ error: 'Player ID required' });
      }

      const updates = [];
      const args = [];

      if (totalPoints !== undefined) {
        updates.push('total_points = ?');
        args.push(totalPoints);
      }

      if (avgPoints !== undefined) {
        updates.push('avg_points = ?');
        args.push(avgPoints);
      }

      if (matchesPlayed !== undefined) {
        updates.push('matches_played = ?');
        args.push(matchesPlayed);
      }

      if (isActive !== undefined) {
        updates.push('is_active = ?');
        args.push(isActive ? 1 : 0);
      }

      if (isInjured !== undefined) {
        updates.push('is_injured = ?');
        args.push(isInjured ? 1 : 0);
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      args.push(id);

      await db.execute({
        sql: `UPDATE players SET ${updates.join(', ')} WHERE id = ?`,
        args
      });

      return res.status(200).json({ success: true, message: 'Player updated' });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('Players API error:', error);
    return res.status(500).json({ error: 'Server error', details: error.message });
  }
}
