// API: Auction System
// GET /api/auction?action=state&leagueId=X - Get current auction state
// GET /api/auction?action=players&leagueId=X - Get auction players queue
// GET /api/auction?action=logs&leagueId=X - Get auction logs
// POST /api/auction?action=bid - Place a bid
// POST /api/auction?action=control - Admin controls (start, stop, pause, resume, skip, sell, next_player, timer_expired)
// POST /api/auction?action=setup - Setup auction with players for a league
// DELETE /api/auction?action=reset - Reset auction

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

// Calculate bid increment based on current bid
function getBidIncrement(currentBid) {
  if (currentBid >= 2000000) return 1000000;      // $2M+ -> $1M increment
  if (currentBid >= 1000000) return 500000;       // $1M+ -> $500K increment
  if (currentBid >= 500000) return 250000;        // $500K+ -> $250K increment
  if (currentBid >= 200000) return 100000;        // $200K+ -> $100K increment
  return 50000;                                    // Base -> $50K increment
}

// Timer settings
const INITIAL_TIMER = 12000;  // 12 seconds for first bid
const BID_TIMER = 8000;       // 8 seconds after each bid

// Default starting purse
const DEFAULT_PURSE = 5000000; // $5M
const DEFAULT_BASE_PRICE = 100000; // $100K

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

  try {
    // ============================================
    // GET AUCTION STATE
    // ============================================
    if (action === 'state' && req.method === 'GET') {
      const { leagueId } = req.query;
      
      if (!leagueId) {
        return res.status(400).json({ error: 'leagueId required' });
      }

      const stateResult = await db.execute({
        sql: `SELECT as.*, 
                     ap.player_id, ap.player_name, ap.player_team, ap.player_position, ap.base_price,
                     ft.name as highest_bidder_name
              FROM auction_state as
              LEFT JOIN auction_players ap ON as.current_player_id = ap.id
              LEFT JOIN fantasy_teams ft ON as.highest_bidder_team_id = ft.id
              WHERE as.league_id = ?`,
        args: [leagueId]
      });

      if (stateResult.rows.length === 0) {
        return res.status(200).json({ 
          success: true, 
          state: null,
          message: 'Auction not initialized'
        });
      }

      const s = stateResult.rows[0];
      
      // Get teams with their purses
      const teamsResult = await db.execute({
        sql: `SELECT ft.id, ft.name, ft.owner_name, ft.purse,
                     (SELECT COUNT(*) FROM roster r WHERE r.fantasy_team_id = ft.id AND r.dropped_date IS NULL) as roster_count
              FROM fantasy_teams ft
              WHERE ft.league_id = ?
              ORDER BY ft.name`,
        args: [leagueId]
      });

      // Get next players in queue
      const nextPlayersResult = await db.execute({
        sql: `SELECT id, player_id, player_name, player_team, player_position, base_price, order_index
              FROM auction_players
              WHERE league_id = ? AND status = 'pending'
              ORDER BY order_index ASC
              LIMIT 5`,
        args: [leagueId]
      });

      const state = {
        id: s.id,
        leagueId: s.league_id,
        isActive: Boolean(s.is_active),
        isPaused: Boolean(s.is_paused),
        currentPlayer: s.current_player_id ? {
          auctionPlayerId: s.current_player_id,
          playerId: s.player_id,
          name: s.player_name,
          team: s.player_team,
          position: s.player_position,
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
          id: t.id,
          name: t.name,
          ownerName: t.owner_name,
          purse: t.purse || DEFAULT_PURSE,
          rosterCount: t.roster_count || 0
        })),
        nextPlayers: nextPlayersResult.rows.map(p => ({
          id: p.id,
          playerId: p.player_id,
          name: p.player_name,
          team: p.player_team,
          position: p.player_position,
          basePrice: p.base_price
        }))
      };

      return res.status(200).json({ success: true, state });
    }

    // ============================================
    // GET AUCTION PLAYERS
    // ============================================
    if (action === 'players' && req.method === 'GET') {
      const { leagueId, status } = req.query;
      
      if (!leagueId) {
        return res.status(400).json({ error: 'leagueId required' });
      }

      let sql = `SELECT ap.*, ft.name as sold_to_name
                 FROM auction_players ap
                 LEFT JOIN fantasy_teams ft ON ap.sold_to_team_id = ft.id
                 WHERE ap.league_id = ?`;
      const args = [leagueId];

      if (status) {
        sql += ' AND ap.status = ?';
        args.push(status);
      }

      sql += ' ORDER BY ap.order_index ASC';

      const result = await db.execute({ sql, args });

      const players = result.rows.map(p => ({
        id: p.id,
        playerId: p.player_id,
        name: p.player_name,
        team: p.player_team,
        position: p.player_position,
        basePrice: p.base_price,
        status: p.status,
        soldTo: p.sold_to_team_id ? {
          teamId: p.sold_to_team_id,
          teamName: p.sold_to_name
        } : null,
        soldFor: p.sold_for,
        soldAt: p.sold_at,
        orderIndex: p.order_index
      }));

      return res.status(200).json({ success: true, players });
    }

    // ============================================
    // GET AUCTION LOGS
    // ============================================
    if (action === 'logs' && req.method === 'GET') {
      const { leagueId, limit = 50 } = req.query;
      
      if (!leagueId) {
        return res.status(400).json({ error: 'leagueId required' });
      }

      const result = await db.execute({
        sql: `SELECT al.*, ft.name as team_name
              FROM auction_logs al
              LEFT JOIN fantasy_teams ft ON al.team_id = ft.id
              WHERE al.league_id = ?
              ORDER BY al.timestamp DESC
              LIMIT ?`,
        args: [leagueId, parseInt(limit)]
      });

      const logs = result.rows.map(l => ({
        id: l.id,
        type: l.log_type,
        message: l.message,
        teamId: l.team_id,
        teamName: l.team_name,
        playerId: l.player_id,
        amount: l.amount,
        timestamp: l.timestamp
      }));

      return res.status(200).json({ success: true, logs });
    }

    // ============================================
    // SETUP AUCTION
    // ============================================
    if (action === 'setup' && req.method === 'POST') {
      const { leagueId, basePriceByPosition } = req.body;
      
      if (!leagueId) {
        return res.status(400).json({ error: 'leagueId required' });
      }

      // Get league info
      const leagueResult = await db.execute({
        sql: 'SELECT tournament_id, draft_type FROM leagues WHERE id = ?',
        args: [leagueId]
      });

      if (leagueResult.rows.length === 0) {
        return res.status(404).json({ error: 'League not found' });
      }

      const league = leagueResult.rows[0];
      
      // Verify it's an auction draft type
      if (league.draft_type !== 'auction') {
        return res.status(400).json({ error: 'League is not set up for auction draft' });
      }

      // Check if auction already exists
      const existingState = await db.execute({
        sql: 'SELECT id FROM auction_state WHERE league_id = ?',
        args: [leagueId]
      });

      if (existingState.rows.length > 0) {
        return res.status(409).json({ error: 'Auction already set up for this league. Delete first to reset.' });
      }

      // Get all players for this tournament
      const playersResult = await db.execute({
        sql: 'SELECT id, name, team, position, price FROM players WHERE tournament_id = ? AND is_active = 1',
        args: [league.tournament_id]
      });

      if (playersResult.rows.length === 0) {
        return res.status(400).json({ error: 'No players found for this tournament' });
      }

      // Default base prices by position
      const defaultBasePrices = {
        'Batsman': 200000,
        'Batter': 200000,
        'Bowler': 150000,
        'Allrounder': 250000,
        'All-rounder': 250000,
        'Wicketkeeper': 200000,
        'Wicket Keeper': 200000,
        'WK': 200000
      };

      const prices = { ...defaultBasePrices, ...basePriceByPosition };

      // Create auction state
      const stateId = generateId();
      await db.execute({
        sql: `INSERT INTO auction_state (id, league_id, is_active, is_paused)
              VALUES (?, ?, 0, 0)`,
        args: [stateId, leagueId]
      });

      // Shuffle players randomly for auction order
      const shuffledPlayers = [...playersResult.rows].sort(() => Math.random() - 0.5);

      // Insert auction players
      for (let i = 0; i < shuffledPlayers.length; i++) {
        const player = shuffledPlayers[i];
        const basePrice = prices[player.position] || player.price || DEFAULT_BASE_PRICE;
        
        await db.execute({
          sql: `INSERT INTO auction_players (id, league_id, player_id, player_name, player_team, player_position, base_price, status, order_index)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
          args: [generateId(), leagueId, player.id, player.name, player.team, player.position, basePrice, i]
        });
      }

      // Initialize team purses
      await db.execute({
        sql: 'UPDATE fantasy_teams SET purse = ? WHERE league_id = ?',
        args: [DEFAULT_PURSE, leagueId]
      });

      // Log auction setup
      await db.execute({
        sql: `INSERT INTO auction_logs (id, league_id, log_type, message)
              VALUES (?, ?, 'setup', ?)`,
        args: [generateId(), leagueId, `Auction initialized with ${shuffledPlayers.length} players`]
      });

      return res.status(201).json({ 
        success: true, 
        message: 'Auction set up successfully',
        playerCount: shuffledPlayers.length
      });
    }

    // ============================================
    // BID
    // ============================================
    if (action === 'bid' && req.method === 'POST') {
      const { leagueId, teamId, userId } = req.body;
      
      if (!leagueId || !teamId) {
        return res.status(400).json({ error: 'leagueId and teamId required' });
      }

      // Try to acquire lock
      const gotLock = await acquireLock();
      if (!gotLock) {
        return res.status(429).json({ error: 'Auction busy, please try again' });
      }

      try {
        // Get current auction state
        const stateResult = await db.execute({
          sql: `SELECT as.*, ap.base_price, ap.player_name
                FROM auction_state as
                LEFT JOIN auction_players ap ON as.current_player_id = ap.id
                WHERE as.league_id = ?`,
          args: [leagueId]
        });

        if (stateResult.rows.length === 0) {
          return res.status(400).json({ error: 'Auction not initialized' });
        }

        const state = stateResult.rows[0];

        if (!state.is_active) {
          return res.status(400).json({ error: 'Auction is not active' });
        }

        if (state.is_paused) {
          return res.status(400).json({ error: 'Auction is paused' });
        }

        if (!state.current_player_id) {
          return res.status(400).json({ error: 'No player currently up for auction' });
        }

        // Check timer hasn't expired
        const now = Date.now();
        if (state.timer_end_time && now > state.timer_end_time) {
          return res.status(400).json({ error: 'Timer has expired' });
        }

        // Get team info
        const teamResult = await db.execute({
          sql: `SELECT ft.id, ft.name, ft.purse,
                       (SELECT COUNT(*) FROM roster r WHERE r.fantasy_team_id = ft.id AND r.dropped_date IS NULL) as roster_count
                FROM fantasy_teams ft
                WHERE ft.id = ? AND ft.league_id = ?`,
          args: [teamId, leagueId]
        });

        if (teamResult.rows.length === 0) {
          return res.status(404).json({ error: 'Team not found in this league' });
        }

        const team = teamResult.rows[0];

        // Get league roster size limit
        const leagueResult = await db.execute({
          sql: 'SELECT roster_size FROM leagues WHERE id = ?',
          args: [leagueId]
        });
        const maxRosterSize = leagueResult.rows[0]?.roster_size || 16;

        // Check roster isn't full
        if (team.roster_count >= maxRosterSize) {
          return res.status(400).json({ error: 'Roster is full' });
        }

        // Calculate new bid
        const currentBid = state.current_bid || 0;
        const basePrice = state.base_price || DEFAULT_BASE_PRICE;
        let newBid;
        
        if (currentBid === 0) {
          // First bid starts at base price
          newBid = basePrice;
        } else {
          // Subsequent bids increment
          newBid = currentBid + getBidIncrement(currentBid);
        }

        // Check team has enough purse
        if (team.purse < newBid) {
          return res.status(400).json({ error: 'Insufficient funds', purse: team.purse, bidAmount: newBid });
        }

        // Calculate new timer
        const timerMs = currentBid === 0 ? INITIAL_TIMER : BID_TIMER;
        const newTimerEnd = now + timerMs;

        // Update auction state
        await db.execute({
          sql: `UPDATE auction_state 
                SET current_bid = ?, highest_bidder_team_id = ?, timer_end_time = ?, updated_at = datetime('now')
                WHERE league_id = ?`,
          args: [newBid, teamId, newTimerEnd, leagueId]
        });

        // Log the bid
        await db.execute({
          sql: `INSERT INTO auction_logs (id, league_id, log_type, message, team_id, player_id, amount)
                VALUES (?, ?, 'bid', ?, ?, ?, ?)`,
          args: [generateId(), leagueId, `${team.name} bid $${newBid.toLocaleString()} for ${state.player_name}`, teamId, state.current_player_id, newBid]
        });

        return res.status(200).json({ 
          success: true, 
          newBid,
          teamName: team.name,
          timerEndTime: newTimerEnd,
          remainingTime: timerMs
        });

      } finally {
        releaseLock();
      }
    }

    // ============================================
    // ADMIN CONTROL ACTIONS
    // ============================================
    if (action === 'control' && req.method === 'POST') {
      const { leagueId, controlAction, userId } = req.body;
      
      if (!leagueId || !controlAction) {
        return res.status(400).json({ error: 'leagueId and controlAction required' });
      }

      // TODO: Add admin verification via userId
      
      const db = getDb();

      // Handle different control actions
      switch (controlAction) {
        case 'start': {
          // Start the auction - get first pending player
          const firstPlayer = await db.execute({
            sql: `SELECT id, player_name, base_price FROM auction_players 
                  WHERE league_id = ? AND status = 'pending'
                  ORDER BY order_index ASC LIMIT 1`,
            args: [leagueId]
          });

          if (firstPlayer.rows.length === 0) {
            return res.status(400).json({ error: 'No pending players to auction' });
          }

          const player = firstPlayer.rows[0];
          const timerEnd = Date.now() + INITIAL_TIMER;

          // Update state
          await db.execute({
            sql: `UPDATE auction_state 
                  SET is_active = 1, is_paused = 0, current_player_id = ?, current_bid = 0, 
                      highest_bidder_team_id = NULL, timer_end_time = ?, updated_at = datetime('now')
                  WHERE league_id = ?`,
            args: [player.id, timerEnd, leagueId]
          });

          // Mark player as current
          await db.execute({
            sql: "UPDATE auction_players SET status = 'current' WHERE id = ?",
            args: [player.id]
          });

          // Log
          await db.execute({
            sql: `INSERT INTO auction_logs (id, league_id, log_type, message)
                  VALUES (?, ?, 'start', ?)`,
            args: [generateId(), leagueId, `Auction started! First up: ${player.player_name}`]
          });

          // Update league draft status
          await db.execute({
            sql: "UPDATE leagues SET draft_status = 'in_progress' WHERE id = ?",
            args: [leagueId]
          });

          return res.status(200).json({ success: true, message: 'Auction started', timerEndTime: timerEnd });
        }

        case 'pause': {
          // Get current state
          const stateResult = await db.execute({
            sql: 'SELECT timer_end_time, is_active FROM auction_state WHERE league_id = ?',
            args: [leagueId]
          });

          if (stateResult.rows.length === 0 || !stateResult.rows[0].is_active) {
            return res.status(400).json({ error: 'Auction not active' });
          }

          const state = stateResult.rows[0];
          const now = Date.now();
          const remaining = Math.max(0, (state.timer_end_time || now) - now);

          await db.execute({
            sql: `UPDATE auction_state SET is_paused = 1, paused_time_remaining = ?, updated_at = datetime('now')
                  WHERE league_id = ?`,
            args: [remaining, leagueId]
          });

          await db.execute({
            sql: `INSERT INTO auction_logs (id, league_id, log_type, message)
                  VALUES (?, ?, 'pause', 'Auction paused')`,
            args: [generateId(), leagueId]
          });

          return res.status(200).json({ success: true, message: 'Auction paused', pausedTimeRemaining: remaining });
        }

        case 'resume': {
          const stateResult = await db.execute({
            sql: 'SELECT paused_time_remaining, is_paused FROM auction_state WHERE league_id = ?',
            args: [leagueId]
          });

          if (stateResult.rows.length === 0 || !stateResult.rows[0].is_paused) {
            return res.status(400).json({ error: 'Auction not paused' });
          }

          // Resume with full timer for fairness
          const newTimerEnd = Date.now() + INITIAL_TIMER;

          await db.execute({
            sql: `UPDATE auction_state SET is_paused = 0, timer_end_time = ?, paused_time_remaining = NULL, updated_at = datetime('now')
                  WHERE league_id = ?`,
            args: [newTimerEnd, leagueId]
          });

          await db.execute({
            sql: `INSERT INTO auction_logs (id, league_id, log_type, message)
                  VALUES (?, ?, 'resume', 'Auction resumed')`,
            args: [generateId(), leagueId]
          });

          return res.status(200).json({ success: true, message: 'Auction resumed', timerEndTime: newTimerEnd });
        }

        case 'stop': {
          // Return current player to pending if exists
          const stateResult = await db.execute({
            sql: 'SELECT current_player_id FROM auction_state WHERE league_id = ?',
            args: [leagueId]
          });

          if (stateResult.rows[0]?.current_player_id) {
            await db.execute({
              sql: "UPDATE auction_players SET status = 'pending' WHERE id = ?",
              args: [stateResult.rows[0].current_player_id]
            });
          }

          await db.execute({
            sql: `UPDATE auction_state 
                  SET is_active = 0, is_paused = 0, current_player_id = NULL, current_bid = 0, 
                      highest_bidder_team_id = NULL, timer_end_time = NULL, updated_at = datetime('now')
                  WHERE league_id = ?`,
            args: [leagueId]
          });

          await db.execute({
            sql: `INSERT INTO auction_logs (id, league_id, log_type, message)
                  VALUES (?, ?, 'stop', 'Auction stopped')`,
            args: [generateId(), leagueId]
          });

          return res.status(200).json({ success: true, message: 'Auction stopped' });
        }

        case 'skip': {
          // Skip current player (mark as unsold, move to next)
          const stateResult = await db.execute({
            sql: `SELECT as.current_player_id, ap.player_id, ap.player_name, ap.player_position, ap.base_price
                  FROM auction_state as
                  LEFT JOIN auction_players ap ON as.current_player_id = ap.id
                  WHERE as.league_id = ?`,
            args: [leagueId]
          });

          if (stateResult.rows.length === 0 || !stateResult.rows[0].current_player_id) {
            return res.status(400).json({ error: 'No player to skip' });
          }

          const current = stateResult.rows[0];

          // Mark as unsold
          await db.execute({
            sql: "UPDATE auction_players SET status = 'unsold' WHERE id = ?",
            args: [current.current_player_id]
          });

          // Add to unsold pool
          await db.execute({
            sql: `INSERT INTO unsold_players (id, league_id, player_id, player_name, player_position, base_price)
                  VALUES (?, ?, ?, ?, ?, ?)`,
            args: [generateId(), leagueId, current.player_id, current.player_name, current.player_position, current.base_price]
          });

          // Log
          await db.execute({
            sql: `INSERT INTO auction_logs (id, league_id, log_type, message, player_id)
                  VALUES (?, ?, 'skip', ?, ?)`,
            args: [generateId(), leagueId, `${current.player_name} skipped (unsold)`, current.player_id]
          });

          // Get next player
          return await moveToNextPlayer(db, leagueId, res);
        }

        case 'sell':
        case 'timer_expired': {
          // Finalize sale or mark unsold
          const gotLock = await acquireLock();
          if (!gotLock) {
            return res.status(429).json({ error: 'Operation in progress' });
          }

          try {
            const stateResult = await db.execute({
              sql: `SELECT as.*, ap.player_id, ap.player_name, ap.base_price
                    FROM auction_state as
                    LEFT JOIN auction_players ap ON as.current_player_id = ap.id
                    WHERE as.league_id = ?`,
              args: [leagueId]
            });

            if (stateResult.rows.length === 0 || !stateResult.rows[0].current_player_id) {
              return res.status(400).json({ error: 'No player to sell' });
            }

            const state = stateResult.rows[0];

            // If timer_expired, verify timer actually expired (with 1s buffer)
            if (controlAction === 'timer_expired' && state.timer_end_time) {
              const now = Date.now();
              if (state.timer_end_time > now + 1000) {
                return res.status(409).json({ 
                  error: 'Timer not yet expired', 
                  timeRemaining: state.timer_end_time - now 
                });
              }
            }

            if (state.highest_bidder_team_id && state.current_bid > 0) {
              // Finalize sale
              return await finalizeSale(db, leagueId, state, res);
            } else {
              // No bids - mark unsold
              await db.execute({
                sql: "UPDATE auction_players SET status = 'unsold' WHERE id = ?",
                args: [state.current_player_id]
              });

              // Add to unsold pool
              await db.execute({
                sql: `INSERT INTO unsold_players (id, league_id, player_id, player_name, player_position, base_price)
                      VALUES (?, ?, ?, ?, (SELECT player_position FROM auction_players WHERE id = ?), ?)`,
                args: [generateId(), leagueId, state.player_id, state.player_name, state.current_player_id, state.base_price]
              });

              // Log
              await db.execute({
                sql: `INSERT INTO auction_logs (id, league_id, log_type, message, player_id)
                      VALUES (?, ?, 'unsold', ?, ?)`,
                args: [generateId(), leagueId, `${state.player_name} went unsold`, state.player_id]
              });

              // Move to next player
              return await moveToNextPlayer(db, leagueId, res);
            }
          } finally {
            releaseLock();
          }
        }

        case 'next_player': {
          return await moveToNextPlayer(db, leagueId, res);
        }

        default:
          return res.status(400).json({ error: `Unknown control action: ${controlAction}` });
      }
    }

    // ============================================
    // RESET AUCTION
    // ============================================
    if (action === 'reset' && req.method === 'DELETE') {
      const { leagueId } = req.query;
      
      if (!leagueId) {
        return res.status(400).json({ error: 'leagueId required' });
      }

      // Delete auction data
      await db.execute({ sql: 'DELETE FROM auction_logs WHERE league_id = ?', args: [leagueId] });
      await db.execute({ sql: 'DELETE FROM unsold_players WHERE league_id = ?', args: [leagueId] });
      await db.execute({ sql: 'DELETE FROM auction_players WHERE league_id = ?', args: [leagueId] });
      await db.execute({ sql: 'DELETE FROM auction_state WHERE league_id = ?', args: [leagueId] });

      // Clear rosters acquired via auction
      const teams = await db.execute({
        sql: 'SELECT id FROM fantasy_teams WHERE league_id = ?',
        args: [leagueId]
      });

      for (const team of teams.rows) {
        await db.execute({
          sql: "DELETE FROM roster WHERE fantasy_team_id = ? AND acquired_via = 'auction'",
          args: [team.id]
        });
      }

      // Reset team purses
      await db.execute({
        sql: 'UPDATE fantasy_teams SET purse = ? WHERE league_id = ?',
        args: [DEFAULT_PURSE, leagueId]
      });

      // Reset league draft status
      await db.execute({
        sql: "UPDATE leagues SET draft_status = 'pending' WHERE id = ?",
        args: [leagueId]
      });

      return res.status(200).json({ success: true, message: 'Auction reset' });
    }

    // ============================================
    // REORDER PLAYER - Change player's position in queue
    // ============================================
    if (action === 'reorder' && req.method === 'POST') {
      const { leagueId, playerId, newIndex } = req.body;
      
      if (!leagueId || !playerId || newIndex === undefined) {
        return res.status(400).json({ error: 'leagueId, playerId, and newIndex required' });
      }

      await db.execute({
        sql: 'UPDATE auction_players SET order_index = ? WHERE id = ? AND league_id = ?',
        args: [newIndex, playerId, leagueId]
      });

      return res.status(200).json({ success: true, message: 'Player order updated' });
    }

    // ============================================
    // UPDATE BASE PRICE - Change player's base price
    // ============================================
    if (action === 'update_price' && req.method === 'POST') {
      const { leagueId, playerId, basePrice } = req.body;
      
      if (!leagueId || !playerId || basePrice === undefined) {
        return res.status(400).json({ error: 'leagueId, playerId, and basePrice required' });
      }

      await db.execute({
        sql: 'UPDATE auction_players SET base_price = ? WHERE id = ? AND league_id = ?',
        args: [basePrice, playerId, leagueId]
      });

      return res.status(200).json({ success: true, message: 'Base price updated', newPrice: basePrice });
    }

    return res.status(400).json({ error: 'Invalid action. Use ?action=state|players|logs|bid|control|setup|reset|reorder|update_price' });

  } catch (error) {
    console.error('Auction API error:', error);
    return res.status(500).json({ error: 'Server error', details: error.message });
  }
}

// Helper: Finalize a sale
async function finalizeSale(db, leagueId, state, res) {
  const teamId = state.highest_bidder_team_id;
  const amount = state.current_bid;
  const auctionPlayerId = state.current_player_id;
  const playerId = state.player_id;
  const playerName = state.player_name;

  // Atomically update auction_players to prevent double processing
  const updateResult = await db.execute({
    sql: `UPDATE auction_players 
          SET status = 'sold', sold_to_team_id = ?, sold_for = ?, sold_at = datetime('now')
          WHERE id = ? AND status = 'current'`,
    args: [teamId, amount, auctionPlayerId]
  });

  if (updateResult.rowsAffected === 0) {
    // Already processed
    return res.status(409).json({ error: 'Sale already processed' });
  }

  // Get team name
  const teamResult = await db.execute({
    sql: 'SELECT name FROM fantasy_teams WHERE id = ?',
    args: [teamId]
  });
  const teamName = teamResult.rows[0]?.name || 'Unknown';

  // Deduct from team purse
  await db.execute({
    sql: 'UPDATE fantasy_teams SET purse = purse - ? WHERE id = ?',
    args: [amount, teamId]
  });

  // Add to roster
  await db.execute({
    sql: `INSERT INTO roster (id, fantasy_team_id, player_id, position, acquired_via, acquired_date)
          VALUES (?, ?, ?, 'flex', 'auction', datetime('now'))`,
    args: [generateId(), teamId, playerId]
  });

  // Log sale
  await db.execute({
    sql: `INSERT INTO auction_logs (id, league_id, log_type, message, team_id, player_id, amount)
          VALUES (?, ?, 'sold', ?, ?, ?, ?)`,
    args: [generateId(), leagueId, `${playerName} SOLD to ${teamName} for $${amount.toLocaleString()}!`, teamId, playerId, amount]
  });

  // Move to next player
  return await moveToNextPlayer(db, leagueId, res, { soldPlayer: playerName, soldTo: teamName, soldFor: amount });
}

// Helper: Move to next player
async function moveToNextPlayer(db, leagueId, res, soldInfo = null) {
  // Get next pending player
  const nextPlayer = await db.execute({
    sql: `SELECT id, player_name, base_price FROM auction_players 
          WHERE league_id = ? AND status = 'pending'
          ORDER BY order_index ASC LIMIT 1`,
    args: [leagueId]
  });

  if (nextPlayer.rows.length === 0) {
    // Auction complete
    await db.execute({
      sql: `UPDATE auction_state 
            SET is_active = 0, current_player_id = NULL, current_bid = 0, 
                highest_bidder_team_id = NULL, timer_end_time = NULL, updated_at = datetime('now')
            WHERE league_id = ?`,
      args: [leagueId]
    });

    await db.execute({
      sql: "UPDATE leagues SET draft_status = 'completed' WHERE id = ?",
      args: [leagueId]
    });

    await db.execute({
      sql: `INSERT INTO auction_logs (id, league_id, log_type, message)
            VALUES (?, ?, 'complete', 'Auction completed!')`,
      args: [generateId(), leagueId]
    });

    return res.status(200).json({ 
      success: true, 
      message: 'Auction completed',
      auctionComplete: true,
      ...soldInfo
    });
  }

  const player = nextPlayer.rows[0];
  const timerEnd = Date.now() + INITIAL_TIMER;

  // Update state
  await db.execute({
    sql: `UPDATE auction_state 
          SET current_player_id = ?, current_bid = 0, highest_bidder_team_id = NULL, 
              timer_end_time = ?, updated_at = datetime('now')
          WHERE league_id = ?`,
    args: [player.id, timerEnd, leagueId]
  });

  // Mark player as current
  await db.execute({
    sql: "UPDATE auction_players SET status = 'current' WHERE id = ?",
    args: [player.id]
  });

  // Log
  await db.execute({
    sql: `INSERT INTO auction_logs (id, league_id, log_type, message)
          VALUES (?, ?, 'next', ?)`,
    args: [generateId(), leagueId, `Next up: ${player.player_name} (Base: $${player.base_price.toLocaleString()})`]
  });

  return res.status(200).json({ 
    success: true, 
    message: 'Moved to next player',
    nextPlayer: {
      id: player.id,
      name: player.player_name,
      basePrice: player.base_price
    },
    timerEndTime: timerEnd,
    ...soldInfo
  });
}
