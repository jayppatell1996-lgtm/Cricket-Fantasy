/**
 * API Service for T20 Fantasy Cricket
 * Provides functions to interact with the backend APIs
 * 
 * Consolidated API Endpoints:
 * - /api/auth?action=signup|login
 * - /api/admin?action=health|seed|users|tournaments
 * - /api/leagues
 * - /api/teams
 * - /api/players
 * - /api/draft?type=roster
 */

// Base URL for API calls
const API_BASE = '/api';

// Helper for API calls
async function apiCall(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  
  const config = {
    headers: {
      'Content-Type': 'application/json',
    },
    ...options,
  };

  if (config.body && typeof config.body === 'object') {
    config.body = JSON.stringify(config.body);
  }

  try {
    const response = await fetch(url, config);
    const data = await response.json();
    
    if (!response.ok) {
      // Return the error data with success: false so caller can check specific error types
      return { 
        success: false, 
        error: data.error || data.message || 'API request failed',
        ...data  // Include any additional error properties like noApiKey, noScorecard
      };
    }
    
    return data;
  } catch (error) {
    console.error(`API Error [${endpoint}]:`, error);
    // Return a standardized error response
    return { 
      success: false, 
      error: error.message || 'Network error',
      networkError: true
    };
  }
}

// ============================================
// AUTH API
// ============================================
export const authAPI = {
  async signup(email, password, name) {
    return apiCall('/auth?action=signup', {
      method: 'POST',
      body: { email, password, name }
    });
  },

  async login(email, password) {
    return apiCall('/auth?action=login', {
      method: 'POST',
      body: { email, password }
    });
  }
};

// ============================================
// ADMIN API (Health, Seed, Users, Tournaments)
// ============================================
export const adminAPI = {
  async health() {
    return apiCall('/admin?action=health');
  },

  async getSeedStatus() {
    return apiCall('/admin?action=seed');
  },

  async seed(seedType = 'all') {
    return apiCall('/admin?action=seed', {
      method: 'POST',
      body: { seedType }
    });
  },

  async getUsers() {
    return apiCall('/admin?action=users');
  },

  async deleteUser(userId) {
    return apiCall(`/admin?action=users&id=${userId}`, {
      method: 'DELETE'
    });
  },

  async getTournaments() {
    return apiCall('/admin?action=tournaments');
  },

  async createTournament(tournament) {
    return apiCall('/admin?action=tournaments', {
      method: 'POST',
      body: tournament
    });
  },

  async updateTournament(data) {
    return apiCall('/admin?action=tournaments', {
      method: 'PUT',
      body: data
    });
  }
};

// ============================================
// TOURNAMENTS API (uses admin endpoint)
// ============================================
export const tournamentsAPI = {
  async getAll() {
    return adminAPI.getTournaments();
  },

  async create(tournament) {
    return adminAPI.createTournament(tournament);
  },

  async update(data) {
    return adminAPI.updateTournament(data);
  }
};

// ============================================
// LEAGUES API
// ============================================
export const leaguesAPI = {
  async getAll(tournamentId = null) {
    const query = tournamentId ? `?tournamentId=${tournamentId}` : '';
    return apiCall(`/leagues${query}`);
  },

  async getById(leagueId) {
    return apiCall(`/leagues?leagueId=${leagueId}`);
  },

  async create(league) {
    return apiCall('/leagues', {
      method: 'POST',
      body: league
    });
  },

  async update(league) {
    return apiCall('/leagues', {
      method: 'PUT',
      body: league
    });
  },

  async delete(leagueId) {
    return apiCall(`/leagues?id=${leagueId}`, {
      method: 'DELETE'
    });
  }
};

// ============================================
// TEAMS API
// ============================================
export const teamsAPI = {
  async getAll(filters = {}) {
    const params = new URLSearchParams();
    if (filters.tournamentId) params.append('tournamentId', filters.tournamentId);
    if (filters.leagueId) params.append('leagueId', filters.leagueId);
    if (filters.userId) params.append('userId', filters.userId);
    const query = params.toString() ? `?${params.toString()}` : '';
    return apiCall(`/teams${query}`);
  },

  async getById(teamId) {
    return apiCall(`/teams?teamId=${teamId}`);
  },

  async getUserTeam(userId, tournamentId) {
    return apiCall(`/teams?userId=${userId}&tournamentId=${tournamentId}`);
  },

  async create(team) {
    return apiCall('/teams', {
      method: 'POST',
      body: team
    });
  },

  async update(team) {
    return apiCall('/teams', {
      method: 'PUT',
      body: team
    });
  },

  async delete(teamId) {
    return apiCall(`/teams?teamId=${teamId}`, {
      method: 'DELETE'
    });
  }
};

