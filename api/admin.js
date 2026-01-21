// API: Admin Functions (Health, Seed, Users, Tournaments)
// /api/admin?action=health - Database health check
// /api/admin?action=seed - Seed database
// /api/admin?action=users - User management
// /api/admin?action=tournaments - Tournament management

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

// Tournament definitions
const TOURNAMENTS = [
  {
    id: 'ind_nz_test',
    name: 'India vs NZ T20 Series 2026',
    shortName: 'IND vs NZ T20',
    type: 'test',
    startDate: '2026-01-25',
    endDate: '2026-02-05',
    teams: JSON.stringify(['IND', 'NZ']),
    description: 'Test tournament for fantasy cricket app development',
    isTest: 1
  },
  {
    id: 't20_wc_2026',
    name: 'T20 World Cup 2026',
    shortName: 'T20 WC 2026',
    type: 'worldcup',
    startDate: '2026-02-09',
    endDate: '2026-03-07',
    teams: JSON.stringify(['IND', 'AUS', 'ENG', 'PAK', 'SA', 'NZ', 'WI', 'SL', 'BAN', 'AFG']),
    description: 'ICC Men\'s T20 World Cup 2026',
    isTest: 0
  },
  {
    id: 'ipl_2026',
    name: 'IPL 2026',
    shortName: 'IPL 2026',
    type: 'league',
    startDate: '2026-03-22',
    endDate: '2026-05-26',
    teams: JSON.stringify(['CSK', 'MI', 'RCB', 'KKR', 'DC', 'PBKS', 'RR', 'SRH', 'GT', 'LSG']),
    description: 'Indian Premier League 2026',
    isTest: 0
  }
];

