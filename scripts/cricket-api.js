/**
 * CricketData.org API Integration
 * ================================
 * This script handles all interactions with CricketData.org API
 * for fetching players, matches, and fantasy points.
 * 
 * Setup:
 * 1. Sign up at https://cricketdata.org/signup.aspx
 * 2. Get your API key from the dashboard
 * 3. Add to .env: CRICKET_API_KEY=your_key_here
 */

const CRICKET_API_BASE = 'https://api.cricapi.com/v1';

// ============================================
// API HELPER FUNCTIONS
// ============================================

/**
 * Make authenticated request to CricketData.org API
 */
async function cricketApiRequest(endpoint, params = {}) {
  const apiKey = process.env.CRICKET_API_KEY;
  
  if (!apiKey) {
    throw new Error('CRICKET_API_KEY not found in environment variables');
  }
  
  const url = new URL(`${CRICKET_API_BASE}/${endpoint}`);
  url.searchParams.append('apikey', apiKey);
  
  // Add additional parameters
  Object.entries(params).forEach(([key, value]) => {
    if (value) url.searchParams.append(key, value);
  });
  
  console.log(`📡 API Request: ${endpoint}`);
  
  const response = await fetch(url.toString());
  const data = await response.json();
  
  if (data.status !== 'success') {
    throw new Error(`API Error: ${data.reason || 'Unknown error'}`);
  }
  
  return data;
}

// ============================================
// SERIES & TOURNAMENT FUNCTIONS
// ============================================

/**
 * Get list of all available series/tournaments
 */
async function getSeriesList() {
  const data = await cricketApiRequest('series');
  return data.data || [];
}

/**
 * Search for a specific series by name
 */
async function searchSeries(searchTerm) {
  const data = await cricketApiRequest('series', { search: searchTerm });
  return data.data || [];
}

/**
 * Get series info by ID
 */
async function getSeriesInfo(seriesId) {
  const data = await cricketApiRequest('series_info', { id: seriesId });
  return data.data;
}

/**
 * Get squad for a series
 */
async function getSeriesSquad(seriesId) {
  const data = await cricketApiRequest('series_squad', { id: seriesId });
  return data.data || [];
}

// ============================================
// PLAYER FUNCTIONS
// ============================================

/**
 * Search for players by name
 */
async function searchPlayers(name) {
  const data = await cricketApiRequest('players', { search: name });
  return data.data || [];
}

/**
 * Get detailed player info
 */
async function getPlayerInfo(playerId) {
  const data = await cricketApiRequest('players_info', { id: playerId });
  return data.data;
}

// ============================================
// MATCH FUNCTIONS
// ============================================

/**
 * Get current/live matches
 */
async function getCurrentMatches() {
  const data = await cricketApiRequest('currentMatches');
  return data.data || [];
}

/**
 * Get match info by ID
 */
async function getMatchInfo(matchId) {
  const data = await cricketApiRequest('match_info', { id: matchId });
  return data.data;
}

/**
 * Get match scorecard
 */
async function getMatchScorecard(matchId) {
  const data = await cricketApiRequest('match_scorecard', { id: matchId });
  return data.data;
}

/**
 * Get ball-by-ball data for a match
 */
async function getMatchBallByBall(matchId) {
  const data = await cricketApiRequest('match_bbb', { id: matchId });
  return data.data;
}

// ============================================
// FANTASY POINTS FUNCTIONS (PAID PLAN)
// ============================================

/**
 * Get fantasy points for a match
 * Note: Requires paid plan
 */
async function getFantasyPoints(matchId) {
  const data = await cricketApiRequest('match_points', { id: matchId });
  return data.data;
}

/**
 * Get fantasy squad for a match
 * Note: Requires paid plan
 */
async function getFantasySquad(matchId) {
  const data = await cricketApiRequest('match_squad', { id: matchId });
  return data.data;
}

// ============================================
// PLAYER TRANSFORMATION
// ============================================

/**
 * Transform API player data to our database schema
 */
function transformPlayer(apiPlayer, teamCode, tournamentId) {
  // Determine position based on player role
  let position = 'flex';
  const role = (apiPlayer.role || apiPlayer.battingStyle || '').toLowerCase();
  const bowlStyle = (apiPlayer.bowlingStyle || '').toLowerCase();
  
  if (role.includes('wicket') || role.includes('keeper')) {
    position = 'keeper';
  } else if (bowlStyle && !role.includes('bat')) {
    position = 'bowler';
  } else if (role.includes('bat') || role.includes('opening')) {
    position = 'batter';
  } else if (role.includes('all') || (role.includes('bat') && bowlStyle)) {
    position = 'flex';
  }
  
  // Calculate price based on player reputation (customize as needed)
  let price = 8.0; // Base price
  
  // Adjust based on country (star players)
  const starPlayers = [
    'virat kohli', 'rohit sharma', 'jasprit bumrah', 'suryakumar yadav',
    'pat cummins', 'travis head', 'glenn maxwell', 'mitchell starc',
    'jos buttler', 'ben stokes', 'jofra archer',
    'babar azam', 'shaheen afridi',
    'kane williamson', 'trent boult'
  ];
  
  if (starPlayers.includes(apiPlayer.name?.toLowerCase())) {
    price += 3.5;
  }
  
  // Position-based pricing
  if (position === 'keeper') price += 1.0;
  if (position === 'flex') price += 1.5;
  
  // Estimate average fantasy points (will be updated with real data)
  let avgPoints = 25;
  if (position === 'batter') avgPoints = 30;
  if (position === 'bowler') avgPoints = 35;
  if (position === 'flex') avgPoints = 40;
  if (position === 'keeper') avgPoints = 28;
  
  return {
    id: apiPlayer.id || `p_${teamCode.toLowerCase()}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    name: apiPlayer.name,
    team: teamCode,
    position: position,
    price: Math.round(price * 2) / 2, // Round to nearest 0.5
    avgPoints: avgPoints,
    totalPoints: 0,
    tournamentId: tournamentId,
    // Additional metadata
    apiId: apiPlayer.id,
    country: apiPlayer.country,
    imageUrl: apiPlayer.playerImg || null,
  };
}

// ============================================
// EXPORTS
// ============================================

export {
  cricketApiRequest,
  getSeriesList,
  searchSeries,
  getSeriesInfo,
  getSeriesSquad,
  searchPlayers,
  getPlayerInfo,
  getCurrentMatches,
  getMatchInfo,
  getMatchScorecard,
  getMatchBallByBall,
  getFantasyPoints,
  getFantasySquad,
  transformPlayer,
};
