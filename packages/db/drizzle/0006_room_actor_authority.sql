DROP TABLE IF EXISTS "game_events";
--> statement-breakpoint
CREATE TABLE "game_events" (
  "id" text PRIMARY KEY,
  "game_room_id" text NOT NULL,
  "command_id" text NOT NULL,
  "command_event_index" integer NOT NULL,
  "type" text NOT NULL,
  "visibility" text NOT NULL,
  "actor_id" text,
  "subject_id" text,
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "raw_event_json" text NOT NULL,
  "raw_sse_payload" text NOT NULL,
  "visible_to_player_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "game_events_room_command_index_idx"
  ON "game_events" ("game_room_id", "command_id", "command_event_index");

CREATE INDEX IF NOT EXISTS "game_events_room_id_idx"
  ON "game_events" ("game_room_id", "id");

CREATE TABLE IF NOT EXISTS "game_commands" (
  "game_room_id" text NOT NULL,
  "command_id" text NOT NULL,
  "kind" text NOT NULL,
  "actor_user_id" text NOT NULL,
  "status" text NOT NULL,
  "result_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "first_event_id" text,
  "last_event_id" text,
  "error_code" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("game_room_id", "command_id")
);

CREATE TABLE IF NOT EXISTS "room_snapshots" (
  "game_room_id" text PRIMARY KEY,
  "snapshot_event_id" text NOT NULL,
  "canonical_state_json" jsonb NOT NULL,
  "display_state_json" jsonb NOT NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "room_ownership" (
  "game_room_id" text PRIMARY KEY,
  "owner_id" text NOT NULL,
  "fencing_token" bigint NOT NULL,
  "lease_expires_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "event_id_workers" (
  "worker_id" integer PRIMARY KEY,
  "owner_id" text NOT NULL,
  "lease_expires_at" timestamptz NOT NULL
);