// Sample players for IND vs NZ Test
const IND_NZ_PLAYERS = [
  { id: 'ind_rohit', name: 'Rohit Sharma', team: 'IND', position: 'batter' },
  { id: 'ind_virat', name: 'Virat Kohli', team: 'IND', position: 'batter' },
  { id: 'ind_gill', name: 'Shubman Gill', team: 'IND', position: 'batter' },
  { id: 'ind_sky', name: 'Suryakumar Yadav', team: 'IND', position: 'batter' },
  { id: 'ind_tilak', name: 'Tilak Varma', team: 'IND', position: 'batter' },
  { id: 'ind_pant', name: 'Rishabh Pant', team: 'IND', position: 'keeper' },
  { id: 'ind_samson', name: 'Sanju Samson', team: 'IND', position: 'keeper' },
  { id: 'ind_hardik', name: 'Hardik Pandya', team: 'IND', position: 'allrounder' },
  { id: 'ind_jadeja', name: 'Ravindra Jadeja', team: 'IND', position: 'allrounder' },
  { id: 'ind_axar', name: 'Axar Patel', team: 'IND', position: 'allrounder' },
  { id: 'ind_bumrah', name: 'Jasprit Bumrah', team: 'IND', position: 'bowler' },
  { id: 'ind_siraj', name: 'Mohammed Siraj', team: 'IND', position: 'bowler' },
  { id: 'ind_arshdeep', name: 'Arshdeep Singh', team: 'IND', position: 'bowler' },
  { id: 'ind_chahal', name: 'Yuzvendra Chahal', team: 'IND', position: 'bowler' },
  { id: 'ind_kuldeep', name: 'Kuldeep Yadav', team: 'IND', position: 'bowler' },
  { id: 'ind_shami', name: 'Mohammed Shami', team: 'IND', position: 'bowler' },
  { id: 'nz_conway', name: 'Devon Conway', team: 'NZ', position: 'batter' },
  { id: 'nz_williamson', name: 'Kane Williamson', team: 'NZ', position: 'batter' },
  { id: 'nz_allen', name: 'Finn Allen', team: 'NZ', position: 'batter' },
  { id: 'nz_chapman', name: 'Mark Chapman', team: 'NZ', position: 'batter' },
  { id: 'nz_nicholls', name: 'Henry Nicholls', team: 'NZ', position: 'batter' },
  { id: 'nz_latham', name: 'Tom Latham', team: 'NZ', position: 'keeper' },
  { id: 'nz_blundell', name: 'Tom Blundell', team: 'NZ', position: 'keeper' },
  { id: 'nz_phillips', name: 'Glenn Phillips', team: 'NZ', position: 'allrounder' },
  { id: 'nz_neesham', name: 'Jimmy Neesham', team: 'NZ', position: 'allrounder' },
  { id: 'nz_mitchell', name: 'Daryl Mitchell', team: 'NZ', position: 'allrounder' },
  { id: 'nz_santner', name: 'Mitchell Santner', team: 'NZ', position: 'allrounder' },
  { id: 'nz_boult', name: 'Trent Boult', team: 'NZ', position: 'bowler' },
  { id: 'nz_southee', name: 'Tim Southee', team: 'NZ', position: 'bowler' },
  { id: 'nz_ferguson', name: 'Lockie Ferguson', team: 'NZ', position: 'bowler' },
  { id: 'nz_henry', name: 'Matt Henry', team: 'NZ', position: 'bowler' },
  { id: 'nz_sodhi', name: 'Ish Sodhi', team: 'NZ', position: 'bowler' },
];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { action } = req.query;

  // Check database config
  if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
    return res.status(500).json({ 
      error: 'Database not configured',
      hasUrl: !!process.env.TURSO_DATABASE_URL,
      hasToken: !!process.env.TURSO_AUTH_TOKEN
    });
  }

  const db = getDb();

  try {
    // ============================================
    // HEALTH CHECK
    // ============================================
    if (action === 'health') {
      const checks = { database: null, tables: null };

      try {
        const testResult = await db.execute('SELECT 1 as test');
        checks.database = { connected: true };

        const tables = ['users', 'tournaments', 'leagues', 'fantasy_teams', 'players', 'roster', 'draft_picks'];
        const tableCounts = {};
        
        for (const table of tables) {
          try {
            const result = await db.execute(`SELECT COUNT(*) as count FROM ${table}`);
            tableCounts[table] = result.rows[0]?.count || 0;
          } catch (err) {
            tableCounts[table] = `Error: ${err.message}`;
          }
        }
        checks.tables = tableCounts;

        return res.status(200).json({ success: true, message: 'Database healthy', checks });
      } catch (error) {
        checks.database = { connected: false, error: error.message };
        return res.status(500).json({ success: false, error: 'Database connection failed', checks });
      }
    }

    // ============================================
    // SEED DATABASE
    // ============================================
    if (action === 'seed') {
      if (req.method === 'GET') {
        // Get current status
        const tournamentsResult = await db.execute('SELECT COUNT(*) as count FROM tournaments');
        const playersResult = await db.execute('SELECT COUNT(*) as count FROM players');
        const usersResult = await db.execute('SELECT COUNT(*) as count FROM users');
        const teamsResult = await db.execute('SELECT COUNT(*) as count FROM fantasy_teams');
        const leaguesResult = await db.execute('SELECT COUNT(*) as count FROM leagues');

        return res.status(200).json({
          success: true,
          status: {
            tournaments: tournamentsResult.rows[0].count,
            players: playersResult.rows[0].count,
            users: usersResult.rows[0].count,
            fantasyTeams: teamsResult.rows[0].count,
            leagues: leaguesResult.rows[0].count
          }
        });
      }

      if (req.method === 'POST') {
        const { seedType = 'all' } = req.body;
        const results = { tournaments: 0, players: 0, leagues: 0 };

        // Seed tournaments
        if (seedType === 'all' || seedType === 'tournaments') {
          for (const t of TOURNAMENTS) {
            try {
              await db.execute({
                sql: `INSERT OR REPLACE INTO tournaments (id, name, short_name, type, start_date, end_date, teams, description, is_test, is_active, created_at)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))`,
                args: [t.id, t.name, t.shortName, t.type, t.startDate, t.endDate, t.teams, t.description, t.isTest]
              });
              results.tournaments++;
            } catch (err) {
              console.error(`Failed to insert tournament ${t.id}:`, err.message);
            }
          }

          // Create default leagues
          for (const t of TOURNAMENTS) {
            const leagueId = `league_${t.id}`;
            try {
              await db.execute({
                sql: `INSERT OR IGNORE INTO leagues (id, name, tournament_id, draft_type, draft_status, max_teams, roster_size, is_public, created_at)
                      VALUES (?, ?, ?, 'snake', 'pending', 10, 12, 1, datetime('now'))`,
                args: [leagueId, `${t.name} Fantasy League`, t.id]
              });
              results.leagues++;
            } catch (err) {
              console.error(`Failed to create league for ${t.id}:`, err.message);
            }
          }
        }

        // Seed players
        if (seedType === 'all' || seedType === 'players') {
          for (const p of IND_NZ_PLAYERS) {
            try {
              await db.execute({
                sql: `INSERT OR REPLACE INTO players (id, name, team, position, tournament_id, price, avg_points, total_points, matches_played, is_active, is_injured)
                      VALUES (?, ?, ?, ?, 'ind_nz_test', 0, 0, 0, 0, 1, 0)`,
                args: [p.id, p.name, p.team, p.position]
              });
              results.players++;
            } catch (err) {
              console.error(`Failed to insert player ${p.name}:`, err.message);
            }
          }
        }

        // Create admin user
        try {
          await db.execute({
            sql: `INSERT OR IGNORE INTO users (id, email, password_hash, name, created_at, updated_at)
                  VALUES ('admin-001', 'admin@t20fantasy.com', 'hash_admin123_8', 'Admin', datetime('now'), datetime('now'))`,
            args: []
          });
        } catch (err) {
          console.error('Failed to create admin:', err.message);
        }

        return res.status(200).json({ success: true, message: 'Database seeded', results });
      }
    }

    // ============================================
    // USERS MANAGEMENT
    // ============================================
    if (action === 'users') {
      if (req.method === 'GET') {
        const result = await db.execute(
          'SELECT id, email, name, created_at, updated_at FROM users ORDER BY created_at DESC'
        );

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
            teams: teamsResult.rows,
            hasTeam: teamsResult.rows.length > 0
          };
        }));

        return res.status(200).json({ success: true, users });
      }

      if (req.method === 'DELETE') {
        const userId = req.query.id || req.body?.id;

        if (!userId) {
          return res.status(400).json({ error: 'User ID required' });
        }

        // Don't delete admin
        const userResult = await db.execute({
          sql: 'SELECT email FROM users WHERE id = ?',
          args: [userId]
        });

        if (userResult.rows[0]?.email?.toLowerCase() === 'admin@t20fantasy.com') {
          return res.status(403).json({ error: 'Cannot delete admin' });
        }

        // Delete user's teams first
        const teams = await db.execute({
          sql: 'SELECT id FROM fantasy_teams WHERE user_id = ?',
          args: [userId]
        });

        for (const team of teams.rows) {
          await db.execute({ sql: 'DELETE FROM roster WHERE fantasy_team_id = ?', args: [team.id] });
          await db.execute({ sql: 'DELETE FROM draft_picks WHERE fantasy_team_id = ?', args: [team.id] });
        }

        await db.execute({ sql: 'DELETE FROM fantasy_teams WHERE user_id = ?', args: [userId] });
        await db.execute({ sql: 'DELETE FROM users WHERE id = ?', args: [userId] });

        return res.status(200).json({ success: true, message: 'User deleted' });
      }
    }

    // ============================================
    // TOURNAMENTS
    // ============================================
    if (action === 'tournaments') {
      if (req.method === 'GET') {
        const result = await db.execute(
          'SELECT * FROM tournaments WHERE is_active = 1 ORDER BY start_date ASC'
        );

        const tournaments = result.rows.map(t => ({
          id: t.id,
          name: t.name,
          shortName: t.short_name,
          type: t.type,
          startDate: t.start_date,
          endDate: t.end_date,
          teams: JSON.parse(t.teams || '[]'),
          description: t.description,
          isTest: Boolean(t.is_test),
          isActive: Boolean(t.is_active)
        }));

        return res.status(200).json({ success: true, tournaments });
      }

      if (req.method === 'POST') {
        const { id, name, shortName, type, startDate, endDate, teams, description, isTest } = req.body;
        const tournamentId = id || generateId();

        await db.execute({
          sql: `INSERT OR REPLACE INTO tournaments (id, name, short_name, type, start_date, end_date, teams, description, is_test, is_active, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))`,
          args: [tournamentId, name, shortName, type, startDate, endDate, JSON.stringify(teams), description, isTest ? 1 : 0]
        });

        return res.status(201).json({ success: true, tournamentId });
      }
    }

    return res.status(400).json({ error: 'Invalid action. Use ?action=health, seed, users, or tournaments' });

  } catch (error) {
    console.error('Admin API error:', error);
    return res.status(500).json({ error: 'Server error', details: error.message });
  }
}
