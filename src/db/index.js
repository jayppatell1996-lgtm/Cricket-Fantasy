// Turso Database Connection & Fantasy Points Calculator
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema.js';

// Create the Turso client
const client = createClient({
  url: import.meta.env.VITE_TURSO_DATABASE_URL || process.env.TURSO_DATABASE_URL,
  authToken: import.meta.env.VITE_TURSO_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN,
});

// Create the Drizzle ORM instance
export const db = drizzle(client, { schema });
export { client };

// ============================================
// SCORING RULES (from user's screenshot)
// ============================================
export const SCORING_RULES = {
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
    stumpingPoints: 15, // Wicketkeeper only
  },
};

// ============================================
// FANTASY POINTS CALCULATOR
// ============================================
export function calculateFantasyPoints(stats, isWicketkeeper = false) {
  let points = 0;
  
  // Batting: 1 point per run
  points += stats.runs || 0;
  
  // Strike Rate Bonus (must score 20+ runs)
  if ((stats.runs || 0) >= SCORING_RULES.batting.minRunsForSRBonus && stats.strikeRate) {
    const srBonus = SCORING_RULES.batting.strikeRateBonus.find(
      b => stats.strikeRate >= b.min && stats.strikeRate <= b.max
    );
    if (srBonus) points += srBonus.points;
  }
  
  // Bowling: 25 points per wicket
  points += (stats.wickets || 0) * SCORING_RULES.bowling.wicketPoints;
  
  // Maiden Over: 20 points each
  points += (stats.maidenOvers || 0) * SCORING_RULES.bowling.maidenOverPoints;
  
  // Economy Rate Bonus (must bowl 3+ overs)
  if ((stats.oversBowled || 0) >= SCORING_RULES.bowling.minOversForERBonus && stats.economyRate !== undefined) {
    const erBonus = SCORING_RULES.bowling.economyRateBonus.find(
      b => stats.economyRate >= b.min && stats.economyRate <= b.max
    );
    if (erBonus) points += erBonus.points;
  }
  
  // Fielding: Catch 12pts, Run Out 20pts, Stumping 15pts (WK only)
  points += (stats.catches || 0) * SCORING_RULES.fielding.catchPoints;
  points += (stats.runOuts || 0) * SCORING_RULES.fielding.runOutPoints;
  if (isWicketkeeper) {
    points += (stats.stumpings || 0) * SCORING_RULES.fielding.stumpingPoints;
  }
  
  return Math.round(points);
}

// ============================================
// SNAKE DRAFT ORDER GENERATOR
// ============================================
export function generateSnakeDraftOrder(numTeams, numRounds) {
  const order = [];
  
  for (let round = 1; round <= numRounds; round++) {
    const roundPicks = [];
    
    for (let pick = 1; pick <= numTeams; pick++) {
      // Snake: odd rounds go 1-N, even rounds go N-1
      const teamPosition = round % 2 === 1 ? pick : numTeams - pick + 1;
      
      roundPicks.push({
        round,
        pickInRound: pick,
        overallPick: (round - 1) * numTeams + pick,
        teamPosition: teamPosition - 1, // 0-indexed
      });
    }
    
    order.push(...roundPicks);
  }
  
  return order;
}

// ============================================
// DATABASE HELPERS
// ============================================
export async function testConnection() {
  try {
    const result = await client.execute('SELECT 1 as test');
    console.log('✅ Database connection successful');
    return { success: true, message: 'Connected to Turso database' };
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    return { success: false, message: error.message };
  }
}

// Generate unique ID
export function generateId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Format date for display
export function formatDate(dateString) {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// Check if it's a new week (for resetting pickup counters)
export function isNewWeek(lastReset) {
  if (!lastReset) return true;
  
  const last = new Date(lastReset);
  const now = new Date();
  
  // Get Monday of current week
  const currentMonday = new Date(now);
  currentMonday.setDate(now.getDate() - now.getDay() + 1);
  currentMonday.setHours(0, 0, 0, 0);
  
  return last < currentMonday;
}
