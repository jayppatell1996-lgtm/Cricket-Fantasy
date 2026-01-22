import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api, { authAPI, teamsAPI, playersAPI, leaguesAPI, draftAPI, rosterAPI, tournamentsAPI, usersAPI, adminAPI, liveSyncAPI } from './api.js';

// ============================================
// T20 FANTASY CRICKET - COMPLETE APPLICATION
// With Tournaments, Snake Draft & Test Mode
// Database-integrated version
// ============================================

// Tournament Configurations (minimal fallback - primary data comes from database)
const TOURNAMENTS = {
  test_ind_nz: {
    id: 'test_ind_nz',
    name: 'India vs NZ T20 Series 2026',
    shortName: 'IND vs NZ T20',
    description: 'T20 International Series',
    startDate: '2026-01-15',
    endDate: '2026-01-25',
    status: 'active',
    teams: ['IND', 'NZ'],
    isTest: true,
    draftStatus: 'pending',
    matches: [], // Loaded from database/API
  },
  t20_wc_2026: {
    id: 't20_wc_2026',
    name: 'T20 World Cup 2026',
    shortName: 'T20 WC 2026',
    description: 'ICC T20 World Cup 2026 - India & Sri Lanka',
    startDate: '2026-02-09',
    endDate: '2026-03-07',
    status: 'upcoming',
    teams: [],
    isTest: false,
    draftStatus: 'pending',
    matches: [], // Loaded from database/API
  },
  ipl_2026: {
    id: 'ipl_2026',
    name: 'IPL 2026',
    shortName: 'IPL 2026',
    description: 'Indian Premier League - March 2026',
    startDate: '2026-03-22',
    endDate: '2026-05-26',
    status: 'upcoming',
    teams: [],
    isTest: false,
    draftStatus: 'pending',
    matches: [], // Loaded from database/API
  },
};

// Trading Window Configuration
// Trading window: 8 PM MST (previous day) to game start time
// MST is UTC-7
const TRADING_WINDOW = {
  openHour: 20, // 8 PM MST
  timezone: 'America/Denver', // MST
};

// Check if a player is locked (their game has started or is in progress)
const isPlayerLocked = (player, matches, isTestMode = false) => {
  // In test/demo mode, never lock players
  if (isTestMode) return false;
  
  // If no matches defined, don't lock
  if (!matches || matches.length === 0) return false;
  
  const now = new Date();
  const playerTeam = player.team;
  
  for (const match of matches) {
    // Check if player's team is in this match
    const teamsInMatch = Array.isArray(match.teams) ? match.teams : (match.teams || '').split(' vs ').map(t => t.trim());
    if (!teamsInMatch.some(t => t === playerTeam || t.includes(playerTeam))) continue;
    
    // ONLY lock if match status is explicitly 'live' or 'in_progress'
    // Don't auto-lock based on time - let the actual match status drive it
    if (match.status === 'live' || match.status === 'in_progress') {
      return true;
    }
  }
  
  return false;
};

// Check if we're in the trading window
const isInTradingWindow = (matches) => {
  const now = new Date();
  
  // For test/demo purposes, always return true if no real matches or test tournament
  // In production, you'd want proper timezone handling with MST
  
  // Find the next match
  const upcomingMatches = (matches || []).filter(m => m.status === 'upcoming');
  if (upcomingMatches.length === 0) {
    // No upcoming matches, trading is open
    return true;
  }
  
  // Sort by date to get next match
  upcomingMatches.sort((a, b) => new Date(a.date) - new Date(b.date));
  const nextMatch = upcomingMatches[0];
  
  // Parse next match date/time
  const matchDate = new Date(nextMatch.date);
  const [hours, minutes] = (nextMatch.startTime || '19:00').split(':').map(Number);
  matchDate.setHours(hours, minutes, 0, 0);
  
  // If match is in the past, trading is open
  if (matchDate < now) {
    return true;
  }
  
  // Trading window: from 8 PM day before to match start
  // For simplicity, always allow trading for test/demo
  // In production, implement proper MST timezone handling
  const windowStart = new Date(matchDate);
  windowStart.setDate(windowStart.getDate() - 1);
  windowStart.setHours(TRADING_WINDOW.openHour, 0, 0, 0);
  
  // We're in trading window if: now >= windowStart AND now < matchStart
  // For test/demo, be more permissive
  return true; // Always open for testing - remove this line in production
};

// Get lock status message for a player
const getPlayerLockStatus = (player, matches, isTestMode = false) => {
  // In test/demo mode, never lock players
  if (isTestMode) {
    return { locked: false, message: '' };
  }
  
  if (isPlayerLocked(player, matches, isTestMode)) {
    return { locked: true, message: '🔒 Locked - Game in progress' };
  }
  
  if (!isInTradingWindow(matches)) {
    return { locked: true, message: '⏰ Trading window closed' };
  }
  
  return { locked: false, message: '' };
};

// Admin Configuration
const ADMIN_USERS = [
  { email: 'admin@t20fantasy.com', password: 'admin123', name: 'League Admin' },
  // Add more admin emails as needed
];

const isAdminUser = (email) => ADMIN_USERS.some(admin => admin.email.toLowerCase() === email.toLowerCase());

// Points Scoring System
const SCORING_RULES = {
  batting: {
    runsPerPoint: 1,
    strikeRateBonus: [
      { min: 160, max: Infinity, points: 25 },
      { min: 150, max: 159.99, points: 20 },
      { min: 140, max: 149.99, points: 15 },
      { min: 130, max: 139.99, points: 10 },
      { min: 120, max: 129.99, points: 5 },
    ],
    minRunsForSRBonus: 20,
  },
  bowling: {
    wicketPoints: 25,
    maidenOverPoints: 20,
    economyRateBonus: [
      { min: 0, max: 5, points: 25 },
      { min: 5.01, max: 6, points: 20 },
      { min: 6.01, max: 7, points: 15 },
      { min: 7.01, max: 8, points: 10 },
    ],
    minOversForERBonus: 3,
  },
  fielding: {
    catchPoints: 12,
    runOutPoints: 20,
    stumpingPoints: 15,
  },
};

// Squad Configuration
// Squad Configuration - Playing 12 only (no bench, no IL)
// 5 Batters + 1 WK + 5 Bowlers + 1 Flex = 12 players
const SQUAD_CONFIG = {
  batters: { min: 0, max: 5, label: 'Batters', icon: '🏏', isPlaying: true },
  keepers: { min: 0, max: 1, label: 'Wicketkeeper', icon: '🧤', isPlaying: true },
  bowlers: { min: 0, max: 5, label: 'Bowlers', icon: '🎯', isPlaying: true },
  flex: { min: 0, max: 1, label: 'Utility', icon: '🔄', isPlaying: true },
  // Bench for players waiting to be assigned to starting lineup
  bench: { min: 0, max: 4, label: 'Bench', icon: '📋', isPlaying: false },
};

const TOTAL_ROSTER_SIZE = 12; // Only starting lineup counts
const MAX_TOTAL_PLAYERS = 16; // Starting lineup (12) + bench (4)

// Position compatibility rules
// Batters slot: batters, allrounders, or keepers
// WK slot: keepers only
// Bowlers slot: bowlers or allrounders
// Flex slot: any position
// Bench: any position
const POSITION_COMPATIBILITY = {
  batter: ['batters', 'flex', 'bench'],
  keeper: ['batters', 'keepers', 'flex', 'bench'],
  bowler: ['bowlers', 'flex', 'bench'],
  allrounder: ['batters', 'bowlers', 'flex', 'bench'],
};

// Get valid slots for a player position
const getValidSlotsForPosition = (position) => {
  return POSITION_COMPATIBILITY[position] || [];
};

// Check if a player can be placed in a specific slot
const canPlaceInSlot = (playerPosition, slotKey) => {
  const validSlots = POSITION_COMPATIBILITY[playerPosition] || [];
  return validSlots.includes(slotKey);
};

// Game status for a player on a specific date
// Team name mapping for matching
const TEAM_NAME_MAP = {
  'IND': ['IND', 'India', 'INDIA'],
  'NZ': ['NZ', 'New Zealand', 'NEW ZEALAND'],
  'AUS': ['AUS', 'Australia', 'AUSTRALIA'],
  'ENG': ['ENG', 'England', 'ENGLAND'],
  'PAK': ['PAK', 'Pakistan', 'PAKISTAN'],
  'SA': ['SA', 'South Africa', 'SOUTH AFRICA'],
  'WI': ['WI', 'West Indies', 'WEST INDIES'],
  'SL': ['SL', 'Sri Lanka', 'SRI LANKA'],
  'BAN': ['BAN', 'Bangladesh', 'BANGLADESH'],
  'AFG': ['AFG', 'Afghanistan', 'AFGHANISTAN'],
};

const teamsMatch = (playerTeam, matchTeam) => {
  if (!playerTeam || !matchTeam) return false;
  const pTeam = playerTeam.toUpperCase().trim();
  const mTeam = matchTeam.toUpperCase().trim();
  
  // Direct match
  if (pTeam === mTeam) return true;
  if (mTeam.includes(pTeam) || pTeam.includes(mTeam)) return true;
  
  // Check aliases
  for (const [abbrev, aliases] of Object.entries(TEAM_NAME_MAP)) {
    const upperAliases = aliases.map(a => a.toUpperCase());
    if (upperAliases.includes(pTeam) && upperAliases.includes(mTeam)) return true;
    if (upperAliases.includes(pTeam) && mTeam.includes(abbrev)) return true;
  }
  
  return false;
};

const normalizeDate = (dateStr) => {
  if (!dateStr) return '';
  // Handle ISO format "2026-01-21T13:30:00.000Z" or simple "2026-01-21"
  return dateStr.split('T')[0];
};

const getPlayerGameStatus = (player, matches, selectedDate = new Date()) => {
  if (!matches || matches.length === 0) {
    return { status: 'no_game', message: 'No Game', color: 'gray' };
  }
  
  const playerTeam = player.team;
  
  // Normalize selected date to YYYY-MM-DD
  const selectedDateStr = selectedDate.toISOString().split('T')[0];
  
  for (const match of matches) {
    // Check if player's team is in this match
    const teamsInMatch = Array.isArray(match.teams) 
      ? match.teams 
      : (match.teams || '').split(' vs ').map(t => t.trim());
    
    const playerTeamInMatch = teamsInMatch.some(t => teamsMatch(playerTeam, t));
    if (!playerTeamInMatch) continue;
    
    // Normalize and compare dates
    const matchDateStr = normalizeDate(match.date);
    if (matchDateStr !== selectedDateStr) continue;
    
    // Found a match for this player on this date!
    const opponent = teamsInMatch.find(t => !teamsMatch(playerTeam, t)) || '?';
    const matchTime = match.startTime || '19:00';
    
    // Determine status based on match.status first, then time
    if (match.status === 'completed') {
      return { 
        status: 'played', 
        message: `Played vs ${opponent}`,
        matchTime: matchTime,
        color: 'green'
      };
    } else if (match.status === 'live' || match.status === 'in_progress') {
      return { 
        status: 'live', 
        message: `LIVE vs ${opponent}`,
        matchTime: matchTime,
        color: 'yellow'
      };
    } else {
      // Check if match time has passed (for upcoming matches without explicit status)
      const [hours, minutes] = matchTime.split(':').map(Number);
      const matchDateTime = new Date(matchDateStr + 'T00:00:00');
      matchDateTime.setHours(hours || 19, minutes || 0, 0, 0);
      
      const now = new Date();
      
      if (now > matchDateTime) {
        // Match time passed but status not updated - likely live or just finished
        return { 
          status: 'live', 
          message: `In Progress vs ${opponent}`,
          matchTime: matchTime,
          color: 'yellow'
        };
      } else {
        return { 
          status: 'upcoming', 
          message: `${matchTime} vs ${opponent}`,
          matchTime: matchTime,
          venue: match.venue,
          color: 'blue'
        };
      }
    }
  }
  
  // No match found for this player on this date
  return { status: 'no_game', message: 'No Game', color: 'gray' };
};

const FREE_AGENCY_LIMIT = 4;

// Get start of current week (Monday at midnight)
const getStartOfWeek = (date = new Date()) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Sunday
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
};

// Check if weekly pickups should be reset
const checkWeeklyReset = (team) => {
  if (!team) return team;
  
  const currentWeekStart = getStartOfWeek();
  const teamResetDate = team.weeklyPickupsResetDate 
    ? new Date(team.weeklyPickupsResetDate) 
    : new Date(0); // Very old date if not set
  
  // If we're in a new week, reset the counter
  if (currentWeekStart > teamResetDate) {
    return {
      ...team,
      weeklyPickups: 0,
      weeklyPickupsResetDate: currentWeekStart.toISOString(),
    };
  }
  
  return team;
};

// ============================================
// PLAYER DATA - Loaded from Database/API
// ============================================

// Player data is now loaded exclusively from the database.
// Use Admin Panel > Seed Database to populate players.
// The getPlayersForTournament function is kept for backwards compatibility
// but returns empty arrays - all data should come from API.

const PLAYERS_IND_NZ = []; // Loaded from database
const PLAYERS_T20_WC = []; // Loaded from database
const PLAYERS_IPL = []; // Loaded from database

// Get players for a specific tournament - DATABASE ONLY
// Returns empty array - actual data comes from playersAPI.getByTournament()
const getPlayersForTournament = (tournamentId) => {
  console.log(`⚠️ getPlayersForTournament called for ${tournamentId} - data should come from database`);
  return []; // All player data comes from database
};

// Legacy exports for backward compatibility
const TEST_PLAYERS_IND_NZ = PLAYERS_IND_NZ;
const FULL_PLAYER_POOL = PLAYERS_T20_WC;

// ============================================
// UTILITY FUNCTIONS
// ============================================

const calculateFantasyPoints = (playerStats) => {
  let points = 0;
  
  // Batting
  if (playerStats.runs) {
    points += playerStats.runs * SCORING_RULES.batting.runsPerPoint;
    if (playerStats.runs >= SCORING_RULES.batting.minRunsForSRBonus && playerStats.strikeRate) {
      const srBonus = SCORING_RULES.batting.strikeRateBonus.find(
        b => playerStats.strikeRate >= b.min && playerStats.strikeRate <= b.max
      );
      if (srBonus) points += srBonus.points;
    }
  }
  
  // Bowling
  if (playerStats.wickets) {
    points += playerStats.wickets * SCORING_RULES.bowling.wicketPoints;
  }
  if (playerStats.maidenOvers) {
    points += playerStats.maidenOvers * SCORING_RULES.bowling.maidenOverPoints;
  }
  if (playerStats.oversBowled >= SCORING_RULES.bowling.minOversForERBonus && playerStats.economyRate !== undefined) {
    const erBonus = SCORING_RULES.bowling.economyRateBonus.find(
      b => playerStats.economyRate >= b.min && playerStats.economyRate <= b.max
    );
    if (erBonus) points += erBonus.points;
  }
  
  // Fielding
  if (playerStats.catches) points += playerStats.catches * SCORING_RULES.fielding.catchPoints;
  if (playerStats.runOuts) points += playerStats.runOuts * SCORING_RULES.fielding.runOutPoints;
  if (playerStats.stumpings && playerStats.isWicketkeeper) {
    points += playerStats.stumpings * SCORING_RULES.fielding.stumpingPoints;
  }
  
  return points;
};

// Generate random test stats for a player
const generateTestStats = (player) => {
  const isBatter = player.position === 'batter' || player.position === 'keeper';
  const isBowler = player.position === 'bowler';
  const isFlex = player.position === 'flex';
  
  const stats = {
    runs: 0,
    ballsFaced: 0,
    strikeRate: 0,
    wickets: 0,
    oversBowled: 0,
    economyRate: 0,
    maidenOvers: 0,
    catches: Math.random() > 0.7 ? Math.floor(Math.random() * 2) + 1 : 0,
    runOuts: Math.random() > 0.9 ? 1 : 0,
    stumpings: 0,
    isWicketkeeper: player.position === 'keeper',
  };
  
  if (isBatter || isFlex) {
    stats.runs = Math.floor(Math.random() * 80) + (Math.random() > 0.3 ? 10 : 0);
    stats.ballsFaced = Math.max(stats.runs, Math.floor(stats.runs * (0.7 + Math.random() * 0.6)));
    stats.strikeRate = stats.ballsFaced > 0 ? (stats.runs / stats.ballsFaced) * 100 : 0;
  }
  
  if (isBowler || isFlex) {
    stats.oversBowled = Math.floor(Math.random() * 4) + 1;
    stats.wickets = Math.random() > 0.5 ? Math.floor(Math.random() * 3) + 1 : 0;
    const runsConceded = Math.floor(stats.oversBowled * (5 + Math.random() * 5));
    stats.economyRate = stats.oversBowled > 0 ? runsConceded / stats.oversBowled : 0;
    stats.maidenOvers = Math.random() > 0.85 ? 1 : 0;
  }
  
  if (player.position === 'keeper') {
    stats.stumpings = Math.random() > 0.85 ? 1 : 0;
  }
  
  return stats;
};

// Generate game log for a player based on completed matches
// generatePlayerGameLog REMOVED - was generating fake random data
// All game log data now comes from database via API

// Snake Draft Order Generator
const generateSnakeDraftOrder = (teams, totalRounds) => {
  const order = [];
  for (let round = 1; round <= totalRounds; round++) {
    const roundOrder = round % 2 === 1 
      ? [...teams] 
      : [...teams].reverse();
    roundOrder.forEach((team, idx) => {
      order.push({
        round,
        pick: (round - 1) * teams.length + idx + 1,
        teamId: team.id,
        teamName: team.name,
      });
    });
  }
  return order;
};

// ============================================
// COMPONENTS
// ============================================

