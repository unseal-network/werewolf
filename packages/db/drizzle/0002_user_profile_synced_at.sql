ALTER TABLE "game_users" ADD COLUMN IF NOT EXISTS "profile_synced_at" timestamp with time zone;
