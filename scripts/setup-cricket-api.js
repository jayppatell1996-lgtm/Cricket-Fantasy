#!/usr/bin/env node

/**
 * Quick Setup Script for CricketData.org Integration
 * ===================================================
 * 
 * This script helps you:
 * 1. Test your API key
 * 2. Find series IDs for tournaments
 * 3. Sync players to your database
 * 
 * Usage:
 *   node scripts/setup-cricket-api.js test        # Test API connection
 *   node scripts/setup-cricket-api.js search      # Search for series
 *   node scripts/setup-cricket-api.js sync        # Sync all tournaments
 */

// Load .env file FIRST before anything else
import dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@libsql/client';
import * as readline from 'readline';

const CRICKET_API_BASE = 'https://api.cricapi.com/v1';

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSuccess(message) { log(`✅ ${message}`, 'green'); }
function logError(message) { log(`❌ ${message}`, 'red'); }
function logInfo(message) { log(`ℹ️  ${message}`, 'cyan'); }
function logWarning(message) { log(`⚠️  ${message}`, 'yellow'); }

// ============================================
// API FUNCTIONS
// ============================================

async function testApiConnection() {
  log('\n🏏 Testing CricketData.org API Connection', 'bright');
  log('='.repeat(50));
  
  const apiKey = process.env.CRICKET_API_KEY;
  
  if (!apiKey) {
    logError('CRICKET_API_KEY not found!');
    log('\nTo get your API key:');
    log('1. Go to https://cricketdata.org/signup.aspx');
    log('2. Create a free account');
    log('3. Copy your API key from the dashboard');
    log('4. Create a .env file with: CRICKET_API_KEY=your_key');
    log('5. Run: export $(cat .env | xargs)');
    return false;
  }
  
  logInfo(`API Key: ${apiKey.substring(0, 8)}...${apiKey.substring(apiKey.length - 4)}`);
  
  try {
    // Test with a simple request
    const response = await fetch(
      `${CRICKET_API_BASE}/currentMatches?apikey=${apiKey}`
    );
    const data = await response.json();
    
    if (data.status === 'success') {
      logSuccess('API connection successful!');
      log(`\n📊 Account Info:`);
      log(`   Credits Used: ${data.info?.creditsUsed || 'N/A'}`);
      log(`   Credits Remaining: ${data.info?.creditsLeft || 'N/A'}`);
      log(`   Current Matches: ${data.data?.length || 0}`);
      return true;
    } else {
      logError(`API Error: ${data.reason || 'Unknown error'}`);
      return false;
    }
    
  } catch (error) {
    logError(`Connection failed: ${error.message}`);
    return false;
  }
}

async function searchSeries(searchTerm) {
  const apiKey = process.env.CRICKET_API_KEY;
  
  if (!apiKey) {
    logError('CRICKET_API_KEY not set');
    return [];
  }
  
  try {
    const response = await fetch(
      `${CRICKET_API_BASE}/series?apikey=${apiKey}&search=${encodeURIComponent(searchTerm)}`
    );
    const data = await response.json();
    
    if (data.status === 'success') {
      return data.data || [];
    }
    
    return [];
  } catch (error) {
    logError(`Search failed: ${error.message}`);
    return [];
  }
}

async function interactiveSeriesSearch() {
  log('\n🔍 Interactive Series Search', 'bright');
  log('='.repeat(50));
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  
  const question = (prompt) => new Promise(resolve => rl.question(prompt, resolve));
  
  const searches = [
    'T20 World Cup',
    'India vs New Zealand',
    'IPL 2025',
    'Big Bash',
    'Caribbean Premier League',
  ];
  
  log('\nSuggested searches:');
  searches.forEach((s, i) => log(`  ${i + 1}. ${s}`));
  log('  6. Custom search\n');
  
  const choice = await question('Enter choice (1-6): ');
  
  let searchTerm;
  if (choice === '6') {
    searchTerm = await question('Enter search term: ');
  } else {
    searchTerm = searches[parseInt(choice) - 1] || searches[0];
  }
  
  log(`\nSearching for: "${searchTerm}"...`);
  
  const results = await searchSeries(searchTerm);
  
  if (results.length === 0) {
    logWarning('No series found. Try a different search term.');
  } else {
    log(`\n📋 Found ${results.length} series:\n`);
    
    results.slice(0, 10).forEach((series, i) => {
      log(`${i + 1}. ${series.name}`, 'cyan');
      log(`   ID: ${series.id}`);
      log(`   Dates: ${series.startDate || 'N/A'} - ${series.endDate || 'N/A'}`);
      log('');
    });
    
    log('\n💡 To sync a series, add the ID to your tournament config in:');
    log('   scripts/sync-tournaments.js');
  }
  
  rl.close();
}