// Tournament Selection Page
const TournamentSelectPage = ({ onSelectTournament, user, onLogout }) => {
  const [userTeams, setUserTeams] = useState({});
  const [tournaments, setTournaments] = useState(TOURNAMENTS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch tournaments from database and merge with local
  useEffect(() => {
    const fetchTournaments = async () => {
      try {
        const response = await tournamentsAPI.getAll();
        if (response && response.tournaments && response.tournaments.length > 0) {
          console.log('📋 Loaded tournaments from DB:', response.tournaments.length);
          // Merge DB tournaments with local TOURNAMENTS (DB takes priority)
          const mergedTournaments = { ...TOURNAMENTS };
          response.tournaments.forEach(dbTournament => {
            if (dbTournament.id) {
              const matchCount = dbTournament.matches?.length || 0;
              console.log(`   - ${dbTournament.id}: ${matchCount} matches from DB`);
              mergedTournaments[dbTournament.id] = {
                ...TOURNAMENTS[dbTournament.id], // Start with local defaults
                ...dbTournament, // Override with DB values
              };
            }
          });
          setTournaments(mergedTournaments);
        }
      } catch (err) {
        console.error('Failed to fetch tournaments from DB:', err);
        // Fall back to hardcoded tournaments
      }
    };
    
    fetchTournaments();
  }, []);

  // Fetch user's teams from database on load
  useEffect(() => {
    const fetchUserTeams = async () => {
      if (!user?.id) {
        setLoading(false);
        return;
      }
      
      console.log('📋 TournamentSelectPage: Fetching teams for user:', user.email);
      
      try {
        const response = await teamsAPI.getAll({ userId: user.id });
        if (response && response.teams) {
          // Create a map of tournamentId -> team
          const teamsMap = {};
          response.teams.forEach(team => {
            if (team && team.tournamentId) {
              teamsMap[team.tournamentId] = team;
            }
          });
          setUserTeams(teamsMap);
          console.log('✅ Found teams:', Object.keys(teamsMap));
        }
      } catch (err) {
        console.error('Failed to fetch user teams:', err);
        setError(err.message);
        // Don't block the page - just show tournaments without team status
      } finally {
        setLoading(false);
      }
    };
    
    fetchUserTeams();
  }, [user?.id]);

  // Check if user has a team for this tournament
  const getUserTeamStatus = (tournamentId) => {
    return !!userTeams[tournamentId];
  };

  return (
    <div className="tournament-select-page">
      <div className="tournament-container">
        <div className="tournament-header">
          <div className="logo-icon">🏏</div>
          <h1>T20 Fantasy Cricket</h1>
          <p>Select a Tournament</p>
          {user && (
            <div className="logged-in-as">
              <span>👤 {user.name || user.email}</span>
              <button className="btn-small btn-secondary" onClick={onLogout}>Logout</button>
            </div>
          )}
        </div>
        
        {loading ? (
          <div className="loading-spinner">Loading tournaments...</div>
        ) : (
          <div className="tournament-list">
            {Object.values(tournaments || {}).map(tournament => {
              if (!tournament || !tournament.id) return null;
              const hasTeam = getUserTeamStatus(tournament.id);
              const teams = tournament.teams || [];
              return (
                <div 
                  key={tournament.id} 
                  className={`tournament-card ${tournament.isTest ? 'test-tournament' : ''} ${hasTeam ? 'has-team' : ''}`}
                  onClick={() => onSelectTournament(tournament)}
                >
                  <div className="tournament-badge">
                    {tournament.isTest ? '🧪 TEST' : tournament.status === 'upcoming' ? '📅 UPCOMING' : '🔴 LIVE'}
                  </div>
                  {hasTeam && <div className="team-exists-badge">✓ Team Created</div>}
                  <h3>{tournament.name}</h3>
                  <p className="tournament-desc">{tournament.description}</p>
                  <div className="tournament-dates">
                    {tournament.startDate ? new Date(tournament.startDate).toLocaleDateString() : 'TBD'} - {tournament.endDate ? new Date(tournament.endDate).toLocaleDateString() : 'TBD'}
                  </div>
                  <div className="tournament-teams">
                    {teams.slice(0, 6).join(' • ')}
                    {teams.length > 6 && ` +${teams.length - 6} more`}
                  </div>
                  <button className="btn-primary btn-small">
                    {hasTeam ? 'Continue' : tournament.isTest ? 'Start Test Mode' : 'Enter & Register'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

// Login Page Component
const LoginPage = ({ onLogin, onShowSignup }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Generate consistent user ID from email (simple hash) - fallback for localStorage
  const generateUserId = (email) => {
    let hash = 0;
    for (let i = 0; i < email.length; i++) {
      const char = email.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return `user_${Math.abs(hash)}`;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    if (!email || password.length < 6) {
      setError('Invalid credentials. Password must be at least 6 characters.');
      setLoading(false);
      return;
    }

    try {
      // Try API login first
      const response = await authAPI.login(email, password);
      console.log('✅ API Login successful:', response.user);
      onLogin(response.user);
    } catch (apiError) {
      console.log('⚠️ API Login failed, trying local fallback:', apiError.message);
      
      // Fallback to local login (for development/offline)
      const isAdmin = isAdminUser(email);
      const userId = generateUserId(email.toLowerCase());
      
      // Check if user already exists in localStorage
      const savedUsers = localStorage.getItem('t20fantasy_all_users');
      const existingUsers = savedUsers ? JSON.parse(savedUsers) : [];
      const existingUser = existingUsers.find(u => u.email.toLowerCase() === email.toLowerCase());
      
      const finalUserId = existingUser?.id || userId;
      
      onLogin({ 
        email: email.toLowerCase(), 
        id: finalUserId,
        name: existingUser?.name || email.split('@')[0],
        isAdmin 
      });
    }
    setLoading(false);
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-header">
          <div className="logo-icon">🏏</div>
          <h1>T20 Fantasy Cricket</h1>
          <p>Login to Continue</p>
        </div>
        
        <form onSubmit={handleSubmit} className="login-form">
          {error && <div className="error-message">{error}</div>}
          
          <div className="input-group">
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
            />
          </div>
          
          <div className="input-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>
          
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? <span className="spinner"></span> : 'Sign In'}
          </button>
          
          <div className="login-footer">
            <p>Don't have an account?</p>
            <button type="button" className="btn-link" onClick={onShowSignup}>
              Create Account
            </button>
          </div>
          
          <div className="admin-hint">
            <small>Admin? Use admin@t20fantasy.com</small>
          </div>
          
          <div className="reset-data-link" style={{ marginTop: '20px', textAlign: 'center' }}>
            <button 
              type="button"
              className="btn-link" 
              style={{ fontSize: '12px', color: '#888' }}
              onClick={() => {
                if (confirm('This will clear all local data (teams, draft status, etc). Are you sure?')) {
                  localStorage.clear();
                  window.location.reload();
                }
              }}
            >
              Having issues? Reset app data
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Signup Page Component
const SignupPage = ({ onSignup, onShowLogin }) => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Generate consistent user ID from email (simple hash) - fallback
  const generateUserId = (email) => {
    let hash = 0;
    for (let i = 0; i < email.length; i++) {
      const char = email.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return `user_${Math.abs(hash)}`;
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    
    setLoading(true);
    
    try {
      // Try API signup first
      const response = await authAPI.signup(formData.email, formData.password, formData.name);
      console.log('✅ API Signup successful:', response.user);
      onSignup(response.user);
    } catch (apiError) {
      console.log('⚠️ API Signup failed, trying local fallback:', apiError.message);
      
      // Check if it's a "already registered" error
      if (apiError.message.includes('already registered')) {
        setError('Email already registered. Please login instead.');
        setLoading(false);
        return;
      }
      
      // Fallback to local signup (for development/offline)
      const userId = generateUserId(formData.email.toLowerCase());
      onSignup({ 
        email: formData.email.toLowerCase(), 
        name: formData.name, 
        id: userId 
      });
    }
    setLoading(false);
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-header">
          <div className="logo-icon">🏏</div>
          <h1>Join T20 Fantasy</h1>
          <p>Create your account</p>
        </div>
        
        <form onSubmit={handleSubmit} className="login-form">
          {error && <div className="error-message">{error}</div>}
          
          <div className="input-group">
            <label htmlFor="name">Full Name</label>
            <input type="text" id="name" name="name" value={formData.name}
              onChange={handleChange} placeholder="John Smith" required />
          </div>
          
          <div className="input-group">
            <label htmlFor="signup-email">Email</label>
            <input type="email" id="signup-email" name="email" value={formData.email}
              onChange={handleChange} placeholder="your@email.com" required />
          </div>
          
          <div className="input-group">
            <label htmlFor="signup-password">Password</label>
            <input type="password" id="signup-password" name="password" value={formData.password}
              onChange={handleChange} placeholder="••••••••" required />
          </div>
          
          <div className="input-group">
            <label htmlFor="confirm-password">Confirm Password</label>
            <input type="password" id="confirm-password" name="confirmPassword" value={formData.confirmPassword}
              onChange={handleChange} placeholder="••••••••" required />
          </div>
          
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? <span className="spinner"></span> : 'Create Account'}
          </button>
          
          <div className="login-footer">
            <p>Already have an account?</p>
            <button type="button" className="btn-link" onClick={onShowLogin}>Sign In</button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Team Creation Page
const TeamCreationPage = ({ user, tournament, onTeamCreated }) => {
  const [teamName, setTeamName] = useState('');
  const [ownerName, setOwnerName] = useState(user?.name || '');
  const [logo, setLogo] = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        alert('Logo must be under 2MB');
        return;
      }
      setLogo(file);
      const reader = new FileReader();
      reader.onloadend = () => setLogoPreview(reader.result);
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    const teamData = {
      id: Date.now(),
      name: teamName,
      owner: ownerName,
      userId: user.id,
      userEmail: user.email,
      logo: logoPreview || null,
      roster: [],
      weeklyPickups: 0,
      weeklyPickupLimit: FREE_AGENCY_LIMIT,
      weeklyPickupsResetDate: getStartOfWeek().toISOString(),
      totalPoints: 0,
      tournamentId: tournament.id,
    };

    try {
      // Try to create team via API
      const response = await teamsAPI.create({
        userId: user.id,
        tournamentId: tournament.id,
        name: teamName,
        ownerName: ownerName,
        logoUrl: logoPreview
      });
      
      console.log('✅ API Team created:', response);
      teamData.id = response.teamId;
      teamData.leagueId = response.leagueId;
      teamData.draftPosition = response.draftPosition;
    } catch (apiError) {
      console.log('⚠️ API Team creation failed:', apiError.message);
      // If it's a duplicate error, show message
      if (apiError.message.includes('already have a team')) {
        setError('You already have a team in this tournament!');
        setLoading(false);
        return;
      }
      // Otherwise continue with local creation as fallback
    }
    
    onTeamCreated(teamData);
    setLoading(false);
  };

  return (
    <div className="team-creation-page">
      <div className="team-creation-container">
        <div className="creation-header">
          <h1>Create Your Team</h1>
          <p>{tournament.name}</p>
          {tournament.isTest && <span className="test-badge">TEST MODE</span>}
        </div>
        
        <form onSubmit={handleSubmit} className="team-form">
          <div className="logo-upload-section">
            <div className="logo-upload-area" onClick={() => document.getElementById('logo-input').click()}>
              {logoPreview ? (
                <img src={logoPreview} alt="Team logo preview" className="logo-preview" />
              ) : (
                <div className="upload-placeholder">
                  <span className="upload-icon">📷</span>
                  <span>Upload Team Logo</span>
                  <span className="upload-hint">Max 2MB, PNG/JPG</span>
                </div>
              )}
            </div>
            <input type="file" id="logo-input" accept="image/png, image/jpeg"
              onChange={handleLogoChange} hidden />
          </div>
          
          <div className="input-group">
            <label htmlFor="team-name">Team Name</label>
            <input type="text" id="team-name" value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              placeholder="The Mighty XI" maxLength={30} required />
            <span className="char-count">{teamName.length}/30</span>
          </div>
          
          <div className="input-group">
            <label htmlFor="owner-name">Owner Name</label>
            <input type="text" id="owner-name" value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              placeholder="Your name" maxLength={25} required />
          </div>
          
          <div className="squad-preview">
            <h3>Your Squad Structure</h3>
            <div className="squad-slots">
              {Object.entries(SQUAD_CONFIG).map(([key, config]) => (
                <div key={key} className="slot-item">
                  <span className="slot-icon">{config.icon}</span>
                  <span className="slot-count">{config.max}</span>
                  <span className="slot-label">{config.label}</span>
                </div>
              ))}
            </div>
          </div>
          
          <div className="draft-info">
            <h3>🐍 Snake Draft</h3>
            <p>Players are drafted in snake order. Pick order reverses each round for fairness.</p>
          </div>
          
          <button type="submit" className="btn-primary btn-large" disabled={loading}>
            {loading ? <span className="spinner"></span> : 'Create Team & Enter Draft'}
          </button>
        </form>
      </div>
    </div>
  );
};

// Snake Draft Component - Database synchronized, turn-based
const SnakeDraftPage = ({ team, tournament, players, allTeams, onDraftComplete, onUpdateTeam }) => {
  const [draftState, setDraftState] = useState('loading'); // loading, waiting, drafting, completed
  const [league, setLeague] = useState(null);
  const [draftOrder, setDraftOrder] = useState([]);
  const [currentPick, setCurrentPick] = useState(0);
  const [picks, setPicks] = useState([]);
  const [availablePlayers, setAvailablePlayers] = useState([...players]);
  const [filterPosition, setFilterPosition] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Get tournament teams
  const tournamentTeams = useMemo(() => {
    return (allTeams || [])
      .filter(t => t.tournamentId === tournament?.id)
      .map(t => ({
        id: t.id,
        name: t.name,
        owner: t.owner,
        isUser: t.id === team?.id,
        draftPosition: t.draftPosition || 0
      }))
      .sort((a, b) => a.draftPosition - b.draftPosition);
  }, [allTeams, tournament?.id, team?.id]);

  // Generate snake draft order
  const generateDraftOrder = (teams, totalRounds) => {
    const order = [];
    for (let round = 1; round <= totalRounds; round++) {
      const roundTeams = round % 2 === 1 ? [...teams] : [...teams].reverse();
      roundTeams.forEach((t, idx) => {
        order.push({
          pick: order.length + 1,
          round,
          teamId: t.id,
          teamName: t.name,
          isUser: t.isUser
        });
      });
    }
    return order;
  };

  // Load league and draft state
  const loadDraftState = async () => {
    try {
      const leaguesResponse = await leaguesAPI.getAll(tournament.id);
      if (!leaguesResponse.leagues || leaguesResponse.leagues.length === 0) {
        setError('No league found for this tournament');
        return;
      }

      const leagueData = leaguesResponse.leagues[0];
      setLeague(leagueData);
      
      console.log('📋 League data:', {
        draftStatus: leagueData.draftStatus,
        currentPick: leagueData.currentPick,
        draftOrderLength: leagueData.draftOrder?.length || 0
      });

      // Check draft status
      if (leagueData.draftStatus === 'pending' || leagueData.draftStatus === 'open') {
        setDraftState('waiting');
        return;
      }

      if (leagueData.draftStatus === 'completed') {
        setDraftState('completed');
        return;
      }

      // Draft is in progress
      setDraftState('drafting');
      setCurrentPick(leagueData.currentPick || 0);

      // Load draft order from database - DO NOT regenerate
      let order = leagueData.draftOrder;
      
      // Only regenerate if order doesn't exist AND we have teams
      if (!order || order.length === 0) {
        if (tournamentTeams.length >= 2) {
          console.log('⚠️ No draft order found, generating for', tournamentTeams.length, 'teams');
          order = generateDraftOrder(tournamentTeams, TOTAL_ROSTER_SIZE);
          // Save draft order to league
          await leaguesAPI.update({
            id: leagueData.id,
            draftOrder: order
          });
        } else {
          console.error('❌ Cannot generate draft order - not enough teams loaded');
          setError('Draft order not found. Please refresh or contact admin.');
          return;
        }
      }
      
      console.log('📋 Draft order loaded:', order.length, 'total picks');
      setDraftOrder(order);

      // Load existing picks and enrich with player data
      const picksResponse = await draftAPI.getPicks(leagueData.id);
      if (picksResponse.picks) {
        // Enrich picks with player data from local pool
        const enrichedPicks = picksResponse.picks.map(pick => {
          const poolPlayer = players.find(p => p.id === pick.playerId);
          return {
            ...pick,
            playerName: pick.playerName || poolPlayer?.name || 'Unknown',
            playerTeam: pick.playerTeam || poolPlayer?.team || 'Unknown',
            playerPosition: pick.playerPosition || poolPlayer?.position || 'flex'
          };
        });
        setPicks(enrichedPicks);
        // Remove drafted players from available
        const draftedIds = new Set(enrichedPicks.map(p => p.playerId));
        setAvailablePlayers(players.filter(p => !draftedIds.has(p.id)));
      }

      // Check if draft is complete - ONLY if we have a valid draft order AND picks have been made
      const totalPicksRequired = order.length;
      const currentPickNum = leagueData.currentPick || 0;
      
      console.log('📋 Draft progress:', currentPickNum, '/', totalPicksRequired);
      
      // Only mark complete if:
      // 1. We have a valid draft order (totalPicksRequired > 0)
      // 2. At least one pick has been made (currentPickNum > 0)
      // 3. We've reached or passed the total picks required
      if (totalPicksRequired > 0 && currentPickNum > 0 && currentPickNum >= totalPicksRequired) {
        console.log('✅ Draft is complete!');
        setDraftState('completed');
      }
    } catch (err) {
      console.error('Failed to load draft state:', err);
      setError('Failed to load draft. Please refresh.');
    }
  };

  // Initial load
  useEffect(() => {
    loadDraftState();
  }, [tournament?.id]);

  // Poll for updates every 3 seconds
  useEffect(() => {
    if (draftState === 'loading' || draftState === 'completed') return;

    const pollInterval = setInterval(async () => {
      try {
        const leaguesResponse = await leaguesAPI.getAll(tournament.id);
        if (!leaguesResponse.leagues || leaguesResponse.leagues.length === 0) return;

        const leagueData = leaguesResponse.leagues[0];

        // Check if draft started (was waiting, now in_progress)
        if (draftState === 'waiting' && leagueData.draftStatus === 'in_progress') {
          console.log('🚀 Draft started! Loading draft state...');
          loadDraftState();
          return;
        }

        // If drafting, check for new picks
        if (draftState === 'drafting') {
          const serverPick = leagueData.currentPick || 0;
          
          // Also update draft order if we don't have it
          if ((!draftOrder || draftOrder.length === 0) && leagueData.draftOrder?.length > 0) {
            console.log('📋 Loading draft order from server:', leagueData.draftOrder.length, 'picks');
            setDraftOrder(leagueData.draftOrder);
          }
          
          if (serverPick > currentPick) {
            console.log(`📥 New pick detected: ${currentPick} → ${serverPick}`);
            
            // Load new picks - need to enrich with player data from local pool
            const picksResponse = await draftAPI.getPicks(leagueData.id);
            if (picksResponse.picks) {
              // Enrich picks with player data from local pool
              const enrichedPicks = picksResponse.picks.map(pick => {
                const poolPlayer = players.find(p => p.id === pick.playerId);
                return {
                  ...pick,
                  playerName: pick.playerName || poolPlayer?.name || 'Unknown',
                  playerTeam: pick.playerTeam || poolPlayer?.team || 'Unknown',
                  playerPosition: pick.playerPosition || poolPlayer?.position || 'flex'
                };
              });
              setPicks(enrichedPicks);
              const draftedIds = new Set(enrichedPicks.map(p => p.playerId));
              setAvailablePlayers(players.filter(p => !draftedIds.has(p.id)));
            }
            
            setCurrentPick(serverPick);

            // Check if draft complete - use server's draft order length
            // Only complete if at least one pick was made (serverPick > 0)
            const totalPicks = leagueData.draftOrder?.length || draftOrder.length || 0;
            console.log(`📋 Draft progress: ${serverPick} / ${totalPicks}`);
            
            if (totalPicks > 0 && serverPick > 0 && serverPick >= totalPicks) {
              console.log('✅ Draft complete via polling!');
              setDraftState('completed');
            }
          }
        }
      } catch (err) {
        console.error('Poll error:', err);
      }
    }, 3000);

    return () => clearInterval(pollInterval);
  }, [draftState, currentPick, draftOrder.length, tournament?.id, team?.id]);

  // Current pick info
  const currentPickData = draftOrder[currentPick];
  const isUsersTurn = currentPickData?.teamId === team?.id;

  // Get roster counts
  const getUserRoster = () => {
    return picks
      .filter(p => p.teamId === team?.id)
      .map(p => ({
        id: p.playerId,
        name: p.playerName,
        team: p.playerTeam,
        position: p.playerPosition
      }));
  };

  const userRoster = getUserRoster();

  const getRosterCount = (position) => {
    return userRoster.filter(p => p.position === position).length;
  };

  const getSlotCount = (slotKey) => {
    return userRoster.filter(p => {
      const validSlots = POSITION_COMPATIBILITY[p.position] || [];
      return validSlots.includes(slotKey);
    }).length;
  };

  const canDraftPosition = (position) => {
    const validSlots = POSITION_COMPATIBILITY[position] || [];
    for (const slotKey of validSlots) {
      const config = SQUAD_CONFIG[slotKey];
      if (config) {
        const current = getRosterCount(slotKey === 'keepers' ? 'keeper' : slotKey.slice(0, -1));
        if (current < config.max) return true;
      }
    }
    return false;
  };

  const getBestSlotForPosition = (position) => {
    const validSlots = POSITION_COMPATIBILITY[position] || [];
    for (const slotKey of validSlots) {
      if (slotKey === 'flex') continue;
      const config = SQUAD_CONFIG[slotKey];
      if (config) {
        const pos = slotKey === 'keepers' ? 'keeper' : slotKey.slice(0, -1);
        const current = getRosterCount(pos);
        if (current < config.max) return slotKey;
      }
    }
    if (validSlots.includes('flex') && SQUAD_CONFIG.flex) {
      return 'flex';
    }
    return 'flex';
  };

  // Make a draft pick
  const draftPlayer = async (player) => {
    if (!isUsersTurn || isSubmitting) return;
    
    // Guard: Ensure we have a valid draft order
    if (!draftOrder || draftOrder.length === 0) {
      setError('Draft order not loaded. Please refresh the page.');
      return;
    }

    if (!canDraftPosition(player.position)) {
      alert(`No available slots for ${player.position}s!`);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const slot = getBestSlotForPosition(player.position);
      const pickData = {
        leagueId: league.id,
        teamId: team.id,
        playerId: player.id,
        round: currentPickData?.round || 1,
        pickNumber: currentPick + 1,
        slot: slot
      };

      const response = await draftAPI.makePick(pickData);
      
      if (response.success) {
        console.log('✅ Pick saved:', player.name);
        
        // Optimistic update with full player data
        const newPick = {
          ...pickData,
          playerName: player.name,
          playerTeam: player.team,
          playerPosition: player.position,
          teamName: team.name
        };
        setPicks(prev => [...prev, newPick]);
        setAvailablePlayers(prev => prev.filter(p => p.id !== player.id));
        
        const nextPick = currentPick + 1;
        setCurrentPick(nextPick);

        // Check if draft complete - only if we have a valid draft order
        const totalPicks = draftOrder.length;
        console.log(`📋 Draft progress after pick: ${nextPick} / ${totalPicks}`);
        
        if (totalPicks > 0 && nextPick >= totalPicks) {
          console.log('✅ Draft complete!');
          setDraftState('completed');
          // Don't auto-redirect - let user click "Go to Roster" button
        }
      }
    } catch (err) {
      console.error('Failed to make pick:', err);
      setError(err.message || 'Failed to make pick. Try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filter players
  const filteredPlayers = availablePlayers.filter(p => {
    const matchesPosition = filterPosition === 'all' || p.position === filterPosition;
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         p.team.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesPosition && matchesSearch;
  });

  // Loading state
  if (draftState === 'loading') {
    return (
      <div className="draft-page">
        <div className="draft-intro">
          <div className="loading-spinner">Loading draft...</div>
        </div>
      </div>
    );
  }

  // Waiting room
  if (draftState === 'waiting') {
    return (
      <div className="draft-page">
        <div className="draft-intro">
          <div className="draft-intro-content">
            <h1>⏳ Waiting Room</h1>
            <p>Waiting for admin to start the draft...</p>
            
            <div className="waiting-animation">
              <div className="pulse-circle"></div>
            </div>

            <div className="draft-order-preview">
              <h3>Registered Teams ({tournamentTeams.length})</h3>
              <div className="team-order">
                {tournamentTeams.map((t, i) => (
                  <div key={t.id} className={`order-item ${t.isUser ? 'user' : ''}`}>
                    <span className="order-num">{i + 1}</span>
                    <span className="order-name">{t.name}</span>
                    {t.isUser && <span className="you-badge">YOU</span>}
                  </div>
                ))}
              </div>
            </div>

            <p className="waiting-hint">
              💡 The admin will start the draft from the Admin Panel.<br/>
              This page will automatically update when the draft begins.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Completed state
  if (draftState === 'completed') {
    // Build final roster with full player data - ALL go to BENCH first
    const finalRoster = picks
      .filter(p => p.teamId === team?.id)
      .map(p => ({
        id: p.playerId,
        name: p.playerName || 'Unknown Player',
        team: p.playerTeam || 'Unknown',
        position: p.playerPosition || 'flex',
        slot: 'bench', // All players start on bench
        totalPoints: 0,
        avgPoints: 0,
        matchesPlayed: 0
      }));
    
    // Position counts for summary
    const positionCounts = {
      batter: finalRoster.filter(p => p.position === 'batter').length,
      keeper: finalRoster.filter(p => p.position === 'keeper').length,
      allrounder: finalRoster.filter(p => p.position === 'allrounder').length,
      bowler: finalRoster.filter(p => p.position === 'bowler').length,
    };
    
    return (
      <div className="draft-page">
        <div className="draft-intro">
          <div className="draft-intro-content">
            <h1>✅ Draft Complete!</h1>
            <p>Your roster has been set with {finalRoster.length} players.</p>
            
            {/* Position Summary */}
            <div className="draft-position-summary" style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(4, 1fr)', 
              gap: '10px', 
              margin: '20px 0',
              padding: '15px',
              background: 'rgba(255,255,255,0.05)',
              borderRadius: '8px'
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '1.5rem' }}>🏏</div>
                <div style={{ fontWeight: 'bold', color: '#d4af37' }}>{positionCounts.batter}</div>
                <div style={{ fontSize: '0.75rem', color: '#888' }}>Batters</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '1.5rem' }}>🧤</div>
                <div style={{ fontWeight: 'bold', color: '#d4af37' }}>{positionCounts.keeper}</div>
                <div style={{ fontSize: '0.75rem', color: '#888' }}>Keepers</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '1.5rem' }}>⚡</div>
                <div style={{ fontWeight: 'bold', color: '#d4af37' }}>{positionCounts.allrounder}</div>
                <div style={{ fontSize: '0.75rem', color: '#888' }}>All-rounders</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '1.5rem' }}>🎯</div>
                <div style={{ fontWeight: 'bold', color: '#d4af37' }}>{positionCounts.bowler}</div>
                <div style={{ fontSize: '0.75rem', color: '#888' }}>Bowlers</div>
              </div>
            </div>
            
            {/* Player List */}
            <div className="draft-summary" style={{ margin: '20px 0', textAlign: 'left' }}>
              <h3>Your Team:</h3>
              <div className="drafted-players" style={{ maxHeight: '250px', overflow: 'auto' }}>
                {finalRoster.map((p, i) => (
                  <div key={i} style={{ padding: '8px', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between' }}>
                    <span>{p.name}</span>
                    <span className={`position-badge ${p.position}`}>
                      {p.position === 'keeper' ? 'WK' : p.position.toUpperCase().slice(0, 3)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <button 
              className="btn-primary btn-large" 
              onClick={() => onDraftComplete(finalRoster)}
              style={{ marginTop: '20px' }}
            >
              Go to My Roster →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Guard: Show loading if draftOrder is empty
  if (!draftOrder || draftOrder.length === 0) {
    return (
      <div className="draft-page">
        <div className="draft-intro">
          <div className="draft-intro-content">
            <h1>⏳ Loading Draft...</h1>
            <p>Waiting for draft order to load. Please wait...</p>
            <button className="btn-secondary" onClick={loadDraftState}>
              Refresh
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Active draft
  return (
    <div className="draft-page">
      <header className="draft-header">
        <div className="draft-title">
          <h1>🐍 Snake Draft</h1>
          <span className="draft-round">
            Round {currentPickData?.round || 1} • Pick {currentPick + 1}/{draftOrder.length}
          </span>
        </div>
        {isUsersTurn ? (
          <div className="your-turn-indicator">🎯 YOUR PICK!</div>
        ) : (
          <div className="waiting-indicator">
            ⏳ Waiting for {currentPickData?.teamName}...
          </div>
        )}
      </header>

      {error && (
        <div className="draft-error" style={{ background: '#dc3545', padding: '10px', textAlign: 'center' }}>
          {error}
        </div>
      )}

      <div className="draft-content">
        <div className="draft-sidebar">
          <div className="my-roster-preview">
            <h3>Your Roster ({userRoster.length}/{TOTAL_ROSTER_SIZE})</h3>
            
            {/* Position counts */}
            <div className="position-counts">
              <div className="position-count-item">
                <span>🏏 Batters</span>
                <span>{userRoster.filter(p => p.position === 'batter').length}</span>
              </div>
              <div className="position-count-item">
                <span>🧤 Wicket Keepers</span>
                <span>{userRoster.filter(p => p.position === 'keeper').length}</span>
              </div>
              <div className="position-count-item">
                <span>⚡ All-rounders</span>
                <span>{userRoster.filter(p => p.position === 'allrounder').length}</span>
              </div>
              <div className="position-count-item">
                <span>🎯 Bowlers</span>
                <span>{userRoster.filter(p => p.position === 'bowler').length}</span>
              </div>
            </div>
            
            {/* Drafted players list */}
            <div className="drafted-players-list">
              <h4>Drafted</h4>
              {userRoster.length === 0 ? (
                <div className="no-players">No players drafted yet</div>
              ) : (
                userRoster.map((p, i) => (
                  <div key={i} className="drafted-player-item">
                    <span className="drafted-player-name">{p.name}</span>
                    <span className={`position-badge small ${p.position}`}>
                      {p.position === 'keeper' ? 'WK' : p.position.toUpperCase().slice(0, 3)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
          
          <div className="draft-log">
            <h3>Recent Picks</h3>
            <div className="log-entries">
              {picks.slice(-8).reverse().map((pick, i) => (
                <div key={i} className={`log-entry ${pick.teamId === team?.id ? 'user-pick' : ''}`}>
                  <span className="pick-num">#{pick.pickNumber}</span>
                  <span className="pick-team">{pick.teamName}</span>
                  <span className="pick-player">{pick.playerName}</span>
                </div>
              ))}
              {picks.length === 0 && <div className="no-picks">No picks yet</div>}
            </div>
          </div>
        </div>

        <div className="draft-main">
          <div className="player-filters">
            <input
              type="text"
              placeholder="Search players..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />
            <select 
              value={filterPosition} 
              onChange={(e) => setFilterPosition(e.target.value)}
              className="position-filter"
            >
              <option value="all">All Positions</option>
              <option value="batter">Batters</option>
              <option value="bowler">Bowlers</option>
              <option value="allrounder">All-rounders</option>
              <option value="keeper">Keepers</option>
            </select>
          </div>

          <div className="available-players">
            {filteredPlayers.slice(0, 50).map(player => {
              const canDraft = isUsersTurn && canDraftPosition(player.position) && !isSubmitting;
              return (
                <div 
                  key={player.id} 
                  className={`player-card ${canDraft ? 'draftable' : 'disabled'}`}
                  onClick={() => canDraft && draftPlayer(player)}
                >
                  <div className="player-info">
                    <span className="player-name">{player.name}</span>
                    <span className="player-team">{player.team}</span>
                  </div>
                  <div className="player-meta">
                    <span className={`position-badge ${player.position}`}>
                      {player.position.toUpperCase().slice(0, 3)}
                    </span>
                    <span className="player-points">{player.totalPoints || 0} pts</span>
                  </div>
                  {canDraft && <div className="draft-btn">Draft</div>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

// Admin Panel Component
const AdminPanel = ({ user, tournament, players: playersProp, onUpdateTournament, onRefreshPlayers, onLogout, onBackToTournaments, onSwitchTournament, allTeams, allUsers, onStartDraft, onDeleteTeam, onUpdateTeam, onDeleteUser }) => {
  const [activeTab, setActiveTab] = useState('overview');
  
  // Local fantasy points calculator (mirrors backend rules)
  // Accepts SR (strike rate) and ER (economy rate) directly
  const calculateFantasyPointsLocal = (stats) => {
    let points = 0;
    
    // Batting: +1 per run
    const runs = stats.runs || 0;
    points += runs;
    
    // Strike Rate bonus (min 20 runs AND SR must be provided/valid)
    const sr = stats.SR || stats.strikeRate || 0;
    if (runs >= 20 && sr > 0) {
      if (sr >= 160) points += 25;
      else if (sr >= 150) points += 20;
      else if (sr >= 140) points += 15;
      else if (sr >= 130) points += 10;
      else if (sr >= 120) points += 5;
    }
    
    // Bowling: +25 per wicket, +20 per maiden
    points += (stats.wickets || 0) * 25;
    points += (stats.maidens || 0) * 20;
    
    // Economy bonus (min 3 overs AND ER must be provided/valid)
    const overs = stats.overs || stats.oversBowled || 0;
    const er = stats.ER || stats.economy || 0;
    if (overs >= 3 && er > 0) {
      if (er <= 5) points += 25;
      else if (er <= 6) points += 20;
      else if (er <= 7) points += 15;
      else if (er <= 8) points += 10;
    }
    
    // Fielding: +12 catch, +20 run out, +15 stumping
    points += (stats.catches || 0) * 12;
    points += (stats.runouts || stats.runOuts || 0) * 20;
    points += (stats.stumpings || 0) * 15;
    
    return Math.round(points);
  };
  
  // Get points breakdown for manual entry
  const getPointsBreakdownLocal = (stats) => {
    const breakdown = [];
    const runs = stats.runs || 0;
    const sr = stats.SR || stats.strikeRate || 0;
    
    // Batting
    if (runs > 0) {
      breakdown.push({ label: `${runs} runs`, points: runs });
      
      // SR bonus only if runs >= 20 AND SR > 0
      if (runs >= 20 && sr > 0) {
        if (sr >= 160) breakdown.push({ label: `SR ${sr} (≥160)`, points: 25 });
        else if (sr >= 150) breakdown.push({ label: `SR ${sr} (150-159)`, points: 20 });
        else if (sr >= 140) breakdown.push({ label: `SR ${sr} (140-149)`, points: 15 });
        else if (sr >= 130) breakdown.push({ label: `SR ${sr} (130-139)`, points: 10 });
        else if (sr >= 120) breakdown.push({ label: `SR ${sr} (120-129)`, points: 5 });
      }
    }
    
    // Bowling
    if ((stats.wickets || 0) > 0) {
      breakdown.push({ label: `${stats.wickets} wkt${stats.wickets > 1 ? 's' : ''}`, points: stats.wickets * 25 });
    }
    if ((stats.maidens || 0) > 0) {
      breakdown.push({ label: `${stats.maidens} maiden${stats.maidens > 1 ? 's' : ''}`, points: stats.maidens * 20 });
    }
    
    // ER bonus only if overs >= 3 AND ER > 0
    const overs = stats.overs || stats.oversBowled || 0;
    const er = stats.ER || stats.economy || 0;
    if (overs >= 3 && er > 0) {
      if (er <= 5) breakdown.push({ label: `ER ${er} (≤5)`, points: 25 });
      else if (er <= 6) breakdown.push({ label: `ER ${er} (5-6)`, points: 20 });
      else if (er <= 7) breakdown.push({ label: `ER ${er} (6-7)`, points: 15 });
      else if (er <= 8) breakdown.push({ label: `ER ${er} (7-8)`, points: 10 });
    }
    
    // Fielding
    const catches = stats.catches || 0;
    const runouts = stats.runouts || stats.runOuts || 0;
    const stumpings = stats.stumpings || 0;
    if (catches > 0) breakdown.push({ label: `${catches} catch${catches > 1 ? 'es' : ''}`, points: catches * 12 });
    if (runouts > 0) breakdown.push({ label: `${runouts} run out${runouts > 1 ? 's' : ''}`, points: runouts * 20 });
    if (stumpings > 0) breakdown.push({ label: `${stumpings} stumping${stumpings > 1 ? 's' : ''}`, points: stumpings * 15 });
    
    return breakdown;
  };
  
  // Tournament editing state
  const [editingTournament, setEditingTournament] = useState(false);
  const [tournamentForm, setTournamentForm] = useState({
    startDate: tournament?.startDate || '',
    endDate: tournament?.endDate || '',
    matches: tournament?.matches || []
  });
  const [savingTournament, setSavingTournament] = useState(false);
  const [newPlayerForm, setNewPlayerForm] = useState({
    name: '', team: '', position: 'batter'
  });
  // Initialize players from prop if available
  const [players, setPlayers] = useState(playersProp || []);
  const [playersLoading, setPlayersLoading] = useState(false);
  
  // Update players when prop changes
  useEffect(() => {
    if (playersProp && playersProp.length > 0) {
      setPlayers(playersProp);
    }
  }, [playersProp]);
  
  // Fetch players from API when tournament changes (only if prop is empty)
  useEffect(() => {
    // Skip if we already have players from prop
    if (playersProp && playersProp.length > 0) {
      return;
    }
    
    const fetchPlayersForAdmin = async () => {
      setPlayersLoading(true);
      try {
        const response = await playersAPI.getByTournament(tournament.id);
        if (response.players && response.players.length > 0) {
          setPlayers(response.players);
        } else {
          // Fallback to local player data if API returns empty
          const localPlayers = getPlayersForTournament(tournament.id);
          setPlayers(localPlayers);
        }
      } catch (error) {
        console.error('Failed to fetch players from API, using local data:', error);
        // Fallback to local player data
        const localPlayers = getPlayersForTournament(tournament.id);
        setPlayers(localPlayers);
      } finally {
        setPlayersLoading(false);
      }
    };
    
    fetchPlayersForAdmin();
  }, [tournament.id, playersProp]);
  
  // Refetch players after sync
  const refetchPlayers = async () => {
    try {
      const response = await playersAPI.getByTournament(tournament.id);
      if (response.players && response.players.length > 0) {
        setPlayers(response.players);
      } else {
        const localPlayers = getPlayersForTournament(tournament.id);
        setPlayers(localPlayers);
      }
    } catch (error) {
      console.error('Failed to refetch players, using local data:', error);
      const localPlayers = getPlayersForTournament(tournament.id);
      setPlayers(localPlayers);
    }
  };
  
  // Draft status state
  const [draftStatus, setDraftStatusState] = useState('pending');
  
  // Load draft status from database when tournament changes
  useEffect(() => {
    const loadDraftStatus = async () => {
      try {
        const leaguesResponse = await leaguesAPI.getAll(tournament.id);
        if (leaguesResponse.leagues && leaguesResponse.leagues.length > 0) {
          const league = leaguesResponse.leagues[0];
          console.log(`📋 Admin: Loaded draft status from DB: ${league.draftStatus}`);
          setDraftStatusState(league.draftStatus || 'pending');
        }
      } catch (err) {
        console.log('Failed to load draft status:', err);
        setDraftStatusState('pending');
      }
    };
    loadDraftStatus();
  }, [tournament.id]);
  
  // Save draft status to database
  const setDraftStatus = async (status) => {
    console.log(`💾 Admin: Saving draft status: ${status}`);
    setDraftStatusState(status);
    
    // Persist to database
    try {
      const leaguesResponse = await leaguesAPI.getAll(tournament.id);
      if (leaguesResponse.leagues && leaguesResponse.leagues.length > 0) {
        const league = leaguesResponse.leagues[0];
        await leaguesAPI.updateDraftStatus(league.id, status);
        console.log(`✅ Draft status saved to database: ${status}`);
      }
    } catch (err) {
      console.error('Failed to save draft status to database:', err);
    }
    
    // Update isDraftOpen in parent
    if (status === 'open' || status === 'in_progress') {
      onStartDraft && onStartDraft();
    }
  };
  
  const [syncStatus, setSyncStatus] = useState({ players: null, scores: null, clearing: null, match: null });
  const [pendingSyncPreview, setPendingSyncPreview] = useState(null); // Holds preview data before admin approval
  const [isSyncing, setIsSyncing] = useState({ players: false, scores: false, clearing: false });
  const [apiMatchesInfo, setApiMatchesInfo] = useState(null); // Stores fetched matches with fantasyEnabled info
  const [showManualEntry, setShowManualEntry] = useState(false); // Toggle manual entry form
  const [manualEntryMatch, setManualEntryMatch] = useState(null); // Match to enter manual stats for
  const [showPointsAdjust, setShowPointsAdjust] = useState(false); // Toggle points adjustment
  const [pointsAdjustPlayer, setPointsAdjustPlayer] = useState(null); // Player being adjusted
  const [pointsAdjustValue, setPointsAdjustValue] = useState(''); // New points value
  const [editingTeam, setEditingTeam] = useState(null);
  const [editTeamForm, setEditTeamForm] = useState({ name: '', ownerName: '', totalPoints: 0 });
  const [userFilter, setUserFilter] = useState('all'); // all, with_team, without_team
  const [draftLogs, setDraftLogs] = useState([]); // Draft pick history
  const [loadingDraftLogs, setLoadingDraftLogs] = useState(false);
  
  // Load draft logs when draft tab is opened or draft is completed
  useEffect(() => {
    const loadDraftLogs = async () => {
      if (draftStatus !== 'completed' && draftStatus !== 'in_progress') return;
      
      setLoadingDraftLogs(true);
      try {
        // Get league for this tournament
        const leaguesResponse = await leaguesAPI.getAll(tournament.id);
        if (leaguesResponse.leagues && leaguesResponse.leagues.length > 0) {
          const league = leaguesResponse.leagues[0];
          const picksResponse = await draftAPI.getPicks(league.id);
          if (picksResponse.picks) {
            console.log(`📋 Loaded ${picksResponse.picks.length} draft picks`);
            setDraftLogs(picksResponse.picks);
          }
        }
      } catch (err) {
        console.error('Failed to load draft logs:', err);
      } finally {
        setLoadingDraftLogs(false);
      }
    };
    
    loadDraftLogs();
  }, [tournament.id, draftStatus]);
  
  // Get API base URL
  const getApiBaseUrl = () => {
    if (typeof window !== 'undefined') {
      return window.location.origin;
    }
    return '';
  };
  
  // Get player status (count)
  const handleSyncPlayers = async () => {
    setIsSyncing(prev => ({ ...prev, players: true }));
    setSyncStatus(prev => ({ ...prev, players: 'Checking...' }));
    
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/sync/players?tournament=${tournament.id}`);
      const data = await response.json();
      
      if (data.success) {
        const count = data.playerCount || 0;
        const teams = data.teams || [];
        const teamInfo = teams.map(t => `${t.team}: ${t.count}`).join(', ');
        setSyncStatus(prev => ({ 
          ...prev, 
          players: `✅ ${count} players in database${teams.length > 0 ? ` (${teamInfo})` : ''}` 
        }));
        // Refetch players to update the list
        await refetchPlayers();
      } else {
        setSyncStatus(prev => ({ ...prev, players: `❌ Error: ${data.error}` }));
      }
    } catch (error) {
      setSyncStatus(prev => ({ ...prev, players: `❌ Error: ${error.message}` }));
    } finally {
      setIsSyncing(prev => ({ ...prev, players: false }));
    }
  };
  
  // Clear all players for tournament
  const handleClearPlayers = async () => {
    if (!confirm(`Are you sure you want to delete ALL players for ${tournament.name}? This cannot be undone.`)) {
      return;
    }
    
    setIsSyncing(prev => ({ ...prev, clearing: true }));
    setSyncStatus(prev => ({ ...prev, clearing: 'Clearing...' }));
    
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/sync/players?tournament=${tournament.id}`, {
        method: 'DELETE',
      });
      const data = await response.json();
      
      if (data.success) {
        setSyncStatus(prev => ({ ...prev, clearing: `✅ ${data.message}` }));
        // Refetch to show empty list
        await refetchPlayers();
      } else {
        setSyncStatus(prev => ({ ...prev, clearing: `❌ Error: ${data.error}` }));
      }
    } catch (error) {
      setSyncStatus(prev => ({ ...prev, clearing: `❌ Error: ${error.message}` }));
    } finally {
      setIsSyncing(prev => ({ ...prev, clearing: false }));
    }
  };
  
  const handleSyncLiveScores = async () => {
    setIsSyncing(prev => ({ ...prev, scores: true }));
    setSyncStatus(prev => ({ ...prev, scores: 'syncing...' }));
    
    try {
      // Try to get live matches from Cricket API
      const response = await liveSyncAPI.getLiveMatches();
      
      if (response.success && response.count > 0) {
        setSyncStatus(prev => ({ 
          ...prev, 
          scores: `✅ Found ${response.count} live T20 matches` 
        }));
      } else {
        setSyncStatus(prev => ({ 
          ...prev, 
          scores: `ℹ️ No live T20 matches found. Use Match Sync below to simulate.` 
        }));
      }
    } catch (error) {
      setSyncStatus(prev => ({ ...prev, scores: `❌ Error: ${error.message}` }));
    } finally {
      setIsSyncing(prev => ({ ...prev, scores: false }));
    }
  };
  
  // Sync specific match - PREVIEW MODE (shows points before applying)
  const handleSyncMatch = async (match) => {
    setIsSyncing(prev => ({ ...prev, match: match.id }));
    setSyncStatus(prev => ({ ...prev, match: `🔍 Fetching scorecard for ${match.name || match.teams}...` }));
    setPendingSyncPreview(null);
    
    try {
      const matchTeams = Array.isArray(match.teams) ? match.teams.join(' vs ') : match.teams;
      
      // Fetch preview (doesn't save to database)
      const response = await liveSyncAPI.previewScorecard(match.id, tournament.id, {
        teams: matchTeams,
        matchDate: match.date,
        cricketApiMatchId: match.cricketApiId
      });
      
      if (response.success && response.preview) {
        // Store preview for admin approval
        setPendingSyncPreview({
          match,
          matchId: match.id,
          cricketApiId: response.cricketApiId,
          matchInfo: response.matchInfo,
          playerStats: response.playerStats,
          totalPoints: response.totalFantasyPoints,
          totalPlayers: response.totalPlayers,
          scoringRules: response.scoringRules
        });
        setSyncStatus(prev => ({ 
          ...prev, 
          match: `📋 Preview ready: ${response.totalPlayers} players, ${response.totalFantasyPoints} total points. Review and click "Apply Points" to save.` 
        }));
      } else if (response.warning) {
        setSyncStatus(prev => ({ ...prev, match: `⚠️ ${response.warning}` }));
      } else {
        setSyncStatus(prev => ({ 
          ...prev, 
          match: `❌ ${response.error || 'Failed to fetch scorecard'}${response.tip ? ` - ${response.tip}` : ''}` 
        }));
      }
    } catch (error) {
      setSyncStatus(prev => ({ ...prev, match: `❌ Error: ${error.message}` }));
    } finally {
      setIsSyncing(prev => ({ ...prev, match: null }));
    }
  };
  
  // Apply points after admin approval
  const handleApplyPoints = async () => {
    if (!pendingSyncPreview) return;
    
    const { match, matchId, cricketApiId, playerStats, totalPoints } = pendingSyncPreview;
    
    if (!confirm(`Apply ${totalPoints} fantasy points for ${playerStats.length} players?\n\nThis will update the database.`)) {
      return;
    }
    
    setIsSyncing(prev => ({ ...prev, match: matchId }));
    setSyncStatus(prev => ({ ...prev, match: `💾 Applying points to database...` }));
    
    try {
      const response = await liveSyncAPI.applyPoints(matchId, tournament.id, cricketApiId, playerStats);
      
      if (response.success && response.applied) {
        setSyncStatus(prev => ({ 
          ...prev, 
          match: `✅ Applied! ${response.playersUpdated} players updated, ${response.totalPoints} points saved.${response.playersNotFound > 0 ? ` (${response.playersNotFound} players not found in DB)` : ''}` 
        }));
        
        // Clear preview
        setPendingSyncPreview(null);
        
        // Refetch players to show updated stats
        await refetchPlayers();
        
        // Also refresh main App's player pool for Dashboard
        if (onRefreshPlayers) {
          await onRefreshPlayers();
        }
        
        // Update tournament match status
        if (onUpdateTournament) {
          const updatedMatches = (tournament.matches || []).map(m => {
            if (m.id === matchId) {
              return { ...m, status: 'completed', cricketApiId };
            }
            return m;
          });
          onUpdateTournament({ ...tournament, matches: updatedMatches });
        }
      } else {
        setSyncStatus(prev => ({ ...prev, match: `❌ ${response.error || 'Failed to apply points'}` }));
      }
    } catch (error) {
      setSyncStatus(prev => ({ ...prev, match: `❌ Error: ${error.message}` }));
    } finally {
      setIsSyncing(prev => ({ ...prev, match: null }));
    }
  };
  
  // Cancel pending preview
  const handleCancelPreview = () => {
    setPendingSyncPreview(null);
    setSyncStatus(prev => ({ ...prev, match: null }));
  };
  
  // Complete a match (mark as completed without syncing - edge case)
  const handleCompleteMatch = async (match) => {
    if (!confirm(`Mark "${match.name || match.teams}" as completed without syncing new scores?`)) return;
    
    // Just update tournament match status locally
    if (onUpdateTournament) {
      const updatedMatches = (tournament.matches || []).map(m => 
        m.id === match.id ? { ...m, status: 'completed' } : m
      );
      onUpdateTournament({ ...tournament, matches: updatedMatches });
      setSyncStatus(prev => ({ ...prev, match: `✅ ${match.name || match.teams} marked as completed` }));
    }
  };
  
  // Sync All - Players + Live Scores in one click
  const handleSyncAll = async () => {
    setIsSyncing(prev => ({ ...prev, all: true }));
    setSyncStatus(prev => ({ ...prev, all: 'syncing players...' }));
    
    try {
      // Step 1: Sync Players
      const playersResponse = await fetch(`${getApiBaseUrl()}/api/sync/players?tournament=${tournament.id}`);
      const playersData = await playersResponse.json();
      
      if (!playersData.success) {
        throw new Error(`Players: ${playersData.error}`);
      }
      
      setSyncStatus(prev => ({ ...prev, all: 'syncing live scores...' }));
      
      // Step 2: Sync Live Scores
      const scoresResponse = await fetch(`${getApiBaseUrl()}/api/sync/live-scores`);
      const scoresData = await scoresResponse.json();
      
      if (!scoresData.success) {
        throw new Error(`Scores: ${scoresData.error}`);
      }
      
      const playerCount = playersData.results[0]?.saved || 0;
      const matchCount = scoresData.results?.length || 0;
      
      setSyncStatus(prev => ({ 
        ...prev, 
        all: `✅ Complete! ${playerCount} players + ${matchCount} matches synced`,
        players: `✅ ${playerCount} players`,
        scores: `✅ ${matchCount} matches`
      }));
    } catch (error) {
      setSyncStatus(prev => ({ ...prev, all: `❌ Error: ${error.message}` }));
    } finally {
      setIsSyncing(prev => ({ ...prev, all: false }));
    }
  };
  
  const handleAddPlayer = () => {
    if (!newPlayerForm.name || !newPlayerForm.team) return;
    const newPlayer = {
      id: `p${Date.now()}`,
      name: newPlayerForm.name,
      team: newPlayerForm.team,
      position: newPlayerForm.position,
      totalPoints: 0,
      matchesPlayed: 0,
    };
    setPlayers([...players, newPlayer]);
    setNewPlayerForm({ name: '', team: '', position: 'batter' });
  };
  
  const handleRemovePlayer = (playerId) => {
    if (window.confirm('Remove this player from the pool?')) {
      setPlayers(players.filter(p => p.id !== playerId));
    }
  };
  
  // Draft Control Functions
  const handleStartDraft = () => {
    if (window.confirm('Open draft registration? Users will be able to create teams and join.')) {
      setDraftStatus('open');
      onStartDraft && onStartDraft();
    }
  };
  
  const handleBeginDraft = async () => {
    // Check if there are at least 2 teams
    const tournamentTeams = (allTeams || []).filter(t => t.tournamentId === tournament.id);
    if (tournamentTeams.length < 2) {
      alert('Need at least 2 teams to start the draft!');
      return;
    }
    
    if (window.confirm(`Begin the snake draft with ${tournamentTeams.length} teams? Make sure all teams are registered.`)) {
      // Generate draft order
      const shuffledTeams = [...tournamentTeams].sort(() => Math.random() - 0.5);
      const draftOrder = [];
      const totalRounds = 12; // TOTAL_ROSTER_SIZE
      
      for (let round = 1; round <= totalRounds; round++) {
        const roundTeams = round % 2 === 1 ? [...shuffledTeams] : [...shuffledTeams].reverse();
        roundTeams.forEach((t, idx) => {
          draftOrder.push({
            pick: draftOrder.length + 1,
            round,
            teamId: t.id,
            teamName: t.name
          });
        });
      }
      
      console.log('📋 Generated draft order:', draftOrder.length, 'total picks for', tournamentTeams.length, 'teams');
      
      // Save draft order to league
      try {
        const leaguesResponse = await leaguesAPI.getAll(tournament.id);
        if (leaguesResponse.leagues && leaguesResponse.leagues.length > 0) {
          const league = leaguesResponse.leagues[0];
          await leaguesAPI.update({
            id: league.id,
            draftOrder: draftOrder,
            draftStatus: 'in_progress',
            currentPick: 0  // IMPORTANT: Start at pick 0
          });
          console.log('✅ Draft started with order:', draftOrder.length, 'picks, currentPick: 0');
        }
      } catch (err) {
        console.error('Failed to save draft order:', err);
        alert('Failed to start draft. Please try again.');
        return;
      }
      
      setDraftStatus('in_progress');
    }
  };
  
  const handleCompleteDraft = () => {
    if (window.confirm('Mark draft as completed?')) {
      setDraftStatus('completed');
    }
  };
  
  const handleResetDraft = async () => {
    if (window.confirm('⚠️ RESET DRAFT?\n\nThis will:\n- Set draft status back to "pending"\n- Keep all registered teams\n- Clear all draft picks\n\nContinue?')) {
      try {
        const leaguesResponse = await leaguesAPI.getAll(tournament.id);
        if (leaguesResponse.leagues && leaguesResponse.leagues.length > 0) {
          const league = leaguesResponse.leagues[0];
          // Reset draft in database
          await draftAPI.resetDraft(league.id);
          console.log('✅ Draft reset successfully');
        }
      } catch (err) {
        console.error('Failed to reset draft:', err);
      }
      setDraftStatus('pending');
    }
  };
  
  const handleDeleteDraft = () => {
    if (window.confirm('⚠️ DELETE DRAFT & ALL TEAMS?\n\nThis will:\n- Remove ALL registered teams\n- Reset draft to "pending"\n- Clear all draft picks\n\nThis cannot be undone! Continue?')) {
      setDraftStatus('pending');
      // Clear all teams
      if (onDeleteTeam) {
        allTeams?.forEach(team => onDeleteTeam(team.id));
      }
    }
  };
  
  // Team Management Functions
  const handleEditTeam = (team) => {
    setEditingTeam(team.id);
    setEditTeamForm({
      name: team.name,
      ownerName: team.ownerName,
      totalPoints: team.totalPoints || 0
    });
  };
  
  const handleSaveTeam = (teamId) => {
    if (onUpdateTeam) {
      onUpdateTeam(teamId, editTeamForm);
    }
    setEditingTeam(null);
  };
  
  const handleDeleteTeam = (teamId, teamName) => {
    if (window.confirm(`Delete team "${teamName}"?\n\nThis will remove the team and all their roster picks.`)) {
      if (onDeleteTeam) {
        onDeleteTeam(teamId);
      }
    }
  };
  
  const handleDeleteUser = (userId, userEmail) => {
    if (window.confirm(`Delete user "${userEmail}"?\n\nThis will remove the user account. If they have a team, delete the team first.`)) {
      if (onDeleteUser) {
        onDeleteUser(userId);
      }
    }
  };
  
  return (
    <div className="admin-panel">
      <header className="admin-header">
        <div className="header-left">
          <div className="admin-badge">👑 ADMIN</div>
          <div>
            <div className="tournament-dropdown-wrapper">
              <select 
                className="tournament-dropdown admin-dropdown"
                value={tournament.id}
                onChange={(e) => onSwitchTournament && onSwitchTournament(e.target.value)}
              >
                {Object.values(TOURNAMENTS).map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name} {t.isTest ? '(Test)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <p>League Administration</p>
          </div>
        </div>
        <div className="header-right">
          <button className="btn-icon" onClick={onBackToTournaments} title="All Tournaments">🏆</button>
          <button className="btn-logout" onClick={onLogout} title="Logout">
            <span className="logout-icon">🚪</span>
            <span className="logout-text">Logout</span>
          </button>
        </div>
      </header>
      
      <nav className="admin-nav">
        {['overview', 'sync', 'players', 'teams', 'users', 'draft', 'settings'].map(tab => (
          <button 
            key={tab}
            className={`nav-tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'overview' && '📊 '}
            {tab === 'sync' && '🔄 '}
            {tab === 'players' && '👥 '}
            {tab === 'teams' && '🏏 '}
            {tab === 'users' && '👤 '}
            {tab === 'draft' && '📝 '}
            {tab === 'settings' && '⚙️ '}
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </nav>
      
      <main className="admin-content">
        {activeTab === 'overview' && (
          <div className="admin-overview">
            <div className="stats-grid">
              <div className="stat-card">
                <span className="stat-icon">👥</span>
                <span className="stat-value">{players.length}</span>
                <span className="stat-label">Total Players</span>
              </div>
              <div className="stat-card">
                <span className="stat-icon">🏏</span>
                <span className="stat-value">{allTeams?.length || 0}</span>
                <span className="stat-label">Fantasy Teams</span>
              </div>
              <div className="stat-card">
                <span className="stat-icon">📝</span>
                <span className="stat-value">{draftStatus.toUpperCase()}</span>
                <span className="stat-label">Draft Status</span>
              </div>
              <div className="stat-card">
                <span className="stat-icon">📅</span>
                <span className="stat-value">{tournament.matches?.length || 0}</span>
                <span className="stat-label">Matches</span>
              </div>
            </div>
            
            {/* Tournament Dates Section */}
            <div className="tournament-dates-section" style={{ 
              background: 'var(--bg-card)', 
              borderRadius: '12px', 
              padding: '20px', 
              marginTop: '20px' 
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ margin: 0 }}>📅 Tournament Dates</h3>
                {!editingTournament ? (
                  <button 
                    className="btn-secondary btn-small"
                    onClick={() => {
                      setTournamentForm({
                        startDate: tournament?.startDate || '',
                        endDate: tournament?.endDate || '',
                        matches: tournament?.matches || []
                      });
                      setEditingTournament(true);
                    }}
                  >
                    ✏️ Edit
                  </button>
                ) : (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button 
                      className="btn-primary btn-small"
                      disabled={savingTournament}
                      onClick={async () => {
                        setSavingTournament(true);
                        try {
                          await tournamentsAPI.update({
                            id: tournament.id,
                            startDate: tournamentForm.startDate,
                            endDate: tournamentForm.endDate,
                            matches: tournamentForm.matches
                          });
                          // Update local tournament state
                          if (onUpdateTournament) {
                            onUpdateTournament({
                              ...tournament,
                              startDate: tournamentForm.startDate,
                              endDate: tournamentForm.endDate,
                              matches: tournamentForm.matches
                            });
                          }
                          setEditingTournament(false);
                          alert('Tournament dates saved!');
                        } catch (err) {
                          console.error('Failed to save tournament:', err);
                          alert('Failed to save tournament dates. Check console for details.');
                        } finally {
                          setSavingTournament(false);
                        }
                      }}
                    >
                      {savingTournament ? 'Saving...' : '💾 Save'}
                    </button>
                    <button 
                      className="btn-secondary btn-small"
                      onClick={() => setEditingTournament(false)}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', color: 'var(--text-muted)', fontSize: '0.875rem' }}>Start Date</label>
                  {editingTournament ? (
                    <input 
                      type="date" 
                      value={tournamentForm.startDate}
                      onChange={(e) => setTournamentForm({ ...tournamentForm, startDate: e.target.value })}
                      style={{ width: '100%', padding: '8px', borderRadius: '8px', background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                    />
                  ) : (
                    <div style={{ padding: '8px', background: 'var(--bg-input)', borderRadius: '8px' }}>
                      {tournament.startDate || 'Not set'}
                    </div>
                  )}
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', color: 'var(--text-muted)', fontSize: '0.875rem' }}>End Date</label>
                  {editingTournament ? (
                    <input 
                      type="date" 
                      value={tournamentForm.endDate}
                      onChange={(e) => setTournamentForm({ ...tournamentForm, endDate: e.target.value })}
                      style={{ width: '100%', padding: '8px', borderRadius: '8px', background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                    />
                  ) : (
                    <div style={{ padding: '8px', background: 'var(--bg-input)', borderRadius: '8px' }}>
                      {tournament.endDate || 'Not set'}
                    </div>
                  )}
                </div>
              </div>
              
              {/* Match Dates */}
              {editingTournament && (
                <div style={{ marginTop: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <label style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Match Schedule</label>
                    <button 
                      className="btn-secondary btn-small"
                      onClick={() => {
                        setTournamentForm({
                          ...tournamentForm,
                          matches: [
                            ...tournamentForm.matches,
                            {
                              id: `match_${Date.now()}`,
                              date: tournamentForm.startDate || new Date().toISOString().split('T')[0],
                              teams: tournament.teams?.slice(0, 2) || ['TBD', 'TBD'],
                              venue: 'TBD',
                              startTime: '19:00',
                              status: 'upcoming'
                            }
                          ]
                        });
                      }}
                    >
                      + Add Match
                    </button>
                  </div>
                  <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                    {(tournamentForm.matches || []).map((match, idx) => (
                      <div key={match.id || idx} style={{ 
                        display: 'grid', 
                        gridTemplateColumns: '1fr 1fr 1fr auto', 
                        gap: '8px', 
                        marginBottom: '8px',
                        padding: '8px',
                        background: 'var(--bg-input)',
                        borderRadius: '8px'
                      }}>
                        <input 
                          type="date" 
                          value={match.date}
                          onChange={(e) => {
                            const newMatches = [...tournamentForm.matches];
                            newMatches[idx] = { ...match, date: e.target.value };
                            setTournamentForm({ ...tournamentForm, matches: newMatches });
                          }}
                          style={{ padding: '6px', borderRadius: '4px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                        />
                        <input 
                          type="text" 
                          value={Array.isArray(match.teams) ? match.teams.join(' vs ') : match.teams}
                          placeholder="IND vs NZ"
                          onChange={(e) => {
                            const newMatches = [...tournamentForm.matches];
                            newMatches[idx] = { ...match, teams: e.target.value.split(' vs ').map(t => t.trim()) };
                            setTournamentForm({ ...tournamentForm, matches: newMatches });
                          }}
                          style={{ padding: '6px', borderRadius: '4px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                        />
                        <select
                          value={match.status}
                          onChange={(e) => {
                            const newMatches = [...tournamentForm.matches];
                            newMatches[idx] = { ...match, status: e.target.value };
                            setTournamentForm({ ...tournamentForm, matches: newMatches });
                          }}
                          style={{ padding: '6px', borderRadius: '4px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                        >
                          <option value="upcoming">Upcoming</option>
                          <option value="live">Live</option>
                          <option value="completed">Completed</option>
                        </select>
                        <button 
                          onClick={() => {
                            const newMatches = tournamentForm.matches.filter((_, i) => i !== idx);
                            setTournamentForm({ ...tournamentForm, matches: newMatches });
                          }}
                          style={{ padding: '6px 10px', background: '#ef4444', border: 'none', borderRadius: '4px', color: 'white', cursor: 'pointer' }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            
            <div className="quick-actions">
              <h3>Quick Actions</h3>
              <div className="action-buttons">
                {draftStatus === 'pending' && (
                  <button className="btn-primary" onClick={handleStartDraft}>
                    🚀 Open Draft Registration
                  </button>
                )}
                {draftStatus === 'open' && (
                  <button className="btn-primary" onClick={handleBeginDraft}>
                    ▶️ Start Draft
                  </button>
                )}
                {draftStatus === 'in_progress' && (
                  <button className="btn-secondary" onClick={handleCompleteDraft}>
                    ✅ Complete Draft
                  </button>
                )}
                <button className="btn-secondary" onClick={() => setActiveTab('sync')}>
                  🔄 Sync Data
                </button>
                <button className="btn-secondary" onClick={() => setActiveTab('players')}>
                  ➕ Manage Players
                </button>
              </div>
            </div>
            
            {/* Database Status Notice */}
            <div className="admin-notice" style={{ 
              background: 'rgba(76, 175, 80, 0.1)', 
              border: '1px solid rgba(76, 175, 80, 0.3)', 
              borderRadius: '8px', 
              padding: '16px', 
              marginTop: '20px' 
            }}>
              <h4 style={{ color: '#4caf50', marginTop: 0 }}>✅ Database Connected</h4>
              <p style={{ margin: '8px 0', color: '#ccc', fontSize: '14px' }}>
                This app is connected to <strong>Turso Database</strong> for persistent storage.
              </p>
              <ul style={{ margin: '8px 0', paddingLeft: '20px', color: '#aaa', fontSize: '13px' }}>
                <li>Teams, draft status, and user data are <strong>saved to database</strong></li>
                <li>Data persists across <strong>all devices and browsers</strong></li>
                <li>Changes sync automatically</li>
              </ul>
            </div>
          </div>
        )}
        
        {activeTab === 'sync' && (
          <div className="admin-sync">
            <h3>🔄 Data Management</h3>
            <p className="sync-info">
              Player data is managed manually. Use "Clear Players" to reset, then add players via the Players tab or API.
            </p>
            
            <div className="sync-controls">
              <div className="sync-card">
                <h4>👥 Player Data Status</h4>
                <p>Check current player count for {tournament.name}</p>
                <button 
                  className="btn-primary btn-large"
                  onClick={handleSyncPlayers}
                  disabled={isSyncing.players}
                >
                  {isSyncing.players ? '⏳ Checking...' : '📊 Check Player Status'}
                </button>
                {syncStatus.players && (
                  <div className={`sync-result ${syncStatus.players.startsWith('✅') ? 'success' : syncStatus.players.startsWith('❌') ? 'error' : ''}`}>
                    {syncStatus.players}
                  </div>
                )}
              </div>
              
              <div className="sync-card">
                <h4>🗑️ Clear Player Data</h4>
                <p>Remove all players for {tournament.name} (use before re-importing)</p>
                <button 
                  className="btn-danger btn-large"
                  onClick={handleClearPlayers}
                  disabled={isSyncing.clearing}
                >
                  {isSyncing.clearing ? '⏳ Clearing...' : '🗑️ Clear All Players'}
                </button>
                {syncStatus.clearing && (
                  <div className={`sync-result ${syncStatus.clearing.startsWith('✅') ? 'success' : 'error'}`}>
                    {syncStatus.clearing}
                  </div>
                )}
              </div>
              
              <div className="sync-card">
                <h4>🔄 Reset All Points</h4>
                <p>Clear all fantasy points AND browser cache (use if points are wrong or doubled)</p>
                <button 
                  className="btn-danger btn-large"
                  onClick={async () => {
                    if (!confirm('Reset ALL fantasy points for this tournament?\\n\\nThis will:\\n- Clear all player stats from database\\n- Reset all player points to 0\\n- Reset all team points to 0\\n- Clear browser cache\\n- Reload the page\\n\\nYou will need to re-apply match scores.')) {
                      return;
                    }
                    setSyncStatus(prev => ({ ...prev, clearing: '⏳ Resetting points...' }));
                    try {
                      const response = await fetch(`${getApiBaseUrl()}/api/admin?action=reset-points&tournamentId=${tournament.id}`);
                      const data = await response.json();
                      if (data.success) {
                        // Clear localStorage cache
                        localStorage.removeItem(`t20fantasy_players_${tournament.id}`);
                        localStorage.removeItem(`t20fantasy_dropped_${tournament.id}`);
                        
                        // Clear all player-related localStorage
                        Object.keys(localStorage).forEach(key => {
                          if (key.startsWith('t20fantasy_')) {
                            localStorage.removeItem(key);
                          }
                        });
                        
                        setSyncStatus(prev => ({ ...prev, clearing: '✅ Reset complete! Reloading page...' }));
                        
                        // Reload page to clear React state cache
                        setTimeout(() => window.location.reload(), 1000);
                      } else {
                        setSyncStatus(prev => ({ ...prev, clearing: `❌ Error: ${data.error}` }));
                      }
                    } catch (error) {
                      setSyncStatus(prev => ({ ...prev, clearing: `❌ Error: ${error.message}` }));
                    }
                  }}
                >
                  🔄 Reset All Points & Clear Cache
                </button>
              </div>
              
              <div className="sync-card">
                <h4>📊 Recalculate Team Totals</h4>
                <p>Recalculate team points from roster history (use after applying scores)</p>
                <button 
                  className="btn-primary btn-large"
                  onClick={async () => {
                    setSyncStatus(prev => ({ ...prev, clearing: '⏳ Recalculating team totals...' }));
                    try {
                      const response = await fetch(`${getApiBaseUrl()}/api/admin?action=recalc-points&tournamentId=${tournament.id}`);
                      const data = await response.json();
                      if (data.success) {
                        const summary = data.teams.map(t => `${t.teamName}: ${t.totalPoints} pts`).join(', ');
                        setSyncStatus(prev => ({ ...prev, clearing: `✅ Recalculated! ${summary}` }));
                        // Refresh data
                        await refetchPlayers();
                        onRefreshPlayers && await onRefreshPlayers();
                      } else {
                        setSyncStatus(prev => ({ ...prev, clearing: `❌ Error: ${data.error}` }));
                      }
                    } catch (error) {
                      setSyncStatus(prev => ({ ...prev, clearing: `❌ Error: ${error.message}` }));
                    }
                  }}
                >
                  📊 Recalculate Team Totals
                </button>
              </div>
              
              <div className="sync-card">
                <h4>📊 Check Live Matches</h4>
                <p>Check for live T20 matches via Cricket API</p>
                <button 
                  className="btn-primary btn-large"
                  onClick={handleSyncLiveScores}
                  disabled={isSyncing.scores}
                >
                  {isSyncing.scores ? '⏳ Checking...' : '🔍 Check Live Matches'}
                </button>
                {syncStatus.scores && (
                  <div className={`sync-result ${syncStatus.scores.startsWith('✅') ? 'success' : syncStatus.scores.startsWith('❌') ? 'error' : ''}`}>
                    {syncStatus.scores}
                  </div>
                )}
              </div>
            </div>
            
            {/* Match-by-Match Sync */}
            <div className="match-sync-section" style={{ marginTop: '30px' }}>
              <h3>🏏 Match Scoring Sync</h3>
              
              {/* Tournament-specific guidance */}
              {tournament.id === 'ipl_2026' ? (
                <div style={{ 
                  padding: '15px', 
                  marginBottom: '15px', 
                  background: 'rgba(34, 197, 94, 0.1)', 
                  borderRadius: '8px',
                  border: '1px solid rgba(34, 197, 94, 0.3)'
                }}>
                  <strong>✅ IPL 2026 - Full API Support</strong>
                  <p style={{ margin: '8px 0 0 0', fontSize: '0.875rem' }}>
                    IPL matches have <code>fantasyEnabled: true</code>. Use "Sync Scorecard" to automatically fetch player stats.
                  </p>
                  <div style={{ 
                    marginTop: '10px', 
                    padding: '10px', 
                    background: 'rgba(251, 191, 36, 0.2)', 
                    borderRadius: '4px',
                    fontSize: '0.8rem',
                    border: '1px solid rgba(251, 191, 36, 0.4)'
                  }}>
                    ⚠️ <strong>REMINDER:</strong> Test the sync flow once IPL 2026 matches are available in the Cricket API.
                    Verify the scorecard parsing works correctly with real data.
                  </div>
                </div>
              ) : (
                <div style={{ 
                  padding: '15px', 
                  marginBottom: '15px', 
                  background: 'rgba(251, 191, 36, 0.1)', 
                  borderRadius: '8px',
                  border: '1px solid rgba(251, 191, 36, 0.3)'
                }}>
                  <strong>📝 {tournament.name} - Manual Entry Required</strong>
                  <p style={{ margin: '8px 0 0 0', fontSize: '0.875rem' }}>
                    This tournament does not have <code>fantasyEnabled</code> in the Cricket API.
                    Use <strong>Manual Entry</strong> below to add player stats.
                  </p>
                </div>
              )}
              
              <div style={{ marginBottom: '20px' }}>
                <button 
                  className="btn-secondary"
                  onClick={async () => {
                    setSyncStatus(prev => ({ ...prev, match: '🔍 Fetching matches from Cricket API...' }));
                    try {
                      const result = await liveSyncAPI.getMatchesForTournament(tournament.id);
                      if (result.success) {
                        // Store API matches info for later use
                        setApiMatchesInfo(result);
                        
                        // Count fantasy-enabled matches
                        const fantasyCount = (result.matches || []).filter(m => m.fantasyEnabled).length;
                        const totalCount = result.matchCount || 0;
                        
                        // Sync matches with tournament data
                        const apiMatches = result.matches || [];
                        const existingMatches = tournament.matches || [];
                        
                        // Helper to extract match number from name (e.g., "1st T20I" -> 1, "2nd T20I" -> 2)
                        const getMatchNumber = (name) => {
                          const match = name.match(/(\d+)(?:st|nd|rd|th)\s*T20I?/i);
                          return match ? parseInt(match[1]) : null;
                        };
                        
                        // Helper to extract date from API match
                        const getMatchDate = (apiMatch) => {
                          if (apiMatch.date) {
                            // Handle various date formats
                            const dateStr = apiMatch.date.split('T')[0];
                            return dateStr;
                          }
                          return null;
                        };
                        
                        // Build updated matches array
                        const updatedMatches = [];
                        const processedApiIds = new Set();
                        
                        // First, update existing matches with API data
                        for (const existing of existingMatches) {
                          const existingNum = getMatchNumber(existing.name);
                          
                          // Find matching API match
                          const apiMatch = apiMatches.find(m => {
                            const apiNum = getMatchNumber(m.name);
                            return apiNum === existingNum;
                          });
                          
                          if (apiMatch) {
                            processedApiIds.add(apiMatch.cricketApiId);
                            const newDate = getMatchDate(apiMatch);
                            const newStatus = apiMatch.matchEnded ? 'completed' : 
                                             apiMatch.matchStarted ? 'live' : 'upcoming';
                            
                            updatedMatches.push({
                              ...existing,
                              date: newDate || existing.date,
                              status: newStatus,
                              cricketApiId: apiMatch.cricketApiId,
                              fantasyEnabled: apiMatch.fantasyEnabled || false
                            });
                          } else {
                            // Keep existing match as-is if no API match found
                            updatedMatches.push(existing);
                          }
                        }
                        
                        // Add any new matches from API that don't exist
                        for (const apiMatch of apiMatches) {
                          if (!processedApiIds.has(apiMatch.cricketApiId)) {
                            const matchNum = getMatchNumber(apiMatch.name);
                            const existsAlready = existingMatches.some(e => getMatchNumber(e.name) === matchNum);
                            
                            if (!existsAlready && matchNum) {
                              const ordinal = matchNum === 1 ? '1st' : matchNum === 2 ? '2nd' : matchNum === 3 ? '3rd' : `${matchNum}th`;
                              updatedMatches.push({
                                id: `match_${matchNum}`,
                                name: `${ordinal} T20I`,
                                date: getMatchDate(apiMatch) || '',
                                teams: apiMatch.teams || 'TBD vs TBD',
                                status: apiMatch.matchEnded ? 'completed' : apiMatch.matchStarted ? 'live' : 'upcoming',
                                cricketApiId: apiMatch.cricketApiId,
                                fantasyEnabled: apiMatch.fantasyEnabled || false
                              });
                            }
                          }
                        }
                        
                        // Sort by match number
                        updatedMatches.sort((a, b) => {
                          const numA = getMatchNumber(a.name) || 999;
                          const numB = getMatchNumber(b.name) || 999;
                          return numA - numB;
                        });
                        
                        // Check if anything changed
                        const hasChanges = JSON.stringify(updatedMatches) !== JSON.stringify(existingMatches);
                        
                        if (hasChanges) {
                          // Update tournament with new matches
                          const updatedTournament = {
                            ...tournament,
                            matches: updatedMatches
                          };
                          
                          // Save to database
                          await onUpdateTournament(updatedTournament);
                          
                          let message = `✅ Synced ${totalCount} matches from "${result.seriesName}"`;
                          const addedCount = updatedMatches.length - existingMatches.length;
                          if (addedCount > 0) {
                            message += ` (${addedCount} new added)`;
                          }
                          if (fantasyCount === 0 && totalCount > 0) {
                            message += ` - basic scorecard only`;
                          }
                          setSyncStatus(prev => ({ ...prev, match: message }));
                        } else {
                          let message = `✅ Found ${totalCount} matches in "${result.seriesName}" - already up to date`;
                          if (fantasyCount === 0 && totalCount > 0) {
                            message += ` (basic scorecard only - no fantasy data)`;
                          }
                          setSyncStatus(prev => ({ ...prev, match: message }));
                        }
                        
                        console.log('Cricket API Matches:', result.matches);
                        console.log('Updated Tournament Matches:', updatedMatches);
                      } else {
                        setApiMatchesInfo(null);
                        setSyncStatus(prev => ({ ...prev, match: `❌ ${result.error}` }));
                      }
                    } catch (err) {
                      setApiMatchesInfo(null);
                      setSyncStatus(prev => ({ ...prev, match: `❌ ${err.message}` }));
                    }
                  }}
                >
                  🔄 Fetch & Sync Matches
                </button>
              </div>
              
              {/* API Matches Info */}
              {apiMatchesInfo && apiMatchesInfo.matches && apiMatchesInfo.matches.length > 0 && (
                <div style={{ 
                  marginBottom: '20px', 
                  padding: '15px', 
                  background: 'var(--bg-card)', 
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)'
                }}>
                  <h5 style={{ margin: '0 0 10px 0' }}>📡 Available from Cricket API:</h5>
                  <div style={{ display: 'grid', gap: '8px', fontSize: '0.875rem' }}>
                    {apiMatchesInfo.matches.slice(0, 8).map((m, i) => (
                      <div key={i} style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '6px 10px',
                        background: 'var(--bg-primary)',
                        borderRadius: '4px'
                      }}>
                        <div>
                          <span>{m.name}</span>
                          {m.date && (
                            <span style={{ marginLeft: '10px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              {m.date.split('T')[0]}
                            </span>
                          )}
                        </div>
                        <span style={{ 
                          fontSize: '0.75rem',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: m.fantasyEnabled ? '#22c55e' : m.matchEnded ? '#3b82f6' : '#f59e0b',
                          color: 'white'
                        }}>
                          {m.fantasyEnabled ? '✓ Fantasy' : m.matchEnded ? 'Scorecard' : 'Upcoming'}
                        </span>
                      </div>
                    ))}
                  </div>
                  {apiMatchesInfo.matches.length > 8 && (
                    <div style={{ marginTop: '8px', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                      + {apiMatchesInfo.matches.length - 8} more matches
                    </div>
                  )}
                </div>
              )}
              
              {syncStatus.match && (
                <div className={`sync-result ${syncStatus.match.startsWith('✅') ? 'success' : syncStatus.match.startsWith('❌') ? 'error' : ''}`} style={{ marginBottom: '15px' }}>
                  {syncStatus.match}
                </div>
              )}
              
              {/* Preview Panel - Shows calculated points before applying */}
              {pendingSyncPreview && (
                <div className="preview-panel" style={{ 
                  marginBottom: '20px',
                  padding: '20px',
                  background: 'var(--bg-card)',
                  borderRadius: '12px',
                  border: '2px solid #3b82f6'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                    <h4 style={{ margin: 0 }}>📋 Preview: {pendingSyncPreview.matchInfo?.name || pendingSyncPreview.match?.name}</h4>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button 
                        className="btn-primary"
                        onClick={handleApplyPoints}
                        disabled={isSyncing.match}
                      >
                        {isSyncing.match ? '⏳ Applying...' : '✅ Apply Points'}
                      </button>
                      <button 
                        className="btn-secondary"
                        onClick={handleCancelPreview}
                      >
                        ❌ Cancel
                      </button>
                    </div>
                  </div>
                  
                  <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(3, 1fr)', 
                    gap: '15px', 
                    marginBottom: '15px',
                    padding: '10px',
                    background: 'var(--bg-primary)',
                    borderRadius: '8px'
                  }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#3b82f6' }}>{pendingSyncPreview.totalPlayers}</div>
                      <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Players</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#22c55e' }}>{pendingSyncPreview.totalPoints}</div>
                      <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Total Points</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#f59e0b' }}>{Math.round(pendingSyncPreview.totalPoints / pendingSyncPreview.totalPlayers)}</div>
                      <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Avg Points</div>
                    </div>
                  </div>
                  
                  <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                      <thead>
                        <tr style={{ background: 'var(--bg-primary)', position: 'sticky', top: 0 }}>
                          <th style={{ padding: '8px', textAlign: 'left' }}>Player</th>
                          <th style={{ padding: '8px', textAlign: 'center' }}>Runs</th>
                          <th style={{ padding: '8px', textAlign: 'center' }}>Balls</th>
                          <th style={{ padding: '8px', textAlign: 'center' }}>4s/6s</th>
                          <th style={{ padding: '8px', textAlign: 'center' }}>Wkts</th>
                          <th style={{ padding: '8px', textAlign: 'center' }}>Overs</th>
                          <th style={{ padding: '8px', textAlign: 'center' }}>Econ</th>
                          <th style={{ padding: '8px', textAlign: 'right', fontWeight: '700' }}>Points</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pendingSyncPreview.playerStats.map((player, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                            <td style={{ padding: '8px' }}>
                              <div style={{ fontWeight: '500' }}>{player.playerName}</div>
                              {player.pointsBreakdown && player.pointsBreakdown.length > 0 && (
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                  {player.pointsBreakdown.map((b, i) => (
                                    <span key={i}>{i > 0 ? ' • ' : ''}{b.label} ({b.points > 0 ? '+' : ''}{b.points})</span>
                                  ))}
                                </div>
                              )}
                            </td>
                            <td style={{ padding: '8px', textAlign: 'center' }}>{player.runs ?? '-'}</td>
                            <td style={{ padding: '8px', textAlign: 'center' }}>{player.ballsFaced ?? '-'}</td>
                            <td style={{ padding: '8px', textAlign: 'center' }}>{player.fours ?? 0}/{player.sixes ?? 0}</td>
                            <td style={{ padding: '8px', textAlign: 'center' }}>{player.wickets ?? '-'}</td>
                            <td style={{ padding: '8px', textAlign: 'center' }}>{player.oversBowled ?? '-'}</td>
                            <td style={{ padding: '8px', textAlign: 'center' }}>
                              {player.oversBowled > 0 ? (player.runsConceded / player.oversBowled).toFixed(2) : '-'}
                            </td>
                            <td style={{ 
                              padding: '8px', 
                              textAlign: 'right', 
                              fontWeight: '700',
                              color: player.fantasyPoints >= 50 ? '#22c55e' : player.fantasyPoints >= 25 ? '#3b82f6' : 'inherit'
                            }}>
                              {player.fantasyPoints}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              
              <div className="match-sync-list" style={{ display: 'grid', gap: '12px' }}>
                {(tournament.matches || []).map(match => (
                  <div 
                    key={match.id} 
                    className="match-sync-row" 
                    style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'space-between',
                      padding: '12px 16px',
                      background: 'var(--bg-card)',
                      borderRadius: '8px',
                      border: match.status === 'live' ? '2px solid #ef4444' : match.status === 'completed' ? '2px solid #22c55e' : '1px solid var(--border-color)'
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: '600' }}>{match.name || `${Array.isArray(match.teams) ? match.teams.join(' vs ') : match.teams}`}</div>
                      <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                        {match.date} • 
                        <span style={{ 
                          marginLeft: '8px',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          background: match.status === 'live' ? '#ef4444' : match.status === 'completed' ? '#22c55e' : '#f59e0b',
                          color: 'white'
                        }}>
                          {match.status?.toUpperCase() || 'UPCOMING'}
                        </span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      {match.status !== 'completed' && tournament.id === 'ipl_2026' && (
                        <>
                          <button 
                            className="btn-primary btn-small"
                            onClick={() => handleSyncMatch(match)}
                            disabled={isSyncing.match === match.id}
                            title="Sync real scorecard from CricketData.org API"
                          >
                            {isSyncing.match === match.id ? '⏳ Syncing...' : '📡 Sync Scorecard'}
                          </button>
                          {match.status === 'live' && (
                            <button 
                              className="btn-small"
                              style={{ background: '#22c55e', color: 'white' }}
                              onClick={() => handleCompleteMatch(match)}
                              disabled={isSyncing.match === match.id}
                              title="Mark match as completed"
                            >
                              ✓ Complete
                            </button>
                          )}
                        </>
                      )}
                      {match.status !== 'completed' && tournament.id !== 'ipl_2026' && (
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          Use Manual Entry ↓
                        </span>
                      )}
                      {match.status === 'completed' && (
                        <span style={{ color: '#22c55e', fontWeight: '600' }}>✓ Completed</span>
                      )}
                    </div>
                  </div>
                ))}
                
                {(!tournament.matches || tournament.matches.length === 0) && (
                  <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>
                    No matches defined. Add matches in the Overview tab.
                  </div>
                )}
              </div>
              
              {/* Manual Entry Section */}
              <div style={{ marginTop: '20px' }}>
                {tournament.id === 'ipl_2026' ? (
                  <button 
                    className="btn-secondary btn-small"
                    onClick={() => setShowManualEntry(!showManualEntry)}
                    style={{ marginBottom: '10px' }}
                  >
                    {showManualEntry ? '➖ Hide Manual Entry' : '➕ Manual Entry (backup option)'}
                  </button>
                ) : (
                  <h4 style={{ margin: '0 0 15px 0', color: 'var(--accent-color)' }}>📝 Manual Stats Entry</h4>
                )}
                
                {(showManualEntry || tournament.id !== 'ipl_2026') && (
                  <div style={{ 
                    padding: '20px', 
                    background: 'var(--bg-card)', 
                    borderRadius: '8px',
                    border: tournament.id !== 'ipl_2026' ? '2px solid var(--accent-color)' : '1px solid var(--border-color)'
                  }}>
                    {tournament.id === 'ipl_2026' && <h4 style={{ margin: '0 0 15px 0' }}>📝 Manual Stats Entry</h4>}
                    <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '15px' }}>
                      {tournament.id === 'ipl_2026' 
                        ? 'Use this as a backup when API sync fails.'
                        : 'Enter player stats manually for each match. This is the primary method for this tournament.'}
                    </p>
                    
                    <div style={{ marginBottom: '15px' }}>
                      <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500' }}>Select Match:</label>
                      <select 
                        value={manualEntryMatch?.id || ''}
                        onChange={(e) => {
                          const match = (tournament.matches || []).find(m => m.id === e.target.value);
                          setManualEntryMatch(match);
                        }}
                        style={{ width: '100%', padding: '8px', borderRadius: '4px' }}
                      >
                        <option value="">-- Select a match --</option>
                        {(tournament.matches || []).map(m => (
                          <option key={m.id} value={m.id}>{m.name} ({m.date})</option>
                        ))}
                      </select>
                    </div>
                    
                    {manualEntryMatch && (
                      <div>
                        <p style={{ fontSize: '0.875rem', marginBottom: '10px' }}>
                          Enter stats in JSON format for: <strong>{manualEntryMatch.name}</strong>
                        </p>
                        
                        {/* Help Section - Sample JSON */}
                        <details open style={{ marginBottom: '15px', fontSize: '0.85rem' }}>
                          <summary style={{ cursor: 'pointer', fontWeight: '600', color: 'var(--accent-color)' }}>
                            📋 Sample JSON Structure (click to copy)
                          </summary>
                          <div style={{ 
                            marginTop: '10px', 
                            padding: '12px', 
                            background: 'var(--bg-primary)', 
                            borderRadius: '6px',
                            border: '1px solid var(--border-color)',
                            position: 'relative'
                          }}>
                            <button
                              onClick={() => {
                                const sample = `[
  { "playerName": "Virat Kohli", "runs": 82, "SR": 156.25, "wickets": 0, "overs": 0, "maidens": 0, "ER": 0, "catches": 1, "runouts": 0, "stumpings": 0 },
  { "playerName": "Rohit Sharma", "runs": 45, "SR": 140.62, "wickets": 0, "overs": 0, "maidens": 0, "ER": 0, "catches": 0, "runouts": 0, "stumpings": 0 },
  { "playerName": "Jasprit Bumrah", "runs": 0, "SR": 0, "wickets": 3, "overs": 4, "maidens": 1, "ER": 5.25, "catches": 0, "runouts": 0, "stumpings": 0 },
  { "playerName": "Ravindra Jadeja", "runs": 28, "SR": 127.27, "wickets": 2, "overs": 4, "maidens": 0, "ER": 6.50, "catches": 2, "runouts": 1, "stumpings": 0 }
]`;
                                navigator.clipboard.writeText(sample);
                                alert('Sample JSON copied to clipboard!');
                              }}
                              style={{
                                position: 'absolute',
                                top: '8px',
                                right: '8px',
                                padding: '4px 8px',
                                fontSize: '0.75rem',
                                background: 'var(--accent-color)',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer'
                              }}
                            >
                              📋 Copy
                            </button>
                            <pre style={{ 
                              margin: 0, 
                              fontSize: '0.75rem', 
                              whiteSpace: 'pre-wrap',
                              fontFamily: 'monospace',
                              lineHeight: '1.5'
                            }}>{`[
  {
    "playerName": "Player Name",  // Required
    "runs": 45,                   // Batting runs
    "SR": 150.00,                 // Strike Rate (for SR bonus)
    "wickets": 0,                 // Bowling wickets
    "overs": 0,                   // Overs bowled (for ER bonus)
    "maidens": 0,                 // Maiden overs
    "ER": 0,                      // Economy Rate
    "catches": 1,                 // Catches taken
    "runouts": 0,                 // Run outs
    "stumpings": 0                // Stumpings (WK)
  }
]`}</pre>
                          </div>
                        </details>

                        {/* Scoring Rules */}
                        <details style={{ marginBottom: '15px', fontSize: '0.85rem' }}>
                          <summary style={{ cursor: 'pointer', fontWeight: '600' }}>📖 Scoring Rules Reference</summary>
                          <div style={{ 
                            marginTop: '8px', 
                            padding: '12px', 
                            background: 'var(--bg-primary)', 
                            borderRadius: '6px',
                            lineHeight: '1.8'
                          }}>
                            <div style={{ marginBottom: '10px' }}>
                              <strong>🏏 Batting:</strong><br/>
                              • +1 per run<br/>
                              • SR Bonus (min 20 runs): ≥160 (+25) | 150-159 (+20) | 140-149 (+15) | 130-139 (+10) | 120-129 (+5)
                            </div>
                            <div style={{ marginBottom: '10px' }}>
                              <strong>🎳 Bowling:</strong><br/>
                              • +25 per wicket | +20 per maiden<br/>
                              • ER Bonus (min 3 overs): ≤5 (+25) | 5.01-6 (+20) | 6.01-7 (+15) | 7.01-8 (+10)
                            </div>
                            <div>
                              <strong>🧤 Fielding:</strong><br/>
                              • +12 per catch | +20 per run out | +15 per stumping
                            </div>
                          </div>
                        </details>
                        
                        <textarea
                          id="manual-stats-json"
                          placeholder='Paste your JSON array here...'
                          style={{ 
                            width: '100%', 
                            height: '180px', 
                            padding: '12px', 
                            fontFamily: 'monospace',
                            fontSize: '0.8rem',
                            borderRadius: '6px',
                            border: '1px solid var(--border-color)',
                            background: 'var(--bg-primary)'
                          }}
                        />
                        
                        <button
                          className="btn-primary"
                          style={{ marginTop: '10px' }}
                          onClick={async () => {
                            const textarea = document.getElementById('manual-stats-json');
                            try {
                              const stats = JSON.parse(textarea.value);
                              if (!Array.isArray(stats) || stats.length === 0) {
                                alert('Please enter an array of player stats');
                                return;
                              }
                              
                              // Calculate fantasy points and breakdown for each
                              const statsWithPoints = stats.map(s => ({
                                ...s,
                                fantasyPoints: calculateFantasyPointsLocal(s),
                                pointsBreakdown: getPointsBreakdownLocal(s)
                              }));
                              
                              // Sort by points descending
                              statsWithPoints.sort((a, b) => b.fantasyPoints - a.fantasyPoints);
                              
                              // Set as pending preview
                              setPendingSyncPreview({
                                match: manualEntryMatch,
                                matchId: manualEntryMatch.id,
                                cricketApiId: 'manual-entry',
                                matchInfo: { name: manualEntryMatch.name },
                                playerStats: statsWithPoints,
                                totalPoints: statsWithPoints.reduce((sum, s) => sum + s.fantasyPoints, 0),
                                totalPlayers: statsWithPoints.length
                              });
                              
                              setSyncStatus(prev => ({ 
                                ...prev, 
                                match: `📋 Manual entry preview: ${statsWithPoints.length} players, ${statsWithPoints.reduce((sum, s) => sum + s.fantasyPoints, 0)} total points` 
                              }));
                              
                              setShowManualEntry(false);
                            } catch (e) {
                              alert('Invalid JSON format: ' + e.message);
                            }
                          }}
                        >
                          Preview Points
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            
            {/* Points Adjustment Section */}
            <div className="points-adjust-section" style={{ marginTop: '30px' }}>
              <h3>🔧 Adjust Player Points</h3>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '15px' }}>
                Made a mistake? Adjust individual player fantasy points here.
              </p>
              
              <button 
                className="btn-secondary btn-small"
                onClick={() => setShowPointsAdjust(!showPointsAdjust)}
                style={{ marginBottom: '15px' }}
              >
                {showPointsAdjust ? '➖ Hide Points Adjustment' : '➕ Adjust Player Points'}
              </button>
              
              {showPointsAdjust && (
                <div style={{ 
                  padding: '20px', 
                  background: 'var(--bg-card)', 
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)'
                }}>
                  <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500' }}>Select Player:</label>
                    <select 
                      value={pointsAdjustPlayer?.id || ''}
                      onChange={(e) => {
                        const player = players.find(p => p.id === e.target.value);
                        setPointsAdjustPlayer(player);
                        setPointsAdjustValue(player?.fantasyPoints?.toString() || '0');
                      }}
                      style={{ width: '100%', padding: '10px', borderRadius: '4px' }}
                    >
                      <option value="">-- Select a player --</option>
                      {players
                        .filter(p => (p.fantasyPoints || 0) > 0)
                        .sort((a, b) => (b.fantasyPoints || 0) - (a.fantasyPoints || 0))
                        .map(p => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.team}) - {p.fantasyPoints || 0} pts
                          </option>
                        ))}
                    </select>
                  </div>
                  
                  {pointsAdjustPlayer && (
                    <div style={{ 
                      padding: '15px', 
                      background: 'var(--bg-primary)', 
                      borderRadius: '6px',
                      marginBottom: '15px'
                    }}>
                      <div style={{ marginBottom: '10px' }}>
                        <strong>{pointsAdjustPlayer.name}</strong> ({pointsAdjustPlayer.team})
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '4px' }}>Current Points:</label>
                          <span style={{ fontSize: '1.2rem', fontWeight: '600' }}>{pointsAdjustPlayer.fantasyPoints || 0}</span>
                        </div>
                        <span style={{ fontSize: '1.5rem' }}>→</span>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '4px' }}>New Points:</label>
                          <input
                            type="number"
                            value={pointsAdjustValue}
                            onChange={(e) => setPointsAdjustValue(e.target.value)}
                            style={{ 
                              width: '100px', 
                              padding: '8px', 
                              fontSize: '1.1rem',
                              fontWeight: '600',
                              borderRadius: '4px',
                              border: '1px solid var(--border-color)'
                            }}
                          />
                        </div>
                        <button
                          className="btn-primary"
                          onClick={async () => {
                            const newPoints = parseInt(pointsAdjustValue);
                            if (isNaN(newPoints)) {
                              alert('Please enter a valid number');
                              return;
                            }
                            
                            const diff = newPoints - (pointsAdjustPlayer.fantasyPoints || 0);
                            
                            if (!confirm(`Update ${pointsAdjustPlayer.name}'s points from ${pointsAdjustPlayer.fantasyPoints || 0} to ${newPoints}? (${diff >= 0 ? '+' : ''}${diff})`)) {
                              return;
                            }
                            
                            try {
                              const response = await fetch(`/api/players?action=adjust-points`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  playerId: pointsAdjustPlayer.id,
                                  newPoints: newPoints,
                                  tournamentId: tournament.id
                                })
                              });
                              
                              const result = await response.json();
                              
                              if (result.success) {
                                // Update local state
                                setPlayers(prev => prev.map(p => 
                                  p.id === pointsAdjustPlayer.id 
                                    ? { ...p, fantasyPoints: newPoints }
                                    : p
                                ));
                                setPointsAdjustPlayer(null);
                                setPointsAdjustValue('');
                                setSyncStatus(prev => ({ 
                                  ...prev, 
                                  match: `✅ Updated ${pointsAdjustPlayer.name}'s points to ${newPoints}` 
                                }));
                              } else {
                                alert('Failed to update: ' + (result.error || 'Unknown error'));
                              }
                            } catch (err) {
                              alert('Error updating points: ' + err.message);
                            }
                          }}
                        >
                          💾 Save
                        </button>
                      </div>
                    </div>
                  )}
                  
                  {/* Quick view of all players with points */}
                  <details style={{ marginTop: '15px' }}>
                    <summary style={{ cursor: 'pointer', fontWeight: '500' }}>
                      📊 All Players with Points ({players.filter(p => (p.fantasyPoints || 0) > 0).length})
                    </summary>
                    <div style={{ 
                      marginTop: '10px', 
                      maxHeight: '300px', 
                      overflowY: 'auto',
                      fontSize: '0.85rem'
                    }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                            <th style={{ padding: '8px', textAlign: 'left' }}>Player</th>
                            <th style={{ padding: '8px', textAlign: 'left' }}>Team</th>
                            <th style={{ padding: '8px', textAlign: 'right' }}>Points</th>
                            <th style={{ padding: '8px', textAlign: 'center' }}>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {players
                            .filter(p => (p.fantasyPoints || 0) > 0)
                            .sort((a, b) => (b.fantasyPoints || 0) - (a.fantasyPoints || 0))
                            .map(p => (
                              <tr key={p.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                <td style={{ padding: '8px' }}>{p.name}</td>
                                <td style={{ padding: '8px' }}>{p.team}</td>
                                <td style={{ padding: '8px', textAlign: 'right', fontWeight: '600' }}>{p.fantasyPoints}</td>
                                <td style={{ padding: '8px', textAlign: 'center' }}>
                                  <button
                                    onClick={() => {
                                      setPointsAdjustPlayer(p);
                                      setPointsAdjustValue(p.fantasyPoints?.toString() || '0');
                                    }}
                                    style={{
                                      padding: '4px 8px',
                                      fontSize: '0.75rem',
                                      background: 'var(--accent-color)',
                                      color: 'white',
                                      border: 'none',
                                      borderRadius: '4px',
                                      cursor: 'pointer'
                                    }}
                                  >
                                    ✏️ Edit
                                  </button>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                </div>
              )}
            </div>
            
            {tournament.id === 'ipl_2026' && (
              <div className="sync-schedule" style={{ marginTop: '30px' }}>
                <h4>⏰ Automatic Sync Setup (IPL only)</h4>
                <p className="cron-info">
                  For automatic syncing during IPL, use <a href="https://cron-job.org" target="_blank" rel="noopener noreferrer">cron-job.org</a> (free) to schedule API calls.
                </p>
                <table className="schedule-table">
                  <thead>
                    <tr>
                      <th>Sync Type</th>
                      <th>Recommended Schedule</th>
                      <th>API Endpoint</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Player Roster</td>
                      <td>Daily at 7 PM MST</td>
                      <td><code>/api/sync/players</code></td>
                    </tr>
                    <tr>
                      <td>Live Scores</td>
                      <td>Every 15 min during matches</td>
                      <td><code>/api/live-sync</code></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
        
        {activeTab === 'players' && (
          <div className="admin-players">
            <div className="add-player-form">
              <h3>➕ Add New Player</h3>
              <div className="form-row">
                <input
                  type="text"
                  placeholder="Player Name"
                  value={newPlayerForm.name}
                  onChange={(e) => setNewPlayerForm({...newPlayerForm, name: e.target.value})}
                />
                <input
                  type="text"
                  placeholder="Team (e.g., IND)"
                  value={newPlayerForm.team}
                  onChange={(e) => setNewPlayerForm({...newPlayerForm, team: e.target.value.toUpperCase()})}
                />
                <select
                  value={newPlayerForm.position}
                  onChange={(e) => setNewPlayerForm({...newPlayerForm, position: e.target.value})}
                >
                  <option value="batter">Batter</option>
                  <option value="keeper">Keeper</option>
                  <option value="bowler">Bowler</option>
                  <option value="allrounder">Allrounder</option>
                </select>
                <button className="btn-primary" onClick={handleAddPlayer}>Add</button>
              </div>
            </div>
            
            <div className="player-list-admin">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3>📋 Player Pool ({players.length} players)</h3>
                <button className="btn-small btn-secondary" onClick={refetchPlayers} disabled={playersLoading}>
                  {playersLoading ? '⏳ Loading...' : '🔄 Refresh'}
                </button>
              </div>
              {playersLoading ? (
                <div className="loading-message" style={{ padding: '20px', textAlign: 'center' }}>
                  ⏳ Loading players from database...
                </div>
              ) : players.length === 0 ? (
                <div className="empty-message" style={{ padding: '20px', textAlign: 'center', color: '#888' }}>
                  No players found. Go to Sync tab to add players.
                </div>
              ) : (
                <div className="player-table">
                  <div className="table-header">
                    <span>Name</span>
                    <span>Team</span>
                    <span>Position</span>
                    <span>Total Pts</span>
                    <span>Games</span>
                    <span>Avg</span>
                    <span>Actions</span>
                  </div>
                  {players.map(player => (
                    <div key={player.id} className="table-row">
                      <span>{player.name}</span>
                      <span>{player.team}</span>
                      <span className={`position-badge ${player.position}`}>{player.position.toUpperCase()}</span>
                      <span>{player.totalPoints || 0}</span>
                      <span>{player.matchesPlayed || 0}</span>
                      <span>{player.matchesPlayed > 0 ? Math.round((player.totalPoints || 0) / player.matchesPlayed) : '-'}</span>
                      <button className="btn-small btn-danger" onClick={() => handleRemovePlayer(player.id)}>
                        🗑️
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
        
        {activeTab === 'teams' && (
          <div className="admin-teams">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h3 style={{ margin: 0 }}>🏏 Registered Fantasy Teams ({allTeams?.length || 0})</h3>
              {allTeams && allTeams.length > 0 && (
                <button 
                  className="btn-small btn-danger"
                  onClick={async () => {
                    if (confirm(`Delete ALL ${allTeams.length} teams? This cannot be undone.`)) {
                      // Delete all teams from database
                      for (const team of allTeams) {
                        try {
                          await teamsAPI.delete(team.id);
                        } catch (err) {
                          console.error('Failed to delete team:', team.id, err);
                        }
                      }
                      window.location.reload();
                    }
                  }}
                >
                  🗑️ Clear All Teams
                </button>
              )}
            </div>
            {allTeams && allTeams.length > 0 ? (
              <div className="teams-list-admin">
                {allTeams.map((t, i) => (
                  <div key={t.id || i} className="team-card-admin">
                    {editingTeam === t.id ? (
                      <div className="team-edit-form">
                        <input
                          type="text"
                          value={editTeamForm.name}
                          onChange={(e) => setEditTeamForm({...editTeamForm, name: e.target.value})}
                          placeholder="Team Name"
                        />
                        <input
                          type="text"
                          value={editTeamForm.ownerName}
                          onChange={(e) => setEditTeamForm({...editTeamForm, ownerName: e.target.value})}
                          placeholder="Owner Name"
                        />
                        <input
                          type="number"
                          value={editTeamForm.totalPoints}
                          onChange={(e) => setEditTeamForm({...editTeamForm, totalPoints: parseFloat(e.target.value) || 0})}
                          placeholder="Total Points"
                        />
                        <div className="edit-actions">
                          <button className="btn-small btn-primary" onClick={() => handleSaveTeam(t.id)}>💾 Save</button>
                          <button className="btn-small btn-secondary" onClick={() => setEditingTeam(null)}>❌ Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <span className="team-rank">#{i + 1}</span>
                        <div className="team-info">
                          <span className="team-name">{t.name}</span>
                          <span className="team-owner">{t.ownerName}</span>
                        </div>
                        <span className="team-points">{Math.round(t.totalPoints || 0)} pts</span>
                        <div className="team-actions">
                          <button className="btn-small btn-secondary" onClick={() => handleEditTeam(t)} title="Edit">✏️</button>
                          <button className="btn-small btn-danger" onClick={() => handleDeleteTeam(t.id, t.name)} title="Delete">🗑️</button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="no-data">No teams registered yet. Open the draft to allow users to create teams.</p>
            )}
          </div>
        )}
        
        {activeTab === 'users' && (
          <div className="admin-users">
            <h3>👤 Registered Users ({allUsers?.length || 0})</h3>
            
            <div className="user-filters">
              <button 
                className={`filter-btn ${userFilter === 'all' ? 'active' : ''}`}
                onClick={() => setUserFilter('all')}
              >
                All Users
              </button>
              <button 
                className={`filter-btn ${userFilter === 'with_team' ? 'active' : ''}`}
                onClick={() => setUserFilter('with_team')}
              >
                With Team
              </button>
              <button 
                className={`filter-btn ${userFilter === 'without_team' ? 'active' : ''}`}
                onClick={() => setUserFilter('without_team')}
              >
                No Team
              </button>
            </div>
            
            {allUsers && allUsers.length > 0 ? (
              <div className="users-list-admin">
                <table className="users-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Team</th>
                      <th>Tournament</th>
                      <th>Points</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allUsers
                      .filter(u => {
                        if (userFilter === 'all') return true;
                        const hasTeam = allTeams?.some(t => t.ownerId === u.id || t.ownerEmail === u.email);
                        return userFilter === 'with_team' ? hasTeam : !hasTeam;
                      })
                      .map((u, i) => {
                        const userTeam = allTeams?.find(t => t.ownerId === u.id || t.ownerEmail === u.email);
                        return (
                          <tr key={u.id || i}>
                            <td>{i + 1}</td>
                            <td>{u.name}</td>
                            <td>{u.email}</td>
                            <td>
                              {userTeam ? (
                                <span className="user-team-badge">{userTeam.name}</span>
                              ) : (
                                <span className="no-team-badge">No Team</span>
                              )}
                            </td>
                            <td>{userTeam?.tournamentId || '-'}</td>
                            <td>{userTeam ? Math.round(userTeam.totalPoints || 0) : '-'}</td>
                            <td>
                              <button 
                                className="btn-small btn-danger" 
                                onClick={() => handleDeleteUser(u.id, u.email)}
                                title="Delete User"
                              >
                                🗑️
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="no-data">No users registered yet.</p>
            )}
            
            <div className="users-summary">
              <div className="summary-card">
                <span className="summary-value">{allUsers?.length || 0}</span>
                <span className="summary-label">Total Users</span>
              </div>
              <div className="summary-card">
                <span className="summary-value">{allTeams?.length || 0}</span>
                <span className="summary-label">Teams Created</span>
              </div>
              <div className="summary-card">
                <span className="summary-value">
                  {(allUsers?.length || 0) - (allTeams?.length || 0)}
                </span>
                <span className="summary-label">Without Team</span>
              </div>
            </div>
          </div>
        )}
        
        {activeTab === 'draft' && (
          <div className="admin-draft">
            <h3>📝 Draft Management</h3>
            <div className="draft-status-card">
              <div className={`status-indicator ${draftStatus}`}>
                {draftStatus === 'pending' && '⏸️ Pending - Draft not yet open'}
                {draftStatus === 'open' && '🟢 Open - Teams can register'}
                {draftStatus === 'in_progress' && '🔴 In Progress - Snake draft running'}
                {draftStatus === 'completed' && '✅ Completed - Season active'}
              </div>
              
              <div className="draft-info">
                <p><strong>Registered Teams:</strong> {allTeams?.length || 0}</p>
                <p><strong>Players Available:</strong> {players.length}</p>
              </div>
              
              <div className="draft-controls">
                <h4>Draft Actions</h4>
                
                <div className="draft-buttons">
                  {draftStatus === 'pending' && (
                    <button className="btn-primary btn-large" onClick={handleStartDraft}>
                      🚀 Open Draft Registration
                    </button>
                  )}
                  
                  {draftStatus === 'open' && (
                    <>
                      <button className="btn-primary btn-large" onClick={handleBeginDraft}>
                        ▶️ Start Snake Draft
                      </button>
                      <button className="btn-secondary" onClick={() => setDraftStatus('pending')}>
                        ⏪ Close Registration
                      </button>
                    </>
                  )}
                  
                  {draftStatus === 'in_progress' && (
                    <>
                      <button className="btn-primary btn-large" onClick={handleCompleteDraft}>
                        ✅ Complete Draft
                      </button>
                      <button className="btn-secondary" onClick={handleResetDraft}>
                        🔄 Reset Draft (Keep Teams)
                      </button>
                    </>
                  )}
                  
                  {draftStatus === 'completed' && (
                    <button className="btn-secondary" onClick={handleResetDraft}>
                      🔄 Reset Draft (Keep Teams)
                    </button>
                  )}
                </div>
                
                <div className="draft-danger-zone">
                  <h4>⚠️ Danger Zone</h4>
                  <button className="btn-danger" onClick={handleDeleteDraft}>
                    🗑️ Delete Draft & All Teams
                  </button>
                  <p className="danger-warning">This permanently removes all teams and resets the draft.</p>
                </div>
              </div>
            </div>
            
            {/* Draft Logs Section */}
            {(draftStatus === 'completed' || draftStatus === 'in_progress') && (
              <div className="draft-logs-section" style={{ marginTop: '30px' }}>
                <h3>📋 Draft Pick History</h3>
                {loadingDraftLogs ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    Loading draft logs...
                  </div>
                ) : draftLogs.length === 0 ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No draft picks recorded yet.
                  </div>
                ) : (
                  <div style={{ 
                    background: 'var(--bg-card)', 
                    borderRadius: '8px', 
                    border: '1px solid var(--border-color)',
                    maxHeight: '500px',
                    overflow: 'auto'
                  }}>
                    {/* Header */}
                    <div style={{ 
                      display: 'grid', 
                      gridTemplateColumns: '60px 60px 1fr 1fr 100px 150px', 
                      padding: '12px 15px', 
                      background: 'var(--bg-secondary)', 
                      fontWeight: '600',
                      fontSize: '0.85rem',
                      borderBottom: '1px solid var(--border-color)',
                      position: 'sticky',
                      top: 0
                    }}>
                      <span>Pick #</span>
                      <span>Round</span>
                      <span>Team</span>
                      <span>Player</span>
                      <span>Position</span>
                      <span>Time</span>
                    </div>
                    
                    {/* Picks */}
                    {draftLogs.map((pick, idx) => (
                      <div 
                        key={pick.id || idx} 
                        style={{ 
                          display: 'grid', 
                          gridTemplateColumns: '60px 60px 1fr 1fr 100px 150px', 
                          padding: '10px 15px', 
                          borderBottom: '1px solid var(--border-color)',
                          fontSize: '0.9rem',
                          background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)'
                        }}
                      >
                        <span style={{ fontWeight: '600', color: 'var(--accent-color)' }}>
                          #{pick.pickNumber || idx + 1}
                        </span>
                        <span>R{pick.round || Math.ceil((idx + 1) / (allTeams?.length || 1))}</span>
                        <span style={{ fontWeight: '500' }}>{pick.teamName || 'Unknown'}</span>
                        <span>
                          <span style={{ fontWeight: '500' }}>{pick.playerName || 'Unknown'}</span>
                          {pick.playerTeam && (
                            <span style={{ marginLeft: '6px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                              ({pick.playerTeam})
                            </span>
                          )}
                        </span>
                        <span>
                          <span className={`position-badge ${pick.playerPosition}`} style={{ 
                            fontSize: '0.75rem', 
                            padding: '2px 8px',
                            borderRadius: '12px',
                            background: pick.playerPosition === 'batter' ? '#3b82f6' : 
                                       pick.playerPosition === 'bowler' ? '#22c55e' : 
                                       pick.playerPosition === 'keeper' ? '#f59e0b' : '#8b5cf6',
                            color: 'white'
                          }}>
                            {pick.playerPosition?.toUpperCase() || 'N/A'}
                          </span>
                        </span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          {pick.createdAt ? new Date(pick.createdAt).toLocaleString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          }) : '-'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                
                {/* Summary */}
                {draftLogs.length > 0 && (
                  <div style={{ 
                    marginTop: '15px', 
                    padding: '15px', 
                    background: 'var(--bg-card)', 
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)'
                  }}>
                    <h4 style={{ margin: '0 0 10px 0' }}>📊 Draft Summary</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '15px' }}>
                      <div>
                        <div style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--accent-color)' }}>
                          {draftLogs.length}
                        </div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Total Picks</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#3b82f6' }}>
                          {draftLogs.filter(p => p.playerPosition === 'batter').length}
                        </div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Batters</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#22c55e' }}>
                          {draftLogs.filter(p => p.playerPosition === 'bowler').length}
                        </div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Bowlers</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#8b5cf6' }}>
                          {draftLogs.filter(p => p.playerPosition === 'allrounder').length}
                        </div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>All-rounders</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#f59e0b' }}>
                          {draftLogs.filter(p => p.playerPosition === 'keeper').length}
                        </div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Keepers</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        
        {activeTab === 'users' && (
          <div className="admin-users">
            <h3>👤 Registered Users & Teams</h3>
            
            <div className="user-filters">
              <select value={userFilter} onChange={(e) => setUserFilter(e.target.value)}>
                <option value="all">All Users</option>
                <option value="with_team">Users with Teams</option>
                <option value="without_team">Users without Teams</option>
              </select>
              <span className="user-count">
                {allUsers?.length || 0} total users
              </span>
            </div>
            
            {allUsers && allUsers.length > 0 ? (
              <div className="users-table">
                <div className="table-header">
                  <span>User</span>
                  <span>Email</span>
                  <span>Team</span>
                  <span>Tournament</span>
                  <span>Points</span>
                  <span>Actions</span>
                </div>
                {allUsers
                  .filter(u => {
                    if (userFilter === 'with_team') return u.hasTeam;
                    if (userFilter === 'without_team') return !u.hasTeam;
                    return true;
                  })
                  .map((u, i) => {
                    const userTeam = allTeams?.find(t => t.userId === u.id);
                    return (
                      <div key={u.id || i} className="table-row">
                        <span className="user-name">
                          {u.isAdmin && <span className="admin-tag">👑</span>}
                          {u.name}
                        </span>
                        <span className="user-email">{u.email}</span>
                        <span className="user-team">
                          {userTeam ? (
                            <span className="team-badge">{userTeam.name}</span>
                          ) : (
                            <span className="no-team">No team</span>
                          )}
                        </span>
                        <span className="user-tournament">
                          {userTeam ? TOURNAMENTS[userTeam.tournamentId]?.shortName || userTeam.tournamentId : '-'}
                        </span>
                        <span className="user-points">
                          {userTeam ? `${Math.round(userTeam.totalPoints || 0)} pts` : '-'}
                        </span>
                        <span className="user-actions">
                          {userTeam && (
                            <button 
                              className="btn-small btn-secondary" 
                              onClick={() => {
                                setActiveTab('teams');
                                handleEditTeam(userTeam);
                              }}
                              title="Edit Team"
                            >
                              ✏️
                            </button>
                          )}
                          {!u.isAdmin && (
                            <button 
                              className="btn-small btn-danger" 
                              onClick={() => {
                                if (window.confirm(`Delete user "${u.name}"?\n\nThis will also remove their team if they have one.`)) {
                                  onDeleteUser && onDeleteUser(u.id);
                                }
                              }}
                              title="Delete User"
                            >
                              🗑️
                            </button>
                          )}
                        </span>
                      </div>
                    );
                  })}
              </div>
            ) : (
              <p className="no-data">No users registered yet.</p>
            )}
            
            <div className="users-summary">
              <h4>📊 Summary by Tournament</h4>
              <div className="summary-cards">
                {Object.values(TOURNAMENTS).map(t => {
                  const tournamentTeams = allTeams?.filter(team => team.tournamentId === t.id) || [];
                  return (
                    <div key={t.id} className="summary-card">
                      <span className="tournament-name">{t.shortName}</span>
                      <span className="team-count">{tournamentTeams.length} teams</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
        
        {activeTab === 'settings' && (
          <div className="admin-settings">
            <h3>⚙️ Tournament Settings</h3>
            <div className="settings-list">
              <div className="setting-item">
                <label>Tournament Name</label>
                <input type="text" value={tournament.name} readOnly />
              </div>
              <div className="setting-item">
                <label>Tournament ID</label>
                <input type="text" value={tournament.id} readOnly />
              </div>
              <div className="setting-item">
                <label>Start Date</label>
                <input type="date" value={tournament.startDate} readOnly />
              </div>
              <div className="setting-item">
                <label>End Date</label>
                <input type="date" value={tournament.endDate} readOnly />
              </div>
              <div className="setting-item">
                <label>Weekly Pickup Limit</label>
                <input type="number" value={FREE_AGENCY_LIMIT} readOnly />
              </div>
              <div className="setting-item">
                <label>Roster Size</label>
                <input type="number" value={TOTAL_ROSTER_SIZE} readOnly />
              </div>
            </div>
            
            <div className="api-info">
              <h4>🔗 API Endpoints</h4>
              <div className="endpoint-list">
                <div className="endpoint">
                  <code>GET /api/sync/players?tournament={tournament.id}</code>
                  <span>Sync player roster</span>
                </div>
                <div className="endpoint">
                  <code>GET /api/sync/live-scores</code>
                  <span>Sync live match scores</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

// Main Dashboard Component  
const Dashboard = ({ user, team, tournament, players: playersProp, allTeams = [], onLogout, onUpdateTeam, onBackToTournaments, onSwitchTournament, isDraftComplete, isDraftOpen, onGoToDraft, onRefreshPlayers }) => {
  const [activeTab, setActiveTab] = useState('roster');
  const [showPlayerModal, setShowPlayerModal] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState(null);
  const [testResults, setTestResults] = useState(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPosition, setFilterPosition] = useState('all');
  const [filterTeam, setFilterTeam] = useState('all');
  const [tradingWindowStatus, setTradingWindowStatus] = useState({ open: true, message: '' });
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedPlayerProfile, setSelectedPlayerProfile] = useState(null); // Player profile modal
  const [localDraftOpen, setLocalDraftOpen] = useState(isDraftOpen); // Local state for auto-refresh
  const [selectedSlotToFill, setSelectedSlotToFill] = useState(null); // For moving players from bench to lineup
  const [viewingTeam, setViewingTeam] = useState(null); // For viewing other team's roster
  const [localPlayers, setLocalPlayers] = useState(playersProp || []); // Local copy of players
  const [playerGameLogs, setPlayerGameLogs] = useState({}); // Cache of player game logs: { playerId: [gameLog] }
  
  // Load game log for a player
  const loadPlayerGameLog = async (playerId) => {
    // Check cache first
    if (playerGameLogs[playerId]) {
      return playerGameLogs[playerId];
    }
    
    try {
      const response = await playersAPI.getGameLog(playerId);
      if (response.gameLog) {
        setPlayerGameLogs(prev => ({ ...prev, [playerId]: response.gameLog }));
        return response.gameLog;
      }
    } catch (err) {
      console.log('⚠️ Could not load game log for player:', playerId, err.message);
    }
    return [];
  };
  
  // Get points for a specific match date
  const getMatchPointsForDate = (playerId, date) => {
    const dateStr = date.toISOString().split('T')[0];
    const gameLog = playerGameLogs[playerId] || [];
    
    const matchEntry = gameLog.find(g => {
      const matchDateStr = g.matchDate?.split('T')[0];
      return matchDateStr === dateStr;
    });
    
    return matchEntry?.fantasyPoints || 0;
  };
  
  // Load game logs for all roster players
  useEffect(() => {
    const loadAllGameLogs = async () => {
      const rosterPlayers = team?.roster || [];
      for (const player of rosterPlayers) {
        const playerId = player.id || player.playerId;
        if (playerId && !playerGameLogs[playerId]) {
          await loadPlayerGameLog(playerId);
        }
      }
    };
    
    if (team?.roster?.length > 0) {
      loadAllGameLogs();
    }
  }, [team?.roster]);
  
  // Enhanced Test Mode State
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [apiTestStatus, setApiTestStatus] = useState(null);
  const [isFetchingData, setIsFetchingData] = useState(false);
  const [matchHistory, setMatchHistory] = useState([]);
  const [liveScoreUpdates, setLiveScoreUpdates] = useState([]);
  const [dbTestStatus, setDbTestStatus] = useState(null);
  const [isTestingDb, setIsTestingDb] = useState(false);
  const [pointsVerification, setPointsVerification] = useState(null);
  
  // Refresh player data on mount and when tournament changes
  useEffect(() => {
    const refreshPlayers = async () => {
      try {
        console.log('🔄 Dashboard: Refreshing player data...');
        const response = await playersAPI.getByTournament(tournament.id);
        if (response.players && response.players.length > 0) {
          const formattedPlayers = response.players.map(p => ({
            id: p.id,
            name: p.name,
            team: p.team,
            position: p.position,
            totalPoints: p.totalPoints || p.total_points || 0,
            matchesPlayed: p.matchesPlayed || p.matches_played || 0,
            avgPoints: p.avgPoints || p.avg_points || 0,
            gameLog: []
          }));
          console.log('✅ Dashboard: Loaded', formattedPlayers.length, 'players with points');
          setLocalPlayers(formattedPlayers);
        }
      } catch (err) {
        console.log('⚠️ Dashboard: Could not refresh players:', err.message);
      }
    };
    
    refreshPlayers();
  }, [tournament?.id]);
  
  // Update localPlayers when prop changes
  useEffect(() => {
    if (playersProp && playersProp.length > 0) {
      setLocalPlayers(playersProp);
    }
  }, [playersProp]);
  
  // Use local players (refreshed from API) or prop
  const playerPool = localPlayers.length > 0 
    ? localPlayers 
    : (playersProp && playersProp.length > 0 ? playersProp : getPlayersForTournament(tournament.id));
  
  // Detect if this is a test/demo tournament (never lock players)
  const isTestMode = tournament?.id?.includes('test') || 
                     tournament?.name?.toLowerCase().includes('test') ||
                     tournament?.isTest === true;
  
  // Auto-refresh draft status every 10 seconds (poll database)
  useEffect(() => {
    if (isDraftComplete) return;
    
    const checkDraftStatus = async () => {
      try {
        const leaguesResponse = await leaguesAPI.getAll(tournament.id);
        if (leaguesResponse.leagues && leaguesResponse.leagues.length > 0) {
          const league = leaguesResponse.leagues[0];
          const draftIsOpen = league.draftStatus === 'open' || league.draftStatus === 'in_progress';
          
          if (draftIsOpen && !localDraftOpen) {
            setLocalDraftOpen(true);
          }
        }
      } catch (err) {
        // Silently fail - not critical
      }
    };
    
    const interval = setInterval(checkDraftStatus, 10000); // Check every 10 seconds
    return () => clearInterval(interval);
  }, [isDraftComplete, localDraftOpen, tournament?.id]);
  
  // Use localDraftOpen if it's true (detected from polling), otherwise use prop
  const effectiveDraftOpen = localDraftOpen || isDraftOpen;
  
  // Check and reset weekly pickups if new week
  useEffect(() => {
    const updatedTeam = checkWeeklyReset(team);
    if (updatedTeam !== team && updatedTeam.weeklyPickups !== team.weeklyPickups) {
      onUpdateTeam(updatedTeam);
    }
  }, [team?.weeklyPickupsResetDate]);
  
  // Computed weekly pickups (accounts for weekly reset)
  const currentWeekPickups = (() => {
    const checkedTeam = checkWeeklyReset(team);
    return checkedTeam?.weeklyPickups || 0;
  })();
  const weeklyPickupLimit = team?.weeklyPickupLimit || FREE_AGENCY_LIMIT;
  const isPickupLimitReached = currentWeekPickups >= weeklyPickupLimit;
  
  // Get API base URL for test mode API calls
  const getApiBaseUrl = () => {
    if (typeof window !== 'undefined' && window.location.origin) {
      return window.location.origin;
    }
    return '';
  };
  
  // Date navigation helpers
  const goToPreviousDay = () => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() - 1);
    setSelectedDate(newDate);
  };
  
  const goToNextDay = () => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + 1);
    setSelectedDate(newDate);
  };
  
  const goToToday = () => {
    setSelectedDate(new Date());
  };
  
  const formatDateDisplay = (date) => {
    // Always show actual date like "Jan 21" or "Wed, Jan 21"
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };
  
  // Global dropped players pool (persisted in localStorage)
  const getDroppedPlayers = () => {
    const key = `t20fantasy_dropped_${tournament.id}`;
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : [];
  };
  
  const addToDroppedPlayers = (player) => {
    const key = `t20fantasy_dropped_${tournament.id}`;
    const dropped = getDroppedPlayers();
    if (!dropped.find(p => p.id === player.id)) {
      dropped.push({ ...player, droppedAt: new Date().toISOString() });
      localStorage.setItem(key, JSON.stringify(dropped));
    }
  };
  
  const removeFromDroppedPlayers = (playerId) => {
    const key = `t20fantasy_dropped_${tournament.id}`;
    const dropped = getDroppedPlayers().filter(p => p.id !== playerId);
    localStorage.setItem(key, JSON.stringify(dropped));
  };
  
  // Get all rostered players across all teams in this tournament
  const getAllRosteredPlayers = () => {
    const tournamentTeams = allTeams.filter(t => t.tournamentId === tournament.id);
    const rosteredIds = new Set();
    const rosteredNames = new Set();
    
    // Get IDs and names from all teams
    tournamentTeams.forEach(t => {
      (t.roster || []).forEach(p => {
        if (p.id) rosteredIds.add(p.id);
        if (p.name) rosteredNames.add(p.name);
      });
    });
    
    // Also include current team's roster
    (team.roster || []).forEach(p => {
      if (p.id) rosteredIds.add(p.id);
      if (p.name) rosteredNames.add(p.name);
    });
    
    return { rosteredIds, rosteredNames };
  };
  
  // Free agents = pool players not rostered + dropped players not re-rostered
  const [freeAgents, setFreeAgents] = useState([]);
  
  // Update free agents when rosters change
  useEffect(() => {
    const { rosteredIds, rosteredNames } = getAllRosteredPlayers();
    const droppedPlayers = getDroppedPlayers();
    
    // Start with pool players not rostered (check both ID and name)
    const availableFromPool = playerPool.filter(p => 
      !rosteredIds.has(p.id) && !rosteredNames.has(p.name)
    );
    
    // Add dropped players that aren't re-rostered
    const availableDropped = droppedPlayers.filter(p => 
      !rosteredIds.has(p.id) && !rosteredNames.has(p.name)
    );
    
    // Combine, avoiding duplicates
    const combined = [...availableFromPool];
    availableDropped.forEach(dp => {
      if (!combined.find(p => p.id === dp.id || p.name === dp.name)) {
        combined.push(dp);
      }
    });
    
    setFreeAgents(combined);
  }, [team.roster, allTeams, playerPool, tournament.id]);
  
  // Update trading window status periodically
  useEffect(() => {
    const checkTradingWindow = () => {
      // In test mode, always keep trading open
      if (isTestMode) {
        setTradingWindowStatus({ open: true, message: '' });
        return;
      }
      
      const inWindow = isInTradingWindow(tournament.matches);
      setTradingWindowStatus({
        open: inWindow,
        message: inWindow ? '' : '⏰ Trading window closed (Opens 8 PM MST)'
      });
    };
    
    checkTradingWindow();
    const interval = setInterval(checkTradingWindow, 60000); // Check every minute
    return () => clearInterval(interval);
  }, [tournament.matches, isTestMode]);

  // Group roster by assigned slot (no bench, no IL - just playing 12)
  // Enrich roster players with data from player pool if missing
  // Also deduplicate by player ID to prevent duplicate rendering
  const enrichedRoster = useMemo(() => {
    const seenIds = new Set();
    console.log('🔄 Enriching roster:', team.roster?.length, 'players');
    console.log('📊 PlayerPool has:', playerPool?.length, 'players');
    
    return (team.roster || [])
      .filter(p => {
        // Deduplicate by ID
        const id = p.id || p.playerId;
        if (seenIds.has(id)) {
          console.warn(`Filtering duplicate player from roster: ${p.name || id}`);
          return false;
        }
        seenIds.add(id);
        return true;
      })
      .map(p => {
        const playerId = p.id || p.playerId;
        // ALWAYS try to find player in player pool to get latest points
        const poolPlayer = playerPool.find(pp => pp.id === playerId);
        
        if (poolPlayer) {
          console.log(`✅ Found ${poolPlayer.name} in pool with ${poolPlayer.totalPoints} pts`);
          // Merge pool data (including totalPoints) with roster slot info
          return { 
            ...poolPlayer, 
            slot: p.slot || p.position,
            // Keep any roster-specific data
            fantasyPoints: poolPlayer.totalPoints || p.fantasyPoints || 0,
            totalPoints: poolPlayer.totalPoints || 0
          };
        }
        
        console.log(`❌ Player ${p.name || playerId} NOT found in pool (roster ID: ${playerId})`);
        // Fallback - use what we have
        return { ...p, name: p.name || 'Unknown Player', totalPoints: p.totalPoints || p.fantasyPoints || 0 };
      });
  }, [team.roster, playerPool]);
  
  const rosterBySlot = {
    batters: enrichedRoster.filter(p => p.slot === 'batters'),
    keepers: enrichedRoster.filter(p => p.slot === 'keepers'),
    bowlers: enrichedRoster.filter(p => p.slot === 'bowlers'),
    flex: enrichedRoster.filter(p => p.slot === 'flex'),
    bench: enrichedRoster.filter(p => p.slot === 'bench' || !p.slot),
  };
  
  // Count players in active lineup (not bench)
  const activeLineupCount = rosterBySlot.batters.length + rosterBySlot.keepers.length + 
                            rosterBySlot.bowlers.length + rosterBySlot.flex.length;
  
  // Move a player to a different slot
  const movePlayerToSlot = async (playerId, newSlot) => {
    const player = enrichedRoster.find(p => p.id === playerId);
    if (!player) return;
    
    // Check if player can go in this slot
    if (newSlot !== 'bench' && !canPlaceInSlot(player.position, newSlot)) {
      alert(`${player.name} (${player.position}) cannot be placed in ${newSlot} slot`);
      return;
    }
    
    // Check if slot is full (except bench)
    if (newSlot !== 'bench' && isSlotFull(newSlot)) {
      alert(`${SQUAD_CONFIG[newSlot]?.label || newSlot} slot is full`);
      return;
    }
    
    // Update roster
    const updatedRoster = team.roster.map(p => 
      p.id === playerId ? { ...p, slot: newSlot } : p
    );
    
    onUpdateTeam({ ...team, roster: updatedRoster });
    setSelectedSlotToFill(null);
    
    // Also save to database
    try {
      await teamsAPI.update({ id: team.id, roster: updatedRoster });
    } catch (err) {
      console.error('Failed to save roster change:', err);
    }
  };
  
  // Get bench players that can fill a specific slot
  const getBenchPlayersForSlot = (slotKey) => {
    return rosterBySlot.bench.filter(p => canPlaceInSlot(p.position, slotKey));
  };
  
  // For backward compatibility - old rosters without slots
  // Auto-assign slots based on position
  const migrateRosterToSlots = (roster) => {
    // Track slot counts during migration
    const slotCounts = { batters: 0, keepers: 0, bowlers: 0, flex: 0 };
    
    return roster.map(p => {
      if (p.slot) return p;
      
      // Assign based on position and available slots
      if (p.position === 'keeper') {
        if (slotCounts.keepers < SQUAD_CONFIG.keepers.max) {
          slotCounts.keepers++;
          return { ...p, slot: 'keepers' };
        } else if (slotCounts.batters < SQUAD_CONFIG.batters.max) {
          slotCounts.batters++;
          return { ...p, slot: 'batters' };
        }
      }
      if (p.position === 'batter') {
        if (slotCounts.batters < SQUAD_CONFIG.batters.max) {
          slotCounts.batters++;
          return { ...p, slot: 'batters' };
        }
      }
      if (p.position === 'bowler') {
        if (slotCounts.bowlers < SQUAD_CONFIG.bowlers.max) {
          slotCounts.bowlers++;
          return { ...p, slot: 'bowlers' };
        }
      }
      if (p.position === 'allrounder') {
        // Allrounders can go to batters or bowlers slots
        if (slotCounts.batters < SQUAD_CONFIG.batters.max) {
          slotCounts.batters++;
          return { ...p, slot: 'batters' };
        } else if (slotCounts.bowlers < SQUAD_CONFIG.bowlers.max) {
          slotCounts.bowlers++;
          return { ...p, slot: 'bowlers' };
        }
      }
      // Fallback to flex
      if (slotCounts.flex < SQUAD_CONFIG.flex.max) {
        slotCounts.flex++;
        return { ...p, slot: 'flex' };
      }
      return { ...p, slot: 'batters' }; // Final fallback
    });
  };
  
  // Check if we need to migrate
  useEffect(() => {
    if (team.roster.length > 0 && !team.roster[0].slot) {
      const migratedRoster = migrateRosterToSlots(team.roster);
      onUpdateTeam({ ...team, roster: migratedRoster });
    }
  }, []);
  
  // Get count of players in a slot
  const getSlotCount = (slotKey) => rosterBySlot[slotKey]?.length || 0;
  
  // Check if a slot is full
  const isSlotFull = (slotKey) => SQUAD_CONFIG[slotKey] && getSlotCount(slotKey) >= SQUAD_CONFIG[slotKey].max;
  
  // Get available slots for a player's position
  const getAvailableSlotsForPlayer = (player) => {
    const validSlots = getValidSlotsForPosition(player.position);
    return validSlots.filter(slot => !isSlotFull(slot));
  };
  
  // Filter free agents based on search and position
  const filteredFreeAgents = freeAgents.filter(player => {
    const matchesSearch = player.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          player.team.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesPosition = filterPosition === 'all' || player.position === filterPosition;
    const matchesTeam = filterTeam === 'all' || player.team === filterTeam;
    return matchesSearch && matchesPosition && matchesTeam;
  });
  
  // For pre-draft browse mode - show all players
  const allPlayersForBrowse = playerPool.filter(player => {
    const matchesSearch = player.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          player.team.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesPosition = filterPosition === 'all' || player.position === filterPosition;
    const matchesTeam = filterTeam === 'all' || player.team === filterTeam;
    return matchesSearch && matchesPosition && matchesTeam;
  });
  
  // Get unique teams from player pool for filter dropdown
  const uniqueTeams = [...new Set(playerPool.map(p => p.team))].sort();

  // Test Mode: Simulate API Data Pull (works even without roster)
  const simulateApiPull = async () => {
    setIsFetchingData(true);
    setApiTestStatus({ status: 'connecting', message: 'Connecting to API...' });
    setLiveScoreUpdates([]);
    
    // Simulate connection delay
    await new Promise(resolve => setTimeout(resolve, 800));
    setApiTestStatus({ status: 'fetching', message: 'Fetching match data...' });
    
    // Simulate fetching
    await new Promise(resolve => setTimeout(resolve, 1000));
    setApiTestStatus({ status: 'processing', message: 'Processing player stats...' });
    
    // If roster is empty, show simulated sample data
    const playersToProcess = team.roster.length > 0 ? team.roster : [
      { name: 'Sample Player 1', position: 'batter' },
      { name: 'Sample Player 2', position: 'bowler' },
      { name: 'Sample Player 3', position: 'allrounder' },
    ];
    
    // Simulate live updates coming in one by one
    for (let i = 0; i < Math.min(playersToProcess.length, 5); i++) {
      const player = playersToProcess[i];
      const stats = generateTestStats(player);
      const points = calculateFantasyPoints(stats);
      
      setLiveScoreUpdates(prev => [...prev, {
        player: player.name,
        points: Math.round(points),
        timestamp: new Date().toLocaleTimeString(),
      }]);
      
      await new Promise(resolve => setTimeout(resolve, 400));
    }
    
    setApiTestStatus({ status: 'success', message: '✓ Data pull successful!' });
    setIsFetchingData(false);
    
    // Auto-clear after 5 seconds
    setTimeout(() => setApiTestStatus(null), 5000);
  };
  
  // Test Mode: Real API Pull (calls actual endpoint)
  const realApiPull = async () => {
    setIsFetchingData(true);
    setApiTestStatus({ status: 'connecting', message: 'Connecting to live API...' });
    setLiveScoreUpdates([]);
    
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/sync/live-scores`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        setApiTestStatus({ 
          status: 'success', 
          message: `✓ Real API pull successful! ${data.results?.length || 0} matches processed` 
        });
        
        // Show results
        if (data.results && data.results.length > 0) {
          data.results.forEach((result, i) => {
            setTimeout(() => {
              setLiveScoreUpdates(prev => [...prev, {
                player: result.matchName || `Match ${i + 1}`,
                points: result.playersProcessed || result.updated || 0,
                timestamp: new Date().toLocaleTimeString(),
              }]);
            }, i * 300);
          });
        } else {
          setLiveScoreUpdates([{
            player: 'No live matches',
            points: 0,
            timestamp: new Date().toLocaleTimeString(),
          }]);
        }
      } else {
        setApiTestStatus({ status: 'error', message: `❌ Error: ${data.error}` });
      }
    } catch (error) {
      setApiTestStatus({ status: 'error', message: `❌ Connection failed: ${error.message}` });
    } finally {
      setIsFetchingData(false);
      setTimeout(() => setApiTestStatus(null), 10000);
    }
  };
  
  // Test Mode: Real API Player Sync
  const realPlayerSync = async () => {
    setIsFetchingData(true);
    setApiTestStatus({ status: 'connecting', message: 'Syncing players from API...' });
    
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/sync/players?tournament=${tournament.id}`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        const result = data.results?.[0] || {};
        setApiTestStatus({ 
          status: 'success', 
          message: `✓ Player sync successful! ${result.saved || 0} players saved (Source: ${result.source || 'unknown'})${result.seriesName ? ` - ${result.seriesName}` : ''}` 
        });
      } else {
        setApiTestStatus({ status: 'error', message: `❌ Error: ${data.error}` });
      }
    } catch (error) {
      setApiTestStatus({ status: 'error', message: `❌ Connection failed: ${error.message}` });
    } finally {
      setIsFetchingData(false);
      setTimeout(() => setApiTestStatus(null), 10000);
    }
  };

  // Test Mode: Simulate Database Connection
  const testDatabaseConnection = async () => {
    setIsTestingDb(true);
    setDbTestStatus({ status: 'connecting', message: '🔌 Connecting to Turso...' });
    
    await new Promise(resolve => setTimeout(resolve, 600));
    setDbTestStatus({ status: 'reading', message: '📖 Reading from database...' });
    
    await new Promise(resolve => setTimeout(resolve, 500));
    setDbTestStatus({ status: 'writing', message: '✏️ Testing write operations...' });
    
    await new Promise(resolve => setTimeout(resolve, 500));
    setDbTestStatus({ status: 'verifying', message: '🔍 Verifying data integrity...' });
    
    await new Promise(resolve => setTimeout(resolve, 400));
    
    // Simulate successful connection with mock stats
    setDbTestStatus({ 
      status: 'success', 
      message: '✅ Database connection successful!',
      stats: {
        latency: Math.floor(Math.random() * 50) + 20 + 'ms',
        tablesFound: 8,
        playersInDb: tournament.isTest ? 24 : 67,
        version: 'Turso libSQL 0.24'
      }
    });
    setIsTestingDb(false);
    
    setTimeout(() => setDbTestStatus(null), 10000);
  };

  // Test Mode: Verify Points Calculation
  const verifyPointsCalculation = () => {
    const testCases = [
      {
        name: 'Batting: 45 runs @ 150 SR',
        stats: { runs: 45, ballsFaced: 30, strikeRate: 150, wickets: 0, oversBowled: 0, catches: 0, runOuts: 0, stumpings: 0, isWicketkeeper: false },
        expected: 45 + 20, // 45 runs + 20 SR bonus (150-159.99)
      },
      {
        name: 'Bowling: 2 wickets, 4 overs @ 6.0 ER',
        stats: { runs: 0, ballsFaced: 0, strikeRate: 0, wickets: 2, oversBowled: 4, economyRate: 6.0, maidenOvers: 0, catches: 0, runOuts: 0, stumpings: 0, isWicketkeeper: false },
        expected: 50 + 20, // 2x25 wickets + 20 ER bonus
      },
      {
        name: 'Fielding: 2 catches + 1 run out',
        stats: { runs: 0, ballsFaced: 0, strikeRate: 0, wickets: 0, oversBowled: 0, catches: 2, runOuts: 1, stumpings: 0, isWicketkeeper: false },
        expected: 24 + 20, // 2x12 catches + 20 run out
      },
      {
        name: 'All-rounder: 30 runs + 1 wicket + 1 catch',
        stats: { runs: 30, ballsFaced: 20, strikeRate: 150, wickets: 1, oversBowled: 3, economyRate: 7.5, catches: 1, runOuts: 0, stumpings: 0, isWicketkeeper: false },
        expected: 30 + 20 + 25 + 10 + 12, // runs + SR bonus + wicket + ER bonus + catch
      },
    ];
    
    const results = testCases.map(tc => {
      const calculated = calculateFantasyPoints(tc.stats);
      return {
        ...tc,
        calculated: Math.round(calculated),
        passed: Math.round(calculated) === tc.expected,
      };
    });
    
    setPointsVerification(results);
  };

  // Test Mode: Simulate Match for specific match
  const simulateSpecificMatch = async (match) => {
    setIsSimulating(true);
    setTestResults(null);
    setSelectedMatch(match);
    
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    const matchResults = team.roster.map(player => {
      const stats = generateTestStats(player);
      const points = calculateFantasyPoints(stats);
      return { player, stats, points };
    });
    
    const totalMatchPoints = matchResults.reduce((sum, r) => sum + r.points, 0);
    
    const updatedRoster = team.roster.map(player => {
      const result = matchResults.find(r => r.player.id === player.id);
      return {
        ...player,
        totalPoints: (player.totalPoints || 0) + (result?.points || 0),
      };
    });
    
    const updatedTeam = {
      ...team,
      roster: updatedRoster,
      totalPoints: (team.totalPoints || 0) + totalMatchPoints,
      matchesPlayed: (team.matchesPlayed || 0) + 1,
    };
    
    // Add to match history
    setMatchHistory(prev => [...prev, {
      match: match.name,
      points: Math.round(totalMatchPoints),
      date: new Date().toLocaleString(),
    }]);
    
    onUpdateTeam(updatedTeam);
    setTestResults({ 
      matchResults, 
      totalMatchPoints, 
      newTeamTotal: updatedTeam.totalPoints,
      matchName: match.name,
    });
    setIsSimulating(false);
  };

  // Test Mode: Simulate Match & Update Scores (legacy/quick)
  const simulateMatch = async () => {
    const defaultMatch = tournament.matches?.[0] || { id: 'quick', name: 'Quick Match' };
    await simulateSpecificMatch(defaultMatch);
  };

  // State for slot selection when adding players
  const [selectedSlotForAdd, setSelectedSlotForAdd] = useState(null);
  const [playerToAdd, setPlayerToAdd] = useState(null);

  const handleAddPlayer = (player, targetSlot = null) => {
    // Check if in trading window
    if (!tradingWindowStatus.open && !isTestMode) {
      alert(tradingWindowStatus.message);
      return;
    }
    
    // Check if player is already on roster (prevent duplicates) - check both ID and name
    const isDuplicate = team.roster.some(p => 
      p.id === player.id || 
      p.playerId === player.id || 
      (p.name && p.name === player.name)
    );
    if (isDuplicate) {
      alert(`${player.name} is already on your roster!`);
      return;
    }
    
    // Count players
    const totalPlayers = (team.roster || []).length;
    
    // Check if total roster is full
    if (totalPlayers >= MAX_TOTAL_PLAYERS) {
      alert(`Roster is full (${MAX_TOTAL_PLAYERS} total players). Drop a player first.`);
      return;
    }
    
    // Check if player is locked (their game has started)
    const lockStatus = getPlayerLockStatus(player, tournament.matches, isTestMode);
    if (lockStatus.locked) {
      alert(lockStatus.message);
      return;
    }
    
    // Check and reset weekly pickups if new week
    const currentTeam = checkWeeklyReset(team);
    if (currentTeam !== team) {
      onUpdateTeam(currentTeam);
    }
    
    // Check weekly pickup limit (use current team's value)
    const pickupsUsed = currentTeam.weeklyPickups || 0;
    const pickupLimit = currentTeam.weeklyPickupLimit || FREE_AGENCY_LIMIT;
    
    if (pickupsUsed >= pickupLimit) {
      alert(`Weekly pickup limit reached (${FREE_AGENCY_LIMIT}/week). Resets every Monday.`);
      return;
    }

    // ALWAYS add to bench first - user can move to active lineup later
    const newPlayer = { 
      ...player, 
      slot: 'bench',
      acquiredVia: 'pickup' 
    };
    const updatedRoster = [...team.roster, newPlayer];
    const updatedTeam = {
      ...currentTeam,
      roster: updatedRoster,
      weeklyPickups: pickupsUsed + 1
    };
    onUpdateTeam(updatedTeam);
    
    // Remove from free agents
    setFreeAgents(prev => prev.filter(p => p.id !== player.id));
    removeFromDroppedPlayers(player.id);
    
    alert(`${player.name} added to bench! Go to your roster to move them to your starting lineup.`);
  };
  
  // Drop a player back to free agency
  const handleDropPlayer = (player) => {
    // Check if in trading window
    if (!tradingWindowStatus.open && !isTestMode) {
      alert(tradingWindowStatus.message);
      return;
    }
    
    // Check if player is locked
    const lockStatus = getPlayerLockStatus(player, tournament.matches, isTestMode);
    if (lockStatus.locked) {
      alert(`Cannot drop ${player.name}: ${lockStatus.message}`);
      return;
    }
    
    if (!confirm(`Drop ${player.name} to free agency?`)) {
      return;
    }
    
    // Remove from roster
    const updatedRoster = team.roster.filter(p => p.id !== player.id);
    const updatedTeam = { ...team, roster: updatedRoster };
    onUpdateTeam(updatedTeam);
    
    // Add back to free agents
    const droppedPlayer = { ...player };
    delete droppedPlayer.slot; // Remove slot assignment
    setFreeAgents(prev => [...prev, droppedPlayer].sort((a, b) => a.name.localeCompare(b.name)));
  };
  
  // Confirm add player to specific slot
  const confirmAddToSlot = (slot) => {
    if (playerToAdd) {
      if (playerToAdd.movingFromBench) {
        // Moving from bench to playing
        const updatedRoster = team.roster.map(p => 
          p.id === playerToAdd.id ? { ...p, slot: slot } : p
        );
        onUpdateTeam({ ...team, roster: updatedRoster });
        setPlayerToAdd(null);
      } else {
        // Adding new player
        handleAddPlayer(playerToAdd, slot);
      }
    }
  };

  // Fetch game log when player profile is opened
  useEffect(() => {
    if (selectedPlayerProfile) {
      loadPlayerGameLog(selectedPlayerProfile.id);
    }
  }, [selectedPlayerProfile?.id]);

  return (
    <div className="dashboard">
      {/* Player Profile Modal */}
      {selectedPlayerProfile && (() => {
        // Use real game log from API if available, otherwise empty array
        const apiGameLog = playerGameLogs[selectedPlayerProfile.id] || [];
        
        // Map API response to display format
        const playerGameLog = apiGameLog.map(g => ({
          date: g.matchDate,
          opponent: g.opponent || 'OPP',
          runs: g.runs,
          strikeRate: g.strikeRate,
          wickets: g.wickets,
          economy: g.economy,
          catches: g.catches,
          runOuts: g.runOuts,
          stumpings: g.stumpings,
          points: g.fantasyPoints
        }));
        
        // Calculate totals from game log
        const totalFromGames = playerGameLog.reduce((sum, g) => sum + (g.points || 0), 0);
        const displayTotalPoints = totalFromGames || selectedPlayerProfile.totalPoints || 0;
        const displayMatches = playerGameLog.length || selectedPlayerProfile.matchesPlayed || 0;
        
        return (
        <div className="player-profile-modal" onClick={() => setSelectedPlayerProfile(null)}>
          <div className="player-profile-content" onClick={(e) => e.stopPropagation()}>
            <button className="close-btn" onClick={() => setSelectedPlayerProfile(null)}>×</button>
            
            <div className="profile-header">
              <div className="player-avatar">{selectedPlayerProfile.position === 'keeper' ? '🧤' : selectedPlayerProfile.position === 'bowler' ? '🎯' : selectedPlayerProfile.position === 'allrounder' ? '⚡' : '🏏'}</div>
              <div className="profile-info">
                <h2>{selectedPlayerProfile.name}</h2>
                <div className="profile-meta">
                  <span className="team-badge">{selectedPlayerProfile.team}</span>
                  <span className={`position-badge ${selectedPlayerProfile.position}`}>{selectedPlayerProfile.position.toUpperCase()}</span>
                </div>
              </div>
            </div>
            
            <div className="profile-stats-summary">
              <div className="stat-box">
                <span className="stat-value">{displayTotalPoints}</span>
                <span className="stat-label">Total Pts</span>
              </div>
              <div className="stat-box">
                <span className="stat-value">{displayMatches}</span>
                <span className="stat-label">Matches</span>
              </div>
              <div className="stat-box">
                <span className="stat-value">
                  {displayMatches > 0 
                    ? Math.round(displayTotalPoints / displayMatches) 
                    : '-'}
                </span>
                <span className="stat-label">Avg Pts</span>
              </div>
            </div>
            
            <div className="game-log-section">
              <h3>📊 Game Log</h3>
              {playerGameLog && playerGameLog.length > 0 ? (
                <div className="game-log-table">
                  <div className="game-log-header">
                    <span>Date</span>
                    <span>vs</span>
                    <span>Runs</span>
                    <span>SR</span>
                    <span>Wkts</span>
                    <span>Econ</span>
                    <span>Ct/RO</span>
                    <span>Pts</span>
                  </div>
                  {playerGameLog.map((game, idx) => (
                    <div key={idx} className="game-log-row">
                      <span>{new Date(game.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                      <span>{game.opponent}</span>
                      <span>{game.runs ?? '-'}</span>
                      <span>{game.strikeRate ? game.strikeRate.toFixed(1) : '-'}</span>
                      <span>{game.wickets ?? '-'}</span>
                      <span>{game.economy ? game.economy.toFixed(1) : '-'}</span>
                      <span>{(game.catches || 0) + (game.runOuts || 0) || '-'}</span>
                      <span className="pts">{game.points}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="no-games">
                  <p>No completed games yet</p>
                  <p className="sub-text">Stats will appear here as matches are played</p>
                </div>
              )}
            </div>
          </div>
        </div>
        );
      })()}

      {/* View Other Team Modal */}
      {viewingTeam && (() => {
        // Get roster for this team - enrich with player pool data
        const teamRoster = (viewingTeam.roster || []).map(p => {
          const poolPlayer = playerPool.find(pp => pp.id === p.id || pp.id === p.playerId);
          if (poolPlayer) {
            return { ...poolPlayer, slot: p.slot || p.position };
          }
          return { ...p, name: p.name || 'Unknown Player', totalPoints: p.totalPoints || p.fantasyPoints || 0 };
        });
        
        const teamRosterBySlot = {
          batters: teamRoster.filter(p => p.slot === 'batters'),
          keepers: teamRoster.filter(p => p.slot === 'keepers'),
          bowlers: teamRoster.filter(p => p.slot === 'bowlers'),
          flex: teamRoster.filter(p => p.slot === 'flex'),
          bench: teamRoster.filter(p => p.slot === 'bench' || !p.slot),
        };
        
        const activeCount = teamRosterBySlot.batters.length + teamRosterBySlot.keepers.length + 
                           teamRosterBySlot.bowlers.length + teamRosterBySlot.flex.length;
        
        // Calculate total points for active lineup
        const activeRoster = [...teamRosterBySlot.batters, ...teamRosterBySlot.keepers, ...teamRosterBySlot.bowlers, ...teamRosterBySlot.flex];
        const rosterTotalPoints = activeRoster.reduce((sum, p) => sum + (p.totalPoints || 0), 0);
        
        return (
          <div className="player-profile-modal" onClick={() => setViewingTeam(null)}>
            <div className="player-profile-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '650px', maxHeight: '85vh', overflow: 'auto' }}>
              <button className="close-btn" onClick={() => setViewingTeam(null)}>×</button>
              
              <div className="profile-header" style={{ marginBottom: '15px' }}>
                <div className="player-avatar">👥</div>
                <div className="profile-info">
                  <h2>{viewingTeam.name} {viewingTeam.id === team.id && <span style={{ fontSize: '0.8rem', color: '#22c55e' }}>(You)</span>}</h2>
                  <div className="profile-meta">
                    <span className="team-badge">Owner: {viewingTeam.owner || viewingTeam.ownerName}</span>
                    <span className="position-badge" style={{ background: '#3b82f6' }}>{Math.round(rosterTotalPoints)} PTS</span>
                  </div>
                </div>
              </div>
              
              {/* Date Navigator */}
              <div className="date-nav-bar" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '15px', marginBottom: '15px', padding: '10px', background: 'var(--bg-card)', borderRadius: '8px' }}>
                <button className="date-nav-btn" onClick={goToPreviousDay} style={{ background: '#d4a017', border: 'none', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', fontSize: '1.2rem' }}>‹</button>
                <div className="date-display" style={{ textAlign: 'center' }}>
                  <span className="current-date" style={{ fontWeight: '600' }}>{formatDateDisplay(selectedDate)}</span>
                </div>
                <button className="date-nav-btn" onClick={goToNextDay} style={{ background: '#d4a017', border: 'none', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', fontSize: '1.2rem' }}>›</button>
              </div>
              
              <div className="roster-section-yahoo starters-section">
                <div className="section-label">Starting Lineup ({activeCount}/12)</div>
                <div className="stat-headers">
                  <span className="stat-header">PTS</span>
                </div>
                
                {Object.entries(SQUAD_CONFIG)
                  .filter(([key, config]) => config.isPlaying)
                  .map(([slotKey, config]) => (
                    <React.Fragment key={slotKey}>
                      {teamRosterBySlot[slotKey]?.map(player => {
                        const gameStatus = getPlayerGameStatus(player, tournament.matches, selectedDate);
                        const slotLabel = slotKey === 'keepers' ? 'WK' : slotKey === 'batters' ? 'BAT' : slotKey === 'bowlers' ? 'BWL' : 'UTIL';
                        
                        return (
                          <div 
                            key={player.id} 
                            className={`player-row ${gameStatus.status}`}
                          >
                            <div className="slot-indicator">{slotLabel}</div>
                            <div className={`game-status-dot ${gameStatus.color}`}></div>
                            <div className="player-info-yahoo">
                              <div className="player-main">
                                <span className="player-name-yahoo">{player.name}</span>
                              </div>
                              <div className="player-sub">
                                <span className="player-team-yahoo">{player.team}</span>
                                <span className="player-positions">• {player.position?.toUpperCase()}</span>
                              </div>
                            </div>
                            <div className="player-stats-yahoo">
                              <span className="stat-value">
                                {(() => {
                                  // Show "-" for other teams since we don't have their game logs
                                  // Could add API call to fetch per-player stats if needed
                                  return '-';
                                })()}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </React.Fragment>
                  ))}
              </div>
              
              {/* Bench */}
              {teamRosterBySlot.bench.length > 0 && (
                <div className="roster-section-yahoo bench-section" style={{ marginTop: '15px' }}>
                  <div className="section-label">Bench ({teamRosterBySlot.bench.length})</div>
                  {teamRosterBySlot.bench.map(player => (
                    <div key={player.id} className="player-row bench">
                      <div className="slot-indicator">BN</div>
                      <div className="game-status-dot gray"></div>
                      <div className="player-info-yahoo">
                        <div className="player-main">
                          <span className="player-name-yahoo">{player.name}</span>
                        </div>
                        <div className="player-sub">
                          <span className="player-team-yahoo">{player.team}</span>
                          <span className="player-positions">• {player.position?.toUpperCase()}</span>
                        </div>
                      </div>
                      <div className="player-stats-yahoo">
                        <span className="stat-value">{player.totalPoints || 0}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      <header className="dashboard-header">
        <div className="header-left">
          {team.logo ? (
            <img src={team.logo} alt="Team logo" className="team-logo-small" />
          ) : (
            <div className="team-logo-placeholder">🏏</div>
          )}
          <div className="team-info">
            <h1>{team.name}</h1>
            <div className="tournament-dropdown-wrapper">
              <select 
                className="tournament-dropdown"
                value={tournament.id}
                onChange={(e) => onSwitchTournament && onSwitchTournament(e.target.value)}
              >
                {Object.values(TOURNAMENTS).map(t => (
                  <option key={t.id} value={t.id}>
                    {t.shortName} {t.isTest ? '(Test)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <div className="header-right">
          <div className="points-display">
            <span className="points-value">
              {(() => {
                // Calculate today's points from game logs using local date
                const year = selectedDate.getFullYear();
                const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
                const day = String(selectedDate.getDate()).padStart(2, '0');
                const dateStr = `${year}-${month}-${day}`;
                let todayPoints = 0;
                
                (team.roster || []).forEach(p => {
                  const playerId = p.id || p.playerId;
                  const gameLog = playerGameLogs[playerId] || [];
                  const matchEntry = gameLog.find(g => g.matchDate?.split('T')[0] === dateStr);
                  if (matchEntry) {
                    todayPoints += matchEntry.fantasyPoints || 0;
                  }
                });
                
                return Math.round(todayPoints);
              })()}
            </span>
            <span className="points-label">{formatDateDisplay(selectedDate)} Pts</span>
          </div>
          <div className="points-display" style={{ marginLeft: '10px' }}>
            <span className="points-value" style={{ fontSize: '1.2rem', color: 'var(--text-muted)' }}>{Math.round(team.totalPoints)}</span>
            <span className="points-label">Total</span>
          </div>
          <button className="btn-icon" onClick={onBackToTournaments} title="All Tournaments">🏆</button>
          <button className="btn-logout" onClick={onLogout} title="Logout">
            <span className="logout-icon">🚪</span>
            <span className="logout-text">Logout</span>
          </button>
        </div>
      </header>

      <nav className="dashboard-nav">
        {['roster', 'players', 'standings', 'scoring', ...(tournament.isTest ? ['test'] : [])].map(tab => (
          <button 
            key={tab}
            className={`nav-tab ${activeTab === tab ? 'active' : ''} ${tab === 'test' ? 'test-tab' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'roster' ? 'My Roster' : 
             tab === 'players' ? 'Free Agents' :
             tab === 'test' ? '🧪 Test' :
             tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </nav>

      <main className="dashboard-content">
        {activeTab === 'roster' && (
          <div className="roster-view yahoo-style">
            {/* Date Selector */}
            <div className="date-selector">
              <button className="date-nav-btn" onClick={goToPreviousDay}>‹</button>
              <div className="date-display">
                <span className="current-date">{formatDateDisplay(selectedDate)}</span>
                {selectedDate.toDateString() !== new Date().toDateString() && (
                  <button className="today-btn" onClick={goToToday}>Today</button>
                )}
              </div>
              <button className="date-nav-btn" onClick={goToNextDay}>›</button>
            </div>
            
            {/* Match Info for Selected Date */}
            {(() => {
              // Use local date format for comparison
              const year = selectedDate.getFullYear();
              const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
              const day = String(selectedDate.getDate()).padStart(2, '0');
              const selectedDateStr = `${year}-${month}-${day}`;
              
              const todaysMatches = (tournament.matches || []).filter(m => {
                const matchDateStr = normalizeDate(m.date);
                return matchDateStr === selectedDateStr;
              });
              
              if (todaysMatches.length === 0) {
                return (
                  <div style={{ textAlign: 'center', padding: '8px', background: 'rgba(107, 114, 128, 0.2)', borderRadius: '8px', marginBottom: '10px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    No matches scheduled for {formatDateDisplay(selectedDate)}
                  </div>
                );
              }
              
              return todaysMatches.map(m => (
                <div key={m.id} style={{ 
                  textAlign: 'center', 
                  padding: '10px', 
                  background: m.status === 'completed' ? 'rgba(34, 197, 94, 0.2)' : m.status === 'live' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(59, 130, 246, 0.2)', 
                  borderRadius: '8px', 
                  marginBottom: '10px',
                  border: `1px solid ${m.status === 'completed' ? '#22c55e' : m.status === 'live' ? '#f59e0b' : '#3b82f6'}`
                }}>
                  <div style={{ fontWeight: '600', marginBottom: '4px' }}>
                    {m.status === 'completed' ? '✅' : m.status === 'live' ? '🔴' : '📅'} {m.name}
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    {m.teams?.join(' vs ') || 'TBD'} • {m.venue || 'TBD'} • {m.startTime || '19:00'}
                  </div>
                  <div style={{ fontSize: '0.75rem', marginTop: '4px' }}>
                    Status: <strong style={{ color: m.status === 'completed' ? '#22c55e' : m.status === 'live' ? '#f59e0b' : '#3b82f6' }}>{m.status?.toUpperCase() || 'SCHEDULED'}</strong>
                  </div>
                </div>
              ));
            })()}
            
            <div className="roster-header-row">
              <div className="pickup-counter">
                Weekly Pickups: <strong>{currentWeekPickups}/{weeklyPickupLimit}</strong>
                <span className="pickup-reset-info">
                  (Resets Mon)
                </span>
              </div>
              <div className="points-summary">
                <span className="points-value">{Math.round(team.totalPoints)}</span>
                <span className="points-label">Points</span>
              </div>
            </div>
            
            {/* Trading Window Status Banner */}
            {isDraftComplete && (
              <div className={`trading-window-banner ${tradingWindowStatus.open ? 'window-open' : 'window-closed'}`}>
                {tradingWindowStatus.open ? (
                  <>
                    <span className="banner-icon">✅</span>
                    <span className="banner-text">Trading window OPEN - You can add/drop players</span>
                  </>
                ) : (
                  <>
                    <span className="banner-icon">🔒</span>
                    <span className="banner-text">{tradingWindowStatus.message}</span>
                  </>
                )}
              </div>
            )}
            
            {/* Draft Status Banner */}
            {!isDraftComplete && (
              <div className={`draft-status-banner ${effectiveDraftOpen ? 'draft-open' : 'draft-pending'}`}>
                {effectiveDraftOpen ? (
                  <>
                    <span className="banner-icon">🚀</span>
                    <span className="banner-text">Draft is OPEN! Complete your roster now.</span>
                    <button className="btn-primary btn-small" onClick={onGoToDraft}>
                      Go to Draft →
                    </button>
                  </>
                ) : (
                  <>
                    <span className="banner-icon">⏳</span>
                    <span className="banner-text">Waiting for admin to open the draft. Browse players in the meantime.</span>
                    <button 
                      className="btn-secondary btn-small" 
                      onClick={async () => {
                        // Re-check draft status from API
                        try {
                          const leaguesResponse = await leaguesAPI.getAll(tournament?.id);
                          if (leaguesResponse.leagues && leaguesResponse.leagues.length > 0) {
                            const league = leaguesResponse.leagues[0];
                            if (league.draftStatus === 'open' || league.draftStatus === 'in_progress') {
                              window.location.reload();
                            } else {
                              alert('Draft is still pending. Admin has not opened the draft yet.');
                            }
                          }
                        } catch (err) {
                          alert('Could not check draft status. Please try again.');
                        }
                      }}
                      title="Check if admin has opened the draft"
                    >
                      🔄 Refresh
                    </button>
                  </>
                )}
              </div>
            )}
            
            {/* Slot Selection Modal */}
            {playerToAdd && (
              <div className="slot-selection-modal">
                <div className="slot-modal-content">
                  <h4>Select slot for {playerToAdd.name}</h4>
                  <p className="player-position-info">Position: {playerToAdd.position.toUpperCase()}</p>
                  <div className="slot-options">
                    {getAvailableSlotsForPlayer(playerToAdd).map(slot => (
                      <button 
                        key={slot}
                        className="slot-option-btn"
                        onClick={() => confirmAddToSlot(slot)}
                      >
                        {SQUAD_CONFIG[slot].icon} {SQUAD_CONFIG[slot].label}
                        <span className="slot-capacity">
                          ({getSlotCount(slot)}/{SQUAD_CONFIG[slot].max})
                        </span>
                      </button>
                    ))}
                  </div>
                  <button className="btn-secondary" onClick={() => setPlayerToAdd(null)}>Cancel</button>
                </div>
              </div>
            )}

            {/* Roster - Starting Lineup */}
            <div className="roster-section-yahoo starters-section">
              <div className="section-label">Starting Lineup ({activeLineupCount}/12)</div>
              <div className="stat-headers">
                <span className="stat-header">PTS</span>
              </div>
              
              {Object.entries(SQUAD_CONFIG)
                .filter(([key, config]) => config.isPlaying)
                .map(([slotKey, config]) => (
                  <React.Fragment key={slotKey}>
                    {rosterBySlot[slotKey]?.map(player => {
                      const gameStatus = getPlayerGameStatus(player, tournament.matches, selectedDate);
                      const slotLabel = slotKey === 'keepers' ? 'WK' : slotKey === 'batters' ? 'BAT' : slotKey === 'bowlers' ? 'BWL' : 'UTIL';
                      
                      return (
                        <div 
                          key={player.id} 
                          className={`player-row ${gameStatus.status} clickable`}
                        >
                          <div className="slot-indicator">{slotLabel}</div>
                          <div className={`game-status-dot ${gameStatus.color}`}></div>
                          <div className="player-info-yahoo" onClick={() => setSelectedPlayerProfile(player)}>
                            <div className="player-main">
                              <span className="player-name-yahoo">{player.name}</span>
                            </div>
                            <div className="player-sub">
                              <span className="player-team-yahoo">{player.team}</span>
                              <span className="player-positions">• {player.position.toUpperCase()}</span>
                            </div>
                          </div>
                          <div className="player-stats-yahoo">
                            <span className="stat-value">
                              {(() => {
                                // Get match-specific points for selected date
                                // Use local date format (YYYY-MM-DD) for comparison
                                const year = selectedDate.getFullYear();
                                const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
                                const day = String(selectedDate.getDate()).padStart(2, '0');
                                const dateStr = `${year}-${month}-${day}`;
                                
                                const gameLog = playerGameLogs[player.id] || [];
                                const matchEntry = gameLog.find(g => {
                                  const matchDateStr = g.matchDate?.split('T')[0];
                                  return matchDateStr === dateStr;
                                });
                                
                                if (matchEntry) {
                                  return matchEntry.fantasyPoints || 0;
                                }
                                
                                // No match on this date - show "-"
                                return '-';
                              })()}
                            </span>
                          </div>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <button 
                              className="bench-btn" 
                              onClick={(e) => { 
                                e.stopPropagation(); 
                                movePlayerToSlot(player.id, 'bench');
                              }}
                              title="Move to bench"
                              style={{ 
                                background: '#f59e0b', 
                                color: 'white', 
                                border: 'none', 
                                borderRadius: '4px', 
                                padding: '6px 8px', 
                                cursor: 'pointer', 
                                fontSize: '0.75rem',
                                fontWeight: '500'
                              }}
                            >
                              📋
                            </button>
                            <button 
                              className="drop-btn" 
                              onClick={(e) => { e.stopPropagation(); handleDropPlayer(player); }}
                              title="Drop to free agency"
                              style={{ 
                                background: '#ef4444', 
                                color: 'white', 
                                border: 'none', 
                                borderRadius: '4px', 
                                padding: '6px 10px', 
                                cursor: 'pointer', 
                                fontSize: '0.8rem',
                                fontWeight: '500'
                              }}
                            >
                              Drop
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    {/* Empty slots for this position - clickable to fill from bench */}
                    {Array(Math.max(0, (config.max || 0) - (rosterBySlot[slotKey]?.length || 0))).fill(null).map((_, i) => {
                      const slotLabel = slotKey === 'keepers' ? 'WK' : slotKey === 'batters' ? 'BAT' : slotKey === 'bowlers' ? 'BWL' : 'UTIL';
                      const eligibleBenchPlayers = getBenchPlayersForSlot(slotKey);
                      const isSelected = selectedSlotToFill === `${slotKey}-${i}`;
                      
                      return (
                        <div key={`empty-${slotKey}-${i}`} className="empty-slot-container">
                          <div 
                            className={`player-row empty-row ${eligibleBenchPlayers.length > 0 ? 'clickable' : ''} ${isSelected ? 'selected' : ''}`}
                            onClick={() => eligibleBenchPlayers.length > 0 && setSelectedSlotToFill(isSelected ? null : `${slotKey}-${i}`)}
                          >
                            <div className="slot-indicator">{slotLabel}</div>
                            <div className="game-status-dot gray"></div>
                            <div className="player-info-yahoo">
                              <span className="empty-slot-text">
                                {eligibleBenchPlayers.length > 0 
                                  ? `Click to fill ${config.label} slot (${eligibleBenchPlayers.length} available)`
                                  : `Empty ${config.label} Slot`
                                }
                              </span>
                            </div>
                            <div className="player-stats-yahoo">
                              <span className="stat-value">-</span>
                            </div>
                          </div>
                          
                          {/* Dropdown showing eligible bench players */}
                          {isSelected && (
                            <div className="bench-player-dropdown">
                              <div className="dropdown-header">
                                Select player for {config.label}:
                                <button className="close-btn" onClick={() => setSelectedSlotToFill(null)}>×</button>
                              </div>
                              {eligibleBenchPlayers.map(benchPlayer => (
                                <div 
                                  key={benchPlayer.id}
                                  className="dropdown-player"
                                  onClick={() => movePlayerToSlot(benchPlayer.id, slotKey)}
                                >
                                  <span className="player-name">{benchPlayer.name}</span>
                                  <span className="player-detail">{benchPlayer.team} • {benchPlayer.position.toUpperCase()}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </React.Fragment>
                ))}
            </div>
            
            {/* Bench Section */}
            {rosterBySlot.bench.length > 0 && (
              <div className="roster-section-yahoo bench-section">
                <div className="section-label">Bench ({rosterBySlot.bench.length})</div>
                <div className="stat-headers">
                  <span className="stat-header">PTS</span>
                </div>
                
                {rosterBySlot.bench.map(player => {
                  const gameStatus = getPlayerGameStatus(player, tournament.matches, selectedDate);
                  const availableSlots = getAvailableSlotsForPlayer(player).filter(s => s !== 'bench');
                  
                  return (
                    <div 
                      key={player.id} 
                      className={`player-row bench-player ${gameStatus.status}`}
                    >
                      <div className="slot-indicator bench">BN</div>
                      <div className={`game-status-dot ${gameStatus.color}`}></div>
                      <div className="player-info-yahoo" onClick={() => setSelectedPlayerProfile(player)}>
                        <div className="player-main">
                          <span className="player-name-yahoo">{player.name}</span>
                        </div>
                        <div className="player-sub">
                          <span className="player-team-yahoo">{player.team}</span>
                          <span className="player-positions">• {player.position.toUpperCase()}</span>
                        </div>
                      </div>
                      <div className="player-stats-yahoo">
                        <span className="stat-value">{player.totalPoints || 0}</span>
                      </div>
                      {availableSlots.length > 0 && (
                        <div className="move-options">
                          {availableSlots.map(slot => {
                            const slotLabel = slot === 'keepers' ? 'WK' : slot === 'batters' ? 'BAT' : slot === 'bowlers' ? 'BWL' : 'UTIL';
                            return (
                              <button 
                                key={slot}
                                className="move-to-slot-btn"
                                onClick={() => movePlayerToSlot(player.id, slot)}
                                title={`Move to ${SQUAD_CONFIG[slot]?.label}`}
                              >
                                ↑ {slotLabel}
                              </button>
                            );
                          })}
                        </div>
                      )}
                      <button 
                        className="drop-btn" 
                        onClick={(e) => { e.stopPropagation(); handleDropPlayer(player); }}
                        title="Drop to free agency"
                        style={{ 
                          marginLeft: '8px', 
                          background: '#ef4444', 
                          color: 'white', 
                          border: 'none', 
                          borderRadius: '4px', 
                          padding: '6px 10px', 
                          cursor: 'pointer', 
                          fontSize: '0.8rem',
                          fontWeight: '500'
                        }}
                      >
                        Drop
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'players' && (
          <div className="free-agents-view">
            {!isDraftComplete && (
              <div className="browse-mode-banner">
                <span className="browse-icon">👁️</span>
                <span>Browse Mode - Complete the draft to add/drop players</span>
              </div>
            )}
            
            <div className="search-filters">
              <input 
                type="search" 
                placeholder="Search players..." 
                className="search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <select 
                className="filter-select"
                value={filterPosition}
                onChange={(e) => setFilterPosition(e.target.value)}
              >
                <option value="all">All Positions</option>
                <option value="batter">Batters</option>
                <option value="keeper">Keepers</option>
                <option value="bowler">Bowlers</option>
                <option value="allrounder">Allrounders</option>
              </select>
              <select 
                className="filter-select"
                value={filterTeam}
                onChange={(e) => setFilterTeam(e.target.value)}
              >
                <option value="all">All Teams</option>
                {uniqueTeams.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            
            <div className="player-count">
              <span>
                {isDraftComplete 
                  ? `${filteredFreeAgents.length} free agents available`
                  : `${allPlayersForBrowse.length} players in pool`
                }
                {(filterPosition !== 'all' || filterTeam !== 'all') && (
                  <span className="active-filters">
                    {filterPosition !== 'all' && ` • ${filterPosition}`}
                    {filterTeam !== 'all' && ` • ${filterTeam}`}
                  </span>
                )}
              </span>
              {(filterPosition !== 'all' || filterTeam !== 'all' || searchQuery) && (
                <button 
                  className="btn-small btn-clear-filters"
                  onClick={() => {
                    setFilterPosition('all');
                    setFilterTeam('all');
                    setSearchQuery('');
                  }}
                >
                  Clear Filters
                </button>
              )}
            </div>
            
            <div className="players-grid">
              {(isDraftComplete ? filteredFreeAgents : allPlayersForBrowse).map(player => {
                // Use component-level isTestMode
                const lockStatus = getPlayerLockStatus(player, tournament.matches, isTestMode);
                const isLocked = isDraftComplete && !isTestMode && (lockStatus.locked || !tradingWindowStatus.open);
                return (
                  <div key={player.id} className={`player-card-full ${isLocked ? 'locked' : ''}`}>
                    <div 
                      className="player-header" 
                      style={{ cursor: 'pointer' }}
                      onClick={() => setSelectedPlayerProfile(player)}
                    >
                      <span className="player-name">
                        {isLocked && <span className="lock-icon">🔒</span>}
                        {player.name}
                      </span>
                      <span className={`position-badge ${player.position}`}>{player.position.toUpperCase()}</span>
                    </div>
                    <div 
                      className="player-details"
                      style={{ cursor: 'pointer' }}
                      onClick={() => setSelectedPlayerProfile(player)}
                    >
                      <span className="player-team">{player.team}</span>
                      {player.droppedAt && (
                        <span className="recently-dropped">Recently Dropped</span>
                      )}
                    </div>
                    <div className="player-footer">
                      <span className="avg-points">{player.totalPoints || 0} pts ({player.matchesPlayed || 0} gms)</span>
                      {isDraftComplete ? (
                        <button 
                          className="btn-primary btn-small"
                          onClick={() => handleAddPlayer(player)}
                          disabled={isPickupLimitReached || isLocked}
                          title={isLocked ? lockStatus.message || 'Locked' : isPickupLimitReached ? 'Weekly pickup limit reached' : ''}
                        >+ Add</button>
                      ) : (
                        <span className="browse-only-badge">Browse Only</span>
                      )}
                    </div>
                    {isLocked && <div className="lock-overlay">{lockStatus.message || 'Locked'}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'standings' && (
          <div className="standings-view">
            <h2>League Standings</h2>
            <div className="standings-table">
              <div className="standings-header">
                <span className="rank">#</span>
                <span className="team-name">Team</span>
                <span className="owner">Owner</span>
                <span className="points">Points</span>
              </div>
              {(() => {
                // Get all teams for this tournament from allTeams prop (loaded from database)
                const tournamentTeams = (allTeams || [])
                  .filter(t => t.tournamentId === tournament.id)
                  .map(t => ({
                    ...t,
                    isUser: t.id === team.id
                  }))
                  .sort((a, b) => (b.totalPoints || 0) - (a.totalPoints || 0));
                
                // If no other teams, show message
                if (tournamentTeams.length === 0) {
                  return (
                    <div className="no-teams-message">
                      No teams registered yet. Be the first!
                    </div>
                  );
                }
                
                return tournamentTeams.map((t, i) => (
                  <div 
                    key={t.id} 
                    className={`standings-row ${t.isUser ? 'user-team' : ''} clickable`}
                    onClick={() => setViewingTeam(t)}
                    style={{ cursor: 'pointer' }}
                    title={`Click to view ${t.name}'s roster`}
                  >
                    <span className="rank">{i + 1}</span>
                    <span className="team-name">{t.name} <span style={{ fontSize: '0.7rem', opacity: 0.6 }}>👁</span></span>
                    <span className="owner">{t.owner}</span>
                    <span className="points">{Math.round(t.totalPoints || 0)}</span>
                  </div>
                ));
              })()}
            </div>
          </div>
        )}

        {activeTab === 'scoring' && (
          <div className="scoring-view">
            <h2>Points Scoring System</h2>
            
            <div className="scoring-section">
              <h3>🏏 Batting</h3>
              <div className="scoring-rules">
                <div className="rule-item"><span>Runs</span><span className="points">1 pt/run</span></div>
                <div className="rule-group">
                  <h4>Strike Rate Bonus (min 20 runs)</h4>
                  <div className="rule-item sub"><span>SR ≥ 160</span><span className="points">+25 pts</span></div>
                  <div className="rule-item sub"><span>SR 150-159.99</span><span className="points">+20 pts</span></div>
                  <div className="rule-item sub"><span>SR 140-149.99</span><span className="points">+15 pts</span></div>
                  <div className="rule-item sub"><span>SR 130-139.99</span><span className="points">+10 pts</span></div>
                  <div className="rule-item sub"><span>SR 120-129.99</span><span className="points">+5 pts</span></div>
                </div>
              </div>
            </div>

            <div className="scoring-section">
              <h3>🎯 Bowling</h3>
              <div className="scoring-rules">
                <div className="rule-item"><span>Wickets</span><span className="points">25 pts each</span></div>
                <div className="rule-item"><span>Maiden Over</span><span className="points">20 pts</span></div>
                <div className="rule-group">
                  <h4>Economy Rate Bonus (min 3 overs)</h4>
                  <div className="rule-item sub"><span>ER ≤ 5</span><span className="points">+25 pts</span></div>
                  <div className="rule-item sub"><span>ER 5.01-6</span><span className="points">+20 pts</span></div>
                  <div className="rule-item sub"><span>ER 6.01-7</span><span className="points">+15 pts</span></div>
                  <div className="rule-item sub"><span>ER 7.01-8</span><span className="points">+10 pts</span></div>
                </div>
              </div>
            </div>

            <div className="scoring-section">
              <h3>🧤 Fielding</h3>
              <div className="scoring-rules">
                <div className="rule-item"><span>Catch</span><span className="points">12 pts</span></div>
                <div className="rule-item"><span>Run Out</span><span className="points">20 pts</span></div>
                <div className="rule-item"><span>Stumping (WK only)</span><span className="points">15 pts</span></div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'test' && tournament.isTest && (
          <div className="test-view">
            <div className="test-header">
              <h2>🧪 Test Mode - {tournament.name}</h2>
              <p>Test the complete app flow: data pulls, score updates, and fantasy points calculation.</p>
            </div>

            {/* Match Schedule */}
            {tournament.matches && tournament.matches.length > 0 && (
              <div className="match-schedule">
                <h3>📅 Match Schedule</h3>
                <div className="matches-grid">
                  {tournament.matches.map(match => (
                    <div 
                      key={match.id} 
                      className={`match-card ${match.status} ${selectedMatch?.id === match.id ? 'selected' : ''}`}
                      onClick={() => !isSimulating && team.roster.length > 0 && setSelectedMatch(match)}
                    >
                      <div className="match-status-badge">
                        {match.status === 'completed' && '✅'}
                        {match.status === 'live' && '🔴'}
                        {match.status === 'upcoming' && '📅'}
                        {match.status.toUpperCase()}
                      </div>
                      <div className="match-info">
                        <span className="match-name">{match.name}</span>
                        <span className="match-teams">{match.teams}</span>
                        <span className="match-venue">{match.venue}</span>
                        <span className="match-date">{new Date(match.date).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Test Actions */}
            <div className="test-actions-grid">
              {/* Database Connection Test */}
              <div className="test-action-card">
                <h4>🗄️ Test Database Connection</h4>
                <p>Verify Turso database connectivity</p>
                <button 
                  className="btn-secondary"
                  onClick={testDatabaseConnection}
                  disabled={isTestingDb}
                >
                  {isTestingDb ? (
                    <><span className="spinner"></span> Testing...</>
                  ) : (
                    '🔌 Test DB Connection'
                  )}
                </button>
                
                {dbTestStatus && (
                  <div className={`db-status ${dbTestStatus.status}`}>
                    <span className="status-message">{dbTestStatus.message}</span>
                    {dbTestStatus.stats && (
                      <div className="db-stats">
                        <span>Latency: {dbTestStatus.stats.latency}</span>
                        <span>Tables: {dbTestStatus.stats.tablesFound}</span>
                        <span>Players: {dbTestStatus.stats.playersInDb}</span>
                        <span>{dbTestStatus.stats.version}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* API Pull Test */}
              <div className="test-action-card">
                <h4>🔄 Test Data Pull</h4>
                <p>Test API connectivity and data fetching</p>
                <div className="test-buttons-row">
                  <button 
                    className="btn-secondary"
                    onClick={simulateApiPull}
                    disabled={isFetchingData}
                  >
                    {isFetchingData ? (
                      <><span className="spinner"></span> Fetching...</>
                    ) : (
                      '🎭 Simulate Pull'
                    )}
                  </button>
                  <button 
                    className="btn-primary"
                    onClick={realApiPull}
                    disabled={isFetchingData}
                  >
                    {isFetchingData ? (
                      <><span className="spinner"></span> Fetching...</>
                    ) : (
                      '📡 Live Scores API'
                    )}
                  </button>
                  <button 
                    className="btn-primary"
                    onClick={realPlayerSync}
                    disabled={isFetchingData}
                  >
                    {isFetchingData ? (
                      <><span className="spinner"></span> Syncing...</>
                    ) : (
                      '👥 Sync Players API'
                    )}
                  </button>
                </div>
                
                {apiTestStatus && (
                  <div className={`api-status ${apiTestStatus.status}`}>
                    {apiTestStatus.message}
                  </div>
                )}
                
                {liveScoreUpdates.length > 0 && (
                  <div className="live-updates">
                    {liveScoreUpdates.map((update, i) => (
                      <div key={i} className="live-update-item">
                        <span className="update-time">{update.timestamp}</span>
                        <span className="update-player">{update.player}</span>
                        <span className="update-points">+{update.points} pts</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Points Verification */}
              <div className="test-action-card">
                <h4>🧮 Verify Points Calculation</h4>
                <p>Test scoring formula with known values</p>
                <button 
                  className="btn-secondary"
                  onClick={verifyPointsCalculation}
                >
                  🔢 Run Points Test
                </button>
                
                {pointsVerification && (
                  <div className="points-verification">
                    {pointsVerification.map((tc, i) => (
                      <div key={i} className={`verification-item ${tc.passed ? 'passed' : 'failed'}`}>
                        <span className="test-icon">{tc.passed ? '✅' : '❌'}</span>
                        <span className="test-name">{tc.name}</span>
                        <span className="test-result">
                          {tc.calculated} pts {tc.passed ? '' : `(expected ${tc.expected})`}
                        </span>
                      </div>
                    ))}
                    <div className="verification-summary">
                      {pointsVerification.every(tc => tc.passed) 
                        ? '✅ All tests passed!' 
                        : `⚠️ ${pointsVerification.filter(tc => !tc.passed).length} test(s) failed`}
                    </div>
                  </div>
                )}
              </div>

              {/* Match Simulation */}
              <div className="test-action-card">
                <h4>🎮 Simulate Match</h4>
                <p>Generate random stats and calculate fantasy points</p>
                {selectedMatch ? (
                  <button 
                    className="btn-primary"
                    onClick={() => simulateSpecificMatch(selectedMatch)}
                    disabled={isSimulating || team.roster.length === 0}
                  >
                    {isSimulating ? (
                      <><span className="spinner"></span> Simulating...</>
                    ) : (
                      `⚡ Simulate ${selectedMatch.name}`
                    )}
                  </button>
                ) : (
                  <button 
                    className="btn-primary"
                    onClick={simulateMatch}
                    disabled={isSimulating || team.roster.length === 0}
                  >
                    {isSimulating ? (
                      <><span className="spinner"></span> Simulating...</>
                    ) : (
                      '⚡ Quick Simulate'
                    )}
                  </button>
                )}
                {team.roster.length === 0 && (
                  <p className="test-warning">⚠️ Complete the draft first!</p>
                )}
              </div>
            </div>

            {/* Match Results */}
            {testResults && (
              <div className="test-results">
                <div className="results-summary">
                  <h3>✅ {testResults.matchName || 'Match'} Complete!</h3>
                  <div className="summary-stats">
                    <div className="stat-box">
                      <span className="stat-value">+{Math.round(testResults.totalMatchPoints)}</span>
                      <span className="stat-label">Match Points</span>
                    </div>
                    <div className="stat-box highlight">
                      <span className="stat-value">{Math.round(testResults.newTeamTotal)}</span>
                      <span className="stat-label">Total Points</span>
                    </div>
                    <div className="stat-box">
                      <span className="stat-value">{team.matchesPlayed || 1}</span>
                      <span className="stat-label">Matches</span>
                    </div>
                  </div>
                </div>

                <div className="player-results">
                  <h4>Player Performance Breakdown</h4>
                  {testResults.matchResults.sort((a, b) => b.points - a.points).map((result, i) => (
                    <div key={i} className="result-card">
                      <div className="result-header">
                        <span className="result-rank">#{i + 1}</span>
                        <span className="player-name">{result.player.name}</span>
                        <span className={`position-badge ${result.player.position}`}>
                          {result.player.position.toUpperCase()}
                        </span>
                        <span className="result-points">+{Math.round(result.points)} pts</span>
                      </div>
                      <div className="result-stats">
                        {result.stats.runs > 0 && (
                          <span className="stat-item">🏏 {result.stats.runs} runs ({result.stats.strikeRate.toFixed(1)} SR)</span>
                        )}
                        {result.stats.wickets > 0 && (
                          <span className="stat-item">🎯 {result.stats.wickets} wkt{result.stats.wickets > 1 ? 's' : ''}</span>
                        )}
                        {result.stats.oversBowled > 0 && (
                          <span className="stat-item">📊 {result.stats.oversBowled}ov, {result.stats.economyRate.toFixed(1)} ER</span>
                        )}
                        {result.stats.catches > 0 && (
                          <span className="stat-item">🧤 {result.stats.catches} catch{result.stats.catches > 1 ? 'es' : ''}</span>
                        )}
                        {result.stats.runOuts > 0 && (
                          <span className="stat-item">🏃 run out</span>
                        )}
                        {result.stats.stumpings > 0 && (
                          <span className="stat-item">👐 stumping</span>
                        )}
                        {result.stats.maidenOvers > 0 && (
                          <span className="stat-item">🎖️ maiden</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Match History */}
            {matchHistory.length > 0 && (
              <div className="match-history">
                <h3>📊 Match History</h3>
                <div className="history-list">
                  {matchHistory.map((history, i) => (
                    <div key={i} className="history-item">
                      <span className="history-match">{history.match}</span>
                      <span className="history-points">+{history.points} pts</span>
                      <span className="history-date">{history.date}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Test Checklist */}
            <div className="test-checklist">
              <h3>✅ Test Checklist</h3>
              <ul>
                <li className={team.roster.length > 0 ? 'checked' : ''}>
                  <span className="check-icon">{team.roster.length > 0 ? '✓' : '○'}</span>
                  Complete snake draft ({team.roster.length}/{TOTAL_ROSTER_SIZE} players)
                </li>
                <li className={apiTestStatus?.status === 'success' ? 'checked' : ''}>
                  <span className="check-icon">{apiTestStatus?.status === 'success' ? '✓' : '○'}</span>
                  Test API data pull
                </li>
                <li className={testResults ? 'checked' : ''}>
                  <span className="check-icon">{testResults ? '✓' : '○'}</span>
                  Simulate a match
                </li>
                <li className={team.totalPoints > 0 ? 'checked' : ''}>
                  <span className="check-icon">{team.totalPoints > 0 ? '✓' : '○'}</span>
                  Verify points update ({Math.round(team.totalPoints || 0)} total pts)
                </li>
                <li className={currentWeekPickups > 0 ? 'checked' : ''}>
                  <span className="check-icon">{currentWeekPickups > 0 ? '✓' : '○'}</span>
                  Test free agency ({currentWeekPickups}/{FREE_AGENCY_LIMIT} pickups)
                </li>
                <li className={team.ir?.length > 0 ? 'checked' : ''}>
                  <span className="check-icon">{team.ir?.length > 0 ? '✓' : '○'}</span>
                  Test IR functionality
                </li>
              </ul>
              
              <div className="checklist-summary">
                {[
                  team.roster.length > 0,
                  apiTestStatus?.status === 'success',
                  testResults,
                  team.totalPoints > 0,
                  currentWeekPickups > 0,
                  team.ir?.length > 0,
                ].filter(Boolean).length === 6 ? (
                  <p className="all-complete">🎉 All tests passed! Ready for production.</p>
                ) : (
                  <p className="in-progress">Complete all tests before deploying to production.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {showPlayerModal && (
        <div className="modal-overlay" onClick={() => setShowPlayerModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add {selectedPosition?.charAt(0).toUpperCase() + selectedPosition?.slice(1)}</h2>
              <button className="btn-close" onClick={() => setShowPlayerModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="player-list-modal">
                {freeAgents
                  .filter(p => !selectedPosition || p.position === selectedPosition)
                  .map(player => (
                    <div key={player.id} className="player-option" onClick={() => handleAddPlayer(player)}>
                      <div className="player-info">
                        <span className="player-name">{player.name}</span>
                        <span className="player-team">{player.team}</span>
                      </div>
                      <span className="avg-points">{player.totalPoints || 0} pts</span>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================
// MAIN APP COMPONENT
// ============================================

export default function App() {
  const [currentPage, setCurrentPage] = useState('login'); // Login first!
  const [selectedTournament, setSelectedTournament] = useState(null);
  const [user, setUser] = useState(null);
  const [team, setTeam] = useState(null);
  const [isDraftComplete, setIsDraftComplete] = useState(false);
  const [isDraftOpen, setIsDraftOpen] = useState(false);
  const [allTeams, setAllTeams] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [players, setPlayers] = useState([]); // Players loaded from API
  const [isLoading, setIsLoading] = useState(false);
  const [apiConnected, setApiConnected] = useState(null); // null = unknown, true = connected, false = offline

  // Load players for a tournament from API
  const loadPlayers = async (tournamentId) => {
    console.log('🎯 Loading players for tournament:', tournamentId);
    try {
      const response = await playersAPI.getByTournament(tournamentId);
      if (response.players && response.players.length > 0) {
        console.log('✅ Loaded', response.players.length, 'players from API');
        // Transform to match expected format
        const formattedPlayers = response.players.map(p => ({
          id: p.id,
          name: p.name,
          team: p.team,
          position: p.position,
          totalPoints: p.totalPoints || p.total_points || 0,
          matchesPlayed: p.matchesPlayed || p.matches_played || 0,
          avgPoints: p.avgPoints || p.avg_points || 0,
          gameLog: []
        }));
        setPlayers(formattedPlayers);
        // Cache in localStorage for offline use
        localStorage.setItem(`t20fantasy_players_${tournamentId}`, JSON.stringify(formattedPlayers));
        return formattedPlayers;
      }
    } catch (err) {
      console.log('⚠️ Could not load players from API:', err.message);
    }
    
    // Fallback to localStorage cache
    const cached = localStorage.getItem(`t20fantasy_players_${tournamentId}`);
    if (cached) {
      const cachedPlayers = JSON.parse(cached);
      console.log('📦 Using cached players:', cachedPlayers.length);
      setPlayers(cachedPlayers);
      return cachedPlayers;
    }
    
    // Final fallback to hardcoded data
    const fallbackPlayers = getPlayersForTournament(tournamentId);
    console.log('🔄 Using hardcoded fallback:', fallbackPlayers.length, 'players');
    setPlayers(fallbackPlayers);
    return fallbackPlayers;
  };

  // Check API connectivity
  const checkApiHealth = async () => {
    try {
      const response = await adminAPI.health();
      if (response.success) {
        setApiConnected(true);
        console.log('✅ API connected, database healthy');
        return true;
      }
    } catch (err) {
      console.log('⚠️ API not available, running in offline mode');
      setApiConnected(false);
    }
    return false;
  };

  // Load all users from API
  const loadAllUsers = async () => {
    try {
      const response = await usersAPI.getAll();
      if (response.users) {
        console.log('✅ Loaded users from API:', response.users.length);
        setAllUsers(response.users);
      }
    } catch (err) {
      console.log('⚠️ Could not load users from API:', err.message);
      setAllUsers([]);
    }
  };

  // Load all teams from API
  const loadAllTeams = async (tournamentId = null) => {
    try {
      const filters = tournamentId ? { tournamentId } : {};
      const response = await teamsAPI.getAll(filters);
      if (response.teams) {
        console.log('✅ Loaded teams from API:', response.teams.length);
        setAllTeams(response.teams);
      }
    } catch (err) {
      console.log('⚠️ Could not load teams from API:', err.message);
      setAllTeams([]);
    }
  };

  // Delete user (calls API)
  const handleDeleteUser = async (userId) => {
    try {
      await usersAPI.delete(userId);
      console.log('✅ User deleted from API');
      // Refresh users list from API
      loadAllUsers();
    } catch (err) {
      console.error('Failed to delete user:', err);
    }
  };

  useEffect(() => {
    // Check API health
    checkApiHealth();
    
    // Load users and teams from API (for admin panel)
    loadAllUsers();
    loadAllTeams();
    
    // Check if user is logged in
    const savedUser = localStorage.getItem('t20fantasy_user');
    
    if (savedUser) {
      const parsedUser = JSON.parse(savedUser);
      setUser(parsedUser);
      
      // Always go to tournament selection on app load
      // The tournament page will handle loading teams from API
      setCurrentPage('tournamentSelect');
    }
    // If not logged in, stays on login page (default)
  }, []);

  const handleSelectTournament = async (tournament) => {
    console.log(`\n🏆 === SELECTING TOURNAMENT: ${tournament.id} ===`);
    console.log(`   User: ${user?.email} (ID: ${user?.id})`);
    
    setSelectedTournament(tournament);
    // No localStorage - everything from DB
    
    // Load players for this tournament
    setIsLoading(true);
    await loadPlayers(tournament.id);
    
    const tournamentKey = tournament.id;
    let draftStatus = 'pending';
    let draftComplete = false;
    
    // Get league info from API (for draft status)
    try {
      const leaguesResponse = await leaguesAPI.getAll(tournamentKey);
      if (leaguesResponse.leagues && leaguesResponse.leagues.length > 0) {
        const league = leaguesResponse.leagues[0];
        draftStatus = league.draftStatus || 'pending';
        draftComplete = draftStatus === 'completed';
        console.log('✅ Got league from API:', draftStatus);
      }
    } catch (err) {
      console.log('⚠️ Could not get league from API:', err.message);
    }
    
    // Set draft state
    setIsDraftOpen(draftStatus === 'open' || draftStatus === 'in_progress');
    setIsDraftComplete(draftComplete);
    
    // Admin goes to admin panel
    if (user?.isAdmin) {
      console.log(`   → Admin user, going to admin panel`);
      setIsLoading(false);
      setCurrentPage('admin');
      return;
    }
    
    // Get user's team from API
    let userTeam = null;
    try {
      const teamsResponse = await teamsAPI.getUserTeam(user?.id, tournamentKey);
      if (teamsResponse.teams && teamsResponse.teams.length > 0) {
        userTeam = teamsResponse.teams[0];
        console.log('✅ Found team from API:', userTeam.name);
      }
    } catch (err) {
      console.log('⚠️ Could not get team from API:', err.message);
    }
    
    setIsLoading(false);
    
    // Navigate based on team status
    if (userTeam) {
      console.log(`   ✅ TEAM FOUND: ${userTeam.name}, going to dashboard`);
      setTeam(userTeam);
      setCurrentPage('dashboard');
    } else {
      console.log(`   ❌ NO TEAM FOUND, going to createTeam`);
      setTeam(null);
      setCurrentPage('createTeam');
    }
    console.log(`🏆 === END TOURNAMENT SELECTION ===\n`);
  };
  
  // Switch tournament (dropdown handler)
  const handleSwitchTournament = (tournamentId) => {
    const tournament = Object.values(TOURNAMENTS).find(t => t.id === tournamentId);
    if (tournament) {
      handleSelectTournament(tournament);
    }
  };

  const handleLogin = (userData) => {
    console.log('🔐 Login:', userData.email);
    
    setUser(userData);
    localStorage.setItem('t20fantasy_user', JSON.stringify(userData));
    
    // Go to tournament selection
    localStorage.removeItem('t20fantasy_tournament');
    setSelectedTournament(null);
    setCurrentPage('tournamentSelect');
  };

  const handleSignup = (userData) => {
    console.log('📝 Signup:', userData.email);
    
    setUser(userData);
    localStorage.setItem('t20fantasy_user', JSON.stringify(userData));
    
    // Go to tournament selection
    localStorage.removeItem('t20fantasy_tournament');
    setSelectedTournament(null);
    setCurrentPage('tournamentSelect');
  };

  const handleTeamCreated = async (teamData) => {
    const tournamentKey = selectedTournament?.id || 'default';
    
    console.log('🏏 Creating team:', teamData.name);
    
    // Save to database
    try {
      const response = await teamsAPI.create({
        userId: user?.id,
        tournamentId: tournamentKey,
        name: teamData.name,
        ownerName: teamData.owner || teamData.name,
      });
      
      if (response.teamId) {
        const newTeam = {
          id: response.teamId,
          name: teamData.name,
          owner: teamData.owner || teamData.name,
          userId: user?.id,
          tournamentId: tournamentKey,
          leagueId: response.leagueId,
          draftPosition: response.draftPosition,
          roster: [],
          totalPoints: 0,
        };
        
        console.log('✅ Team saved to database:', response.teamId);
        setTeam(newTeam);
        
        // Navigate based on draft status
        if (isDraftOpen) {
          setCurrentPage('draft');
        } else {
          setCurrentPage('dashboard');
        }
      }
    } catch (err) {
      console.error('Failed to create team:', err);
      alert('Failed to create team. Please try again.');
    }
  };

  const handleDraftComplete = async (roster) => {
    console.log('📋 Draft complete, roster:', roster);
    const updatedTeam = { ...team, roster };
    setTeam(updatedTeam);
    
    // Update allTeams so free agents are correctly filtered
    setAllTeams(prev => prev.map(t => 
      t.id === team.id ? { ...t, roster } : t
    ));
    
    // Save roster to database
    try {
      await teamsAPI.update({
        id: team.id,
        roster: roster,
      });
      console.log('✅ Roster saved to database');
    } catch (err) {
      console.error('Failed to save roster:', err);
    }
    
    setIsDraftComplete(true);
    setCurrentPage('dashboard');
  };

  const handleUpdateTeam = async (teamIdOrTeam, updates = null) => {
    // Support both: handleUpdateTeam(updatedTeam) and handleUpdateTeam(teamId, updates)
    if (updates !== null) {
      // Called with (teamId, updates) from admin panel
      const teamId = teamIdOrTeam;
      
      // Update in database
      try {
        await teamsAPI.update({ id: teamId, ...updates });
        console.log('✅ Team updated in database');
      } catch (err) {
        console.error('Failed to update team:', err);
      }
      
      // Update local state
      setAllTeams(prev => prev.map(t => 
        t.id === teamId ? { ...t, ...updates } : t
      ));
      
      if (team && team.id === teamId) {
        setTeam({ ...team, ...updates });
      }
    } else {
      // Called with (updatedTeam) from dashboard
      const updatedTeam = teamIdOrTeam;
      
      // Update in database
      try {
        await teamsAPI.update({ id: updatedTeam.id, roster: updatedTeam.roster });
        console.log('✅ Team updated in database');
      } catch (err) {
        console.error('Failed to update team:', err);
      }
      
      setTeam(updatedTeam);
      setAllTeams(prev => prev.map(t => t.id === updatedTeam.id ? updatedTeam : t));
    }
  };
  
  const handleDeleteTeam = async (teamId) => {
    // Delete from database
    try {
      await teamsAPI.delete(teamId);
      console.log('✅ Team deleted from database');
    } catch (err) {
      console.error('Failed to delete team:', err);
    }
    
    // Update local state
    setAllTeams(prev => prev.filter(t => t.id !== teamId));
    
    if (team && team.id === teamId) {
      setTeam(null);
    }
  };
  
  const handleStartDraft = () => {
    setIsDraftOpen(true);
  };
  
  const handleGoToDraft = () => {
    if (team) {
      setCurrentPage('draft');
    }
  };

  const handleLogout = () => {
    console.log('🚪 Logging out');
    
    // Clear all state
    setUser(null);
    setTeam(null);
    setSelectedTournament(null);
    setIsDraftComplete(false);
    setIsDraftOpen(false);
    
    // Only remove user session
    localStorage.removeItem('t20fantasy_user');
    localStorage.removeItem('t20fantasy_tournament');
    
    setCurrentPage('login');
  };

  const handleBackToTournaments = () => {
    // Keep user logged in, reset tournament state
    setSelectedTournament(null);
    setTeam(null);
    setIsDraftComplete(false);
    setIsDraftOpen(false);
    
    localStorage.removeItem('t20fantasy_tournament');
    
    setCurrentPage('tournamentSelect');
  };

  // Use API-loaded players, fallback to hardcoded if empty
  const playerPool = players.length > 0 
    ? players 
    : (selectedTournament ? getPlayersForTournament(selectedTournament.id) : []);

  return (
    <>
      {currentPage === 'tournamentSelect' && (
        <TournamentSelectPage 
          onSelectTournament={handleSelectTournament}
          user={user}
          onLogout={handleLogout}
        />
      )}
      {currentPage === 'login' && (
        <LoginPage 
          onLogin={handleLogin} 
          onShowSignup={() => setCurrentPage('signup')}
        />
      )}
      {currentPage === 'signup' && (
        <SignupPage 
          onSignup={handleSignup} 
          onShowLogin={() => setCurrentPage('login')} 
        />
      )}
      {currentPage === 'createTeam' && (
        <TeamCreationPage 
          user={user}
          tournament={selectedTournament}
          onTeamCreated={handleTeamCreated} 
        />
      )}
      {currentPage === 'draft' && (
        <SnakeDraftPage
          team={team}
          tournament={selectedTournament}
          players={playerPool}
          allTeams={allTeams}
          onDraftComplete={handleDraftComplete}
          onUpdateTeam={handleUpdateTeam}
        />
      )}
      {currentPage === 'admin' && user?.isAdmin && (
        <AdminPanel
          user={user}
          tournament={selectedTournament || TOURNAMENTS.test_ind_nz}
          players={playerPool}
          onUpdateTournament={async (updatedTournament) => {
            console.log('📅 Tournament updated:', updatedTournament);
            
            // Save to database
            try {
              await tournamentsAPI.update({
                id: updatedTournament.id,
                name: updatedTournament.name,
                startDate: updatedTournament.startDate,
                endDate: updatedTournament.endDate,
                matches: updatedTournament.matches
              });
              console.log('✅ Tournament saved to database');
            } catch (err) {
              console.error('❌ Failed to save tournament to database:', err);
            }
            
            // Update local state
            setSelectedTournament(updatedTournament);
          }}
          onRefreshPlayers={async () => {
            console.log('🔄 Refreshing players from database...');
            if (selectedTournament?.id) {
              await loadPlayers(selectedTournament.id);
            }
          }}
          onLogout={handleLogout}
          onBackToTournaments={handleBackToTournaments}
          onSwitchTournament={handleSwitchTournament}
          allTeams={allTeams}
          allUsers={allUsers}
          onStartDraft={handleStartDraft}
          onDeleteTeam={handleDeleteTeam}
          onUpdateTeam={handleUpdateTeam}
          onDeleteUser={handleDeleteUser}
        />
      )}
      {currentPage === 'dashboard' && (
        <Dashboard 
          user={user} 
          team={team}
          tournament={selectedTournament}
          players={playerPool}
          allTeams={allTeams}
          onLogout={handleLogout}
          onUpdateTeam={handleUpdateTeam}
          onBackToTournaments={handleBackToTournaments}
          onSwitchTournament={handleSwitchTournament}
          isDraftComplete={isDraftComplete}
          isDraftOpen={isDraftOpen}
          onGoToDraft={handleGoToDraft}
          onRefreshPlayers={async () => {
            console.log('🔄 Refreshing players from Dashboard request...');
            if (selectedTournament?.id) {
              await loadPlayers(selectedTournament.id);
            }
          }}
        />
      )}
    </>
  );
}
