# T20 Fantasy Cricket

Full-featured fantasy cricket application with auction-style drafting, live scoring, and team management.

## Features

### Tournaments
- T20 World Cup 2026 (India & Sri Lanka)
- IPL 2026

### Auction System (₹129 Cr Budget)
- **Rounds Management**: Create auction rounds (Marquee, Capped, Uncapped, etc.)
- **Player JSON Import**: Import players via JSON with base prices and categories
- **Live Bidding**: Real-time auction with timer and bid increments
- **Franchise Management**: Create and manage teams with purse tracking
- **Round-by-Round Auction**: Select and auction each round independently

### Draft Types
- 🎯 **Auction Draft**: Bid on players with ₹129 Cr budget
- 🐍 **Snake Draft**: Turn-based picking

### Admin Panel
- Auction controls (start, pause, resume, skip, sell)
- Rounds creation and player import
- Franchise/team management
- Live sync with Cricket API
- Manual score entry

## Player JSON Format

```json
[
  {
    "name": "Virat Kohli",
    "team": "RCB",
    "position": "batter",
    "category": "Marquee",
    "base_price": 20000000
  }
]
```

See `data/sample_auction_players.json` for complete examples.

## Quick Start

1. Clone and install: `npm install`
2. Set up environment variables in `.env`
3. Run migrations: `npx drizzle-kit push:sqlite`
4. Start dev server: `npm run dev`

## Tech Stack
- React + Vite
- SQLite (Turso)
- Vercel Deployment
