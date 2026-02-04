// Database Schema for T20 Fantasy Cricket
// Using Drizzle ORM with Turso (libSQL)
// Supports: T20 World Cup 2026

import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// ============================================
// USERS TABLE
// ============================================
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

// ============================================
// TOURNAMENTS TABLE
// ============================================
export const tournaments = sqliteTable('tournaments', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  shortName: text('short_name').notNull(),
  type: text('type').notNull(), // 'test', 'worldcup', 'league'
  startDate: text('start_date').notNull(),
  endDate: text('end_date').notNull(),
  teams: text('teams').notNull(), // JSON array of team codes
  description: text('description'),
  isTest: integer('is_test', { mode: 'boolean' }).default(false),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});

// ============================================
// LEAGUES TABLE
// ============================================
export const leagues = sqliteTable('leagues', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  tournamentId: text('tournament_id').notNull().references(() => tournaments.id),
  draftType: text('draft_type').notNull().default('snake'), // snake, auction
  draftStatus: text('draft_status').notNull().default('pending'), // pending, in_progress, completed
  draftDate: text('draft_date'),
  draftOrder: text('draft_order'), // JSON array of team IDs in snake draft order
  currentPick: integer('current_pick').default(0),
  currentRound: integer('current_round').default(1),
  maxTeams: integer('max_teams').notNull().default(10),
  rosterSize: integer('roster_size').notNull().default(16),
  isPublic: integer('is_public', { mode: 'boolean' }).default(false),
  createdBy: text('created_by').references(() => users.id),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});

// ============================================
// FANTASY TEAMS TABLE
// ============================================
export const fantasyTeams = sqliteTable('fantasy_teams', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  leagueId: text('league_id').notNull().references(() => leagues.id),
  tournamentId: text('tournament_id').notNull().references(() => tournaments.id),
  name: text('name').notNull(),
  ownerName: text('owner_name').notNull(),
  logoUrl: text('logo_url'),
  totalPoints: real('total_points').default(0),
  weeklyPickups: integer('weekly_pickups').default(0),
  weeklyPickupLimit: integer('weekly_pickup_limit').default(4),
  lastPickupReset: text('last_pickup_reset'),
  draftPosition: integer('draft_position'), // Position in snake draft (1st pick, 2nd pick, etc.)
  isAiTeam: integer('is_ai_team', { mode: 'boolean' }).default(false),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

// ============================================
// PLAYERS TABLE (Cricket Players)
// ============================================
export const players = sqliteTable('players', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  team: text('team').notNull(), // IND, AUS, ENG, CSK, MI, etc.
  position: text('position').notNull(), // batter, keeper, bowler, flex
  tournamentId: text('tournament_id').references(() => tournaments.id),
  imageUrl: text('image_url'),
  price: real('price').default(0),
  avgPoints: real('avg_points').default(0),
  totalPoints: real('total_points').default(0),
  matchesPlayed: integer('matches_played').default(0),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  isInjured: integer('is_injured', { mode: 'boolean' }).default(false),
  injuryDetails: text('injury_details'),
});

// ============================================
// ROSTER TABLE (Players on Fantasy Teams)
// ============================================
export const roster = sqliteTable('roster', {
  id: text('id').primaryKey(),
  fantasyTeamId: text('fantasy_team_id').notNull().references(() => fantasyTeams.id),
  playerId: text('player_id').notNull().references(() => players.id),
  position: text('position').notNull(), // batter, keeper, bowler, flex
  isOnIR: integer('is_on_ir', { mode: 'boolean' }).default(false),
  irDate: text('ir_date'),
  acquiredDate: text('acquired_date').default(sql`CURRENT_TIMESTAMP`),
  acquiredVia: text('acquired_via').notNull().default('draft'), // draft, free_agency, trade
});

// ============================================
// DRAFT PICKS TABLE (Snake Draft History)
// ============================================
export const draftPicks = sqliteTable('draft_picks', {
  id: text('id').primaryKey(),
  leagueId: text('league_id').notNull().references(() => leagues.id),
  fantasyTeamId: text('fantasy_team_id').notNull().references(() => fantasyTeams.id),
  playerId: text('player_id').notNull().references(() => players.id),
  round: integer('round').notNull(),
  pickInRound: integer('pick_in_round').notNull(), // 1-10 within the round
  overallPick: integer('overall_pick').notNull(), // 1-160 overall
  pickTime: text('pick_time').default(sql`CURRENT_TIMESTAMP`),
});

