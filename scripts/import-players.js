// Player Import Script for T20 Fantasy
// Run this to populate player databases from JSON files

const fs = require('fs');
const path = require('path');

// Tournament IDs mapping
const TOURNAMENTS = {
  'test_ind_nz': {
    id: 'test_ind_nz',
    name: 'IND vs NZ T20 2026'
  },
  't20_wc_2026': {
    id: 't20_wc_2026', 
    name: 'T20 World Cup 2026'
  },
  'ipl_2026': {
    id: 'ipl_2026',
    name: 'IPL 2026'
  }
};

// Generate unique player ID
function generatePlayerId(name, team) {
  return `${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${team.toLowerCase()}`;
}

// Load JSON file
function loadPlayersFromFile(filename) {
  const filepath = path.join(__dirname, 'data', filename);
  try {
    const data = fs.readFileSync(filepath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error(`Error loading ${filename}:`, err.message);
    return null;
  }
}

// Format players for database
function formatPlayers(data) {
  if (!data || !data.players) return [];
  
  return data.players.map((p, index) => ({
    id: generatePlayerId(p.name, p.team),
    name: p.name,
    team: p.team,
    position: p.position,
    totalPoints: 0,
    matchesPlayed: 0,
    gameLog: []
  }));
}

// Export for use in app
module.exports = {
  loadPlayersFromFile,
  formatPlayers,
  TOURNAMENTS
};

// If run directly
if (require.main === module) {
  console.log('Player Import Script');
  console.log('===================');
  
  const files = [
    'test_ind_nz_players.json',
    't20_wc_2026_players.json',
    'ipl_2026_players.json'
  ];
  
  files.forEach(file => {
    const data = loadPlayersFromFile(file);
    if (data) {
      const players = formatPlayers(data);
      console.log(`\\n${data.tournament}: ${players.length} players loaded`);
      console.log('Sample:', players.slice(0, 3).map(p => `${p.name} (${p.team})`).join(', '));
    }
  });
}
