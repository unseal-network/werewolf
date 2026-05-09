import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const gameUsers = pgTable("game_users", {
  id: text("id").primaryKey(),
  matrixUserId: text("matrix_user_id").notNull().unique(),
  displayName: text("display_name").notNull(),
  avatarUrl: text("avatar_url"),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
});

export const gameRooms = pgTable("game_rooms", {
  id: text("id").primaryKey(),
  creatorUserId: text("creator_user_id").notNull(),
  status: text("status").notNull(),
  title: text("title").notNull(),
  targetPlayerCount: integer("target_player_count").notNull(),
  timing: jsonb("timing").notNull(),
  createdFromMatrixRoomId: text("created_from_matrix_room_id").notNull(),
  allowedSourceMatrixRoomIds: jsonb("allowed_source_matrix_room_ids").notNull(),
  agentSourceMatrixRoomId: text("agent_source_matrix_room_id").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  pausedAt: timestamp("paused_at", { withTimezone: true }),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  nextTickAt: timestamp("next_tick_at", { withTimezone: true }),
  runtimeLeaseUntil: timestamp("runtime_lease_until", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const gameRoomPlayers = pgTable(
  "game_room_players",
  {
    id: text("id").primaryKey(),
    gameRoomId: text("game_room_id").notNull(),
    kind: text("kind").notNull(),
    userId: text("user_id"),
    agentId: text("agent_id"),
    displayName: text("display_name").notNull(),
    seatNo: integer("seat_no").notNull(),
    ready: boolean("ready").notNull(),
    onlineState: text("online_state").notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull(),
    leftAt: timestamp("left_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("game_room_players_room_seat_idx").on(
      table.gameRoomId,
      table.seatNo
    ),
  ]
);

export const gameEvents = pgTable(
  "game_events",
  {
    id: text("id").primaryKey(),
    gameRoomId: text("game_room_id").notNull(),
    seq: integer("seq").notNull(),
    type: text("type").notNull(),
    visibility: text("visibility").notNull(),
    actorId: text("actor_id"),
    subjectId: text("subject_id"),
    payload: jsonb("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("game_events_room_seq_idx").on(table.gameRoomId, table.seq),
  ]
);

export const roomProjection = pgTable("room_projection", {
  gameRoomId: text("game_room_id").primaryKey(),
  version: integer("version").notNull(),
  publicState: jsonb("public_state").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const playerPrivateState = pgTable(
  "player_private_state",
  {
    gameRoomId: text("game_room_id").notNull(),
    playerId: text("player_id").notNull(),
    privateState: jsonb("private_state").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("player_private_state_room_player_idx").on(
      table.gameRoomId,
      table.playerId
    ),
  ]
);
