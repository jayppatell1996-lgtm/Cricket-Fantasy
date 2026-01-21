/**
 * API Service for T20 Fantasy Cricket
 * Provides functions to interact with the backend APIs
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
      throw new Error(data.error || data.message || 'API request failed');
    }
    
    return data;
  } catch (error) {
    console.error(`API Error [${endpoint}]:`, error);
    throw error;
  }
}

// ============================================
// AUTH API
// ============================================
export const authAPI = {
  async signup(email, password, name) {
    return apiCall('/auth/signup', {
      method: 'POST',
      body: { email, password, name }
    });
  },

  async login(email, password) {
    return apiCall('/auth/login', {
      method: 'POST',
      body: { email, password }
    });
  }
};

// ============================================
// TOURNAMENTS API
// ============================================
export const tournamentsAPI = {
  async getAll() {
    return apiCall('/tournaments');
  },

  async create(tournament) {
    return apiCall('/tournaments', {
      method: 'POST',
      body: tournament
    });
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

  async updateDraftStatus(leagueId, draftStatus, draftOrder = null) {
    const body = { id: leagueId, draftStatus };
    if (draftOrder) body.draftOrder = draftOrder;
    return apiCall('/leagues', {
      method: 'PUT',
      body
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

  async getAvailable(tournamentId, leagueId) {
    return apiCall(`/players?tournament=${tournamentId}&leagueId=${leagueId}&available=true`);
  },

  async getById(playerId) {
    return apiCall(`/players?playerId=${playerId}`);
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
  }
};

// ============================================
// ROSTER API
// ============================================
export const rosterAPI = {
  async get(teamId) {
    return apiCall(`/roster?teamId=${teamId}`);
  },

  async addPlayer(teamId, playerId, slot, acquiredVia = 'draft') {
    return apiCall('/roster', {
      method: 'POST',
      body: { teamId, playerId, slot, acquiredVia }
    });
  },

  async dropPlayer(teamId, playerId) {
    return apiCall('/roster', {
      method: 'DELETE',
      body: { teamId, playerId }
    });
  }
};

// ============================================
// DRAFT API
// ============================================
export const draftAPI = {
  async getPicks(leagueId) {
    return apiCall(`/draft-picks?leagueId=${leagueId}`);
  },

  async makePick(pick) {
    return apiCall('/draft-picks', {
      method: 'POST',
      body: pick
    });
  },

  async reset(leagueId) {
    return apiCall(`/draft-picks?leagueId=${leagueId}`, {
      method: 'DELETE'
    });
  }
};

// ============================================
// USERS API (Admin)
// ============================================
export const usersAPI = {
  async getAll() {
    return apiCall('/users');
  },

  async delete(userId) {
    return apiCall(`/users?id=${userId}`, {
      method: 'DELETE'
    });
  }
};

// ============================================
// SEED API
// ============================================
export const seedAPI = {
  async getStatus() {
    return apiCall('/seed');
  },

  async seed(seedType = 'all') {
    return apiCall('/seed', {
      method: 'POST',
      body: { seedType }
    });
  }
};

// ============================================
// COMBINED HELPERS
// ============================================

/**
 * Initialize app data from database
 * Returns tournaments, user team, and league status
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
 * Get all data needed for draft page
 */
export async function getDraftData(leagueId, tournamentId) {
  try {
    const [leagueRes, teamsRes, playersRes, picksRes] = await Promise.all([
      leaguesAPI.getById(leagueId),
      teamsAPI.getAll({ leagueId }),
      playersAPI.getAvailable(tournamentId, leagueId),
      draftAPI.getPicks(leagueId)
    ]);

    return {
      league: leagueRes.league,
      teams: teamsRes.teams || [],
      availablePlayers: playersRes.players || [],
      draftPicks: picksRes.picks || []
    };
  } catch (error) {
    console.error('Failed to get draft data:', error);
    throw error;
  }
}

/**
 * Get standings for a league
 */
export async function getStandings(leagueId) {
  try {
    const teamsRes = await teamsAPI.getAll({ leagueId });
    const teams = teamsRes.teams || [];
    
    // Sort by total points
    return teams.sort((a, b) => (b.totalPoints || 0) - (a.totalPoints || 0));
  } catch (error) {
    console.error('Failed to get standings:', error);
    return [];
  }
}

export default {
  auth: authAPI,
  tournaments: tournamentsAPI,
  leagues: leaguesAPI,
  teams: teamsAPI,
  players: playersAPI,
  roster: rosterAPI,
  draft: draftAPI,
  users: usersAPI,
  seed: seedAPI,
  initializeAppData,
  getDraftData,
  getStandings
};