// ============================================
// PLAYERS API
// ============================================
export const playersAPI = {
  async getAll(tournamentId = null) {
    const query = tournamentId ? `?tournament=${tournamentId}` : '';
    return apiCall(`/players${query}`);
  },

  // Alias for getAll with tournament filter
  async getByTournament(tournamentId) {
    return this.getAll(tournamentId);
  },

  async getAvailable(tournamentId, leagueId) {
    return apiCall(`/players?tournament=${tournamentId}&leagueId=${leagueId}&available=true`);
  },

  async getById(playerId) {
    return apiCall(`/players?playerId=${playerId}`);
  },

  async getGameLog(playerId) {
    return apiCall(`/players?playerId=${playerId}&action=gamelog`);
  },

  async create(player) {
    return apiCall('/players', {
      method: 'POST',
      body: player
    });
  },

  async bulkCreate(players, tournamentId) {
    return apiCall('/players', {
      method: 'POST',
      body: { players, tournamentId }
    });
  },

  async update(player) {
    return apiCall('/players', {
      method: 'PUT',
      body: player
    });
  },

  async delete(playerId) {
    return apiCall(`/players?playerId=${playerId}`, {
      method: 'DELETE'
    });
  },

  async deleteAll(tournamentId) {
    return apiCall(`/players?tournament=${tournamentId}`, {
      method: 'DELETE'
    });
  }
};

// ============================================
// ROSTER API
// ============================================
export const rosterAPI = {
  async get(teamId) {
    return apiCall(`/draft?type=roster&teamId=${teamId}`);
  },

  async addPlayer(teamId, playerId, slot, acquiredVia = 'free_agency') {
    return apiCall('/draft?type=roster', {
      method: 'POST',
      body: { teamId, playerId, slot, acquiredVia }
    });
  },

  async dropPlayer(teamId, playerId) {
    return apiCall('/draft?type=roster', {
      method: 'DELETE',
      body: { teamId, playerId }
    });
  }
};

// ============================================
// USERS API (Part of Admin)
// ============================================
export const usersAPI = {
  async getAll() {
    return adminAPI.getUsers();
  },

  async delete(userId) {
    return adminAPI.deleteUser(userId);
  }
};

// ============================================
// LIVE SYNC API - CricketData.org Integration
// ============================================
export const liveSyncAPI = {
  /**
   * Get live matches from Cricket API
   * Returns list of currently live T20 matches
   */
  async getLiveMatches() {
    return apiCall('/live-sync?action=live');
  },

  /**
   * Get all matches for a tournament from Cricket API
   * Uses series search → series info flow
   */
  async getMatchesForTournament(tournamentId) {
    return apiCall(`/live-sync?tournamentId=${encodeURIComponent(tournamentId)}`);
  },

  /**
   * Preview scorecard - fetch from Cricket API, calculate points, but DON'T save
   * Returns player stats with calculated fantasy points for admin review
   */
  async previewScorecard(matchId, tournamentId, { teams, matchDate, cricketApiMatchId } = {}) {
    return apiCall('/live-sync', {
      method: 'POST',
      body: { 
        matchId, 
        tournamentId, 
        teams,
        matchDate,
        cricketApiMatchId
      }
    });
  },

  /**
   * Apply points - save previously previewed stats to database
   * Call this after admin approves the preview
   */
  async applyPoints(matchId, tournamentId, cricketApiMatchId, playerStats, matchDate) {
    return apiCall('/live-sync?action=apply', {
      method: 'POST',
      body: { 
        matchId, 
        tournamentId, 
        cricketApiMatchId,
        playerStats,
        matchDate // IMPORTANT: Include date for player_stats
      }
    });
  }
};

// ============================================
// SEED API (Part of Admin)
// ============================================
export const seedAPI = {
  async getStatus() {
    return adminAPI.getSeedStatus();
  },

  async seed(seedType = 'all') {
    return adminAPI.seed(seedType);
  }
};

// ============================================
// COMBINED HELPERS
// ============================================

/**
 * Initialize app data from database
 */
export async function initializeAppData(userId, tournamentId) {
  try {
    const [tournamentsRes, teamsRes, leaguesRes] = await Promise.all([
      tournamentsAPI.getAll(),
      userId && tournamentId ? teamsAPI.getUserTeam(userId, tournamentId) : Promise.resolve({ teams: [] }),
      tournamentId ? leaguesAPI.getAll(tournamentId) : Promise.resolve({ leagues: [] })
    ]);

    return {
      tournaments: tournamentsRes.tournaments || [],
      userTeam: teamsRes.teams?.[0] || null,
      league: leaguesRes.leagues?.[0] || null
    };
  } catch (error) {
    console.error('Failed to initialize app data:', error);
    return { tournaments: [], userTeam: null, league: null };
  }
}

/**
 * Get standings for a league
 */
export async function getStandings(leagueId) {
  try {
    const teamsRes = await teamsAPI.getAll({ leagueId });
    const teams = teamsRes.teams || [];
    return teams.sort((a, b) => (b.totalPoints || 0) - (a.totalPoints || 0));
  } catch (error) {
    console.error('Failed to get standings:', error);
    return [];
  }
}

export default {
  auth: authAPI,
  admin: adminAPI,
  tournaments: tournamentsAPI,
  leagues: leaguesAPI,
  teams: teamsAPI,
  players: playersAPI,
  roster: rosterAPI,
  users: usersAPI,
  seed: seedAPI,
  liveSync: liveSyncAPI,
  initializeAppData,
  getStandings
};
