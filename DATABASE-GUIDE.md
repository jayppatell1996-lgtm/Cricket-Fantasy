# T20 Fantasy Cricket - Turso Database Integration Guide

## Overview

This guide explains how to set up and use the Turso database integration for the T20 Fantasy Cricket app. With this integration, all users will share the same data across different browsers and devices.

## Prerequisites

1. Turso account with database created (you have this ✅)
2. Vercel account with environment variables set (you have this ✅)
3. Environment variables:
   - `TURSO_DATABASE_URL` - Your Turso database URL
   - `TURSO_AUTH_TOKEN` - Your Turso auth token

## API Endpoints (6 Total - Within Vercel Hobby Limit)

| Endpoint | Methods | Actions/Params |
|----------|---------|----------------|
| `/api/auth` | POST | `?action=signup` or `?action=login` |
| `/api/admin` | GET, POST, DELETE | `?action=health`, `seed`, `users`, `tournaments` |
| `/api/leagues` | GET, POST, PUT, DELETE | League management |
| `/api/teams` | GET, POST, PUT, DELETE | Fantasy team management |
| `/api/players` | GET, POST, PUT, DELETE | Player management |
| `/api/draft` | GET, POST, DELETE | `?type=picks` or `?type=roster` |

## Setup Steps

### Step 1: Deploy to Vercel

1. Replace your project files with the contents of the zip
2. Commit and push to GitHub:
   ```bash
   git add .
   git commit -m "Add Turso database integration"
   git push
   ```
3. Vercel will automatically deploy

### Step 2: Verify Database Connection

After deployment, visit:
```
https://your-app.vercel.app/api/admin?action=health
```

You should see a response like:
```json
{
  "success": true,
  "message": "Database healthy",
  "checks": {
    "database": { "connected": true },
    "tables": {
      "users": 0,
      "tournaments": 0,
      "players": 0,
      ...
    }
  }
}
```

### Step 3: Seed the Database

To populate the database with initial data, call:

**Using browser console:**
```javascript
fetch('/api/admin?action=seed', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ seedType: 'all' })
}).then(r => r.json()).then(console.log);
```

This will:
- Create 3 tournaments (IND vs NZ Test, T20 WC 2026, IPL 2026)
- Create default leagues for each tournament
- Add 32 players for IND vs NZ Test tournament
- Create an admin user (admin@t20fantasy.com / admin123)

### Step 4: Verify Seeding

Visit `/api/admin?action=seed` (GET request) to check counts:
```
https://your-app.vercel.app/api/admin?action=seed
```

## SQL Commands for Turso Console

If you need to manually add data or fix issues, here are some useful SQL commands:

### Check Table Counts
```sql
SELECT 'users' as table_name, COUNT(*) as count FROM users
UNION ALL
SELECT 'tournaments', COUNT(*) FROM tournaments
UNION ALL
SELECT 'leagues', COUNT(*) FROM leagues
UNION ALL
SELECT 'fantasy_teams', COUNT(*) FROM fantasy_teams
UNION ALL
SELECT 'players', COUNT(*) FROM players
UNION ALL
SELECT 'roster', COUNT(*) FROM roster
UNION ALL
SELECT 'draft_picks', COUNT(*) FROM draft_picks;
```

### Add Missing Tournaments
```sql
INSERT INTO tournaments (id, name, short_name, type, start_date, end_date, teams, description, is_test, is_active, created_at)
VALUES 
('ind_nz_test', 'India vs NZ T20 Series 2026', 'IND vs NZ T20', 'test', '2026-01-25', '2026-02-05', '["IND", "NZ"]', 'Test tournament', 1, 1, datetime('now')),
('t20_wc_2026', 'T20 World Cup 2026', 'T20 WC 2026', 'worldcup', '2026-02-09', '2026-03-07', '["IND", "AUS", "ENG", "PAK", "SA", "NZ", "WI", "SL", "BAN", "AFG"]', 'T20 World Cup', 0, 1, datetime('now')),
('ipl_2026', 'IPL 2026', 'IPL 2026', 'league', '2026-03-22', '2026-05-26', '["CSK", "MI", "RCB", "KKR", "DC", "PBKS", "RR", "SRH", "GT", "LSG"]', 'IPL Season', 0, 1, datetime('now'));
```

