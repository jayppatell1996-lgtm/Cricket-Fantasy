// API: Auction System with Rounds Support
// Based on reference app architecture - round-based auctions with JSON import
//
// GET endpoints:
// - ?action=state&leagueId=X - Get current auction state
// - ?action=rounds&leagueId=X - Get all auction rounds with stats
// - ?action=players&leagueId=X[&roundId=X][&status=X] - Get auction players
// - ?action=logs&leagueId=X - Get auction activity logs
// - ?action=teams&leagueId=X - Get franchises with purse and roster
// - ?action=unsold&leagueId=X - Get unsold players pool
//
// POST endpoints:
// - ?action=setup - Initialize auction for a league
// - ?action=create_round - Create a new round with players
// - ?action=import_players - Import players JSON to a round
// - ?action=bid - Place a bid on current player
// - ?action=control - Admin controls (select_round, start, next, pause, resume, skip, sell, timer_expired, stop, end_round)
// - ?action=reorder - Reorder player in queue
// - ?action=update_price - Update player base price
// - ?action=update_team - Update team/franchise details
// - ?action=create_team - Create new franchise
//
// DELETE endpoints:
// - ?action=reset - Reset entire auction
// - ?action=delete_round - Delete a specific round
// - ?action=reset_round - Reset a round's players to pending
// - ?action=delete_team - Delete a franchise

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

// Bid lock to prevent race conditions
let bidLock = false;
const lockQueue = [];
const LOCK_TIMEOUT = 800;

async function acquireLock() {
  if (!bidLock) {
    bidLock = true;
    return true;
  }
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      const index = lockQueue.indexOf(resolve);
      if (index > -1) lockQueue.splice(index, 1);
      resolve(false);
    }, LOCK_TIMEOUT);
    lockQueue.push(() => {
      clearTimeout(timeout);
      bidLock = true;
      resolve(true);
    });
  });
}

function releaseLock() {
  if (lockQueue.length > 0) {
    const next = lockQueue.shift();
    next();
  } else {
    bidLock = false;
  }
}

// Control lock for admin actions
let controlLock = false;

async function acquireControlLock() {
  if (controlLock) return false;
  controlLock = true;
  setTimeout(() => { controlLock = false; }, 3000);
  return true;
}

function releaseControlLock() {
  controlLock = false;
}

// Calculate bid increment based on current bid (IPL-style in Crores/Lakhs)
function getBidIncrement(currentBid) {
  if (currentBid >= 150000000) return 10000000;   // $150M+ -> $10M increment
  if (currentBid >= 100000000) return 5000000;    // $100M+ -> $5M increment
  if (currentBid >= 50000000) return 2500000;     // $50M+ -> $2.5M increment
  if (currentBid >= 20000000) return 1000000;     // $20M+ -> $1M increment
  if (currentBid >= 10000000) return 500000;      // $10M+ -> $500K increment
  if (currentBid >= 5000000) return 250000;       // $5M+ -> $250K increment
  return 100000;                                   // Base -> $100K increment
}

// Timer settings
const INITIAL_TIMER = 15000;  // 15 seconds for first bid
const BID_TIMER = 10000;      // 10 seconds after each bid

// Default starting purse: $120 Million
const DEFAULT_PURSE = 120000000;
const DEFAULT_BASE_PRICE = 2000000; // $2M default

// Format currency
function formatCurrency(amount) {
  if (!amount) return '$0';
  if (amount >= 1000000) return `$${(amount / 1000000).toFixed(2)}M`;
  if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
  return `$${amount.toLocaleString()}`;
}

