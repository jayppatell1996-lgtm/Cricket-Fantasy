/**
 * Fantasy Points Calculator
 * =========================
 * Calculates fantasy points using YOUR custom scoring rules
 * This allows you to keep your own scoring system while using CricketData.org API
 * 
 * Your Scoring Rules:
 * - Batting: 1 point per run + strike rate bonuses (if 20+ runs)
 * - Bowling: 25 points per wicket + 20 for maidens + economy bonuses (if 3+ overs)
 * - Fielding: 12 per catch, 20 per run out, 15 per stumping
 */

// ============================================
// YOUR CUSTOM SCORING RULES
// ============================================

const SCORING_RULES = {
  batting: {
    runsPerPoint: 1,
    // Bonus points based on strike rate (only if scored 20+ runs)
    strikeRateBonus: [
      { min: 160, max: Infinity, points: 25 },
      { min: 150, max: 159.99, points: 20 },
      { min: 140, max: 149.99, points: 15 },
      { min: 130, max: 139.99, points: 10 },
      { min: 120, max: 129.99, points: 5 },
    ],
    minRunsForSRBonus: 20,
    // Milestone bonuses
    halfCenturyBonus: 10,      // 50+ runs
    centuryBonus: 25,          // 100+ runs
    duckPenalty: -5,           // Out for 0
  },
  bowling: {
    wicketPoints: 25,
    maidenOverPoints: 20,
    // Economy rate bonuses (only if bowled 3+ overs)
    economyRateBonus: [
      { min: 0, max: 5, points: 25 },
      { min: 5.01, max: 6, points: 20 },
      { min: 6.01, max: 7, points: 15 },
      { min: 7.01, max: 8, points: 10 },
    ],
    minOversForERBonus: 3,
    // Wicket haul bonuses
    threeWicketBonus: 10,      // 3+ wickets
    fiveWicketBonus: 25,       // 5+ wickets
  },
  fielding: {
    catchPoints: 12,
    runOutPoints: 20,          // Direct hit or contribution
    stumpingPoints: 15,
  },
  bonus: {
    playerOfMatch: 25,
  }
};

// ============================================
// POINTS CALCULATION FUNCTIONS
// ============================================

/**
 * Calculate batting points from player performance
 * @param {Object} stats - { runs, balls, fours, sixes, isOut }
 * @returns {Object} - { total, breakdown }
 */
function calculateBattingPoints(stats) {
  const { runs = 0, balls = 0, fours = 0, sixes = 0, isOut = false } = stats;
  
  const breakdown = {
    runs: 0,
    strikeRateBonus: 0,
    milestoneBonus: 0,
    duckPenalty: 0,
  };
  
  // Base points for runs
  breakdown.runs = runs * SCORING_RULES.batting.runsPerPoint;
  
  // Strike rate bonus (only if 20+ runs)
  if (runs >= SCORING_RULES.batting.minRunsForSRBonus && balls > 0) {
    const strikeRate = (runs / balls) * 100;
    
    for (const tier of SCORING_RULES.batting.strikeRateBonus) {
      if (strikeRate >= tier.min && strikeRate <= tier.max) {
        breakdown.strikeRateBonus = tier.points;
        break;
      }
    }
  }
  
  // Milestone bonuses
  if (runs >= 100) {
    breakdown.milestoneBonus = SCORING_RULES.batting.centuryBonus;
  } else if (runs >= 50) {
    breakdown.milestoneBonus = SCORING_RULES.batting.halfCenturyBonus;
  }
  
  // Duck penalty
  if (runs === 0 && isOut) {
    breakdown.duckPenalty = SCORING_RULES.batting.duckPenalty;
  }
  
  const total = breakdown.runs + breakdown.strikeRateBonus + 
                breakdown.milestoneBonus + breakdown.duckPenalty;
  
  return { total, breakdown };
}

/**
 * Calculate bowling points from player performance
 * @param {Object} stats - { wickets, overs, runsConceded, maidens }
 * @returns {Object} - { total, breakdown }
 */
function calculateBowlingPoints(stats) {
  const { wickets = 0, overs = 0, runsConceded = 0, maidens = 0 } = stats;
  
  const breakdown = {
    wickets: 0,
    maidens: 0,
    economyBonus: 0,
    wicketHaulBonus: 0,
  };
  
  // Points for wickets
  breakdown.wickets = wickets * SCORING_RULES.bowling.wicketPoints;
  
  // Maiden over bonus
  breakdown.maidens = maidens * SCORING_RULES.bowling.maidenOverPoints;
  
  // Economy rate bonus (only if 3+ overs)
  if (overs >= SCORING_RULES.bowling.minOversForERBonus) {
    const economy = runsConceded / overs;
    
    for (const tier of SCORING_RULES.bowling.economyRateBonus) {
      if (economy >= tier.min && economy <= tier.max) {
        breakdown.economyBonus = tier.points;
        break;
      }
    }
  }
  
  // Wicket haul bonuses
  if (wickets >= 5) {
    breakdown.wicketHaulBonus = SCORING_RULES.bowling.fiveWicketBonus;
  } else if (wickets >= 3) {
    breakdown.wicketHaulBonus = SCORING_RULES.bowling.threeWicketBonus;
  }
  
  const total = breakdown.wickets + breakdown.maidens + 
                breakdown.economyBonus + breakdown.wicketHaulBonus;
  
  return { total, breakdown };
}

