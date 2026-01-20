CREATE TABLE `draft_picks` (
	`id` text PRIMARY KEY NOT NULL,
	`league_id` text NOT NULL,
	`fantasy_team_id` text NOT NULL,
	`player_id` text NOT NULL,
	`round` integer NOT NULL,
	`pick_in_round` integer NOT NULL,
	`overall_pick` integer NOT NULL,
	`pick_time` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`league_id`) REFERENCES `leagues`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`fantasy_team_id`) REFERENCES `fantasy_teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `fantasy_teams` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`league_id` text NOT NULL,
	`tournament_id` text NOT NULL,
	`name` text NOT NULL,
	`owner_name` text NOT NULL,
	`logo_url` text,
	`total_points` real DEFAULT 0,
	`weekly_pickups` integer DEFAULT 0,
	`weekly_pickup_limit` integer DEFAULT 4,
	`last_pickup_reset` text,
	`draft_position` integer,
	`is_ai_team` integer DEFAULT false,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`league_id`) REFERENCES `leagues`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `leagues` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`tournament_id` text NOT NULL,
	`draft_type` text DEFAULT 'snake' NOT NULL,
	`draft_status` text DEFAULT 'pending' NOT NULL,
	`draft_date` text,
	`draft_order` text,
	`current_pick` integer DEFAULT 0,
	`current_round` integer DEFAULT 1,
	`max_teams` integer DEFAULT 10 NOT NULL,
	`roster_size` integer DEFAULT 16 NOT NULL,
	`is_public` integer DEFAULT false,
	`created_by` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `matches` (
	`id` text PRIMARY KEY NOT NULL,
	`tournament_id` text NOT NULL,
	`team1` text NOT NULL,
	`team2` text NOT NULL,
	`venue` text,
	`match_date` text NOT NULL,
	`match_time` text,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`result` text,
	`winner` text,
	`team1_score` text,
	`team2_score` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `player_stats` (
	`id` text PRIMARY KEY NOT NULL,
	`player_id` text NOT NULL,
	`match_id` text NOT NULL,
	`match_date` text NOT NULL,
	`opponent` text,
	`runs` integer DEFAULT 0,
	`balls_faced` integer DEFAULT 0,
	`fours` integer DEFAULT 0,
	`sixes` integer DEFAULT 0,
	`strike_rate` real DEFAULT 0,
	`overs_bowled` real DEFAULT 0,
	`runs_conceded` integer DEFAULT 0,
	`wickets` integer DEFAULT 0,
	`maiden_overs` integer DEFAULT 0,
	`economy_rate` real DEFAULT 0,
	`catches` integer DEFAULT 0,
	`run_outs` integer DEFAULT 0,
	`stumpings` integer DEFAULT 0,
	`fantasy_points` real DEFAULT 0,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `players` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`team` text NOT NULL,
	`position` text NOT NULL,
	`tournament_id` text,
	`image_url` text,
	`price` real DEFAULT 0,
	`avg_points` real DEFAULT 0,
	`total_points` real DEFAULT 0,
	`matches_played` integer DEFAULT 0,
	`is_active` integer DEFAULT true,
	`is_injured` integer DEFAULT false,
	`injury_details` text,
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `roster` (
	`id` text PRIMARY KEY NOT NULL,
	`fantasy_team_id` text NOT NULL,
	`player_id` text NOT NULL,
	`position` text NOT NULL,
	`is_on_ir` integer DEFAULT false,
	`ir_date` text,
	`acquired_date` text DEFAULT CURRENT_TIMESTAMP,
	`acquired_via` text DEFAULT 'draft' NOT NULL,
	FOREIGN KEY (`fantasy_team_id`) REFERENCES `fantasy_teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sync_log` (
	`id` text PRIMARY KEY NOT NULL,
	`tournament_id` text,
	`sync_type` text NOT NULL,
	`status` text NOT NULL,
	`matches_processed` integer DEFAULT 0,
	`players_updated` integer DEFAULT 0,
	`points_calculated` integer DEFAULT 0,
	`error_message` text,
	`started_at` text DEFAULT CURRENT_TIMESTAMP,
	`completed_at` text,
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `tournaments` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`short_name` text NOT NULL,
	`type` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`teams` text NOT NULL,
	`description` text,
	`is_test` integer DEFAULT false,
	`is_active` integer DEFAULT true,
	`created_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`league_id` text NOT NULL,
	`fantasy_team_id` text NOT NULL,
	`type` text NOT NULL,
	`player_id` text,
	`related_player_id` text,
	`related_team_id` text,
	`status` text DEFAULT 'completed' NOT NULL,
	`week_number` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`league_id`) REFERENCES `leagues`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`fantasy_team_id`) REFERENCES `fantasy_teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`name` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `weekly_scores` (
	`id` text PRIMARY KEY NOT NULL,
	`fantasy_team_id` text NOT NULL,
	`league_id` text NOT NULL,
	`week_number` integer NOT NULL,
	`week_start_date` text NOT NULL,
	`week_end_date` text NOT NULL,
	`total_points` real DEFAULT 0,
	`rank` integer,
	FOREIGN KEY (`fantasy_team_id`) REFERENCES `fantasy_teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`league_id`) REFERENCES `leagues`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);