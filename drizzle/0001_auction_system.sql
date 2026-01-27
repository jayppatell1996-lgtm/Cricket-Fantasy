-- Auction System Schema Migration
-- This adds support for auction-style drafts for T20 World Cup and IPL tournaments

-- Add purse column to fantasy_teams for budget tracking
ALTER TABLE `fantasy_teams` ADD COLUMN `purse` real DEFAULT 5000000;

-- Auction State: Tracks the current state of an auction
CREATE TABLE `auction_state` (
    `id` text PRIMARY KEY NOT NULL,
    `league_id` text NOT NULL UNIQUE,
    `is_active` integer DEFAULT false,
    `is_paused` integer DEFAULT false,
    `current_player_id` text,
    `current_bid` real DEFAULT 0,
    `highest_bidder_team_id` text,
    `timer_end_time` integer,
    `paused_time_remaining` integer,
    `created_at` text DEFAULT CURRENT_TIMESTAMP,
    `updated_at` text DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`league_id`) REFERENCES `leagues`(`id`) ON UPDATE no action ON DELETE cascade,
    FOREIGN KEY (`current_player_id`) REFERENCES `auction_players`(`id`) ON UPDATE no action ON DELETE set null,
    FOREIGN KEY (`highest_bidder_team_id`) REFERENCES `fantasy_teams`(`id`) ON UPDATE no action ON DELETE set null
);

-- Auction Players: Queue of players up for auction with their status
CREATE TABLE `auction_players` (
    `id` text PRIMARY KEY NOT NULL,
    `league_id` text NOT NULL,
    `player_id` text NOT NULL,
    `player_name` text NOT NULL,
    `player_team` text NOT NULL,
    `player_position` text NOT NULL,
    `base_price` real NOT NULL DEFAULT 100000,
    `status` text DEFAULT 'pending' NOT NULL,
    `sold_to_team_id` text,
    `sold_for` real,
    `sold_at` text,
    `order_index` integer NOT NULL DEFAULT 0,
    `created_at` text DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`league_id`) REFERENCES `leagues`(`id`) ON UPDATE no action ON DELETE cascade,
    FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE cascade,
    FOREIGN KEY (`sold_to_team_id`) REFERENCES `fantasy_teams`(`id`) ON UPDATE no action ON DELETE set null
);

-- Auction Logs: Activity log for auction events
CREATE TABLE `auction_logs` (
    `id` text PRIMARY KEY NOT NULL,
    `league_id` text NOT NULL,
    `log_type` text NOT NULL,
    `message` text NOT NULL,
    `team_id` text,
    `player_id` text,
    `amount` real,
    `timestamp` text DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`league_id`) REFERENCES `leagues`(`id`) ON UPDATE no action ON DELETE cascade,
    FOREIGN KEY (`team_id`) REFERENCES `fantasy_teams`(`id`) ON UPDATE no action ON DELETE set null,
    FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE set null
);

-- Unsold Players: Players that didn't get sold in auction (can be reintroduced)
CREATE TABLE `unsold_players` (
    `id` text PRIMARY KEY NOT NULL,
    `league_id` text NOT NULL,
    `player_id` text NOT NULL,
    `player_name` text NOT NULL,
    `player_position` text NOT NULL,
    `base_price` real NOT NULL,
    `created_at` text DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`league_id`) REFERENCES `leagues`(`id`) ON UPDATE no action ON DELETE cascade,
    FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE cascade
);

-- Create index for faster auction player lookups
CREATE INDEX `idx_auction_players_league` ON `auction_players` (`league_id`, `status`, `order_index`);
CREATE INDEX `idx_auction_logs_league` ON `auction_logs` (`league_id`, `timestamp`);
CREATE INDEX `idx_auction_state_league` ON `auction_state` (`league_id`);

-- Add auction settings to leagues table
-- Note: These ALTER TABLE statements may fail if columns exist, handle in migration runner
-- ALTER TABLE `leagues` ADD COLUMN `auction_budget` real DEFAULT 5000000;
-- ALTER TABLE `leagues` ADD COLUMN `auction_min_bid` real DEFAULT 100000;
-- ALTER TABLE `leagues` ADD COLUMN `auction_timer_seconds` integer DEFAULT 12;
