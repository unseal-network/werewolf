CREATE TABLE "game_events" (
	"id" text PRIMARY KEY NOT NULL,
	"game_room_id" text NOT NULL,
	"seq" integer NOT NULL,
	"type" text NOT NULL,
	"visibility" text NOT NULL,
	"actor_id" text,
	"subject_id" text,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_room_players" (
	"id" text PRIMARY KEY NOT NULL,
	"game_room_id" text NOT NULL,
	"kind" text NOT NULL,
	"user_id" text,
	"agent_id" text,
	"display_name" text NOT NULL,
	"seat_no" integer NOT NULL,
	"ready" boolean NOT NULL,
	"online_state" text NOT NULL,
	"joined_at" timestamp with time zone NOT NULL,
	"left_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "game_rooms" (
	"id" text PRIMARY KEY NOT NULL,
	"creator_user_id" text NOT NULL,
	"status" text NOT NULL,
	"title" text NOT NULL,
	"target_player_count" integer NOT NULL,
	"timing" jsonb NOT NULL,
	"created_from_matrix_room_id" text NOT NULL,
	"allowed_source_matrix_room_ids" jsonb NOT NULL,
	"agent_source_matrix_room_id" text NOT NULL,
	"started_at" timestamp with time zone,
	"paused_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"next_tick_at" timestamp with time zone,
	"runtime_lease_until" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_users" (
	"id" text PRIMARY KEY NOT NULL,
	"matrix_user_id" text NOT NULL,
	"display_name" text NOT NULL,
	"avatar_url" text,
	"last_seen_at" timestamp with time zone NOT NULL,
	CONSTRAINT "game_users_matrix_user_id_unique" UNIQUE("matrix_user_id")
);
--> statement-breakpoint
CREATE TABLE "player_private_state" (
	"game_room_id" text NOT NULL,
	"player_id" text NOT NULL,
	"private_state" jsonb NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "room_projection" (
	"game_room_id" text PRIMARY KEY NOT NULL,
	"version" integer NOT NULL,
	"public_state" jsonb NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "game_events_room_seq_idx" ON "game_events" USING btree ("game_room_id","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "game_room_players_room_seat_idx" ON "game_room_players" USING btree ("game_room_id","seat_no");--> statement-breakpoint
CREATE UNIQUE INDEX "player_private_state_room_player_idx" ON "player_private_state" USING btree ("game_room_id","player_id");