// Log action helper
async function logAction(db, leagueId, roundId, message, logType, teamId = null, playerId = null, amount = null) {
  try {
    await db.execute({
      sql: `INSERT INTO auction_logs (id, league_id, round_id, log_type, message, team_id, player_id, amount, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      args: [generateId(), leagueId, roundId, logType, message, teamId, playerId, amount]
    });
  } catch (e) {
    console.error('Failed to log action:', e);
  }
}

// Run migrations for Phase 3 (rounds-based auction)
async function runMigrations(db) {
  try {
    // Ensure all auction tables exist first
    await db.execute({ sql: `CREATE TABLE IF NOT EXISTS auction_state (
      id text PRIMARY KEY NOT NULL,
      league_id text NOT NULL UNIQUE,
      is_active integer DEFAULT 0,
      is_paused integer DEFAULT 0,
      current_player_id text,
      current_bid real DEFAULT 0,
      highest_bidder_team_id text,
      timer_end_time integer,
      paused_time_remaining integer,
      current_round_id text,
      created_at text DEFAULT CURRENT_TIMESTAMP,
      updated_at text DEFAULT CURRENT_TIMESTAMP
    )` });
    
    await db.execute({ sql: `CREATE TABLE IF NOT EXISTS auction_players (
      id text PRIMARY KEY NOT NULL,
      league_id text NOT NULL,
      round_id text,
      player_id text NOT NULL,
      player_name text NOT NULL,
      player_team text NOT NULL,
      player_position text NOT NULL,
      category text,
      base_price real NOT NULL DEFAULT 2000000,
      status text DEFAULT 'pending' NOT NULL,
      sold_to_team_id text,
      sold_for real,
      sold_at text,
      order_index integer NOT NULL DEFAULT 0,
      created_at text DEFAULT CURRENT_TIMESTAMP
    )` });
    
    await db.execute({ sql: `CREATE TABLE IF NOT EXISTS auction_rounds (
      id text PRIMARY KEY NOT NULL,
      league_id text NOT NULL,
      round_number integer NOT NULL,
      name text NOT NULL,
      is_active integer DEFAULT 0,
      is_completed integer DEFAULT 0,
      created_at text DEFAULT CURRENT_TIMESTAMP
    )` });
    
    await db.execute({ sql: `CREATE TABLE IF NOT EXISTS auction_logs (
      id text PRIMARY KEY NOT NULL,
      league_id text NOT NULL,
      round_id text,
      log_type text NOT NULL,
      message text NOT NULL,
      team_id text,
      player_id text,
      amount real,
      timestamp text DEFAULT CURRENT_TIMESTAMP
    )` });
    
    await db.execute({ sql: `CREATE TABLE IF NOT EXISTS unsold_players (
      id text PRIMARY KEY NOT NULL,
      league_id text NOT NULL,
      player_id text NOT NULL,
      player_name text NOT NULL,
      player_position text NOT NULL,
      base_price real NOT NULL,
      original_round_id text,
      category text,
      created_at text DEFAULT CURRENT_TIMESTAMP
    )` });
    
    // Update team purses to new default ($120M) if they have old default (5M)
    await db.execute({
      sql: `UPDATE fantasy_teams SET purse = ? WHERE purse = 5000000`,
      args: [DEFAULT_PURSE]
    });
    
  } catch (e) {
    console.error('Migration error:', e);
  }
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
  const { action } = req.query;

  // Run migrations
  await runMigrations(db);

  try {
    // ============================================
    // GET AUCTION STATE
    // ============================================
    if (action === 'state' && req.method === 'GET') {
      const { leagueId } = req.query;
      if (!leagueId) return res.status(400).json({ error: 'leagueId required' });

      const stateResult = await db.execute({
        sql: `SELECT s.*, 
                     ap.player_id, ap.player_name, ap.player_team, ap.player_position, ap.base_price, ap.category,
                     ft.name as highest_bidder_name,
                     ar.round_number, ar.name as round_name
              FROM auction_state s
              LEFT JOIN auction_players ap ON s.current_player_id = ap.id
              LEFT JOIN fantasy_teams ft ON s.highest_bidder_team_id = ft.id
              LEFT JOIN auction_rounds ar ON s.current_round_id = ar.id
              WHERE s.league_id = ?`,
        args: [leagueId]
      });

      if (stateResult.rows.length === 0) {
        return res.status(200).json({ success: true, state: null, message: 'Auction not initialized' });
      }

      const s = stateResult.rows[0];
      
      // Get teams with purses
      const teamsResult = await db.execute({
        sql: `SELECT ft.id, ft.name, ft.owner_name, ft.purse,
                     (SELECT COUNT(*) FROM roster r WHERE r.fantasy_team_id = ft.id AND r.dropped_date IS NULL) as roster_count
              FROM fantasy_teams ft WHERE ft.league_id = ? ORDER BY ft.purse DESC`,
        args: [leagueId]
      });

      // Get next players in queue
      let nextPlayers = [];
      if (s.current_round_id) {
        const nextResult = await db.execute({
          sql: `SELECT id, player_id, player_name, player_team, player_position, base_price, category
                FROM auction_players WHERE round_id = ? AND status = 'pending' ORDER BY order_index ASC LIMIT 5`,
          args: [s.current_round_id]
        });
        nextPlayers = nextResult.rows.map(p => ({
          id: p.id, playerId: p.player_id, name: p.player_name, team: p.player_team,
          position: p.player_position, category: p.category, basePrice: p.base_price
        }));
      }

      const state = {
        id: s.id,
        leagueId: s.league_id,
        isActive: Boolean(s.is_active),
        isPaused: Boolean(s.is_paused),
        currentRoundId: s.current_round_id,
        currentRoundNumber: s.round_number,
        currentRoundName: s.round_name,
        currentPlayer: s.current_player_id ? {
          auctionPlayerId: s.current_player_id,
          playerId: s.player_id,
          name: s.player_name,
          team: s.player_team,
          position: s.player_position,
          category: s.category,
          basePrice: s.base_price
        } : null,
        currentBid: s.current_bid || 0,
        highestBidder: s.highest_bidder_team_id ? {
          teamId: s.highest_bidder_team_id,
          teamName: s.highest_bidder_name
        } : null,
        timerEndTime: s.timer_end_time,
        pausedTimeRemaining: s.paused_time_remaining,
        teams: teamsResult.rows.map(t => ({
          id: t.id, name: t.name, ownerName: t.owner_name,
          purse: t.purse || DEFAULT_PURSE, rosterCount: t.roster_count || 0
        })),
        nextPlayers
      };

      return res.status(200).json({ success: true, state });
    }

    // ============================================
    // GET AUCTION ROUNDS
    // ============================================
    if (action === 'rounds' && req.method === 'GET') {
      const { leagueId } = req.query;
      if (!leagueId) return res.status(400).json({ error: 'leagueId required' });

      const roundsResult = await db.execute({
        sql: `SELECT * FROM auction_rounds WHERE league_id = ? ORDER BY round_number ASC`,
        args: [leagueId]
      });

      // Get player counts for each round
      const playersResult = await db.execute({
        sql: `SELECT round_id, status, COUNT(*) as count FROM auction_players 
              WHERE league_id = ? AND round_id IS NOT NULL GROUP BY round_id, status`,
        args: [leagueId]
      });

      const playerCounts = {};
      for (const row of playersResult.rows) {
        if (!playerCounts[row.round_id]) {
          playerCounts[row.round_id] = { total: 0, pending: 0, sold: 0, unsold: 0, current: 0 };
        }
        playerCounts[row.round_id][row.status] = row.count;
        playerCounts[row.round_id].total += row.count;
      }

      const rounds = roundsResult.rows.map(r => ({
        id: r.id,
        roundNumber: r.round_number,
        name: r.name,
        isActive: Boolean(r.is_active),
        isCompleted: Boolean(r.is_completed),
        createdAt: r.created_at,
        playerCount: playerCounts[r.id]?.total || 0,
        totalPlayers: playerCounts[r.id]?.total || 0,
        pendingPlayers: playerCounts[r.id]?.pending || 0,
        soldPlayers: playerCounts[r.id]?.sold || 0,
        unsoldPlayers: playerCounts[r.id]?.unsold || 0
      }));

      return res.status(200).json({ success: true, rounds });
    }

    // ============================================
    // GET AUCTION PLAYERS
    // ============================================
    if (action === 'players' && req.method === 'GET') {
      const { leagueId, roundId, status } = req.query;
      if (!leagueId) return res.status(400).json({ error: 'leagueId required' });

      let sql = `SELECT ap.*, ft.name as sold_to_name FROM auction_players ap
                 LEFT JOIN fantasy_teams ft ON ap.sold_to_team_id = ft.id WHERE ap.league_id = ?`;
      const args = [leagueId];

      if (roundId) { sql += ' AND ap.round_id = ?'; args.push(roundId); }
      if (status) { sql += ' AND ap.status = ?'; args.push(status); }
      sql += ' ORDER BY ap.order_index ASC';

      const result = await db.execute({ sql, args });

      const players = result.rows.map(p => ({
        id: p.id, playerId: p.player_id, name: p.player_name, team: p.player_team,
        position: p.player_position, category: p.category, basePrice: p.base_price,
        status: p.status, roundId: p.round_id, orderIndex: p.order_index,
        soldTo: p.sold_to_team_id ? { teamId: p.sold_to_team_id, teamName: p.sold_to_name } : null,
        soldFor: p.sold_for, soldAt: p.sold_at
      }));

      return res.status(200).json({ success: true, players });
    }

    // ============================================
    // GET AUCTION LOGS
    // ============================================
    if (action === 'logs' && req.method === 'GET') {
      const { leagueId, roundId, limit = 50 } = req.query;
      if (!leagueId) return res.status(400).json({ error: 'leagueId required' });

      let sql = `SELECT al.*, ft.name as team_name FROM auction_logs al
                 LEFT JOIN fantasy_teams ft ON al.team_id = ft.id WHERE al.league_id = ?`;
      const args = [leagueId];
      if (roundId) { sql += ' AND al.round_id = ?'; args.push(roundId); }
      sql += ' ORDER BY al.timestamp DESC LIMIT ?';
      args.push(parseInt(limit));

      const result = await db.execute({ sql, args });

      return res.status(200).json({ 
        success: true, 
        logs: result.rows.map(l => ({
          id: l.id, logType: l.log_type, message: l.message, teamId: l.team_id,
          teamName: l.team_name, playerId: l.player_id, amount: l.amount,
          roundId: l.round_id, timestamp: l.timestamp
        }))
      });
    }

    // ============================================
    // GET TEAMS (Franchises)
    // ============================================
    if (action === 'teams' && req.method === 'GET') {
      const { leagueId } = req.query;
      if (!leagueId) return res.status(400).json({ error: 'leagueId required' });

      const teamsResult = await db.execute({
        sql: `SELECT ft.*, (SELECT COUNT(*) FROM roster r WHERE r.fantasy_team_id = ft.id AND r.dropped_date IS NULL) as roster_count
              FROM fantasy_teams ft WHERE ft.league_id = ? ORDER BY ft.name`,
        args: [leagueId]
      });

      const teams = [];
      for (const team of teamsResult.rows) {
        // Get players for this team
        const playersResult = await db.execute({
          sql: `SELECT p.id, p.name, p.position, ap.sold_for as bought_for, ap.category
                FROM roster r JOIN players p ON r.player_id = p.id
                LEFT JOIN auction_players ap ON ap.player_id = p.id AND ap.sold_to_team_id = ?
                WHERE r.fantasy_team_id = ? AND r.dropped_date IS NULL`,
          args: [team.id, team.id]
        });

        teams.push({
          id: team.id, name: team.name, ownerName: team.owner_name, ownerId: team.user_id,
          purse: team.purse || DEFAULT_PURSE, rosterCount: team.roster_count || 0,
          players: playersResult.rows.map(p => ({
            id: p.id, name: p.name, position: p.position, category: p.category, boughtFor: p.bought_for
          }))
        });
      }

      return res.status(200).json({ success: true, teams });
    }

    // ============================================
    // GET UNSOLD PLAYERS
    // ============================================
    if (action === 'unsold' && req.method === 'GET') {
      const { leagueId } = req.query;
      if (!leagueId) return res.status(400).json({ error: 'leagueId required' });

      const result = await db.execute({
        sql: `SELECT * FROM unsold_players WHERE league_id = ? ORDER BY created_at DESC`,
        args: [leagueId]
      });

      return res.status(200).json({
        success: true,
        players: result.rows.map(p => ({
          id: p.id, playerId: p.player_id, name: p.player_name, position: p.player_position,
          category: p.category, basePrice: p.base_price, originalRoundId: p.original_round_id
        }))
      });
    }

    // ============================================
    // SETUP AUCTION
    // ============================================
    if (action === 'setup' && req.method === 'POST') {
      const { leagueId, budget = DEFAULT_PURSE } = req.body;
      if (!leagueId) return res.status(400).json({ error: 'leagueId required' });

      // Create or reset auction state (tables already created by runMigrations)
      const existingState = await db.execute({
        sql: `SELECT id FROM auction_state WHERE league_id = ?`,
        args: [leagueId]
      });

      if (existingState.rows.length === 0) {
        await db.execute({
          sql: `INSERT INTO auction_state (id, league_id, is_active, is_paused, current_bid) VALUES (?, ?, 0, 0, 0)`,
          args: [generateId(), leagueId]
        });
      } else {
        await db.execute({
          sql: `UPDATE auction_state SET is_active = 0, is_paused = 0, current_player_id = NULL, 
                current_round_id = NULL, current_bid = 0, highest_bidder_team_id = NULL,
                timer_end_time = NULL, paused_time_remaining = NULL WHERE league_id = ?`,
          args: [leagueId]
        });
      }

      // Set team budgets
      await db.execute({
        sql: `UPDATE fantasy_teams SET purse = ? WHERE league_id = ?`,
        args: [budget, leagueId]
      });

      await logAction(db, leagueId, null, `Auction setup. Team budgets: ${formatCurrency(budget)}`, 'setup');

      return res.status(200).json({ success: true, message: `Auction setup. Budgets: ${formatCurrency(budget)}` });
    }

    // ============================================
    // CREATE ROUND
    // ============================================
    if (action === 'create_round' && req.method === 'POST') {
      const { leagueId, roundNumber, name, players: playersData } = req.body;
      if (!leagueId || !roundNumber || !name) {
        return res.status(400).json({ error: 'leagueId, roundNumber, and name required' });
      }

      // Check if round exists
      const existing = await db.execute({
        sql: `SELECT id FROM auction_rounds WHERE league_id = ? AND round_number = ?`,
        args: [leagueId, roundNumber]
      });

      let roundId;
      if (existing.rows.length > 0) {
        roundId = existing.rows[0].id;
        await db.execute({
          sql: `UPDATE auction_rounds SET name = ?, is_active = 0, is_completed = 0 WHERE id = ?`,
          args: [name, roundId]
        });
        await db.execute({ sql: `DELETE FROM auction_players WHERE round_id = ?`, args: [roundId] });
      } else {
        roundId = generateId();
        await db.execute({
          sql: `INSERT INTO auction_rounds (id, league_id, round_number, name, is_active, is_completed) VALUES (?, ?, ?, ?, 0, 0)`,
          args: [roundId, leagueId, roundNumber, name]
        });
      }

      // Add players if provided
      if (playersData && Array.isArray(playersData)) {
        for (let i = 0; i < playersData.length; i++) {
          const p = playersData[i];
          await db.execute({
            sql: `INSERT INTO auction_players (id, league_id, round_id, player_id, player_name, player_team, player_position, category, base_price, status, order_index)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
            args: [generateId(), leagueId, roundId, p.player_id || generateId(), p.name, p.team || '', 
                   p.position || p.category || 'Unknown', p.category || p.position || 'Unknown',
                   p.base_price || p.basePrice || DEFAULT_BASE_PRICE, i]
          });
        }
      }

      return res.status(200).json({ success: true, message: `Round ${roundNumber} created with ${playersData?.length || 0} players`, roundId });
    }

    // ============================================
    // IMPORT PLAYERS TO ROUND
    // ============================================
    if (action === 'import_players' && req.method === 'POST') {
      const { leagueId, roundId, players: playersData, append = false } = req.body;
      if (!leagueId || !roundId || !playersData) {
        return res.status(400).json({ error: 'leagueId, roundId, and players required' });
      }

      if (!append) {
        await db.execute({ sql: `DELETE FROM auction_players WHERE round_id = ? AND status = 'pending'`, args: [roundId] });
      }

      const maxResult = await db.execute({
        sql: `SELECT MAX(order_index) as max_order FROM auction_players WHERE round_id = ?`,
        args: [roundId]
      });
      let orderIndex = (maxResult.rows[0]?.max_order || -1) + 1;

      for (const p of playersData) {
        await db.execute({
          sql: `INSERT INTO auction_players (id, league_id, round_id, player_id, player_name, player_team, player_position, category, base_price, status, order_index)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
          args: [generateId(), leagueId, roundId, p.player_id || generateId(), p.name, p.team || '',
                 p.position || p.category || 'Unknown', p.category || p.position || 'Unknown',
                 p.base_price || p.basePrice || DEFAULT_BASE_PRICE, orderIndex++]
        });
      }

      return res.status(200).json({ success: true, message: `Imported ${playersData.length} players`, count: playersData.length });
    }

    // ============================================
    // PLACE BID
    // ============================================
    if (action === 'bid' && req.method === 'POST') {
      const { leagueId, teamId } = req.body;
      if (!leagueId || !teamId) return res.status(400).json({ error: 'leagueId and teamId required' });

      const acquired = await acquireLock();
      if (!acquired) return res.status(429).json({ error: 'Server busy' });

      try {
        const stateResult = await db.execute({ sql: `SELECT * FROM auction_state WHERE league_id = ?`, args: [leagueId] });
        if (stateResult.rows.length === 0) { releaseLock(); return res.status(400).json({ error: 'Auction not initialized' }); }
        const state = stateResult.rows[0];

        if (!state.is_active || state.is_paused) { releaseLock(); return res.status(400).json({ error: 'Auction not active' }); }
        if (!state.current_player_id) { releaseLock(); return res.status(400).json({ error: 'No player up for auction' }); }
        if (state.timer_end_time && Date.now() > state.timer_end_time) { releaseLock(); return res.status(400).json({ error: 'Timer expired' }); }

        const teamResult = await db.execute({ sql: `SELECT * FROM fantasy_teams WHERE id = ?`, args: [teamId] });
        if (teamResult.rows.length === 0) { releaseLock(); return res.status(400).json({ error: 'Team not found' }); }
        const team = teamResult.rows[0];

        const playerResult = await db.execute({ sql: `SELECT * FROM auction_players WHERE id = ?`, args: [state.current_player_id] });
        const player = playerResult.rows[0];

        const currentBid = state.current_bid || 0;
        const newBid = currentBid === 0 ? player.base_price : currentBid + getBidIncrement(currentBid);

        if (team.purse < newBid) { releaseLock(); return res.status(400).json({ error: 'Insufficient funds' }); }

        const rosterCount = await db.execute({
          sql: `SELECT COUNT(*) as count FROM roster WHERE fantasy_team_id = ? AND dropped_date IS NULL`,
          args: [teamId]
        });
        if (rosterCount.rows[0].count >= 25) { releaseLock(); return res.status(400).json({ error: 'Roster full' }); }

        await db.execute({
          sql: `UPDATE auction_state SET current_bid = ?, highest_bidder_team_id = ?, timer_end_time = ? WHERE league_id = ?`,
          args: [newBid, teamId, Date.now() + BID_TIMER, leagueId]
        });

        await logAction(db, leagueId, state.current_round_id, `${team.name} bids ${formatCurrency(newBid)} for ${player.player_name}`, 'bid', teamId, state.current_player_id, newBid);

        releaseLock();
        return res.status(200).json({ success: true, newBid, teamId, teamName: team.name, remainingTime: BID_TIMER });
      } catch (error) {
        releaseLock();
        throw error;
      }
    }

    // ============================================
    // AUCTION CONTROL
    // ============================================
    if (action === 'control' && req.method === 'POST') {
      const { leagueId, controlAction, roundId } = req.body;
      if (!leagueId || !controlAction) return res.status(400).json({ error: 'leagueId and controlAction required' });

      const acquired = await acquireControlLock();
      if (!acquired) return res.status(429).json({ error: 'Control action in progress' });

      try {
        let stateResult = await db.execute({ sql: `SELECT * FROM auction_state WHERE league_id = ?`, args: [leagueId] });
        let state = stateResult.rows[0];
        
        if (!state) {
          const newId = generateId();
          await db.execute({ sql: `INSERT INTO auction_state (id, league_id, is_active, is_paused, current_bid) VALUES (?, ?, 0, 0, 0)`, args: [newId, leagueId] });
          state = { id: newId, league_id: leagueId, is_active: 0, is_paused: 0, current_bid: 0 };
        }

        switch (controlAction) {
          case 'select_round': {
            if (!roundId) { releaseControlLock(); return res.status(400).json({ error: 'roundId required' }); }
            const roundResult = await db.execute({ sql: `SELECT * FROM auction_rounds WHERE id = ? AND league_id = ?`, args: [roundId, leagueId] });
            if (roundResult.rows.length === 0) { releaseControlLock(); return res.status(404).json({ error: 'Round not found' }); }
            const round = roundResult.rows[0];

            await db.execute({
              sql: `UPDATE auction_state SET current_round_id = ?, is_active = 0, is_paused = 0, current_player_id = NULL, current_bid = 0, highest_bidder_team_id = NULL WHERE league_id = ?`,
              args: [roundId, leagueId]
            });
            await db.execute({ sql: `UPDATE auction_rounds SET is_active = 1 WHERE id = ?`, args: [roundId] });
            await logAction(db, leagueId, roundId, `Round ${round.round_number}: ${round.name} selected`, 'select_round');

            releaseControlLock();
            return res.status(200).json({ success: true, message: `Round ${round.round_number} selected`, roundId, roundName: round.name });
          }

          case 'start': {
            if (!state.current_round_id) { releaseControlLock(); return res.status(400).json({ error: 'Select a round first' }); }
            const playerResult = await db.execute({
              sql: `SELECT * FROM auction_players WHERE round_id = ? AND status = 'pending' ORDER BY order_index ASC LIMIT 1`,
              args: [state.current_round_id]
            });
            if (playerResult.rows.length === 0) { releaseControlLock(); return res.status(400).json({ error: 'No pending players' }); }
            const player = playerResult.rows[0];

            await db.execute({ sql: `UPDATE auction_players SET status = 'current' WHERE id = ?`, args: [player.id] });
            await db.execute({
              sql: `UPDATE auction_state SET is_active = 1, is_paused = 0, current_player_id = ?, current_bid = 0, highest_bidder_team_id = NULL, timer_end_time = ? WHERE league_id = ?`,
              args: [player.id, Date.now() + INITIAL_TIMER, leagueId]
            });
            await logAction(db, leagueId, state.current_round_id, `Auction started! ${player.player_name} up. Base: ${formatCurrency(player.base_price)}`, 'start');

            releaseControlLock();
            return res.status(200).json({ success: true, message: `Started! ${player.player_name} is up`, player: { id: player.id, name: player.player_name, basePrice: player.base_price } });
          }

          case 'next': {
            if (!state.current_round_id) { releaseControlLock(); return res.status(400).json({ error: 'No round selected' }); }
            const nextResult = await db.execute({
              sql: `SELECT * FROM auction_players WHERE round_id = ? AND status = 'pending' ORDER BY order_index ASC LIMIT 1`,
              args: [state.current_round_id]
            });

            if (nextResult.rows.length === 0) {
              await db.execute({ sql: `UPDATE auction_rounds SET is_completed = 1, is_active = 0 WHERE id = ?`, args: [state.current_round_id] });
              await db.execute({
                sql: `UPDATE auction_state SET is_active = 0, current_player_id = NULL, current_round_id = NULL, current_bid = 0, highest_bidder_team_id = NULL, timer_end_time = NULL WHERE league_id = ?`,
                args: [leagueId]
              });
              await logAction(db, leagueId, state.current_round_id, 'Round completed!', 'round_complete');
              releaseControlLock();
              return res.status(200).json({ success: true, message: 'Round completed!', roundComplete: true });
            }

            const nextPlayer = nextResult.rows[0];
            await db.execute({ sql: `UPDATE auction_players SET status = 'current' WHERE id = ?`, args: [nextPlayer.id] });
            await db.execute({
              sql: `UPDATE auction_state SET current_player_id = ?, current_bid = 0, highest_bidder_team_id = NULL, timer_end_time = ?, is_active = 1, is_paused = 0 WHERE league_id = ?`,
              args: [nextPlayer.id, Date.now() + INITIAL_TIMER, leagueId]
            });
            await logAction(db, leagueId, state.current_round_id, `Next: ${nextPlayer.player_name}. Base: ${formatCurrency(nextPlayer.base_price)}`, 'next');

            releaseControlLock();
            return res.status(200).json({ success: true, message: `Next: ${nextPlayer.player_name}`, player: { id: nextPlayer.id, name: nextPlayer.player_name, basePrice: nextPlayer.base_price } });
          }

          case 'pause': {
            if (state.is_paused) { releaseControlLock(); return res.status(400).json({ error: 'Already paused' }); }
            const remaining = state.timer_end_time ? Math.max(0, state.timer_end_time - Date.now()) : 0;
            await db.execute({ sql: `UPDATE auction_state SET is_paused = 1, paused_time_remaining = ? WHERE league_id = ?`, args: [remaining, leagueId] });
            await logAction(db, leagueId, state.current_round_id, 'Auction paused', 'pause');
            releaseControlLock();
            return res.status(200).json({ success: true, message: 'Paused' });
          }

          case 'resume': {
            if (!state.is_paused) { releaseControlLock(); return res.status(400).json({ error: 'Not paused' }); }
            await db.execute({ sql: `UPDATE auction_state SET is_paused = 0, timer_end_time = ?, paused_time_remaining = NULL WHERE league_id = ?`, args: [Date.now() + INITIAL_TIMER, leagueId] });
            await logAction(db, leagueId, state.current_round_id, 'Resumed (timer reset)', 'resume');
            releaseControlLock();
            return res.status(200).json({ success: true, message: 'Resumed' });
          }

          case 'skip': {
            if (!state.current_player_id) { releaseControlLock(); return res.status(400).json({ error: 'No current player' }); }
            const playerResult = await db.execute({ sql: `SELECT * FROM auction_players WHERE id = ?`, args: [state.current_player_id] });
            const player = playerResult.rows[0];

            await db.execute({ sql: `UPDATE auction_players SET status = 'unsold' WHERE id = ?`, args: [state.current_player_id] });
            await db.execute({
              sql: `INSERT INTO unsold_players (id, league_id, player_id, player_name, player_position, base_price, original_round_id, category) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              args: [generateId(), leagueId, player.player_id, player.player_name, player.player_position, player.base_price, state.current_round_id, player.category]
            });
            await db.execute({ sql: `UPDATE auction_state SET current_player_id = NULL, current_bid = 0, highest_bidder_team_id = NULL, timer_end_time = NULL WHERE league_id = ?`, args: [leagueId] });
            await logAction(db, leagueId, state.current_round_id, `${player.player_name} skipped (unsold)`, 'unsold');

            releaseControlLock();
            return res.status(200).json({ success: true, message: `${player.player_name} unsold. Click Next.` });
          }

          case 'sell':
          case 'timer_expired': {
            if (!state.current_player_id) { releaseControlLock(); return res.status(200).json({ success: true, message: 'No current player' }); }
            
            const playerResult = await db.execute({ sql: `SELECT * FROM auction_players WHERE id = ?`, args: [state.current_player_id] });
            const player = playerResult.rows[0];

            if (state.highest_bidder_team_id && state.current_bid > 0) {
              const teamResult = await db.execute({ sql: `SELECT * FROM fantasy_teams WHERE id = ?`, args: [state.highest_bidder_team_id] });
              const team = teamResult.rows[0];

              const updateResult = await db.execute({
                sql: `UPDATE auction_players SET status = 'sold', sold_to_team_id = ?, sold_for = ?, sold_at = datetime('now') WHERE id = ? AND status = 'current'`,
                args: [state.highest_bidder_team_id, state.current_bid, state.current_player_id]
              });

              if (updateResult.rowsAffected === 0) { releaseControlLock(); return res.status(200).json({ success: true, message: 'Already processed', alreadyProcessed: true }); }

              await db.execute({ sql: `UPDATE fantasy_teams SET purse = purse - ? WHERE id = ?`, args: [state.current_bid, state.highest_bidder_team_id] });
              await db.execute({
                sql: `INSERT INTO roster (id, fantasy_team_id, player_id, acquired_date, acquired_via) VALUES (?, ?, ?, datetime('now'), 'auction')`,
                args: [generateId(), state.highest_bidder_team_id, player.player_id]
              });
              await db.execute({ sql: `UPDATE auction_state SET current_player_id = NULL, current_bid = 0, highest_bidder_team_id = NULL, timer_end_time = NULL WHERE league_id = ?`, args: [leagueId] });
              await logAction(db, leagueId, state.current_round_id, `${player.player_name} SOLD to ${team.name} for ${formatCurrency(state.current_bid)}!`, 'sale', state.highest_bidder_team_id, player.player_id, state.current_bid);

              releaseControlLock();
              return res.status(200).json({ success: true, message: `SOLD to ${team.name} for ${formatCurrency(state.current_bid)}!`, sale: { playerName: player.player_name, teamName: team.name, amount: state.current_bid } });
            } else {
              await db.execute({ sql: `UPDATE auction_players SET status = 'unsold' WHERE id = ?`, args: [state.current_player_id] });
              await db.execute({
                sql: `INSERT INTO unsold_players (id, league_id, player_id, player_name, player_position, base_price, original_round_id, category) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                args: [generateId(), leagueId, player.player_id, player.player_name, player.player_position, player.base_price, state.current_round_id, player.category]
              });
              await db.execute({ sql: `UPDATE auction_state SET current_player_id = NULL, current_bid = 0, highest_bidder_team_id = NULL, timer_end_time = NULL WHERE league_id = ?`, args: [leagueId] });
              await logAction(db, leagueId, state.current_round_id, `${player.player_name} unsold (no bids)`, 'unsold');

              releaseControlLock();
              return res.status(200).json({ success: true, message: `${player.player_name} unsold. Click Next.` });
            }
          }

          case 'stop': {
            if (state.current_player_id) {
              await db.execute({ sql: `UPDATE auction_players SET status = 'pending' WHERE id = ? AND status = 'current'`, args: [state.current_player_id] });
            }
            await db.execute({
              sql: `UPDATE auction_state SET is_active = 0, is_paused = 0, current_player_id = NULL, current_bid = 0, highest_bidder_team_id = NULL, timer_end_time = NULL WHERE league_id = ?`,
              args: [leagueId]
            });
            await logAction(db, leagueId, state.current_round_id, 'Auction stopped', 'stop');
            releaseControlLock();
            return res.status(200).json({ success: true, message: 'Stopped' });
          }

          case 'end_round': {
            if (state.current_player_id) {
              await db.execute({ sql: `UPDATE auction_players SET status = 'pending' WHERE id = ? AND status = 'current'`, args: [state.current_player_id] });
            }
            if (state.current_round_id) {
              await db.execute({ sql: `UPDATE auction_rounds SET is_active = 0 WHERE id = ?`, args: [state.current_round_id] });
            }
            await db.execute({
              sql: `UPDATE auction_state SET is_active = 0, is_paused = 0, current_player_id = NULL, current_round_id = NULL, current_bid = 0, highest_bidder_team_id = NULL, timer_end_time = NULL WHERE league_id = ?`,
              args: [leagueId]
            });
            await logAction(db, leagueId, state.current_round_id, 'Round ended', 'end_round');
            releaseControlLock();
            return res.status(200).json({ success: true, message: 'Round ended' });
          }

          default:
            releaseControlLock();
            return res.status(400).json({ error: `Invalid action: ${controlAction}` });
        }
      } catch (error) {
        releaseControlLock();
        throw error;
      }
    }

    // ============================================
    // REORDER PLAYER
    // ============================================
    if (action === 'reorder' && req.method === 'POST') {
      const { leagueId, playerId, newIndex } = req.body;
      if (!leagueId || !playerId || newIndex === undefined) return res.status(400).json({ error: 'leagueId, playerId, newIndex required' });
      await db.execute({ sql: `UPDATE auction_players SET order_index = ? WHERE id = ? AND league_id = ?`, args: [newIndex, playerId, leagueId] });
      return res.status(200).json({ success: true, message: 'Order updated' });
    }

    // ============================================
    // UPDATE BASE PRICE
    // ============================================
    if (action === 'update_price' && req.method === 'POST') {
      const { leagueId, playerId, basePrice } = req.body;
      if (!leagueId || !playerId || basePrice === undefined) return res.status(400).json({ error: 'leagueId, playerId, basePrice required' });
      await db.execute({ sql: `UPDATE auction_players SET base_price = ? WHERE id = ? AND league_id = ?`, args: [basePrice, playerId, leagueId] });
      return res.status(200).json({ success: true, message: 'Price updated', newPrice: basePrice });
    }

    // ============================================
    // UPDATE TEAM/FRANCHISE
    // ============================================
    if (action === 'update_team' && req.method === 'POST') {
      const { teamId, name, ownerName, purse } = req.body;
      if (!teamId) return res.status(400).json({ error: 'teamId required' });
      
      const updates = [];
      const args = [];
      if (name) { updates.push('name = ?'); args.push(name); }
      if (ownerName) { updates.push('owner_name = ?'); args.push(ownerName); }
      if (purse !== undefined) { updates.push('purse = ?'); args.push(purse); }
      
      if (updates.length > 0) {
        args.push(teamId);
        await db.execute({ sql: `UPDATE fantasy_teams SET ${updates.join(', ')} WHERE id = ?`, args });
      }
      return res.status(200).json({ success: true, message: 'Team updated' });
    }

    // ============================================
    // CREATE TEAM/FRANCHISE
    // ============================================
    if (action === 'create_team' && req.method === 'POST') {
      const { leagueId, name, ownerName, ownerId, purse = DEFAULT_PURSE } = req.body;
      if (!leagueId || !name) return res.status(400).json({ error: 'leagueId and name required' });
      
      const teamId = generateId();
      await db.execute({
        sql: `INSERT INTO fantasy_teams (id, league_id, name, owner_name, user_id, purse, total_points) VALUES (?, ?, ?, ?, ?, ?, 0)`,
        args: [teamId, leagueId, name, ownerName || name, ownerId || null, purse]
      });
      return res.status(200).json({ success: true, message: `Team "${name}" created`, teamId });
    }

    // ============================================
    // DELETE TEAM/FRANCHISE
    // ============================================
    if (action === 'delete_team' && req.method === 'DELETE') {
      const { teamId } = req.query;
      if (!teamId) return res.status(400).json({ error: 'teamId required' });
      
      await db.execute({ sql: `DELETE FROM roster WHERE fantasy_team_id = ?`, args: [teamId] });
      await db.execute({ sql: `UPDATE auction_players SET sold_to_team_id = NULL, sold_for = NULL WHERE sold_to_team_id = ?`, args: [teamId] });
      await db.execute({ sql: `DELETE FROM fantasy_teams WHERE id = ?`, args: [teamId] });
      return res.status(200).json({ success: true, message: 'Team deleted' });
    }

    // ============================================
    // DELETE ROUND
    // ============================================
    if (action === 'delete_round' && req.method === 'DELETE') {
      const { leagueId, roundId } = req.query;
      if (!leagueId || !roundId) return res.status(400).json({ error: 'leagueId and roundId required' });
      await db.execute({ sql: `DELETE FROM auction_players WHERE round_id = ?`, args: [roundId] });
      await db.execute({ sql: `DELETE FROM auction_rounds WHERE id = ? AND league_id = ?`, args: [roundId, leagueId] });
      return res.status(200).json({ success: true, message: 'Round deleted' });
    }

    // ============================================
    // RESET ROUND
    // ============================================
    if (action === 'reset_round' && req.method === 'POST') {
      const { leagueId, roundId } = req.body;
      if (!leagueId || !roundId) return res.status(400).json({ error: 'leagueId and roundId required' });
      
      await db.execute({ sql: `UPDATE auction_rounds SET is_active = 0, is_completed = 0 WHERE id = ?`, args: [roundId] });
      await db.execute({ sql: `UPDATE auction_players SET status = 'pending', sold_to_team_id = NULL, sold_for = NULL, sold_at = NULL WHERE round_id = ?`, args: [roundId] });
      return res.status(200).json({ success: true, message: 'Round reset' });
    }

    // ============================================
    // RESET AUCTION
    // ============================================
    if (action === 'reset' && req.method === 'DELETE') {
      const { leagueId } = req.query;
      if (!leagueId) return res.status(400).json({ error: 'leagueId required' });

      await db.execute({ sql: 'DELETE FROM auction_logs WHERE league_id = ?', args: [leagueId] });
      await db.execute({ sql: 'DELETE FROM unsold_players WHERE league_id = ?', args: [leagueId] });
      await db.execute({
        sql: `UPDATE auction_players SET status = 'pending', sold_to_team_id = NULL, sold_for = NULL, sold_at = NULL WHERE league_id = ?`,
        args: [leagueId]
      });
      await db.execute({ sql: `UPDATE auction_rounds SET is_active = 0, is_completed = 0 WHERE league_id = ?`, args: [leagueId] });
      await db.execute({
        sql: `UPDATE auction_state SET is_active = 0, is_paused = 0, current_player_id = NULL, current_round_id = NULL, current_bid = 0, highest_bidder_team_id = NULL, timer_end_time = NULL, paused_time_remaining = NULL WHERE league_id = ?`,
        args: [leagueId]
      });

      // Clear auction-acquired roster entries
      const teams = await db.execute({ sql: 'SELECT id FROM fantasy_teams WHERE league_id = ?', args: [leagueId] });
      for (const team of teams.rows) {
        await db.execute({ sql: "DELETE FROM roster WHERE fantasy_team_id = ? AND acquired_via = 'auction'", args: [team.id] });
      }

      // Reset purses
      await db.execute({ sql: 'UPDATE fantasy_teams SET purse = ? WHERE league_id = ?', args: [DEFAULT_PURSE, leagueId] });
      await db.execute({ sql: "UPDATE leagues SET draft_status = 'pending' WHERE id = ?", args: [leagueId] });

      return res.status(200).json({ success: true, message: `Auction reset. Budgets: ${formatCurrency(DEFAULT_PURSE)}` });
    }

    return res.status(400).json({ error: 'Invalid action' });

  } catch (error) {
    console.error('Auction API error:', error);
    return res.status(500).json({ error: 'Server error', details: error.message });
  }
}
