import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const gameUsers = pgTable("game_users", {
  id: text("id").primaryKey(),
  matrixUserId: text("matrix_user_id").notNull().unique(),
  displayName: text("display_name").notNull(),
  avatarUrl: text("avatar_url"),
  profileSyncedAt: timestamp("profile_synced_at", { withTimezone: true }),
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
    invitedByUserId: text("invited_by_user_id"),
    displayName: text("display_name").notNull(),
    avatarUrl: text("avatar_url"),
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
    commandId: text("command_id").notNull(),
    commandEventIndex: integer("command_event_index").notNull(),
    type: text("type").notNull(),
    visibility: text("visibility").notNull(),
    actorId: text("actor_id"),
    subjectId: text("subject_id"),
    payload: jsonb("payload").notNull().default({}),
    rawEventJson: text("raw_event_json").notNull(),
    rawSsePayload: text("raw_sse_payload").notNull(),
    visibleToPlayerIds: jsonb("visible_to_player_ids").notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("game_events_room_command_index_idx").on(
      table.gameRoomId,
      table.commandId,
      table.commandEventIndex
    ),
    index("game_events_room_id_idx").on(table.gameRoomId, table.id),
  ]
);

export const gameCommands = pgTable(
  "game_commands",
  {
    gameRoomId: text("game_room_id").notNull(),
    commandId: text("command_id").notNull(),
    kind: text("kind").notNull(),
    actorUserId: text("actor_user_id").notNull(),
    status: text("status").notNull(),
    resultJson: jsonb("result_json").notNull().default({}),
    firstEventId: text("first_event_id"),
    lastEventId: text("last_event_id"),
    errorCode: text("error_code"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.gameRoomId, table.commandId] }),
  })
);

export const roomSnapshots = pgTable("room_snapshots", {
  gameRoomId: text("game_room_id").primaryKey(),
  snapshotEventId: text("snapshot_event_id").notNull(),
  canonicalStateJson: jsonb("canonical_state_json").notNull(),
  displayStateJson: jsonb("display_state_json").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const roomOwnership = pgTable("room_ownership", {
  gameRoomId: text("game_room_id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  fencingToken: bigint("fencing_token", { mode: "bigint" }).notNull(),
  leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const eventIdWorkers = pgTable("event_id_workers", {
  workerId: integer("worker_id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }).notNull(),
});

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