### Create Default Leagues
```sql
INSERT INTO leagues (id, name, tournament_id, draft_type, draft_status, max_teams, roster_size, is_public, created_at)
VALUES 
('league_ind_nz_test', 'IND vs NZ Test League', 'ind_nz_test', 'snake', 'pending', 10, 12, 1, datetime('now')),
('league_t20_wc_2026', 'T20 WC 2026 League', 't20_wc_2026', 'snake', 'pending', 10, 12, 1, datetime('now')),
('league_ipl_2026', 'IPL 2026 League', 'ipl_2026', 'snake', 'pending', 10, 12, 1, datetime('now'));
```

### Update Draft Status
```sql
-- Open draft for registration
UPDATE leagues SET draft_status = 'open' WHERE id = 'league_ind_nz_test';

-- Start draft (in progress)
UPDATE leagues SET draft_status = 'in_progress' WHERE id = 'league_ind_nz_test';

-- Complete draft
UPDATE leagues SET draft_status = 'completed' WHERE id = 'league_ind_nz_test';

-- Reset draft
UPDATE leagues SET draft_status = 'pending', current_pick = 0, current_round = 1 WHERE id = 'league_ind_nz_test';
```

### Delete All Data (Careful!)
```sql
-- Clear all transactional data
DELETE FROM draft_picks;
DELETE FROM roster;
DELETE FROM transactions;
DELETE FROM weekly_scores;
DELETE FROM fantasy_teams;
DELETE FROM leagues;

-- Keep users, tournaments, and players
```

### View All Fantasy Teams
```sql
SELECT ft.id, ft.name, ft.owner_name, u.email, ft.total_points, t.name as tournament
FROM fantasy_teams ft
JOIN users u ON ft.user_id = u.id
JOIN tournaments t ON ft.tournament_id = t.id
ORDER BY ft.total_points DESC;
```

### View Draft Picks
```sql
SELECT dp.overall_pick, dp.round, ft.name as team, p.name as player, dp.pick_time
FROM draft_picks dp
JOIN fantasy_teams ft ON dp.fantasy_team_id = ft.id
JOIN players p ON dp.player_id = p.id
ORDER BY dp.overall_pick;
```

## Troubleshooting

### "Database not configured" error
- Check that `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` are set in Vercel environment variables
- Make sure there are no typos in the variable names
- Redeploy after adding variables

### "FOREIGN KEY constraint failed" error
- This usually means you're trying to add data that references non-existent records
- Make sure tournaments exist before creating leagues
- Make sure leagues exist before creating teams
- Make sure players exist before adding to rosters

### Players not showing up
- Check that players have `is_active = 1`
- Verify the `tournament_id` matches

## Frontend API Service

A new file `/src/api.js` has been created with helper functions:

```javascript
import api from './api.js';

// Login
const { user } = await api.auth.login(email, password);

// Get all tournaments
const { tournaments } = await api.tournaments.getAll();

// Get teams for a tournament
const { teams } = await api.teams.getAll({ tournamentId: 'ind_nz_test' });

// Get available players for draft
const { players } = await api.players.getAvailable('ind_nz_test', 'league_ind_nz_test');

// Make a draft pick
await api.draft.makePick({
  leagueId: 'league_ind_nz_test',
  fantasyTeamId: 'team-123',
  playerId: 'ind_virat',
  round: 1,
  pickInRound: 1,
  overallPick: 1,
  slot: 'batters'
});
```

## Next Steps

1. **Deploy and test the API endpoints**
2. **Seed the database with initial data**
3. **Update the frontend** to use the API service instead of localStorage
4. **Test multi-user functionality** with different browsers

The API infrastructure is now in place. The next phase will be updating the React components to use these APIs instead of localStorage.
