# T20 Fantasy Cricket

Full-featured fantasy cricket application with auction-style drafting, live scoring, and team management.

## Features

### Tournaments
- T20 World Cup 2026 (India & Sri Lanka)
- IPL 2026

### Auction System (₹129 Cr Budget)
- **Predefined Rounds**: Batsmen → Allrounders → Bowlers
- **Auto-Setup**: Click "Setup Auction" to create all rounds and auto-populate players
- **Live Bidding**: Real-time auction with timer and progressive bid increments
- **Franchise Management**: Create and manage teams with purse tracking
- **Add Players to Rounds**: Directly add players to their respective rounds

### Admin Panel Tabs
1. **Overview**: Dashboard with stats
2. **Sync**: Cricket API integration
3. **Players**: Import players via JSON, manage player pool
4. **Teams**: View registered franchises
5. **Users**: User management
6. **Auction**: Auction controls, rounds management, franchise management
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

See `data/sample_auction_players.json` for complete examples.

## Auction Workflow

1. **Players Tab**: Import players to the database
2. **Auction Tab**: 
   - Add franchises (team name + owner)
   - Click "Open Auction Registration" 
   - Click "Setup Auction" (auto-creates Batsmen/Allrounders/Bowlers rounds)
3. **Rounds Panel**: 
   - Select a round to auction
   - Add/remove players from rounds
   - Start auction for selected round
4. **Live Auction**: Franchises bid on players in real-time

## Quick Start

1. Clone and install: `npm install`
2. Set up environment variables in `.env`
3. Run migrations: `npx drizzle-kit push:sqlite`
4. Start dev server: `npm run dev`

## Tech Stack
- React + Vite
- SQLite (Turso)
- Vercel Deployment
