-- Phase 3: Auction Rounds System Migration
-- Adds support for rounds-based auctions with JSON player import

-- Update purse to ₹129 Cr (129000000)
UPDATE `fantasy_teams` SET `purse` = 129000000 WHERE `purse` = 5000000;

-- Add round support to auction_state
ALTER TABLE `auction_state` ADD COLUMN `current_round_id` text;

-- Create Auction Rounds table
CREATE TABLE IF NOT EXISTS `auction_rounds` (
    `id` text PRIMARY KEY NOT NULL,
    `league_id` text NOT NULL,
    `round_number` integer NOT NULL,
    `name` text NOT NULL,
    `is_active` integer DEFAULT 0,
    `is_completed` integer DEFAULT 0,
    `created_at` text DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`league_id`) REFERENCES `leagues`(`id`) ON UPDATE no action ON DELETE cascade
);

-- Add round_id to auction_players
ALTER TABLE `auction_players` ADD COLUMN `round_id` text;

-- Add category column to auction_players (replaces player_position for more flexible categorization)
ALTER TABLE `auction_players` ADD COLUMN `category` text;

-- Add original_round_id to unsold_players to track which round they came from
ALTER TABLE `unsold_players` ADD COLUMN `original_round_id` text;
ALTER TABLE `unsold_players` ADD COLUMN `category` text;

-- Create index for rounds
CREATE INDEX IF NOT EXISTS `idx_auction_rounds_league` ON `auction_rounds` (`league_id`, `round_number`);
CREATE INDEX IF NOT EXISTS `idx_auction_players_round` ON `auction_players` (`round_id`, `status`);

-- Add round_id to auction_logs
ALTER TABLE `auction_logs` ADD COLUMN `round_id` text;
