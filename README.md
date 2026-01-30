# T20 Fantasy Cricket

Full-featured fantasy cricket application with auction-style drafting, live scoring, and team management.

## Features

### Tournaments
- T20 World Cup 2026 (India & Sri Lanka)
- IPL 2026

### Auction System ($120M Budget)
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
  {"name": "Virat Kohli", "team": "IND", "position": "batter", "base_price": 2000000},
  {"name": "Jasprit Bumrah", "team": "IND", "position": "bowler", "base_price": 2000000},
  {"name": "Hardik Pandya", "team": "IND", "position": "allrounder", "base_price": 1500000},
  {"name": "Rishabh Pant", "team": "IND", "position": "keeper", "base_price": 1000000}
]
```

**Note**: `base_price` is in dollars (2000000 = $2M)

See `data/sample_auction_players.json` for complete examples.

## Auction Workflow

1. **Players Tab**: Import players to the database (with base_price)
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
3. Start dev server: `npm run dev`
4. Go to Admin Panel → Auction → Setup Auction

## Tech Stack
- React + Vite
- SQLite (Turso)
- Vercel Deployment