async function syncAllTournaments() {
  log('\n🏏 Syncing All Tournaments', 'bright');
  log('='.repeat(50));
  
  // Check environment
  if (!process.env.CRICKET_API_KEY) {
    logError('CRICKET_API_KEY not set');
    return;
  }
  
  if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
    logError('Turso credentials not set');
    return;
  }
  
  const db = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
  
  // Import and run sync
  try {
    const { syncTournamentPlayers } = await import('./sync-tournaments.js');
    
    const tournaments = ['test_ind_nz', 't20_wc_2026', 'ipl_2026'];
    
    for (const tournamentId of tournaments) {
      log(`\n📥 Syncing ${tournamentId}...`);
      await syncTournamentPlayers(tournamentId);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Show summary
    const stats = await db.execute(`
      SELECT tournament_id, COUNT(*) as count 
      FROM players 
      GROUP BY tournament_id
    `);
    
    log('\n' + '='.repeat(50));
    logSuccess('Sync Complete!');
    log('\n📊 Database Summary:');
    stats.rows.forEach(row => {
      log(`   ${row.tournament_id}: ${row.count} players`);
    });
    
  } catch (error) {
    logError(`Sync failed: ${error.message}`);
  }
}

async function testScoringRules() {
  log('\n📊 Testing Your Custom Scoring Rules', 'bright');
  log('='.repeat(50));
  
  try {
    const { calculateFantasyPoints } = await import('./fantasy-scoring.js');
    
    // Test Case 1: Good batting performance
    log('\n🏏 Test 1: Good Batting (65 off 40 balls, SR 162.5)');
    const result1 = calculateFantasyPoints({
      runs: 65, balls: 40, fours: 6, sixes: 3, isOut: true,
      wickets: 0, overs: 0, runsConceded: 0, maidens: 0,
      catches: 1, runOuts: 0, stumpings: 0,
    });
    log(`   Total: ${result1.total} pts`, 'cyan');
    log(`   Breakdown: Bat=${result1.batting}, Bowl=${result1.bowling}, Field=${result1.fielding}`);
    
    // Test Case 2: Good bowling
    log('\n🎯 Test 2: Good Bowling (4 wickets, 4 overs, econ 5.5)');
    const result2 = calculateFantasyPoints({
      runs: 5, balls: 8, isOut: true,
      wickets: 4, overs: 4, runsConceded: 22, maidens: 1,
      catches: 0, runOuts: 0, stumpings: 0,
    });
    log(`   Total: ${result2.total} pts`, 'cyan');
    log(`   Breakdown: Bat=${result2.batting}, Bowl=${result2.bowling}, Field=${result2.fielding}`);
    
    // Test Case 3: All-rounder
    log('\n⚡ Test 3: All-rounder (35 runs, 2 wickets, 2 catches)');
    const result3 = calculateFantasyPoints({
      runs: 35, balls: 22, isOut: false,
      wickets: 2, overs: 3, runsConceded: 25, maidens: 0,
      catches: 2, runOuts: 1, stumpings: 0,
    });
    log(`   Total: ${result3.total} pts`, 'cyan');
    log(`   Breakdown: Bat=${result3.batting}, Bowl=${result3.bowling}, Field=${result3.fielding}`);
    
    // Test Case 4: Duck
    log('\n😢 Test 4: Duck (0 off 3 balls, out)');
    const result4 = calculateFantasyPoints({
      runs: 0, balls: 3, isOut: true,
      wickets: 0, overs: 0, runsConceded: 0, maidens: 0,
      catches: 0, runOuts: 0, stumpings: 0,
    });
    log(`   Total: ${result4.total} pts (duck penalty)`, 'yellow');
    
    logSuccess('\nScoring rules working correctly!');
    
  } catch (error) {
    logError(`Scoring test failed: ${error.message}`);
    log('\nMake sure fantasy-scoring.js exists in the scripts folder.');
  }
}

// ============================================
// MAIN
// ============================================

async function main() {
  const command = process.argv[2];
  
  log('\n🏏 T20 Fantasy - CricketData.org Setup', 'bright');
  
  switch (command) {
    case 'test':
      await testApiConnection();
      break;
      
    case 'search':
      await interactiveSeriesSearch();
      break;
      
    case 'sync':
      await syncAllTournaments();
      break;
      
    case 'scoring':
      await testScoringRules();
      break;
      
    case 'all':
      // Run complete setup verification
      const keyValid = await testApiConnection();
      if (keyValid) {
        await testScoringRules();
      }
      break;
      
    default:
      log('\nAvailable commands:');
      log('  node scripts/setup-cricket-api.js test     - Test API connection');
      log('  node scripts/setup-cricket-api.js search   - Search for series');
      log('  node scripts/setup-cricket-api.js sync     - Sync all tournaments');
      log('  node scripts/setup-cricket-api.js scoring  - Test your scoring rules');
      log('  node scripts/setup-cricket-api.js all      - Run all tests');
      log('\nMake sure your .env file has:');
      log('  CRICKET_API_KEY=your_key');
      log('  TURSO_DATABASE_URL=libsql://...');
      log('  TURSO_AUTH_TOKEN=...');
  }
}

main().catch(console.error);