/**
 * Calculate fielding points from player performance
 * @param {Object} stats - { catches, runOuts, stumpings }
 * @returns {Object} - { total, breakdown }
 */
function calculateFieldingPoints(stats) {
  const { catches = 0, runOuts = 0, stumpings = 0 } = stats;
  
  const breakdown = {
    catches: catches * SCORING_RULES.fielding.catchPoints,
    runOuts: runOuts * SCORING_RULES.fielding.runOutPoints,
    stumpings: stumpings * SCORING_RULES.fielding.stumpingPoints,
  };
  
  const total = breakdown.catches + breakdown.runOuts + breakdown.stumpings;
  
  return { total, breakdown };
}

/**
 * Calculate total fantasy points for a player in a match
 * @param {Object} playerStats - Combined batting, bowling, fielding stats
 * @returns {Object} - { total, batting, bowling, fielding, breakdown }
 */
function calculateFantasyPoints(playerStats) {
  const {
    // Batting
    runs = 0,
    balls = 0,
    fours = 0,
    sixes = 0,
    isOut = false,
    // Bowling
    wickets = 0,
    overs = 0,
    runsConceded = 0,
    maidens = 0,
    // Fielding
    catches = 0,
    runOuts = 0,
    stumpings = 0,
    // Bonus
    isPlayerOfMatch = false,
  } = playerStats;
  
  const batting = calculateBattingPoints({ runs, balls, fours, sixes, isOut });
  const bowling = calculateBowlingPoints({ wickets, overs, runsConceded, maidens });
  const fielding = calculateFieldingPoints({ catches, runOuts, stumpings });
  
  let bonusPoints = 0;
  if (isPlayerOfMatch) {
    bonusPoints = SCORING_RULES.bonus.playerOfMatch;
  }
  
  const total = batting.total + bowling.total + fielding.total + bonusPoints;
  
  return {
    total,
    batting: batting.total,
    bowling: bowling.total,
    fielding: fielding.total,
    bonus: bonusPoints,
    breakdown: {
      batting: batting.breakdown,
      bowling: bowling.breakdown,
      fielding: fielding.breakdown,
    },
  };
}

/**
 * Transform CricketData.org scorecard data to our stats format
 * @param {Object} scorecardPlayer - Player data from API scorecard
 * @returns {Object} - Stats in our format
 */
function transformScorecardToStats(scorecardPlayer) {
  // Handle batting stats
  const battingStats = scorecardPlayer.batting || {};
  const runs = parseInt(battingStats.r || battingStats.runs || 0);
  const balls = parseInt(battingStats.b || battingStats.balls || 0);
  const fours = parseInt(battingStats['4s'] || battingStats.fours || 0);
  const sixes = parseInt(battingStats['6s'] || battingStats.sixes || 0);
  const dismissal = battingStats.dismissal || battingStats.howOut || '';
  const isOut = dismissal && dismissal.toLowerCase() !== 'not out' && dismissal !== '-';
  
  // Handle bowling stats
  const bowlingStats = scorecardPlayer.bowling || {};
  const oversRaw = bowlingStats.o || bowlingStats.overs || 0;
  // Convert overs from format like "4.2" to decimal
  let overs = 0;
  if (typeof oversRaw === 'string' && oversRaw.includes('.')) {
    const [fullOvers, extraBalls] = oversRaw.split('.');
    overs = parseInt(fullOvers) + (parseInt(extraBalls) / 6);
  } else {
    overs = parseFloat(oversRaw);
  }
  
  const wickets = parseInt(bowlingStats.w || bowlingStats.wickets || 0);
  const runsConceded = parseInt(bowlingStats.r || bowlingStats.runs || 0);
  const maidens = parseInt(bowlingStats.m || bowlingStats.maidens || 0);
  
  // Handle fielding stats
  const fieldingStats = scorecardPlayer.fielding || {};
  const catches = parseInt(fieldingStats.catches || fieldingStats.c || 0);
  const runOuts = parseInt(fieldingStats.runOuts || fieldingStats.ro || 0);
  const stumpings = parseInt(fieldingStats.stumpings || fieldingStats.st || 0);
  
  return {
    runs,
    balls,
    fours,
    sixes,
    isOut,
    wickets,
    overs,
    runsConceded,
    maidens,
    catches,
    runOuts,
    stumpings,
    isPlayerOfMatch: scorecardPlayer.isPlayerOfMatch || false,
  };
}

// ============================================
// EXPORTS
// ============================================

export {
  SCORING_RULES,
  calculateBattingPoints,
  calculateBowlingPoints,
  calculateFieldingPoints,
  calculateFantasyPoints,
  transformScorecardToStats,
};

// For CommonJS compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SCORING_RULES,
    calculateBattingPoints,
    calculateBowlingPoints,
    calculateFieldingPoints,
    calculateFantasyPoints,
    transformScorecardToStats,
  };
}
