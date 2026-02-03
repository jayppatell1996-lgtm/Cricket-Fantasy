# T20 Fantasy Cricket

Full-featured fantasy cricket application with live scoring integration and team management.

## Features

### Tournaments
- T20 World Cup 2026 (India & Sri Lanka)
- IPL 2026

### Live Scoring
- Real-time match data from Cricket API (cricapi.com)
- Automatic fantasy points calculation
- Admin preview and approval workflow
- Player stats tracking with game logs

### Team Import (Post-Auction)
- Import teams and rosters via JSON after external auction
- Automatic player matching from database
- Support for roster prices/purchase info

### Admin Panel Tabs
1. **Overview**: Dashboard with stats
2. **Sync**: Cricket API integration, live match sync
3. **Players**: Import players via JSON, manage player pool
4. **Teams**: View registered teams
5. **Users**: User management
6. **Import**: Import teams after external auction
7. **Settings**: Tournament settings

## Player JSON Import Format

```json
[
  {"name": "Virat Kohli", "team": "IND", "position": "batter"},
  {"name": "Jasprit Bumrah", "team": "IND", "position": "bowler"},
  {"name": "Hardik Pandya", "team": "IND", "position": "allrounder"},
  {"name": "Rishabh Pant", "team": "IND", "position": "keeper"}
]
```

## Team Import Format (Post-Auction)

```json
[
  {
    "name": "Mumbai Indians",
    "owner": "John Doe",
    "roster": [
      {"name": "Virat Kohli", "price": 15000000},
      {"name": "Jasprit Bumrah", "price": 12000000}
    ]
  },
  {
    "name": "Chennai Super Kings",
    "owner": "Jane Smith",
    "roster": [
      {"name": "MS Dhoni", "price": 8000000},
      {"name": "Ravindra Jadeja", "price": 11000000}
    ]
  }
]
```

## Live Sync Workflow

1. **Admin → Sync Tab**: Configure Cricket API
2. **Fetch Matches**: Pull match list from Cricket API
3. **Preview Scorecard**: View calculated fantasy points before applying
4. **Apply Points**: Save stats to database (with duplicate protection)

## Fantasy Scoring Rules

### Batting
- +1 point per run
- +5 for 30+ runs
- +10 for 50+ runs
- +20 for 100+ runs
- Strike rate bonuses (min 10 balls faced):
  - SR ≥160: +10 points
  - SR ≥150: +8 points
  - SR ≥140: +6 points
  - SR ≥130: +4 points
  - SR ≥120: +2 points

### Bowling
- +20 points per wicket
- +10 points per maiden
- Economy bonuses (min 2 overs):
  - ER ≤5: +10 points
  - ER ≤6: +8 points
  - ER ≤7: +6 points
  - ER ≤8: +4 points

### Fielding
- +10 points per catch
- +15 points per run out
- +15 points per stumping

## Quick Start

1. Clone and install: `npm install`
2. Set up environment variables in `.env`:
   ```
   TURSO_DATABASE_URL=libsql://your-db.turso.io
   TURSO_AUTH_TOKEN=your-token
   CRICKET_API_KEY=your-cricapi-key
   ```
3. Start dev server: `npm run dev`
4. Import players → Import teams → Sync live matches

## Tech Stack
- React + Vite
- SQLite (Turso)
- Cricket API (cricapi.com)
- Vercel Deployment

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `/api/players` | Player CRUD operations |
| `/api/teams` | Team management |
| `/api/leagues` | League management |
| `/api/live-sync` | Cricket API integration |
| `/api/admin` | Admin operations |
