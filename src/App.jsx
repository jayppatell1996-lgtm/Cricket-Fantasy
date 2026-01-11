import React, { useState, useEffect, useCallback } from 'react';

// ============================================
// T20 FANTASY CRICKET - COMPLETE APPLICATION
// With Tournaments, Snake Draft & Test Mode
// ============================================

// Tournament Configurations
const TOURNAMENTS = {
  test_ind_nz: {
    id: 'test_ind_nz',
    name: 'India vs NZ T20 Series',
    shortName: 'IND vs NZ',
    description: 'Test tournament to verify app functionality',
    startDate: '2026-01-15',
    endDate: '2026-01-25',
    status: 'test',
    teams: ['IND', 'NZ'],
    isTest: true,
    draftStatus: 'pending', // pending, open, in_progress, completed
    matches: [
      { id: 'm1', name: '1st T20I', teams: 'IND vs NZ', venue: 'Rajkot', date: '2026-01-15', status: 'completed' },
      { id: 'm2', name: '2nd T20I', teams: 'IND vs NZ', venue: 'Mumbai', date: '2026-01-18', status: 'completed' },
      { id: 'm3', name: '3rd T20I', teams: 'IND vs NZ', venue: 'Kolkata', date: '2026-01-21', status: 'live' },
      { id: 'm4', name: '4th T20I', teams: 'IND vs NZ', venue: 'Delhi', date: '2026-01-23', status: 'upcoming' },
      { id: 'm5', name: '5th T20I', teams: 'IND vs NZ', venue: 'Bangalore', date: '2026-01-25', status: 'upcoming' },
    ],
  },
  t20_wc_2026: {
    id: 't20_wc_2026',
    name: 'T20 World Cup 2026',
    shortName: 'T20 WC 2026',
    description: 'ICC T20 World Cup - February 2026',
    startDate: '2026-02-09',
    endDate: '2026-03-07',
    status: 'upcoming',
    teams: ['IND', 'AUS', 'ENG', 'PAK', 'NZ', 'SA', 'WI', 'SL', 'BAN', 'AFG', 'ZIM', 'IRE', 'SCO', 'NAM', 'USA', 'NEP'],
    isTest: false,
    draftStatus: 'pending',
    matches: [], // Will be populated when tournament starts
  },
  ipl_2026: {
    id: 'ipl_2026',
    name: 'IPL 2026',
    shortName: 'IPL 2026',
    description: 'Indian Premier League - March 2026',
    startDate: '2026-03-22',
    endDate: '2026-05-26',
    status: 'upcoming',
    teams: ['CSK', 'MI', 'RCB', 'KKR', 'DC', 'PBKS', 'RR', 'SRH', 'GT', 'LSG'],
    isTest: false,
    draftStatus: 'pending',
    matches: [], // Will be populated when tournament starts
  },
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
const SQUAD_CONFIG = {
  batters: { min: 6, max: 6, label: 'Batters', icon: '🏏' },
  keepers: { min: 2, max: 2, label: 'Wicketkeepers', icon: '🧤' },
  bowlers: { min: 6, max: 6, label: 'Bowlers', icon: '🎯' },
  flex: { min: 2, max: 2, label: 'Flex/Utility', icon: '⚡' },
};

const FREE_AGENCY_LIMIT = 4;
const TOTAL_ROSTER_SIZE = 16;

// Test Players for India vs NZ
const TEST_PLAYERS_IND_NZ = [
  // India
  { id: 't1', name: 'Virat Kohli', team: 'IND', position: 'batter', price: 12.5, avgPoints: 45.2, totalPoints: 0 },
  { id: 't2', name: 'Rohit Sharma', team: 'IND', position: 'batter', price: 12.0, avgPoints: 42.8, totalPoints: 0 },
  { id: 't3', name: 'Suryakumar Yadav', team: 'IND', position: 'batter', price: 11.0, avgPoints: 44.1, totalPoints: 0 },
  { id: 't4', name: 'Shubman Gill', team: 'IND', position: 'batter', price: 10.0, avgPoints: 38.5, totalPoints: 0 },
  { id: 't5', name: 'Rishabh Pant', team: 'IND', position: 'keeper', price: 10.5, avgPoints: 40.2, totalPoints: 0 },
  { id: 't6', name: 'KL Rahul', team: 'IND', position: 'keeper', price: 9.5, avgPoints: 36.8, totalPoints: 0 },
  { id: 't7', name: 'Jasprit Bumrah', team: 'IND', position: 'bowler', price: 11.0, avgPoints: 38.2, totalPoints: 0 },
  { id: 't8', name: 'Mohammed Shami', team: 'IND', position: 'bowler', price: 9.5, avgPoints: 34.5, totalPoints: 0 },
  { id: 't9', name: 'Ravindra Jadeja', team: 'IND', position: 'flex', price: 10.0, avgPoints: 36.2, totalPoints: 0 },
  { id: 't10', name: 'Hardik Pandya', team: 'IND', position: 'flex', price: 9.5, avgPoints: 35.8, totalPoints: 0 },
  { id: 't11', name: 'Yuzvendra Chahal', team: 'IND', position: 'bowler', price: 8.5, avgPoints: 32.1, totalPoints: 0 },
  { id: 't12', name: 'Kuldeep Yadav', team: 'IND', position: 'bowler', price: 8.0, avgPoints: 30.5, totalPoints: 0 },
  // New Zealand
  { id: 't13', name: 'Kane Williamson', team: 'NZ', position: 'batter', price: 11.0, avgPoints: 40.5, totalPoints: 0 },
  { id: 't14', name: 'Devon Conway', team: 'NZ', position: 'batter', price: 10.0, avgPoints: 38.2, totalPoints: 0 },
  { id: 't15', name: 'Glenn Phillips', team: 'NZ', position: 'batter', price: 9.5, avgPoints: 36.8, totalPoints: 0 },
  { id: 't16', name: 'Daryl Mitchell', team: 'NZ', position: 'batter', price: 9.0, avgPoints: 35.2, totalPoints: 0 },
  { id: 't17', name: 'Tom Latham', team: 'NZ', position: 'keeper', price: 8.5, avgPoints: 32.5, totalPoints: 0 },
  { id: 't18', name: 'Tom Blundell', team: 'NZ', position: 'keeper', price: 7.5, avgPoints: 28.2, totalPoints: 0 },
  { id: 't19', name: 'Trent Boult', team: 'NZ', position: 'bowler', price: 10.0, avgPoints: 35.8, totalPoints: 0 },
  { id: 't20', name: 'Tim Southee', team: 'NZ', position: 'bowler', price: 9.0, avgPoints: 33.2, totalPoints: 0 },
  { id: 't21', name: 'Matt Henry', team: 'NZ', position: 'bowler', price: 8.0, avgPoints: 30.5, totalPoints: 0 },
  { id: 't22', name: 'Mitchell Santner', team: 'NZ', position: 'flex', price: 8.5, avgPoints: 31.8, totalPoints: 0 },
  { id: 't23', name: 'Rachin Ravindra', team: 'NZ', position: 'flex', price: 9.0, avgPoints: 34.5, totalPoints: 0 },
  { id: 't24', name: 'Lockie Ferguson', team: 'NZ', position: 'bowler', price: 8.5, avgPoints: 32.8, totalPoints: 0 },
];

// Full player pool for T20 WC and IPL
const FULL_PLAYER_POOL = [
  // Batters
  { id: 1, name: 'Virat Kohli', team: 'IND', position: 'batter', price: 12.5, avgPoints: 45.2, totalPoints: 0 },
  { id: 2, name: 'Rohit Sharma', team: 'IND', position: 'batter', price: 12.0, avgPoints: 42.8, totalPoints: 0 },
  { id: 3, name: 'Babar Azam', team: 'PAK', position: 'batter', price: 11.5, avgPoints: 43.5, totalPoints: 0 },
  { id: 4, name: 'Suryakumar Yadav', team: 'IND', position: 'batter', price: 11.0, avgPoints: 44.1, totalPoints: 0 },
  { id: 5, name: 'David Warner', team: 'AUS', position: 'batter', price: 10.5, avgPoints: 39.5, totalPoints: 0 },
  { id: 6, name: 'Kane Williamson', team: 'NZ', position: 'batter', price: 10.0, avgPoints: 38.2, totalPoints: 0 },
  { id: 7, name: 'Travis Head', team: 'AUS', position: 'batter', price: 10.0, avgPoints: 40.5, totalPoints: 0 },
  { id: 8, name: 'Phil Salt', team: 'ENG', position: 'batter', price: 9.5, avgPoints: 38.8, totalPoints: 0 },
  { id: 9, name: 'Shubman Gill', team: 'IND', position: 'batter', price: 9.5, avgPoints: 37.2, totalPoints: 0 },
  { id: 10, name: 'Aiden Markram', team: 'SA', position: 'batter', price: 9.0, avgPoints: 35.5, totalPoints: 0 },
  { id: 11, name: 'Glenn Phillips', team: 'NZ', position: 'batter', price: 9.0, avgPoints: 36.8, totalPoints: 0 },
  { id: 12, name: 'Harry Brook', team: 'ENG', position: 'batter', price: 9.5, avgPoints: 38.2, totalPoints: 0 },
  // Keepers
  { id: 20, name: 'Jos Buttler', team: 'ENG', position: 'keeper', price: 11.5, avgPoints: 48.3, totalPoints: 0 },
  { id: 21, name: 'Quinton de Kock', team: 'SA', position: 'keeper', price: 10.5, avgPoints: 42.1, totalPoints: 0 },
  { id: 22, name: 'Rishabh Pant', team: 'IND', position: 'keeper', price: 10.5, avgPoints: 40.2, totalPoints: 0 },
  { id: 23, name: 'Nicholas Pooran', team: 'WI', position: 'keeper', price: 9.5, avgPoints: 39.8, totalPoints: 0 },
  { id: 24, name: 'Mohammad Rizwan', team: 'PAK', position: 'keeper', price: 9.5, avgPoints: 38.2, totalPoints: 0 },
  { id: 25, name: 'KL Rahul', team: 'IND', position: 'keeper', price: 9.0, avgPoints: 36.8, totalPoints: 0 },
  { id: 26, name: 'Heinrich Klaasen', team: 'SA', position: 'keeper', price: 9.0, avgPoints: 37.5, totalPoints: 0 },
  { id: 27, name: 'Tom Latham', team: 'NZ', position: 'keeper', price: 8.0, avgPoints: 32.5, totalPoints: 0 },
  // Bowlers
  { id: 40, name: 'Jasprit Bumrah', team: 'IND', position: 'bowler', price: 11.5, avgPoints: 40.2, totalPoints: 0 },
  { id: 41, name: 'Rashid Khan', team: 'AFG', position: 'bowler', price: 11.0, avgPoints: 38.8, totalPoints: 0 },
  { id: 42, name: 'Shaheen Afridi', team: 'PAK', position: 'bowler', price: 10.5, avgPoints: 36.5, totalPoints: 0 },
  { id: 43, name: 'Trent Boult', team: 'NZ', position: 'bowler', price: 10.0, avgPoints: 35.8, totalPoints: 0 },
  { id: 44, name: 'Mitchell Starc', team: 'AUS', position: 'bowler', price: 10.5, avgPoints: 37.2, totalPoints: 0 },
  { id: 45, name: 'Pat Cummins', team: 'AUS', position: 'bowler', price: 10.0, avgPoints: 35.5, totalPoints: 0 },
  { id: 46, name: 'Adil Rashid', team: 'ENG', position: 'bowler', price: 9.0, avgPoints: 33.8, totalPoints: 0 },
  { id: 47, name: 'Anrich Nortje', team: 'SA', position: 'bowler', price: 9.5, avgPoints: 34.2, totalPoints: 0 },
  { id: 48, name: 'Wanindu Hasaranga', team: 'SL', position: 'bowler', price: 9.0, avgPoints: 34.5, totalPoints: 0 },
  { id: 49, name: 'Adam Zampa', team: 'AUS', position: 'bowler', price: 8.5, avgPoints: 32.8, totalPoints: 0 },
  { id: 50, name: 'Mohammed Shami', team: 'IND', position: 'bowler', price: 9.0, avgPoints: 34.5, totalPoints: 0 },
  { id: 51, name: 'Kagiso Rabada', team: 'SA', position: 'bowler', price: 9.5, avgPoints: 35.2, totalPoints: 0 },
  { id: 52, name: 'Josh Hazlewood', team: 'AUS', position: 'bowler', price: 9.0, avgPoints: 33.5, totalPoints: 0 },
  { id: 53, name: 'Lockie Ferguson', team: 'NZ', position: 'bowler', price: 8.5, avgPoints: 32.8, totalPoints: 0 },
  // Flex/All-rounders
  { id: 60, name: 'Hardik Pandya', team: 'IND', position: 'flex', price: 10.5, avgPoints: 38.5, totalPoints: 0 },
  { id: 61, name: 'Glenn Maxwell', team: 'AUS', position: 'flex', price: 10.0, avgPoints: 40.2, totalPoints: 0 },
  { id: 62, name: 'Shakib Al Hasan', team: 'BAN', position: 'flex', price: 9.0, avgPoints: 34.5, totalPoints: 0 },
  { id: 63, name: 'Ravindra Jadeja', team: 'IND', position: 'flex', price: 9.5, avgPoints: 36.2, totalPoints: 0 },
  { id: 64, name: 'Marcus Stoinis', team: 'AUS', position: 'flex', price: 8.5, avgPoints: 33.8, totalPoints: 0 },
  { id: 65, name: 'Mitchell Marsh', team: 'AUS', position: 'flex', price: 9.0, avgPoints: 35.5, totalPoints: 0 },
  { id: 66, name: 'Moeen Ali', team: 'ENG', position: 'flex', price: 8.0, avgPoints: 31.2, totalPoints: 0 },
  { id: 67, name: 'Liam Livingstone', team: 'ENG', position: 'flex', price: 8.5, avgPoints: 34.8, totalPoints: 0 },
];

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
const TournamentSelectPage = ({ onSelectTournament }) => {
  return (
    <div className="tournament-select-page">
      <div className="tournament-container">
        <div className="tournament-header">
          <div className="logo-icon">🏏</div>
          <h1>T20 Fantasy Cricket</h1>
          <p>Select a Tournament</p>
        </div>
        
        <div className="tournament-list">
          {Object.values(TOURNAMENTS).map(tournament => (
            <div 
              key={tournament.id} 
              className={`tournament-card ${tournament.isTest ? 'test-tournament' : ''}`}
              onClick={() => onSelectTournament(tournament)}
            >
              <div className="tournament-badge">
                {tournament.isTest ? '🧪 TEST' : tournament.status === 'upcoming' ? '📅 UPCOMING' : '🔴 LIVE'}
              </div>
              <h3>{tournament.name}</h3>
              <p className="tournament-desc">{tournament.description}</p>
              <div className="tournament-dates">
                {new Date(tournament.startDate).toLocaleDateString()} - {new Date(tournament.endDate).toLocaleDateString()}
              </div>
              <div className="tournament-teams">
                {tournament.teams.slice(0, 6).join(' • ')}
                {tournament.teams.length > 6 && ` +${tournament.teams.length - 6} more`}
              </div>
              <button className="btn-primary btn-small">
                {tournament.isTest ? 'Start Test Mode' : 'Enter Tournament'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// Login Page Component
const LoginPage = ({ onLogin, onShowSignup, tournament }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    await new Promise(resolve => setTimeout(resolve, 800));
    
    if (email && password.length >= 6) {
      const isAdmin = isAdminUser(email);
      onLogin({ 
        email, 
        id: Date.now(), 
        name: email.split('@')[0],
        isAdmin 
      });
    } else {
      setError('Invalid credentials. Password must be at least 6 characters.');
    }
    setLoading(false);
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-header">
          <div className="logo-icon">🏏</div>
          <h1>T20 Fantasy</h1>
          <p>{tournament?.shortName || 'World Cup 2026'}</p>
          {tournament?.isTest && <span className="test-badge">TEST MODE</span>}
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
    await new Promise(resolve => setTimeout(resolve, 800));
    onSignup({ email: formData.email, name: formData.name, id: Date.now() });
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
    await new Promise(resolve => setTimeout(resolve, 800));
    
    onTeamCreated({
      id: Date.now(),
      name: teamName,
      owner: ownerName,
      logo: logoPreview || null,
      roster: [],
      ir: [],
      weeklyPickups: 0,
      weeklyPickupLimit: FREE_AGENCY_LIMIT,
      totalPoints: 0,
      tournamentId: tournament.id,
    });
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

// Snake Draft Component
const SnakeDraftPage = ({ team, tournament, players, onDraftComplete, onUpdateTeam }) => {
  const [availablePlayers, setAvailablePlayers] = useState([...players]);
  const [draftOrder, setDraftOrder] = useState([]);
  const [currentPick, setCurrentPick] = useState(0);
  const [draftLog, setDraftLog] = useState([]);
  const [filterPosition, setFilterPosition] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [draftStarted, setDraftStarted] = useState(false);

  // Mock other teams for draft
  const initialTeams = [
    { id: team.id, name: team.name, isUser: true, roster: [] },
    { id: 'cpu1', name: 'Cricket Kings', isUser: false, roster: [] },
    { id: 'cpu2', name: 'Boundary Bashers', isUser: false, roster: [] },
    { id: 'cpu3', name: 'Wicket Warriors', isUser: false, roster: [] },
  ];

  const [teams, setTeams] = useState(initialTeams);

  useEffect(() => {
    const order = generateSnakeDraftOrder(initialTeams, TOTAL_ROSTER_SIZE);
    setDraftOrder(order);
  }, []);

  const currentDraftPick = draftOrder[currentPick];
  const isUsersTurn = currentDraftPick?.teamId === team.id;

  const getRosterCount = (teamRoster, position) => {
    return teamRoster.filter(p => p.position === position).length;
  };

  const canDraftPosition = (position, teamRoster) => {
    const posKey = position === 'keeper' ? 'keepers' : position + 's';
    const current = getRosterCount(teamRoster, position);
    return current < SQUAD_CONFIG[posKey].max;
  };

  const draftPlayer = (player) => {
    if (!isUsersTurn) return;
    
    const userTeam = teams.find(t => t.id === team.id);
    if (!canDraftPosition(player.position, userTeam.roster)) {
      alert(`You already have max ${player.position}s!`);
      return;
    }

    executePick(team.id, player);
  };

  const executePick = useCallback((teamId, player) => {
    const pickingTeam = teams.find(t => t.id === teamId);
    
    // Update teams
    const updatedTeams = teams.map(t => {
      if (t.id === teamId) {
        return { ...t, roster: [...t.roster, player] };
      }
      return t;
    });
    setTeams(updatedTeams);
    
    // Remove from available
    const newAvailable = availablePlayers.filter(p => p.id !== player.id);
    setAvailablePlayers(newAvailable);
    
    // Log pick
    setDraftLog(prev => [...prev, { 
      pick: currentPick + 1, 
      round: currentDraftPick?.round,
      team: pickingTeam.name, 
      player: player.name,
      position: player.position 
    }]);
    
    // Check if draft is complete
    if (currentPick + 1 >= draftOrder.length) {
      const finalUserTeam = updatedTeams.find(t => t.id === team.id);
      setTimeout(() => onDraftComplete(finalUserTeam.roster), 500);
      return;
    }
    
    // Move to next pick
    setCurrentPick(prev => prev + 1);
  }, [teams, availablePlayers, currentPick, draftOrder, currentDraftPick, team.id, onDraftComplete]);

  // CPU auto-draft
  useEffect(() => {
    if (!draftStarted || currentPick >= draftOrder.length) return;
    
    const currentPickData = draftOrder[currentPick];
    if (currentPickData?.teamId === team.id) return; // User's turn
    
    const timer = setTimeout(() => {
      const cpuTeam = teams.find(t => t.id === currentPickData.teamId);
      if (!cpuTeam) return;
      
      // Find best available player for needed position
      const neededPositions = Object.entries(SQUAD_CONFIG)
        .filter(([key, config]) => {
          const pos = key === 'keepers' ? 'keeper' : key.slice(0, -1);
          return getRosterCount(cpuTeam.roster, pos) < config.max;
        })
        .map(([key]) => key === 'keepers' ? 'keeper' : key.slice(0, -1));

      const eligiblePlayers = availablePlayers.filter(p => neededPositions.includes(p.position));
      const bestPlayer = eligiblePlayers.sort((a, b) => b.avgPoints - a.avgPoints)[0];

      if (bestPlayer) {
        executePick(currentPickData.teamId, bestPlayer);
      }
    }, 800);

    return () => clearTimeout(timer);
  }, [currentPick, draftStarted, draftOrder, team.id, teams, availablePlayers, executePick]);

  const startDraft = () => {
    setDraftStarted(true);
  };

  const filteredPlayers = availablePlayers.filter(p => {
    const matchesPosition = filterPosition === 'all' || p.position === filterPosition;
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         p.team.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesPosition && matchesSearch;
  });

  const userTeam = teams.find(t => t.id === team.id);

  if (draftOrder.length === 0) {
    return <div className="draft-page"><div className="loading">Generating draft order...</div></div>;
  }

  if (!draftStarted) {
    return (
      <div className="draft-page">
        <div className="draft-intro">
          <div className="draft-intro-content">
            <h1>🐍 Snake Draft</h1>
            <p>You'll be drafting against 3 CPU teams in snake draft format.</p>
            
            <div className="draft-order-preview">
              <h3>Draft Order</h3>
              <div className="team-order">
                {initialTeams.map((t, i) => (
                  <div key={t.id} className={`order-item ${t.isUser ? 'user' : ''}`}>
                    <span className="order-num">{i + 1}</span>
                    <span className="order-name">{t.name}</span>
                    {t.isUser && <span className="you-badge">YOU</span>}
                  </div>
                ))}
              </div>
            </div>
            
            <div className="snake-explanation">
              <h4>How Snake Draft Works</h4>
              <p>Round 1: 1 → 2 → 3 → 4</p>
              <p>Round 2: 4 → 3 → 2 → 1</p>
              <p>Round 3: 1 → 2 → 3 → 4</p>
              <p>...and so on</p>
            </div>
            
            <button className="btn-primary btn-large" onClick={startDraft}>
              Start Draft
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="draft-page">
      <header className="draft-header">
        <div className="draft-title">
          <h1>🐍 Snake Draft</h1>
          <span className="draft-round">Round {currentDraftPick?.round || 1} • Pick {currentPick + 1}/{draftOrder.length}</span>
        </div>
        {isUsersTurn ? (
          <div className="your-turn-indicator">🎯 YOUR PICK!</div>
        ) : (
          <div className="waiting-indicator">⏳ {currentDraftPick?.teamName} is picking...</div>
        )}
      </header>

      <div className="draft-content">
        <div className="draft-sidebar">
          <div className="my-roster-preview">
            <h3>Your Roster ({userTeam?.roster.length || 0}/{TOTAL_ROSTER_SIZE})</h3>
            {Object.entries(SQUAD_CONFIG).map(([key, config]) => {
              const pos = key === 'keepers' ? 'keeper' : key.slice(0, -1);
              const count = getRosterCount(userTeam?.roster || [], pos);
              return (
                <div key={key} className="roster-slot-status">
                  <span>{config.icon} {config.label}</span>
                  <span className={count >= config.max ? 'full' : ''}>{count}/{config.max}</span>
                </div>
              );
            })}
          </div>
          
          <div className="draft-log">
            <h3>Recent Picks</h3>
            <div className="log-entries">
              {draftLog.slice(-10).reverse().map((entry, i) => (
                <div key={i} className={`log-entry ${entry.team === team.name ? 'user-pick' : ''}`}>
                  <span className="pick-num">#{entry.pick}</span>
                  <span className="pick-info">
                    <span className="pick-team">{entry.team}</span>
                    <span className="pick-player">{entry.player}</span>
                  </span>
                </div>
              ))}
              {draftLog.length === 0 && <p className="no-picks">No picks yet</p>}
            </div>
          </div>
        </div>

        <div className="draft-main">
          <div className="draft-filters">
            <input
              type="search"
              placeholder="Search players..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />
            <select 
              value={filterPosition} 
              onChange={(e) => setFilterPosition(e.target.value)}
              className="filter-select"
            >
              <option value="all">All Positions</option>
              <option value="batter">Batters</option>
              <option value="keeper">Keepers</option>
              <option value="bowler">Bowlers</option>
              <option value="flex">Flex</option>
            </select>
          </div>

          <div className="available-players">
            {filteredPlayers.map(player => {
              const canDraft = isUsersTurn && canDraftPosition(player.position, userTeam?.roster || []);
              return (
                <div 
                  key={player.id} 
                  className={`draft-player-card ${!isUsersTurn ? 'waiting' : !canDraft ? 'disabled' : ''}`}
                  onClick={() => canDraft && draftPlayer(player)}
                >
                  <div className="player-main">
                    <span className="player-name">{player.name}</span>
                    <span className={`position-badge ${player.position}`}>
                      {player.position.toUpperCase()}
                    </span>
                  </div>
                  <div className="player-details">
                    <span className="player-team">{player.team}</span>
                    <span className="player-avg">{player.avgPoints} avg pts</span>
                  </div>
                  {isUsersTurn && canDraft && <button className="btn-draft">Draft</button>}
                  {isUsersTurn && !canDraft && <span className="position-full">Position Full</span>}
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
const AdminPanel = ({ user, tournament, onUpdateTournament, onLogout, onBackToTournaments, allTeams, onStartDraft }) => {
  const [activeTab, setActiveTab] = useState('overview');
  const [newPlayerForm, setNewPlayerForm] = useState({
    name: '', team: '', position: 'batter', price: 8.0, avgPoints: 30
  });
  const [players, setPlayers] = useState(tournament.isTest ? TEST_PLAYERS_IND_NZ : FULL_PLAYER_POOL);
  const [draftStatus, setDraftStatus] = useState(tournament.draftStatus || 'pending');
  
  const handleAddPlayer = () => {
    if (!newPlayerForm.name || !newPlayerForm.team) return;
    const newPlayer = {
      id: `p${Date.now()}`,
      ...newPlayerForm,
      price: parseFloat(newPlayerForm.price),
      avgPoints: parseFloat(newPlayerForm.avgPoints),
      totalPoints: 0,
    };
    setPlayers([...players, newPlayer]);
    setNewPlayerForm({ name: '', team: '', position: 'batter', price: 8.0, avgPoints: 30 });
  };
  
  const handleRemovePlayer = (playerId) => {
    if (window.confirm('Remove this player from the pool?')) {
      setPlayers(players.filter(p => p.id !== playerId));
    }
  };
  
  const handleStartDraft = () => {
    if (window.confirm('Start the draft? All registered teams will be notified.')) {
      setDraftStatus('open');
      onStartDraft();
    }
  };
  
  const handleCloseDraft = () => {
    setDraftStatus('completed');
  };
  
  return (
    <div className="admin-panel">
      <header className="admin-header">
        <div className="header-left">
          <div className="admin-badge">👑 ADMIN</div>
          <div>
            <h1>{tournament.name}</h1>
            <p>League Administration</p>
          </div>
        </div>
        <div className="header-right">
          <button className="btn-icon" onClick={onBackToTournaments} title="Change Tournament">🏆</button>
          <button className="btn-icon" onClick={onLogout} title="Logout">🚪</button>
        </div>
      </header>
      
      <nav className="admin-nav">
        {['overview', 'players', 'teams', 'draft', 'settings'].map(tab => (
          <button 
            key={tab}
            className={`nav-tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'overview' && '📊 '}
            {tab === 'players' && '👥 '}
            {tab === 'teams' && '🏏 '}
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
            
            <div className="quick-actions">
              <h3>Quick Actions</h3>
              <div className="action-buttons">
                {draftStatus === 'pending' && (
                  <button className="btn-primary" onClick={handleStartDraft}>
                    🚀 Open Draft Registration
                  </button>
                )}
                {draftStatus === 'open' && (
                  <button className="btn-primary" onClick={() => setDraftStatus('in_progress')}>
                    ▶️ Start Draft
                  </button>
                )}
                {draftStatus === 'in_progress' && (
                  <button className="btn-secondary" onClick={handleCloseDraft}>
                    ✅ Complete Draft
                  </button>
                )}
                <button className="btn-secondary" onClick={() => setActiveTab('players')}>
                  ➕ Manage Players
                </button>
              </div>
            </div>
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
                  <option value="flex">Flex</option>
                </select>
                <input
                  type="number"
                  placeholder="Price"
                  step="0.5"
                  value={newPlayerForm.price}
                  onChange={(e) => setNewPlayerForm({...newPlayerForm, price: e.target.value})}
                />
                <input
                  type="number"
                  placeholder="Avg Points"
                  value={newPlayerForm.avgPoints}
                  onChange={(e) => setNewPlayerForm({...newPlayerForm, avgPoints: e.target.value})}
                />
                <button className="btn-primary" onClick={handleAddPlayer}>Add</button>
              </div>
            </div>
            
            <div className="player-list-admin">
              <h3>📋 Player Pool ({players.length} players)</h3>
              <div className="player-table">
                <div className="table-header">
                  <span>Name</span>
                  <span>Team</span>
                  <span>Position</span>
                  <span>Price</span>
                  <span>Avg Pts</span>
                  <span>Actions</span>
                </div>
                {players.map(player => (
                  <div key={player.id} className="table-row">
                    <span>{player.name}</span>
                    <span>{player.team}</span>
                    <span className={`position-badge ${player.position}`}>{player.position.toUpperCase()}</span>
                    <span>${player.price}M</span>
                    <span>{player.avgPoints}</span>
                    <button className="btn-small btn-danger" onClick={() => handleRemovePlayer(player.id)}>
                      🗑️
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        
        {activeTab === 'teams' && (
          <div className="admin-teams">
            <h3>🏏 Registered Fantasy Teams</h3>
            {allTeams && allTeams.length > 0 ? (
              <div className="teams-list">
                {allTeams.map((t, i) => (
                  <div key={i} className="team-card-admin">
                    <span className="team-rank">#{i + 1}</span>
                    <div className="team-info">
                      <span className="team-name">{t.name}</span>
                      <span className="team-owner">{t.ownerName}</span>
                    </div>
                    <span className="team-points">{Math.round(t.totalPoints || 0)} pts</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="no-data">No teams registered yet</p>
            )}
          </div>
        )}
        
        {activeTab === 'draft' && (
          <div className="admin-draft">
            <h3>📝 Draft Management</h3>
            <div className="draft-status-card">
              <div className={`status-indicator ${draftStatus}`}>
                {draftStatus === 'pending' && '⏸️ Pending'}
                {draftStatus === 'open' && '🟢 Open for Registration'}
                {draftStatus === 'in_progress' && '🔴 In Progress'}
                {draftStatus === 'completed' && '✅ Completed'}
              </div>
              
              <div className="draft-controls">
                {draftStatus === 'pending' && (
                  <button className="btn-primary btn-large" onClick={handleStartDraft}>
                    🚀 Open Draft Registration
                  </button>
                )}
                {draftStatus === 'open' && (
                  <>
                    <p>Waiting for teams to join...</p>
                    <button className="btn-primary btn-large" onClick={() => setDraftStatus('in_progress')}>
                      ▶️ Start Snake Draft
                    </button>
                  </>
                )}
                {draftStatus === 'in_progress' && (
                  <>
                    <p>Draft is currently running</p>
                    <button className="btn-secondary" onClick={handleCloseDraft}>
                      ⏹️ End Draft Early
                    </button>
                  </>
                )}
                {draftStatus === 'completed' && (
                  <>
                    <p>Draft has been completed!</p>
                    <button className="btn-secondary" onClick={() => setDraftStatus('pending')}>
                      🔄 Reset Draft
                    </button>
                  </>
                )}
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
          </div>
        )}
      </main>
    </div>
  );
};

// Main Dashboard Component  
const Dashboard = ({ user, team, tournament, onLogout, onUpdateTeam, onBackToTournaments, isDraftComplete, isDraftOpen, onGoToDraft }) => {
  const [activeTab, setActiveTab] = useState('roster');
  const [showPlayerModal, setShowPlayerModal] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState(null);
  const [testResults, setTestResults] = useState(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPosition, setFilterPosition] = useState('all');
  
  // Enhanced Test Mode State
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [apiTestStatus, setApiTestStatus] = useState(null);
  const [isFetchingData, setIsFetchingData] = useState(false);
  const [matchHistory, setMatchHistory] = useState([]);
  const [liveScoreUpdates, setLiveScoreUpdates] = useState([]);
  const [dbTestStatus, setDbTestStatus] = useState(null);
  const [isTestingDb, setIsTestingDb] = useState(false);
  const [pointsVerification, setPointsVerification] = useState(null);
  
  const playerPool = tournament.isTest ? TEST_PLAYERS_IND_NZ : FULL_PLAYER_POOL;
  const [freeAgents, setFreeAgents] = useState(
    playerPool.filter(p => !team.roster.find(r => r.id === p.id))
  );

  const rosterByPosition = {
    batters: team.roster.filter(p => p.position === 'batter'),
    keepers: team.roster.filter(p => p.position === 'keeper'),
    bowlers: team.roster.filter(p => p.position === 'bowler'),
    flex: team.roster.filter(p => p.position === 'flex'),
  };
  
  // Filter free agents based on search and position
  const filteredFreeAgents = freeAgents.filter(player => {
    const matchesSearch = player.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          player.team.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesPosition = filterPosition === 'all' || player.position === filterPosition;
    return matchesSearch && matchesPosition;
  });
  
  // For pre-draft browse mode - show all players
  const allPlayersForBrowse = playerPool.filter(player => {
    const matchesSearch = player.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          player.team.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesPosition = filterPosition === 'all' || player.position === filterPosition;
    return matchesSearch && matchesPosition;
  });

  // Test Mode: Simulate API Data Pull
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
    
    // Simulate live updates coming in one by one
    for (let i = 0; i < Math.min(team.roster.length, 5); i++) {
      const player = team.roster[i];
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
    
    // Auto-clear after 3 seconds
    setTimeout(() => setApiTestStatus(null), 3000);
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

  const handleAddPlayer = (player) => {
    if (team.weeklyPickups >= team.weeklyPickupLimit) {
      alert(`Weekly pickup limit reached (${FREE_AGENCY_LIMIT}/week)`);
      return;
    }

    const posKey = player.position === 'keeper' ? 'keepers' : player.position + 's';
    const positionCount = team.roster.filter(p => p.position === player.position).length;
    
    if (positionCount >= SQUAD_CONFIG[posKey].max) {
      alert(`Maximum ${player.position}s reached`);
      return;
    }

    const updatedTeam = {
      ...team,
      roster: [...team.roster, player],
      weeklyPickups: team.weeklyPickups + 1,
    };
    onUpdateTeam(updatedTeam);
    setFreeAgents(freeAgents.filter(p => p.id !== player.id));
    setShowPlayerModal(false);
  };

  const handleDropPlayer = (player) => {
    if (window.confirm(`Drop ${player.name}?`)) {
      const updatedTeam = {
        ...team,
        roster: team.roster.filter(p => p.id !== player.id),
      };
      onUpdateTeam(updatedTeam);
      setFreeAgents([...freeAgents, player]);
    }
  };

  const handleMoveToIR = (player) => {
    const updatedTeam = {
      ...team,
      roster: team.roster.filter(p => p.id !== player.id),
      ir: [...team.ir, { ...player, irDate: new Date().toISOString() }],
    };
    onUpdateTeam(updatedTeam);
  };

  const handleActivateFromIR = (player) => {
    const posKey = player.position === 'keeper' ? 'keepers' : player.position + 's';
    const positionCount = team.roster.filter(p => p.position === player.position).length;
    
    if (positionCount >= SQUAD_CONFIG[posKey].max) {
      alert(`Drop a ${player.position} first`);
      return;
    }

    const updatedTeam = {
      ...team,
      ir: team.ir.filter(p => p.id !== player.id),
      roster: [...team.roster, player],
    };
    onUpdateTeam(updatedTeam);
  };

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="header-left">
          {team.logo ? (
            <img src={team.logo} alt="Team logo" className="team-logo-small" />
          ) : (
            <div className="team-logo-placeholder">🏏</div>
          )}
          <div className="team-info">
            <h1>{team.name}</h1>
            <p>{tournament.shortName} {tournament.isTest && <span className="test-badge-small">TEST</span>}</p>
          </div>
        </div>
        <div className="header-right">
          <div className="points-display">
            <span className="points-value">{Math.round(team.totalPoints)}</span>
            <span className="points-label">Total Pts</span>
          </div>
          <button className="btn-icon" onClick={onBackToTournaments} title="Change Tournament">🏆</button>
          <button className="btn-icon" onClick={onLogout} title="Logout">⚙️</button>
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
          <div className="roster-view">
            <div className="pickup-counter">
              Weekly Pickups: <strong>{team.weeklyPickups}/{team.weeklyPickupLimit}</strong>
              <span className="reset-note">(Resets Monday)</span>
            </div>
            
            {/* Draft Status Banner */}
            {!isDraftComplete && (
              <div className={`draft-status-banner ${isDraftOpen ? 'draft-open' : 'draft-pending'}`}>
                {isDraftOpen ? (
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
                  </>
                )}
              </div>
            )}

            {Object.entries(SQUAD_CONFIG).map(([key, config]) => (
              <div key={key} className="roster-section">
                <div className="section-header">
                  <h3>{config.icon} {config.label}</h3>
                  <span className="slot-count">{rosterByPosition[key]?.length || 0}/{config.max}</span>
                </div>
                <div className="player-list">
                  {rosterByPosition[key]?.map(player => (
                    <div key={player.id} className="player-card">
                      <div className="player-info">
                        <span className="player-name">{player.name}</span>
                        <span className="player-team">{player.team}</span>
                      </div>
                      <div className="player-stats">
                        <span className="total-points">{Math.round(player.totalPoints || 0)} pts</span>
                        <span className="avg-points">{player.avgPoints} avg</span>
                      </div>
                      <div className="player-actions">
                        <button className="btn-small btn-secondary" onClick={() => handleMoveToIR(player)}>IR</button>
                        <button className="btn-small btn-danger" onClick={() => handleDropPlayer(player)}>Drop</button>
                      </div>
                    </div>
                  ))}
                  {Array(config.max - (rosterByPosition[key]?.length || 0)).fill(null).map((_, i) => (
                    <div key={`empty-${i}`} className="player-card empty">
                      <span className="empty-slot">Empty Slot</span>
                      <button 
                        className="btn-small btn-primary"
                        onClick={() => {
                          setSelectedPosition(key === 'keepers' ? 'keeper' : key.slice(0, -1));
                          setShowPlayerModal(true);
                        }}
                      >+ Add</button>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {team.ir.length > 0 && (
              <div className="roster-section ir-section">
                <div className="section-header">
                  <h3>🏥 Injured Reserve</h3>
                  <span className="slot-count">{team.ir.length}</span>
                </div>
                <div className="player-list">
                  {team.ir.map(player => (
                    <div key={player.id} className="player-card ir">
                      <div className="player-info">
                        <span className="player-name">{player.name}</span>
                        <span className="player-team">{player.team}</span>
                      </div>
                      <button className="btn-small btn-primary" onClick={() => handleActivateFromIR(player)}>Activate</button>
                    </div>
                  ))}
                </div>
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
                <option value="flex">Flex</option>
              </select>
            </div>
            
            <div className="player-count">
              {isDraftComplete 
                ? `${filteredFreeAgents.length} free agents available`
                : `${allPlayersForBrowse.length} players in pool`
              }
            </div>
            
            <div className="players-grid">
              {(isDraftComplete ? filteredFreeAgents : allPlayersForBrowse).map(player => (
                <div key={player.id} className="player-card-full">
                  <div className="player-header">
                    <span className="player-name">{player.name}</span>
                    <span className={`position-badge ${player.position}`}>{player.position.toUpperCase()}</span>
                  </div>
                  <div className="player-details">
                    <span className="player-team">{player.team}</span>
                    <span className="player-price">${player.price}M</span>
                  </div>
                  <div className="player-footer">
                    <span className="avg-points">{player.avgPoints} avg pts</span>
                    {isDraftComplete ? (
                      <button 
                        className="btn-primary btn-small"
                        onClick={() => handleAddPlayer(player)}
                        disabled={team.weeklyPickups >= team.weeklyPickupLimit}
                      >+ Add</button>
                    ) : (
                      <span className="browse-only-badge">Browse Only</span>
                    )}
                  </div>
                </div>
              ))}
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
                <span className="points">Points</span>
              </div>
              {[
                { rank: 1, name: team.name, points: Math.round(team.totalPoints), isUser: true },
                { rank: 2, name: 'Cricket Kings', points: 892 },
                { rank: 3, name: 'Boundary Bashers', points: 845 },
                { rank: 4, name: 'Wicket Warriors', points: 798 },
              ].sort((a, b) => b.points - a.points).map((t, i) => (
                <div key={i} className={`standings-row ${t.isUser ? 'user-team' : ''}`}>
                  <span className="rank">{i + 1}</span>
                  <span className="team-name">{t.name}</span>
                  <span className="points">{t.points}</span>
                </div>
              ))}
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
                <p>Simulate fetching live data from an API</p>
                <button 
                  className="btn-secondary"
                  onClick={simulateApiPull}
                  disabled={isFetchingData || team.roster.length === 0}
                >
                  {isFetchingData ? (
                    <><span className="spinner"></span> Fetching...</>
                  ) : (
                    '📡 Simulate API Pull'
                  )}
                </button>
                
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
                <li className={team.weeklyPickups > 0 ? 'checked' : ''}>
                  <span className="check-icon">{team.weeklyPickups > 0 ? '✓' : '○'}</span>
                  Test free agency ({team.weeklyPickups || 0}/{FREE_AGENCY_LIMIT} pickups)
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
                  team.weeklyPickups > 0,
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
                      <span className="avg-points">{player.avgPoints} avg</span>
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
  const [currentPage, setCurrentPage] = useState('tournamentSelect');
  const [selectedTournament, setSelectedTournament] = useState(null);
  const [user, setUser] = useState(null);
  const [team, setTeam] = useState(null);
  const [isDraftComplete, setIsDraftComplete] = useState(false);
  const [isDraftOpen, setIsDraftOpen] = useState(false);
  const [allTeams, setAllTeams] = useState([]);

  useEffect(() => {
    const savedUser = localStorage.getItem('t20fantasy_user');
    const savedTeam = localStorage.getItem('t20fantasy_team');
    const savedTournament = localStorage.getItem('t20fantasy_tournament');
    const savedDraftStatus = localStorage.getItem('t20fantasy_draft_complete');
    const savedDraftOpen = localStorage.getItem('t20fantasy_draft_open');
    
    if (savedUser) {
      const parsedUser = JSON.parse(savedUser);
      setUser(parsedUser);
      
      if (savedTournament) {
        setSelectedTournament(JSON.parse(savedTournament));
      }
      
      if (savedDraftOpen === 'true') {
        setIsDraftOpen(true);
      }
      
      // Admin users go to admin panel
      if (parsedUser.isAdmin) {
        setCurrentPage('admin');
      } else if (savedTeam && savedDraftStatus === 'true') {
        setTeam(JSON.parse(savedTeam));
        setIsDraftComplete(true);
        setCurrentPage('dashboard');
      } else if (savedTeam) {
        setTeam(JSON.parse(savedTeam));
        setCurrentPage('dashboard');
      }
    }
  }, []);

  const handleSelectTournament = (tournament) => {
    setSelectedTournament(tournament);
    localStorage.setItem('t20fantasy_tournament', JSON.stringify(tournament));
    setCurrentPage('login');
  };

  const handleLogin = (userData) => {
    setUser(userData);
    localStorage.setItem('t20fantasy_user', JSON.stringify(userData));
    
    // Admin users go directly to admin panel
    if (userData.isAdmin) {
      setCurrentPage('admin');
    } else {
      setCurrentPage('createTeam');
    }
  };

  const handleSignup = (userData) => {
    setUser(userData);
    localStorage.setItem('t20fantasy_user', JSON.stringify(userData));
    setCurrentPage('createTeam');
  };

  const handleTeamCreated = (teamData) => {
    setTeam(teamData);
    localStorage.setItem('t20fantasy_team', JSON.stringify(teamData));
    setAllTeams(prev => [...prev, teamData]);
    
    // Check if draft is open - if not, go to dashboard in browse mode
    if (isDraftOpen) {
      setIsDraftComplete(false);
      localStorage.setItem('t20fantasy_draft_complete', 'false');
      setCurrentPage('draft');
    } else {
      // Go to dashboard but draft not complete - browse mode
      setIsDraftComplete(false);
      localStorage.setItem('t20fantasy_draft_complete', 'false');
      setCurrentPage('dashboard');
    }
  };

  const handleDraftComplete = (roster) => {
    const updatedTeam = { ...team, roster };
    setTeam(updatedTeam);
    localStorage.setItem('t20fantasy_team', JSON.stringify(updatedTeam));
    setIsDraftComplete(true);
    localStorage.setItem('t20fantasy_draft_complete', 'true');
    setCurrentPage('dashboard');
  };

  const handleUpdateTeam = (updatedTeam) => {
    setTeam(updatedTeam);
    localStorage.setItem('t20fantasy_team', JSON.stringify(updatedTeam));
  };
  
  const handleStartDraft = () => {
    setIsDraftOpen(true);
    localStorage.setItem('t20fantasy_draft_open', 'true');
  };
  
  const handleGoToDraft = () => {
    if (team) {
      setCurrentPage('draft');
    }
  };

  const handleLogout = () => {
    setUser(null);
    setTeam(null);
    setSelectedTournament(null);
    setIsDraftComplete(false);
    setIsDraftOpen(false);
    localStorage.clear();
    setCurrentPage('tournamentSelect');
  };

  const handleBackToTournaments = () => {
    setSelectedTournament(null);
    setTeam(null);
    setIsDraftComplete(false);
    localStorage.removeItem('t20fantasy_team');
    localStorage.removeItem('t20fantasy_tournament');
    localStorage.removeItem('t20fantasy_draft_complete');
    setCurrentPage('tournamentSelect');
  };

  const playerPool = selectedTournament?.isTest ? TEST_PLAYERS_IND_NZ : FULL_PLAYER_POOL;

  return (
    <>
      {currentPage === 'tournamentSelect' && (
        <TournamentSelectPage onSelectTournament={handleSelectTournament} />
      )}
      {currentPage === 'login' && (
        <LoginPage 
          onLogin={handleLogin} 
          onShowSignup={() => setCurrentPage('signup')}
          tournament={selectedTournament}
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
          onDraftComplete={handleDraftComplete}
          onUpdateTeam={handleUpdateTeam}
        />
      )}
      {currentPage === 'admin' && user?.isAdmin && (
        <AdminPanel
          user={user}
          tournament={selectedTournament || TOURNAMENTS.test_ind_nz}
          onLogout={handleLogout}
          onBackToTournaments={handleBackToTournaments}
          allTeams={allTeams}
          onStartDraft={handleStartDraft}
        />
      )}
      {currentPage === 'dashboard' && (
        <Dashboard 
          user={user} 
          team={team}
          tournament={selectedTournament}
          onLogout={handleLogout}
          onUpdateTeam={handleUpdateTeam}
          onBackToTournaments={handleBackToTournaments}
          isDraftComplete={isDraftComplete}
          isDraftOpen={isDraftOpen}
          onGoToDraft={handleGoToDraft}
        />
      )}
    </>
  );
}
