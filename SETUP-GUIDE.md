# T20 Fantasy Cricket - Complete Setup Guide

This guide covers deploying your T20 Fantasy Cricket app with **Turso** (database) and **Vercel** (hosting).

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Turso Database Setup](#turso-database-setup)
   - [Option A: Turso Website (Recommended for Beginners)](#option-a-turso-website-recommended-for-beginners)
   - [Option B: Turso CLI](#option-b-turso-cli)
3. [Vercel Deployment](#vercel-deployment)
4. [Environment Variables](#environment-variables)
5. [Database Schema Setup](#database-schema-setup)
6. [Player Database Integration](#player-database-integration)
   - [Method 1: Admin Panel (Manual Entry)](#method-1-admin-panel-manual-entry)
   - [Method 2: SQL Bulk Import](#method-2-sql-bulk-import)
   - [Method 3: Cricket API Integration](#method-3-cricket-api-integration)
   - [Method 4: CSV/JSON File Import](#method-4-csvjson-file-import)
7. [Testing Your Setup](#testing-your-setup)
8. [Nightly Data Sync (Optional)](#nightly-data-sync-optional)
9. [Free Tier Limits](#free-tier-limits)
10. [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before you begin, make sure you have:

- [ ] A GitHub account (for Vercel deployment)
- [ ] Node.js 18+ installed locally
- [ ] The project code pushed to a GitHub repository

---

## Turso Database Setup

### Option A: Turso Website (Recommended for Beginners)

This is the easiest way to set up your database without using the command line. Follow these detailed steps:

#### Step 1: Create a Turso Account

1. Open your browser and go to **[https://turso.tech](https://turso.tech)**
2. Click the **"Start for free"** button (usually in the top-right corner)
3. You'll see signup options - choose one:
   - **GitHub** (Recommended ⭐) - Click "Continue with GitHub" for one-click signup
   - **Google** - Click "Continue with Google"
   - **Email** - Enter your email and create a password

4. If using GitHub/Google: Authorize Turso when prompted
5. You'll be redirected to the Turso Dashboard

> 💡 **Tip**: Using GitHub signup makes deployment to Vercel smoother later!

#### Step 2: Create Your Database

1. Once in the Dashboard, you'll see a welcome screen or your databases list
2. Look for and click the **"Create Database"** button
   - On desktop: Usually a prominent button in the center or top-right
   - It may say "Create Database" or have a "+" icon

3. A dialog/form will appear. Fill in:

   **Database Name:**
   ```
   t20-fantasy
   ```
   - Use lowercase letters, numbers, and hyphens only
   - No spaces allowed
   
   **Primary Location (Region):**
   Choose based on where most users will be:
   | Code | Location | Best For |
   |------|----------|----------|
   | `bom` | Mumbai, India | 🇮🇳 India/Asia users |
   | `sin` | Singapore | Southeast Asia |
   | `iad` | Virginia, USA | North America East |
   | `sjc` | San Jose, USA | North America West |
   | `lhr` | London, UK | Europe |
   | `syd` | Sydney, Australia | Australia/Oceania |

   **Plan:** 
   - Select **"Starter"** or **"Free"** tier (plenty for a fantasy league!)

4. Click **"Create"** or **"Create Database"**

5. Wait a few seconds - your database is being provisioned!

#### Step 3: Get Your Database URL

1. After creation, you'll be taken to your database's overview page
2. Look for the **"Connection Details"** or **"Overview"** section
3. Find the field labeled:
   - "Database URL" or
   - "Connection String" or  
   - "libSQL URL"

4. It will look like this:
   ```
   libsql://t20-fantasy-yourusername.turso.io
   ```

5. Click the **copy icon** 📋 next to the URL
6. **Save this somewhere safe** (a notes app or text file)
7. Label it: `TURSO_DATABASE_URL`

> ⚠️ **Important**: The URL must start with `libsql://` not `https://`

#### Step 4: Create an Auth Token

1. On your database page, look for one of these:
   - A **"Tokens"** tab at the top
   - An **"Auth Tokens"** section
   - A **"Create Token"** button
   - A **gear icon ⚙️** → Settings → Tokens

2. Click **"Create Token"** or **"Generate Token"**

3. Configure your token:
   
   **Token Name (optional):**
   ```
   t20-fantasy-production
   ```
   
   **Expiration:**
   - Choose **"No expiration"** for simplicity
   - Or set a long duration (1 year recommended)
   
   **Access Level:**
   - Select **"Full Access"** or **"Read & Write"**

4. Click **"Create"** or **"Generate"**

5. **⚠️ CRITICAL**: A token will appear. **Copy it immediately!**
   - It's only shown ONCE
   - It looks like: `eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJpYXQiOj...` (very long)
   - Click the copy button next to it

6. **Save this somewhere safe** alongside your Database URL
7. Label it: `TURSO_AUTH_TOKEN`

> 🔐 **Security Note**: Never share your auth token publicly or commit it to GitHub!

#### Step 5: Verify Your Credentials

You should now have two values saved:

```
TURSO_DATABASE_URL=libsql://t20-fantasy-yourusername.turso.io
TURSO_AUTH_TOKEN=eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJpYXQiOj...
```

**Quick Verification Checklist:**
- [ ] Database URL starts with `libsql://`
- [ ] Database URL ends with `.turso.io`
- [ ] Auth token is a long string starting with `eyJ`
- [ ] Both values are saved somewhere safe

#### Step 6: Test Your Database (Optional but Recommended)

1. In the Turso dashboard, click on your database
2. Look for **"Shell"**, **"SQL Editor"**, or **"Console"** tab
3. You can run a test query:
   ```sql
   SELECT 1 as test;
   ```
4. If you see a result, your database is working!

#### Navigating the Turso Dashboard

Here's what you'll find in the dashboard:

| Section | Purpose |
|---------|---------|
| **Overview** | Database URL, stats, quick actions |
| **Data** | Browse tables, run queries |
| **Shell/Console** | SQL command line interface |
| **Tokens** | Manage auth tokens |
| **Settings** | Rename, delete, configure database |
| **Metrics** | Usage statistics, reads/writes |
| **Locations** | Manage replicas (for Pro plans) |

---

### Option B: Turso CLI

For developers who prefer the command line.

#### Step 1: Install Turso CLI

```bash
# macOS/Linux
curl -sSfL https://get.tur.so/install.sh | bash

# Windows (PowerShell)
iwr -useb https://get.tur.so/install.ps1 | iex

# Or using Homebrew (macOS)
brew install tursodatabase/tap/turso
```

#### Step 2: Authenticate

```bash
turso auth signup    # If new to Turso
# OR
turso auth login     # If you have an account
```

This opens a browser window for authentication.

#### Step 3: Create Database

```bash
# Create database (closest region auto-selected)
turso db create t20-fantasy

# Or specify a region
turso db create t20-fantasy --location bom   # Mumbai
turso db create t20-fantasy --location iad   # US East
```

#### Step 4: Get Credentials

```bash
# Get database URL
turso db show t20-fantasy --url

# Create auth token
turso db tokens create t20-fantasy

# Or create a non-expiring token
turso db tokens create t20-fantasy --expiration none
```

#### Step 5: Save Credentials

```bash
# View all at once
echo "TURSO_DATABASE_URL=$(turso db show t20-fantasy --url)"
echo "TURSO_AUTH_TOKEN=$(turso db tokens create t20-fantasy)"
```

---

## Vercel Deployment

### Step 1: Push Code to GitHub

If you haven't already:

```bash
cd t20-fantasy
git init
git add .
git commit -m "Initial commit - T20 Fantasy Cricket"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/t20-fantasy.git
git push -u origin main
```

### Step 2: Deploy to Vercel

#### Using Vercel Website:

1. Go to [https://vercel.com](https://vercel.com)
2. Sign up/Login with GitHub
3. Click **"Add New Project"**
4. Select your `t20-fantasy` repository
5. Configure the project:
   - **Framework Preset**: Vite
   - **Root Directory**: `./` (leave as default)
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
6. Click **"Deploy"**

#### Using Vercel CLI:

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
cd t20-fantasy
vercel

# Follow the prompts
# - Set up and deploy? Yes
# - Which scope? Your account
# - Link to existing project? No
# - Project name? t20-fantasy
# - Directory? ./
```

### Step 3: Add Environment Variables

1. In Vercel dashboard, go to your project
2. Click **"Settings"** tab
3. Click **"Environment Variables"** in the left sidebar
4. Add each variable:

| Name | Value | Environment |
|------|-------|-------------|
| `TURSO_DATABASE_URL` | `libsql://t20-fantasy-xxx.turso.io` | All |
| `TURSO_AUTH_TOKEN` | `eyJhbGciOiJFZERTQS...` | All |

5. Click **"Save"** for each
6. Go to **"Deployments"** tab
7. Click the three dots on latest deployment → **"Redeploy"**

---

## Environment Variables

### Local Development

Create a `.env` file in your project root:

```env
# Turso Database
TURSO_DATABASE_URL=libsql://t20-fantasy-yourusername.turso.io
TURSO_AUTH_TOKEN=your_auth_token_here

# Optional: For API integrations later
CRICKET_API_KEY=your_cricket_api_key
```

**Important**: Add `.env` to your `.gitignore`:

```bash
echo ".env" >> .gitignore
```

### Accessing in Code

```javascript
// In your code (Vite)
const dbUrl = import.meta.env.VITE_TURSO_DATABASE_URL;

// In server-side code (API routes)
const dbUrl = process.env.TURSO_DATABASE_URL;
```

---

## Database Schema Setup

### Using Drizzle (Recommended)

```bash
# Install dependencies
npm install

# Generate migrations
npx drizzle-kit generate

# Push schema to database
npx drizzle-kit push

# Open Drizzle Studio to view/edit data
npx drizzle-kit studio
```

### Manual SQL Setup

If you prefer to run SQL directly, use the Turso dashboard:

1. Go to your database in Turso dashboard
2. Click **"Shell"** or **"SQL Editor"**
3. Run the schema creation SQL:

```sql
-- Users table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Fantasy Teams table
CREATE TABLE IF NOT EXISTS fantasy_teams (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  tournament_id TEXT NOT NULL,
  name TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  logo_url TEXT,
  total_points REAL DEFAULT 0,
  weekly_pickups INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Players table
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  team TEXT NOT NULL,
  position TEXT NOT NULL,
  price REAL DEFAULT 0,
  avg_points REAL DEFAULT 0,
  total_points REAL DEFAULT 0,
  tournament_id TEXT NOT NULL
);

-- Roster table
CREATE TABLE IF NOT EXISTS roster (
  id TEXT PRIMARY KEY,
  fantasy_team_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  is_ir INTEGER DEFAULT 0,
  acquired_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (fantasy_team_id) REFERENCES fantasy_teams(id),
  FOREIGN KEY (player_id) REFERENCES players(id)
);

-- Player Stats table
CREATE TABLE IF NOT EXISTS player_stats (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  match_id TEXT,
  runs INTEGER DEFAULT 0,
  balls_faced INTEGER DEFAULT 0,
  wickets INTEGER DEFAULT 0,
  overs_bowled REAL DEFAULT 0,
  runs_conceded INTEGER DEFAULT 0,
  catches INTEGER DEFAULT 0,
  run_outs INTEGER DEFAULT 0,
  stumpings INTEGER DEFAULT 0,
  fantasy_points REAL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (player_id) REFERENCES players(id)
);

-- Tournaments table
CREATE TABLE IF NOT EXISTS tournaments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  short_name TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  status TEXT DEFAULT 'upcoming',
  is_test INTEGER DEFAULT 0
);

-- Draft Picks table
CREATE TABLE IF NOT EXISTS draft_picks (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL,
  fantasy_team_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  round INTEGER NOT NULL,
  pick_number INTEGER NOT NULL,
  picked_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

---

## Player Database Integration

This section covers **four different methods** to populate your database with cricket players. Choose the method that best fits your needs:

| Method | Best For | Difficulty | Automation |
|--------|----------|------------|------------|
| Admin Panel | Small leagues, quick setup | ⭐ Easy | Manual |
| SQL Bulk Import | One-time large imports | ⭐⭐ Medium | Manual |
| Cricket API | Live data, real tournaments | ⭐⭐⭐ Advanced | Automated |
| CSV/JSON Import | Offline data, custom sources | ⭐⭐ Medium | Semi-auto |

---

### Method 1: Admin Panel (Manual Entry)

**Best for:** Small private leagues, testing, or adding a few players at a time.

The app includes a built-in Admin Panel where you can manually add, edit, and remove players through a user-friendly interface.

#### Step 1: Access Admin Panel

1. Go to your app's login page
2. Login with admin credentials:
   - **Email:** `admin@t20fantasy.com`
   - **Password:** Any password (6+ characters)
3. You'll be redirected to the Admin Panel

#### Step 2: Navigate to Players Tab

1. In the Admin Panel, click the **"👥 Players"** tab
2. You'll see:
   - Add Player form at the top
   - Current player pool list below

#### Step 3: Add Players One by One

Fill in the **Add Player** form:

| Field | Description | Example |
|-------|-------------|---------|
| **Player Name** | Full name of the player | `Virat Kohli` |
| **Team** | Country/IPL team code (uppercase) | `IND`, `RCB` |
| **Position** | Player's role | `batter`, `bowler`, `keeper`, `flex` |
| **Price** | Fantasy price in millions | `12.0` |
| **Avg Points** | Expected points per match | `45` |

Click **"Add"** to save the player.

#### Step 4: Manage Existing Players

- **View:** Scroll through the player table
- **Remove:** Click 🗑️ button next to any player
- **Edit:** (Coming soon) Currently, remove and re-add to edit

#### Updating the Code for Database Storage

By default, the Admin Panel stores players in React state (memory). To persist to Turso database, modify the `AdminPanel` component in `App.jsx`:

```javascript
// Replace this (memory-only):
const [players, setPlayers] = useState(tournament.isTest ? TEST_PLAYERS_IND_NZ : FULL_PLAYER_POOL);

// With this (database-connected):
const [players, setPlayers] = useState([]);

useEffect(() => {
  // Load players from database on mount
  const loadPlayers = async () => {
    const response = await fetch('/api/players?tournament=' + tournament.id);
    const data = await response.json();
    setPlayers(data);
  };
  loadPlayers();
}, [tournament.id]);

const handleAddPlayer = async () => {
  if (!newPlayerForm.name || !newPlayerForm.team) return;
  
  const newPlayer = {
    id: `p${Date.now()}`,
    ...newPlayerForm,
    price: parseFloat(newPlayerForm.price),
    avgPoints: parseFloat(newPlayerForm.avgPoints),
    totalPoints: 0,
    tournamentId: tournament.id,
  };
  
  // Save to database
  await fetch('/api/players', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(newPlayer),
  });
  
  setPlayers([...players, newPlayer]);
  setNewPlayerForm({ name: '', team: '', position: 'batter', price: 8.0, avgPoints: 30 });
};
```

#### Create the API Route (Vercel Serverless Function)

Create file: `api/players.js`

```javascript
import { createClient } from '@libsql/client';

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

export default async function handler(req, res) {
  if (req.method === 'GET') {
    // Get all players for a tournament
    const { tournament } = req.query;
    const result = await db.execute({
      sql: 'SELECT * FROM players WHERE tournament_id = ?',
      args: [tournament],
    });
    return res.json(result.rows);
  }
  
  if (req.method === 'POST') {
    // Add a new player
    const player = req.body;
    await db.execute({
      sql: `INSERT INTO players (id, name, team, position, price, avg_points, total_points, tournament_id) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [player.id, player.name, player.team, player.position, player.price, player.avgPoints, player.totalPoints, player.tournamentId],
    });
    return res.json({ success: true, player });
  }
  
  if (req.method === 'DELETE') {
    // Remove a player
    const { id } = req.query;
    await db.execute({
      sql: 'DELETE FROM players WHERE id = ?',
      args: [id],
    });
    return res.json({ success: true });
  }
  
  res.status(405).json({ error: 'Method not allowed' });
}
```

---

### Method 2: SQL Bulk Import

**Best for:** Importing a large number of players at once, especially when you have data in spreadsheet format.

#### Step 1: Prepare Your Data

First, format your player data. You'll need:
- Player name
- Team code (IND, AUS, ENG, etc.)
- Position (batter, bowler, keeper, flex)
- Price (in millions)
- Average points

#### Step 2: Access Turso SQL Shell

**Option A: Via Turso Website**
1. Go to [Turso Dashboard](https://turso.tech/app)
2. Click on your `t20-fantasy` database
3. Click **"Shell"** or **"SQL Editor"** tab

**Option B: Via CLI**
```bash
turso db shell t20-fantasy
```

#### Step 3: Run Bulk INSERT Statements

Copy and paste this SQL (modify with your players):

```sql
-- T20 World Cup 2026 Players - India
INSERT INTO players (id, name, team, position, price, avg_points, total_points, tournament_id) VALUES
('p_ind_1', 'Rohit Sharma', 'IND', 'batter', 12.0, 42, 0, 't20_wc_2026'),
('p_ind_2', 'Virat Kohli', 'IND', 'batter', 12.5, 45, 0, 't20_wc_2026'),
('p_ind_3', 'Suryakumar Yadav', 'IND', 'batter', 11.0, 48, 0, 't20_wc_2026'),
('p_ind_4', 'KL Rahul', 'IND', 'keeper', 10.0, 38, 0, 't20_wc_2026'),
('p_ind_5', 'Rishabh Pant', 'IND', 'keeper', 10.5, 40, 0, 't20_wc_2026'),
('p_ind_6', 'Hardik Pandya', 'IND', 'flex', 11.0, 52, 0, 't20_wc_2026'),
('p_ind_7', 'Ravindra Jadeja', 'IND', 'flex', 10.0, 48, 0, 't20_wc_2026'),
('p_ind_8', 'Jasprit Bumrah', 'IND', 'bowler', 11.5, 55, 0, 't20_wc_2026'),
('p_ind_9', 'Mohammed Shami', 'IND', 'bowler', 9.5, 45, 0, 't20_wc_2026'),
('p_ind_10', 'Yuzvendra Chahal', 'IND', 'bowler', 9.0, 42, 0, 't20_wc_2026'),
('p_ind_11', 'Kuldeep Yadav', 'IND', 'bowler', 8.5, 40, 0, 't20_wc_2026'),
('p_ind_12', 'Arshdeep Singh', 'IND', 'bowler', 8.0, 38, 0, 't20_wc_2026');

-- T20 World Cup 2026 Players - Australia
INSERT INTO players (id, name, team, position, price, avg_points, total_points, tournament_id) VALUES
('p_aus_1', 'David Warner', 'AUS', 'batter', 11.0, 42, 0, 't20_wc_2026'),
('p_aus_2', 'Travis Head', 'AUS', 'batter', 10.5, 45, 0, 't20_wc_2026'),
('p_aus_3', 'Steve Smith', 'AUS', 'batter', 10.0, 35, 0, 't20_wc_2026'),
('p_aus_4', 'Glenn Maxwell', 'AUS', 'flex', 11.5, 50, 0, 't20_wc_2026'),
('p_aus_5', 'Marcus Stoinis', 'AUS', 'flex', 9.5, 42, 0, 't20_wc_2026'),
('p_aus_6', 'Josh Inglis', 'AUS', 'keeper', 8.5, 32, 0, 't20_wc_2026'),
('p_aus_7', 'Pat Cummins', 'AUS', 'bowler', 10.5, 48, 0, 't20_wc_2026'),
('p_aus_8', 'Mitchell Starc', 'AUS', 'bowler', 10.0, 45, 0, 't20_wc_2026'),
('p_aus_9', 'Adam Zampa', 'AUS', 'bowler', 9.0, 42, 0, 't20_wc_2026'),
('p_aus_10', 'Josh Hazlewood', 'AUS', 'bowler', 9.5, 40, 0, 't20_wc_2026');

-- Add more teams as needed...
-- England, Pakistan, New Zealand, South Africa, etc.
```

#### Step 4: Verify Import

Run this query to check your players:

```sql
-- Count players by tournament
SELECT tournament_id, COUNT(*) as player_count 
FROM players 
GROUP BY tournament_id;

-- View all players for a tournament
SELECT name, team, position, price, avg_points 
FROM players 
WHERE tournament_id = 't20_wc_2026'
ORDER BY team, position, price DESC;
```

#### Pro Tips for Bulk Import

**Generate INSERT from Spreadsheet:**

If you have data in Excel/Google Sheets:

1. Organize columns: `name, team, position, price, avg_points`
2. Use a formula to generate SQL:
   ```
   =CONCATENATE("('p_", LOWER(B2), "_", ROW()-1, "', '", A2, "', '", B2, "', '", C2, "', ", D2, ", ", E2, ", 0, 't20_wc_2026'),")
   ```
3. Copy the formula down, then copy the output into your SQL

**Batch by Team:**
- Import one team at a time to avoid errors
- Easier to verify and fix issues

**ID Convention:**
- Use format: `p_{team}_{number}` e.g., `p_ind_1`, `p_aus_1`
- Makes it easy to identify and manage players

---

### Method 3: Cricket API Integration

**Best for:** Live data, automatic updates, real tournament rosters.

This method connects to a cricket data API to automatically fetch and update player information. Several APIs are available:

| API | Free Tier | Data Quality | Best For |
|-----|-----------|--------------|----------|
| [CricAPI](https://cricapi.com) | 100 req/day | Good | Basic stats |
| [Cricbuzz (RapidAPI)](https://rapidapi.com/cricketapilive/api/cricbuzz-cricket) | 500 req/month | Excellent | Detailed data |
| [SportMonks Cricket](https://www.sportmonks.com/cricket-api) | Limited | Professional | Production apps |
| [ESPNcricinfo (unofficial)](https://github.com/dwillis/python-espncricinfo) | Unlimited | Good | Scraping |

#### Step 1: Get API Credentials

**For CricAPI (Recommended for beginners):**

1. Go to [https://cricapi.com](https://cricapi.com)
2. Click "Sign Up" and create account
3. Verify your email
4. Go to Dashboard → API Key
5. Copy your API key

**For RapidAPI (Cricbuzz):**

1. Go to [https://rapidapi.com](https://rapidapi.com)
2. Create account or login
3. Search for "Cricbuzz Cricket"
4. Subscribe to free tier
5. Copy your `X-RapidAPI-Key`

#### Step 2: Add API Key to Environment

Add to your `.env` file:

```env
# CricAPI
CRICKET_API_KEY=your_cricapi_key_here

# OR RapidAPI
RAPIDAPI_KEY=your_rapidapi_key_here
```

Add to Vercel:
1. Go to Project Settings → Environment Variables
2. Add `CRICKET_API_KEY` or `RAPIDAPI_KEY`

#### Step 3: Create Player Sync Script

Create file: `scripts/sync-players.js`

```javascript
import { createClient } from '@libsql/client';

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// ============================================
// CricAPI Implementation
// ============================================

async function fetchPlayersFromCricAPI(seriesId) {
  const response = await fetch(
    `https://api.cricapi.com/v1/series_squad?apikey=${process.env.CRICKET_API_KEY}&id=${seriesId}`
  );
  const data = await response.json();
  
  if (data.status !== 'success') {
    throw new Error('Failed to fetch from CricAPI: ' + data.reason);
  }
  
  return data.data;
}

// ============================================
// RapidAPI (Cricbuzz) Implementation
// ============================================

async function fetchPlayersFromCricbuzz(seriesId) {
  const response = await fetch(
    `https://cricbuzz-cricket.p.rapidapi.com/series/v1/${seriesId}/squads`,
    {
      headers: {
        'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
        'X-RapidAPI-Host': 'cricbuzz-cricket.p.rapidapi.com',
      },
    }
  );
  const data = await response.json();
  return data.squads;
}

// ============================================
// Transform API Data to Our Schema
// ============================================

function transformPlayer(apiPlayer, teamCode, tournamentId) {
  // Determine position based on player role
  let position = 'flex';
  const role = (apiPlayer.role || apiPlayer.playingRole || '').toLowerCase();
  
  if (role.includes('wicket') || role.includes('keeper')) {
    position = 'keeper';
  } else if (role.includes('bowl') || role.includes('spinner') || role.includes('pace')) {
    position = 'bowler';
  } else if (role.includes('bat') || role.includes('open')) {
    position = 'batter';
  } else if (role.includes('all')) {
    position = 'flex';
  }
  
  // Calculate price based on batting/bowling averages if available
  const battingAvg = apiPlayer.battingAverage || apiPlayer.stats?.batting?.average || 25;
  const bowlingAvg = apiPlayer.bowlingAverage || apiPlayer.stats?.bowling?.average || 30;
  
  // Simple pricing formula (customize as needed)
  let price = 7.0; // Base price
  if (battingAvg > 35) price += 2;
  if (battingAvg > 45) price += 2;
  if (bowlingAvg < 25) price += 2;
  if (bowlingAvg < 20) price += 2;
  if (role.includes('captain')) price += 1;
  
  // Estimate average fantasy points
  let avgPoints = 25; // Base
  avgPoints += Math.min(battingAvg / 2, 25);
  if (position === 'bowler' || position === 'flex') {
    avgPoints += Math.max(0, (30 - bowlingAvg));
  }
  
  return {
    id: `p_${teamCode.toLowerCase()}_${apiPlayer.id || apiPlayer.playerId || Date.now()}`,
    name: apiPlayer.name || apiPlayer.fullName,
    team: teamCode,
    position: position,
    price: Math.round(price * 2) / 2, // Round to nearest 0.5
    avgPoints: Math.round(avgPoints),
    totalPoints: 0,
    tournamentId: tournamentId,
  };
}

// ============================================
// Save Players to Database
// ============================================

async function savePlayersToDb(players) {
  console.log(`Saving ${players.length} players to database...`);
  
  for (const player of players) {
    try {
      // Use INSERT OR REPLACE to handle duplicates
      await db.execute({
        sql: `INSERT OR REPLACE INTO players 
              (id, name, team, position, price, avg_points, total_points, tournament_id) 
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          player.id,
          player.name,
          player.team,
          player.position,
          player.price,
          player.avgPoints,
          player.totalPoints,
          player.tournamentId,
        ],
      });
      console.log(`  ✓ Saved: ${player.name} (${player.team})`);
    } catch (error) {
      console.error(`  ✗ Failed: ${player.name} - ${error.message}`);
    }
  }
  
  console.log('Player sync complete!');
}

// ============================================
// Main Sync Function
// ============================================

async function syncPlayers(tournamentId, seriesIds) {
  console.log(`\n🏏 Syncing players for tournament: ${tournamentId}`);
  console.log('='.repeat(50));
  
  const allPlayers = [];
  
  for (const [teamCode, seriesId] of Object.entries(seriesIds)) {
    console.log(`\nFetching ${teamCode} squad...`);
    
    try {
      // Use CricAPI
      const squadData = await fetchPlayersFromCricAPI(seriesId);
      
      // OR use RapidAPI
      // const squadData = await fetchPlayersFromCricbuzz(seriesId);
      
      const players = squadData.map(p => transformPlayer(p, teamCode, tournamentId));
      allPlayers.push(...players);
      console.log(`  Found ${players.length} players`);
      
      // Rate limiting - wait between requests
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.error(`  Error fetching ${teamCode}: ${error.message}`);
    }
  }
  
  // Save all players to database
  await savePlayersToDb(allPlayers);
  
  // Summary
  console.log('\n' + '='.repeat(50));
  console.log(`Total players synced: ${allPlayers.length}`);
  
  const byTeam = allPlayers.reduce((acc, p) => {
    acc[p.team] = (acc[p.team] || 0) + 1;
    return acc;
  }, {});
  
  console.log('\nPlayers by team:');
  Object.entries(byTeam)
    .sort((a, b) => b[1] - a[1])
    .forEach(([team, count]) => console.log(`  ${team}: ${count}`));
}

// ============================================
// Run Script
// ============================================

// Example: Sync T20 World Cup 2026 teams
// You'll need to find the actual series IDs from the API

const T20_WC_2026_SERIES_IDS = {
  'IND': 'series_id_for_india',    // Get from API
  'AUS': 'series_id_for_australia',
  'ENG': 'series_id_for_england',
  'PAK': 'series_id_for_pakistan',
  // Add more teams...
};

// Uncomment to run:
// syncPlayers('t20_wc_2026', T20_WC_2026_SERIES_IDS);

export { syncPlayers, fetchPlayersFromCricAPI, transformPlayer };
```

#### Step 4: Create API Route for Manual Sync

Create file: `api/sync-players.js`

```javascript
import { syncPlayers } from '../scripts/sync-players.js';

export default async function handler(req, res) {
  // Check for admin authorization
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.ADMIN_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const { tournamentId, seriesIds } = req.body;
  
  try {
    await syncPlayers(tournamentId, seriesIds);
    res.json({ success: true, message: 'Player sync complete' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
```

#### Step 5: Set Up Automatic Nightly Sync (Vercel Cron)

Create file: `vercel.json`

```json
{
  "crons": [
    {
      "path": "/api/cron/sync-players",
      "schedule": "0 2 * * *"
    }
  ]
}
```

Create file: `api/cron/sync-players.js`

```javascript
import { syncPlayers } from '../../scripts/sync-players.js';

export default async function handler(req, res) {
  // Verify it's a Vercel cron request
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  try {
    // Sync active tournaments
    await syncPlayers('t20_wc_2026', T20_WC_SERIES_IDS);
    
    res.json({ success: true, timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

export const config = {
  api: {
    bodyParser: false,
  },
};
```

---

### Method 4: CSV/JSON File Import

**Best for:** Importing from spreadsheets, offline data sources, or custom player lists.

This method allows you to import players from CSV or JSON files, useful when you have player data in spreadsheets or want to use offline data.

#### Option A: JSON File Import

**Step 1: Create Player Data File**

Create file: `data/players-t20wc2026.json`

```json
{
  "tournament_id": "t20_wc_2026",
  "last_updated": "2026-01-15",
  "players": [
    {
      "name": "Rohit Sharma",
      "team": "IND",
      "position": "batter",
      "price": 12.0,
      "avg_points": 42
    },
    {
      "name": "Virat Kohli",
      "team": "IND",
      "position": "batter",
      "price": 12.5,
      "avg_points": 45
    },
    {
      "name": "Jasprit Bumrah",
      "team": "IND",
      "position": "bowler",
      "price": 11.5,
      "avg_points": 55
    }
  ]
}
```

**Step 2: Create Import Script**

Create file: `scripts/import-json.js`

```javascript
import { createClient } from '@libsql/client';
import fs from 'fs';
import path from 'path';

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function importFromJson(filePath) {
  console.log(`\n📁 Importing from: ${filePath}`);
  console.log('='.repeat(50));
  
  // Read JSON file
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const data = JSON.parse(fileContent);
  
  const tournamentId = data.tournament_id;
  const players = data.players;
  
  console.log(`Tournament: ${tournamentId}`);
  console.log(`Players to import: ${players.length}`);
  
  let successCount = 0;
  let errorCount = 0;
  
  for (let i = 0; i < players.length; i++) {
    const player = players[i];
    const playerId = `p_${player.team.toLowerCase()}_${i + 1}`;
    
    try {
      await db.execute({
        sql: `INSERT OR REPLACE INTO players 
              (id, name, team, position, price, avg_points, total_points, tournament_id) 
              VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
        args: [
          playerId,
          player.name,
          player.team,
          player.position,
          player.price,
          player.avg_points,
          tournamentId,
        ],
      });
      console.log(`  ✓ ${player.name} (${player.team})`);
      successCount++;
    } catch (error) {
      console.error(`  ✗ ${player.name}: ${error.message}`);
      errorCount++;
    }
  }
  
  console.log('\n' + '='.repeat(50));
  console.log(`Import complete: ${successCount} success, ${errorCount} errors`);
}

// Run: node scripts/import-json.js data/players-t20wc2026.json
const filePath = process.argv[2];
if (filePath) {
  importFromJson(filePath);
} else {
  console.log('Usage: node scripts/import-json.js <path-to-json>');
}
```

**Step 3: Run Import**

```bash
# Set environment variables
export TURSO_DATABASE_URL="libsql://your-db.turso.io"
export TURSO_AUTH_TOKEN="your-token"

# Run import
node scripts/import-json.js data/players-t20wc2026.json
```

#### Option B: CSV File Import

**Step 1: Create CSV File**

Create file: `data/players-t20wc2026.csv`

```csv
name,team,position,price,avg_points
Rohit Sharma,IND,batter,12.0,42
Virat Kohli,IND,batter,12.5,45
Suryakumar Yadav,IND,batter,11.0,48
KL Rahul,IND,keeper,10.0,38
Rishabh Pant,IND,keeper,10.5,40
Hardik Pandya,IND,flex,11.0,52
Jasprit Bumrah,IND,bowler,11.5,55
Mohammed Shami,IND,bowler,9.5,45
David Warner,AUS,batter,11.0,42
Travis Head,AUS,batter,10.5,45
Glenn Maxwell,AUS,flex,11.5,50
Pat Cummins,AUS,bowler,10.5,48
```

**Step 2: Create CSV Import Script**

Create file: `scripts/import-csv.js`

```javascript
import { createClient } from '@libsql/client';
import fs from 'fs';
import { parse } from 'csv-parse/sync';

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function importFromCsv(filePath, tournamentId) {
  console.log(`\n📁 Importing from: ${filePath}`);
  console.log(`Tournament: ${tournamentId}`);
  console.log('='.repeat(50));
  
  // Read and parse CSV
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const records = parse(fileContent, {
    columns: true,        // Use first row as headers
    skip_empty_lines: true,
    trim: true,
  });
  
  console.log(`Players to import: ${records.length}`);
  
  // Track team counts for ID generation
  const teamCounts = {};
  
  let successCount = 0;
  let errorCount = 0;
  
  for (const record of records) {
    // Generate unique ID
    const team = record.team.toUpperCase();
    teamCounts[team] = (teamCounts[team] || 0) + 1;
    const playerId = `p_${team.toLowerCase()}_${teamCounts[team]}`;
    
    try {
      await db.execute({
        sql: `INSERT OR REPLACE INTO players 
              (id, name, team, position, price, avg_points, total_points, tournament_id) 
              VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
        args: [
          playerId,
          record.name,
          team,
          record.position.toLowerCase(),
          parseFloat(record.price),
          parseFloat(record.avg_points),
          tournamentId,
        ],
      });
      console.log(`  ✓ ${record.name} (${team})`);
      successCount++;
    } catch (error) {
      console.error(`  ✗ ${record.name}: ${error.message}`);
      errorCount++;
    }
  }
  
  // Summary by team
  console.log('\n' + '='.repeat(50));
  console.log(`Import complete: ${successCount} success, ${errorCount} errors`);
  console.log('\nPlayers by team:');
  Object.entries(teamCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([team, count]) => console.log(`  ${team}: ${count}`));
}

// Run: node scripts/import-csv.js data/players.csv t20_wc_2026
const [filePath, tournamentId] = process.argv.slice(2);
if (filePath && tournamentId) {
  importFromCsv(filePath, tournamentId);
} else {
  console.log('Usage: node scripts/import-csv.js <path-to-csv> <tournament-id>');
}
```

**Step 3: Install CSV Parser**

```bash
npm install csv-parse
```

**Step 4: Run Import**

```bash
node scripts/import-csv.js data/players-t20wc2026.csv t20_wc_2026
```

#### Option C: Google Sheets Integration

For more dynamic data management, you can connect to Google Sheets:

**Step 1: Set Up Google Sheets**

1. Create a Google Sheet with columns: `name, team, position, price, avg_points`
2. Go to File → Share → Publish to web
3. Select "CSV" format and copy the URL

**Step 2: Create Google Sheets Import Script**

```javascript
import { createClient } from '@libsql/client';
import { parse } from 'csv-parse/sync';

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function importFromGoogleSheets(sheetUrl, tournamentId) {
  console.log('📊 Fetching from Google Sheets...');
  
  // Fetch CSV from published Google Sheet
  const response = await fetch(sheetUrl);
  const csvContent = await response.text();
  
  // Parse CSV
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });
  
  console.log(`Found ${records.length} players`);
  
  // Import to database (same logic as CSV import)
  const teamCounts = {};
  
  for (const record of records) {
    const team = record.team.toUpperCase();
    teamCounts[team] = (teamCounts[team] || 0) + 1;
    const playerId = `p_${team.toLowerCase()}_${teamCounts[team]}`;
    
    await db.execute({
      sql: `INSERT OR REPLACE INTO players 
            (id, name, team, position, price, avg_points, total_points, tournament_id) 
            VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
      args: [
        playerId,
        record.name,
        team,
        record.position.toLowerCase(),
        parseFloat(record.price),
        parseFloat(record.avg_points),
        tournamentId,
      ],
    });
  }
  
  console.log('✓ Import complete!');
}

// Usage
const SHEET_URL = 'https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/export?format=csv';
importFromGoogleSheets(SHEET_URL, 't20_wc_2026');
```

---

### Comparison: Which Method Should You Choose?

| Scenario | Recommended Method |
|----------|-------------------|
| Just starting, small league | **Method 1: Admin Panel** |
| One-time setup, have spreadsheet | **Method 2: SQL Bulk Import** |
| Want live/updated data | **Method 3: Cricket API** |
| Managing data in Google Sheets | **Method 4: CSV/JSON Import** |
| Production app with multiple tournaments | **Method 3 + Method 4 combo** |

---

### Verifying Your Player Data

After importing, run these queries to verify:

```sql
-- Count total players
SELECT COUNT(*) as total FROM players;

-- Count by tournament
SELECT tournament_id, COUNT(*) as count 
FROM players 
GROUP BY tournament_id;

-- Count by team within tournament
SELECT tournament_id, team, COUNT(*) as count 
FROM players 
GROUP BY tournament_id, team
ORDER BY tournament_id, count DESC;

-- Check for missing positions
SELECT team, 
       SUM(CASE WHEN position = 'batter' THEN 1 ELSE 0 END) as batters,
       SUM(CASE WHEN position = 'keeper' THEN 1 ELSE 0 END) as keepers,
       SUM(CASE WHEN position = 'bowler' THEN 1 ELSE 0 END) as bowlers,
       SUM(CASE WHEN position = 'flex' THEN 1 ELSE 0 END) as flex
FROM players
WHERE tournament_id = 't20_wc_2026'
GROUP BY team;

-- Find duplicate players
SELECT name, team, COUNT(*) as count 
FROM players 
GROUP BY name, team 
HAVING count > 1;
```

---

## Testing Your Setup

### Complete Test Flow

The app includes a dedicated test tournament (India vs NZ T20 Series) to verify everything works before the real tournaments begin. Here's the complete testing workflow:

### 1. Access Test Mode

1. Open your deployed app at `https://your-app.vercel.app`
2. You'll see the Tournament Selection screen
3. Select **"India vs NZ T20 Series"** (marked with 🧪 TEST badge)
4. Create an account (email + password)
5. Create your fantasy team (name, logo optional)

### 2. Complete the Snake Draft

1. After team creation, you'll enter the **Snake Draft**
2. You'll draft against 3 CPU teams
3. Draft order alternates each round (snake format):
   - Round 1: Team 1 → 2 → 3 → 4
   - Round 2: Team 4 → 3 → 2 → 1
   - Round 3: Team 1 → 2 → 3 → 4... etc.
4. Draft until your roster is full (16 players):
   - 6 Batters
   - 2 Wicketkeepers
   - 6 Bowlers
   - 2 Flex/Utility
5. When complete, you'll be taken to your Dashboard

### 3. Run the Test Suite

In the Dashboard, click the **🧪 Test** tab. You'll see 4 test actions:

#### Test 1: Database Connection 🗄️
1. Click **"🔌 Test DB Connection"**
2. Watch the status progress:
   - 🔌 Connecting to Turso...
   - 📖 Reading from database...
   - ✏️ Testing write operations...
   - 🔍 Verifying data integrity...
3. ✅ Success shows:
   - Latency (should be < 100ms)
   - Tables found (should be 8)
   - Players in database
   - Database version

#### Test 2: API Data Pull 🔄
1. Click **"📡 Simulate API Pull"**
2. This simulates fetching live cricket data
3. Watch as player stats appear one by one:
   ```
   10:30:45 - Virat Kohli: +52 pts
   10:30:45 - Rohit Sharma: +38 pts
   10:30:46 - Jasprit Bumrah: +45 pts
   ```
4. ✅ Success message: "Data pull successful!"

#### Test 3: Points Calculation 🧮
1. Click **"🔢 Run Points Test"**
2. This runs 4 test scenarios:
   - Batting: 45 runs @ 150 SR → Expected: 65 pts
   - Bowling: 2 wickets, 4 overs @ 6.0 ER → Expected: 70 pts
   - Fielding: 2 catches + 1 run out → Expected: 44 pts
   - All-rounder combo → Expected: 97 pts
3. ✅ All tests should show green checkmarks
4. If any fail, check the points breakdown

#### Test 4: Match Simulation 🎮
1. Select a match from the schedule (or use Quick Simulate)
2. Click **"⚡ Simulate [Match Name]"**
3. Watch your players' performance:
   - Each player gets random stats generated
   - Points are calculated per scoring rules
   - Team total updates
4. View the **Player Performance Breakdown**:
   - Stats for each player
   - Points earned
   - Position rankings

### 4. Verify Results

After running all tests, check:

✅ **Points Display**: Header should show updated total points
✅ **Match History**: Previous simulations appear in the history section
✅ **Roster Updates**: My Roster tab shows player point totals
✅ **Standings**: Your team appears in league standings

### 5. Test Checklist

The Test tab includes a live checklist:
- [ ] Complete snake draft (16/16 players)
- [ ] Run database connection test
- [ ] Simulate API data pull
- [ ] Verify points calculation (4/4 tests pass)
- [ ] Run at least one match simulation
- [ ] Test free agency pickup (4/week limit)
- [ ] Test IR (Injured Reserve) functionality

### 6. Database Connection Test (CLI)

If you want to verify the database connection directly:

```bash
# Using Turso CLI
turso db shell t20-fantasy

# Run test queries
SELECT COUNT(*) FROM players;
SELECT * FROM fantasy_teams LIMIT 5;

# Exit
.quit
```

### 7. Common Test Issues

**"Cannot simulate - Complete draft first"**
- Finish the snake draft to build your roster

**Database test shows error**
- Verify `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` are set
- Check the URL starts with `libsql://`
- Regenerate token if expired

**Points calculation test fails**
- Check browser console for JavaScript errors
- Verify scoring rules haven't been modified

**Simulation not updating team total**
- Clear localStorage: `localStorage.clear()`
- Refresh and re-login

---

## Snake Draft System

The app uses a **Snake Draft** format, which is fair and fun for all participants.

### How Snake Draft Works

In a snake draft, the pick order reverses each round:

```
Round 1: Team 1 → Team 2 → Team 3 → Team 4
Round 2: Team 4 → Team 3 → Team 2 → Team 1
Round 3: Team 1 → Team 2 → Team 3 → Team 4
Round 4: Team 4 → Team 3 → Team 2 → Team 1
... and so on
```

This balances the advantage of early picks by giving later teams two consecutive picks between rounds.

### Draft Configuration

| Setting | Value |
|---------|-------|
| Total Rounds | 16 |
| Players per Team | 16 |
| Time per Pick | Untimed (live) |
| CPU Teams | 3 (in test mode) |

### Position Requirements

Draft to fill these slots:

| Position | Slots | Icon |
|----------|-------|------|
| Batters | 6 | 🏏 |
| Wicketkeepers | 2 | 🧤 |
| Bowlers | 6 | 🎯 |
| Flex/Utility | 2 | ⚡ |
| **Total** | **16** | |

### Draft UI Features

- **Your Turn Indicator**: Big "🎯 YOUR PICK!" banner
- **Position Tracker**: Shows filled/empty slots per position
- **Search & Filter**: Find players by name, team, or position
- **Draft Log**: Recent picks from all teams
- **CPU Auto-Pick**: AI teams pick automatically when it's their turn

### Draft Strategy Tips

1. **Balance early rounds**: Don't load up on one position
2. **Watch position limits**: Can't exceed max per position
3. **Note CPU picks**: They take the best available players
4. **Flex picks**: All-rounders provide flexibility

---

## Nightly Data Sync (Optional)

For live tournaments, you'll want to sync real cricket stats.

### Using Vercel Cron Jobs

1. Create `vercel.json` in project root:

```json
{
  "crons": [{
    "path": "/api/sync-stats",
    "schedule": "30 20 * * *"
  }]
}
```

2. Create `api/sync-stats.js`:

```javascript
export default async function handler(req, res) {
  // Verify cron secret (optional but recommended)
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Your stat sync logic here
    // 1. Fetch from cricket API
    // 2. Calculate fantasy points
    // 3. Update database
    
    res.status(200).json({ success: true, synced: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
```

### Using GitHub Actions

Create `.github/workflows/sync-stats.yml`:

```yaml
name: Sync Cricket Stats

on:
  schedule:
    - cron: '30 20 * * *'  # 2:00 AM IST daily
  workflow_dispatch:  # Manual trigger

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          
      - name: Install dependencies
        run: npm ci
        
      - name: Run sync script
        env:
          TURSO_DATABASE_URL: ${{ secrets.TURSO_DATABASE_URL }}
          TURSO_AUTH_TOKEN: ${{ secrets.TURSO_AUTH_TOKEN }}
          CRICKET_API_KEY: ${{ secrets.CRICKET_API_KEY }}
        run: node scripts/sync-stats.js
```

---

## Free Tier Limits

### Turso Free Tier
- 9 GB total storage
- 500 databases
- 1 billion row reads/month
- 25 million row writes/month
- Unlimited API requests
- 3 locations

### Vercel Free Tier (Hobby)
- 100 GB bandwidth/month
- Unlimited deployments
- Serverless functions (100 GB-hours)
- 1 cron job (Vercel Cron)
- Custom domains

**Plenty for a fantasy league with friends!**

---

## Troubleshooting

### "Database connection failed"

1. Check your `TURSO_DATABASE_URL` format:
   - ✅ `libsql://dbname-username.turso.io`
   - ❌ `https://...` (wrong protocol)
   
2. Verify auth token hasn't expired:
   - Go to Turso dashboard → Database → Tokens
   - Create a new token if needed

3. Check environment variables in Vercel:
   - Settings → Environment Variables
   - Ensure no extra spaces or quotes

### "Build failed on Vercel"

1. Check build logs for specific error
2. Ensure `package.json` has correct scripts:
   ```json
   {
     "scripts": {
       "dev": "vite",
       "build": "vite build",
       "preview": "vite preview"
     }
   }
   ```
3. Verify all dependencies are in `package.json`

### "Snake draft not working"

1. Clear localStorage: `localStorage.clear()`
2. Refresh the page
3. Start a new tournament

### "Points not calculating"

1. Check the Test tab simulation works
2. Verify player positions are correct
3. Check browser console for errors

### Getting Help

- Turso Discord: [discord.gg/turso](https://discord.gg/turso)
- Vercel Support: [vercel.com/support](https://vercel.com/support)
- File an issue on your GitHub repo

---

## Quick Reference

### Turso CLI Commands

```bash
turso auth login              # Login
turso db list                 # List databases
turso db show t20-fantasy     # Show database info
turso db shell t20-fantasy    # Open SQL shell
turso db tokens create t20-fantasy  # Create new token
```

### Drizzle Commands

```bash
npx drizzle-kit generate      # Generate migrations
npx drizzle-kit push          # Push to database
npx drizzle-kit studio        # Open visual editor
npx drizzle-kit drop          # Drop all tables (careful!)
```

### Vercel CLI Commands

```bash
vercel                        # Deploy
vercel --prod                 # Deploy to production
vercel env pull               # Pull env vars to local
vercel logs                   # View logs
```

---

## Tournament Schedule

| Tournament | Status | Dates |
|-----------|--------|-------|
| India vs NZ Test Series | 🧪 Test Mode | Jan 15-25, 2026 |
| T20 World Cup 2026 | 📅 Upcoming | Feb 9 - Mar 7, 2026 |
| IPL 2026 | 📅 Upcoming | Mar 22 - May 26, 2026 |

---

**Happy Fantasy Cricket! 🏏**
