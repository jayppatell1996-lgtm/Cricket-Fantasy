/**
 * API Route: Seed Database
 * POST /api/seed
 * 
 * Populates the database with initial tournaments and players.
 * Should be called once during setup.
 */

import { createClient } from '@libsql/client';

function getDb() {
  return createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
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
    isTest: 1,
    isActive: 1
  },
  {
    id: 't20_wc_2026',
    name: 'T20 World Cup 2026',
    shortName: 'T20 WC 2026',
    type: 'worldcup',
    startDate: '2026-02-09',
    endDate: '2026-03-07',
    teams: JSON.stringify(['IND', 'AUS', 'ENG', 'PAK', 'SA', 'NZ', 'WI', 'SL', 'BAN', 'AFG']),
    description: 'ICC Men\'s T20 World Cup 2026 hosted by India and Sri Lanka',
    isTest: 0,
    isActive: 1
  },
  {
    id: 'ipl_2026',
    name: 'IPL 2026',
    shortName: 'IPL 2026',
    type: 'league',
    startDate: '2026-03-22',
    endDate: '2026-05-26',
    teams: JSON.stringify(['CSK', 'MI', 'RCB', 'KKR', 'DC', 'PBKS', 'RR', 'SRH', 'GT', 'LSG']),
    description: 'Indian Premier League 2026 Season',
    isTest: 0,
    isActive: 1
  }
];

// Sample players for IND vs NZ Test tournament
const IND_NZ_PLAYERS = [
  // India Batters
  { id: 'ind_rohit', name: 'Rohit Sharma', team: 'IND', position: 'batter' },
  { id: 'ind_virat', name: 'Virat Kohli', team: 'IND', position: 'batter' },
  { id: 'ind_gill', name: 'Shubman Gill', team: 'IND', position: 'batter' },
  { id: 'ind_sky', name: 'Suryakumar Yadav', team: 'IND', position: 'batter' },
  { id: 'ind_tilak', name: 'Tilak Varma', team: 'IND', position: 'batter' },
  // India Keepers
  { id: 'ind_pant', name: 'Rishabh Pant', team: 'IND', position: 'keeper' },
  { id: 'ind_samson', name: 'Sanju Samson', team: 'IND', position: 'keeper' },
  // India All-rounders
  { id: 'ind_hardik', name: 'Hardik Pandya', team: 'IND', position: 'allrounder' },
  { id: 'ind_jadeja', name: 'Ravindra Jadeja', team: 'IND', position: 'allrounder' },
  { id: 'ind_axar', name: 'Axar Patel', team: 'IND', position: 'allrounder' },
  // India Bowlers
  { id: 'ind_bumrah', name: 'Jasprit Bumrah', team: 'IND', position: 'bowler' },
  { id: 'ind_siraj', name: 'Mohammed Siraj', team: 'IND', position: 'bowler' },
  { id: 'ind_arshdeep', name: 'Arshdeep Singh', team: 'IND', position: 'bowler' },
  { id: 'ind_chahal', name: 'Yuzvendra Chahal', team: 'IND', position: 'bowler' },
  { id: 'ind_kuldeep', name: 'Kuldeep Yadav', team: 'IND', position: 'bowler' },
  { id: 'ind_shami', name: 'Mohammed Shami', team: 'IND', position: 'bowler' },
  
  // New Zealand Batters
  { id: 'nz_conway', name: 'Devon Conway', team: 'NZ', position: 'batter' },
  { id: 'nz_williamson', name: 'Kane Williamson', team: 'NZ', position: 'batter' },
  { id: 'nz_allen', name: 'Finn Allen', team: 'NZ', position: 'batter' },
  { id: 'nz_chapman', name: 'Mark Chapman', team: 'NZ', position: 'batter' },
  { id: 'nz_nicholls', name: 'Henry Nicholls', team: 'NZ', position: 'batter' },
  // New Zealand Keepers
  { id: 'nz_latham', name: 'Tom Latham', team: 'NZ', position: 'keeper' },
  { id: 'nz_blundell', name: 'Tom Blundell', team: 'NZ', position: 'keeper' },
  // New Zealand All-rounders
  { id: 'nz_phillips', name: 'Glenn Phillips', team: 'NZ', position: 'allrounder' },
  { id: 'nz_neesham', name: 'Jimmy Neesham', team: 'NZ', position: 'allrounder' },
  { id: 'nz_mitchell', name: 'Daryl Mitchell', team: 'NZ', position: 'allrounder' },
  { id: 'nz_santner', name: 'Mitchell Santner', team: 'NZ', position: 'allrounder' },
  // New Zealand Bowlers
  { id: 'nz_boult', name: 'Trent Boult', team: 'NZ', position: 'bowler' },
  { id: 'nz_southee', name: 'Tim Southee', team: 'NZ', position: 'bowler' },
  { id: 'nz_ferguson', name: 'Lockie Ferguson', team: 'NZ', position: 'bowler' },
  { id: 'nz_henry', name: 'Matt Henry', team: 'NZ', position: 'bowler' },
  { id: 'nz_sodhi', name: 'Ish Sodhi', team: 'NZ', position: 'bowler' },
];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  const db = getDb();

  try {
    // GET: Check current database status
    if (req.method === 'GET') {
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

    // POST: Seed the database
    if (req.method === 'POST') {
      const { seedType } = req.body; // 'all', 'tournaments', 'players', 'test'
      const results = { tournaments: 0, players: 0, leagues: 0 };

      // Seed tournaments
      if (seedType === 'all' || seedType === 'tournaments') {
        for (const t of TOURNAMENTS) {
          try {
            await db.execute({
              sql: `INSERT OR REPLACE INTO tournaments (id, name, short_name, type, start_date, end_date, teams, description, is_test, is_active, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
              args: [t.id, t.name, t.shortName, t.type, t.startDate, t.endDate, t.teams, t.description, t.isTest, t.isActive]
            });
            results.tournaments++;
          } catch (err) {
            console.error(`Failed to insert tournament ${t.id}:`, err.message);
          }
        }

        // Create default leagues for each tournament
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
      if (seedType === 'all' || seedType === 'players' || seedType === 'test') {
        // Always seed the test tournament players
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

      // Create admin user if doesn't exist
      try {
        await db.execute({
          sql: `INSERT OR IGNORE INTO users (id, email, password_hash, name, created_at, updated_at)
                VALUES ('admin-001', 'admin@t20fantasy.com', 'hash_admin123_8', 'Admin', datetime('now'), datetime('now'))`,
          args: []
        });
      } catch (err) {
        console.error('Failed to create admin user:', err.message);
      }

      return res.status(200).json({
        success: true,
        message: 'Database seeded successfully',
        results
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('Seed API error:', error);
    return res.status(500).json({ error: 'Database error', details: error.message });
  }
}