// ============================================
// PLAYER STATS TABLE (Per Match Stats)
// ============================================
export const playerStats = sqliteTable('player_stats', {
  id: text('id').primaryKey(),
  playerId: text('player_id').notNull().references(() => players.id),
  matchId: text('match_id').notNull(),
  matchDate: text('match_date').notNull(),
  opponent: text('opponent'),
  
  // Batting stats
  runs: integer('runs').default(0),
  ballsFaced: integer('balls_faced').default(0),
  fours: integer('fours').default(0),
  sixes: integer('sixes').default(0),
  strikeRate: real('strike_rate').default(0),
  
  // Bowling stats
  oversBowled: real('overs_bowled').default(0),
  runsConceded: integer('runs_conceded').default(0),
  wickets: integer('wickets').default(0),
  maidenOvers: integer('maiden_overs').default(0),
  economyRate: real('economy_rate').default(0),
  
  // Fielding stats
  catches: integer('catches').default(0),
  runOuts: integer('run_outs').default(0),
  stumpings: integer('stumpings').default(0),
  
  // Calculated fantasy points
  fantasyPoints: real('fantasy_points').default(0),
  
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});

// ============================================
// TRANSACTIONS TABLE (Free Agency, Trades, IR)
// ============================================
export const transactions = sqliteTable('transactions', {
  id: text('id').primaryKey(),
  leagueId: text('league_id').notNull().references(() => leagues.id),
  fantasyTeamId: text('fantasy_team_id').notNull().references(() => fantasyTeams.id),
  type: text('type').notNull(), // 'add', 'drop', 'trade', 'ir_activate', 'ir_place'
  playerId: text('player_id').references(() => players.id),
  relatedPlayerId: text('related_player_id'), // For trades/swaps
  relatedTeamId: text('related_team_id'), // For trades
  status: text('status').notNull().default('completed'), // pending, completed, rejected
  weekNumber: integer('week_number'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});

// ============================================
// MATCHES TABLE (Tournament Matches)
// ============================================
export const matches = sqliteTable('matches', {
  id: text('id').primaryKey(),
  tournamentId: text('tournament_id').notNull().references(() => tournaments.id),
  team1: text('team1').notNull(),
  team2: text('team2').notNull(),
  venue: text('venue'),
  matchDate: text('match_date').notNull(),
  matchTime: text('match_time'),
  status: text('status').notNull().default('scheduled'), // scheduled, live, completed
  result: text('result'),
  winner: text('winner'),
  team1Score: text('team1_score'),
  team2Score: text('team2_score'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});

// ============================================
// WEEKLY SCORES TABLE
// ============================================
export const weeklyScores = sqliteTable('weekly_scores', {
  id: text('id').primaryKey(),
  fantasyTeamId: text('fantasy_team_id').notNull().references(() => fantasyTeams.id),
  leagueId: text('league_id').notNull().references(() => leagues.id),
  weekNumber: integer('week_number').notNull(),
  weekStartDate: text('week_start_date').notNull(),
  weekEndDate: text('week_end_date').notNull(),
  totalPoints: real('total_points').default(0),
  rank: integer('rank'),
});

// ============================================
// SYNC LOG TABLE (For nightly data pulls & testing)
// ============================================
export const syncLog = sqliteTable('sync_log', {
  id: text('id').primaryKey(),
  tournamentId: text('tournament_id').references(() => tournaments.id),
  syncType: text('sync_type').notNull(), // 'nightly', 'manual', 'test'
  status: text('status').notNull(), // 'started', 'completed', 'failed'
  matchesProcessed: integer('matches_processed').default(0),
  playersUpdated: integer('players_updated').default(0),
  pointsCalculated: integer('points_calculated').default(0),
  errorMessage: text('error_message'),
  startedAt: text('started_at').default(sql`CURRENT_TIMESTAMP`),
  completedAt: text('completed_at'),
});

// Types for TypeScript
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Tournament = typeof tournaments.$inferSelect;
export type NewTournament = typeof tournaments.$inferInsert;
export type League = typeof leagues.$inferSelect;
export type NewLeague = typeof leagues.$inferInsert;
export type FantasyTeam = typeof fantasyTeams.$inferSelect;
export type NewFantasyTeam = typeof fantasyTeams.$inferInsert;
export type Player = typeof players.$inferSelect;
export type NewPlayer = typeof players.$inferInsert;
export type Roster = typeof roster.$inferSelect;
export type NewRoster = typeof roster.$inferInsert;
export type DraftPick = typeof draftPicks.$inferSelect;
export type NewDraftPick = typeof draftPicks.$inferInsert;
export type PlayerStats = typeof playerStats.$inferSelect;
export type NewPlayerStats = typeof playerStats.$inferInsert;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type Match = typeof matches.$inferSelect;
export type NewMatch = typeof matches.$inferInsert;
export type SyncLog = typeof syncLog.$inferSelect;
export type NewSyncLog = typeof syncLog.$inferInsert;
