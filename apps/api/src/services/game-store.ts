import { and, eq, inArray, or, sql as rawSql } from "drizzle-orm";
import {
  type DbClient,
  gameEvents,
  gameRoomPlayers,
  gameRooms,
  playerPrivateState,
  roomProjection,
} from "@werewolf/db";
import type { GameEvent } from "@werewolf/shared";
import type { PlayerPrivateState, RoomProjection } from "@werewolf/engine";
import { compareEventIds, isEventIdAfter } from "./event-id-cursor";
import type { StoredGameRoom, StoredPlayer } from "./game-service";

/**
 * Snapshot of runtime-only state that isn't already in RoomProjection.
 * Persisted alongside the projection so recovery restores in-progress night
 * actions, speech queue, and tie data.
 */
export interface PersistedRuntimeState {
  speechQueue: string[];
  pendingNightActions: unknown[];
  pendingVotes: Array<{ actorPlayerId: string; targetPlayerId: string }>;
  tiePlayerIds: string[];
}

interface PersistedProjectionPayload {
  projection: RoomProjection;
  runtime: PersistedRuntimeState;
}

/**
 * GameStore — durable persistence for in-progress games.
 *
 * All writes are best-effort: callers (the game-service) should swallow
 * persistence errors so a transient DB blip doesn't crash an active game.
 * Recovery on startup uses `loadActiveRooms()` to hydrate the in-memory cache.
 */
export class GameStore {
  constructor(private readonly db: DbClient) {}

  // ─────────────────────── Writes ───────────────────────

  /**
   * Upsert the room row and its full players list. Players that no longer
   * exist in the in-memory state are deleted so seat swaps reflect through.
   */
  async saveRoomState(room: StoredGameRoom): Promise<void> {
    const now = new Date();
    await this.db.transaction(async (tx) => {
      await tx
        .insert(gameRooms)
        .values({
          id: room.id,
          creatorUserId: room.creatorUserId,
          status: room.status,
          title: room.title,
          targetPlayerCount: room.targetPlayerCount,
          timing: room.timing,
          createdFromMatrixRoomId: room.createdFromMatrixRoomId,
          agentSourceMatrixRoomId: room.agentSourceMatrixRoomId,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: gameRooms.id,
          set: {
            status: room.status,
            title: room.title,
            targetPlayerCount: room.targetPlayerCount,
            timing: room.timing,
            agentSourceMatrixRoomId: room.agentSourceMatrixRoomId,
            updatedAt: now,
          },
        });

      // Replace the players list. Using delete-then-insert keeps the seat
      // unique index honored even after swaps (seatNo changes are valid
      // because the constraint is on (room_id, seat_no), and the delete
      // clears any stale rows before the new insert).
      await tx
        .delete(gameRoomPlayers)
        .where(eq(gameRoomPlayers.gameRoomId, room.id));
      if (room.players.length > 0) {
        await tx.insert(gameRoomPlayers).values(
          room.players.map((player) => ({
            id: `${room.id}:${player.id}`,
            gameRoomId: room.id,
            kind: player.kind,
            userId: player.userId ?? null,
            agentId: player.agentId ?? null,
            invitedByUserId: player.invitedByUserId ?? null,
            displayName: player.displayName,
            avatarUrl: player.avatarUrl ?? null,
            seatNo: player.seatNo,
            ready: player.ready,
            onlineState: player.onlineState,
            joinedAt: player.joinedAt ? new Date(player.joinedAt) : now,
            leftAt: player.leftAt ? new Date(player.leftAt) : null,
          }))
        );
      }
    });
  }

  /**
   * Update the lifecycle timestamp columns on a room. Lightweight compared
   * to saveRoomState — used when only `started_at` / `ended_at` change.
   */
  async setRoomLifecycle(
    roomId: string,
    fields: { startedAt?: Date | null; pausedAt?: Date | null; endedAt?: Date | null }
  ): Promise<void> {
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if ("startedAt" in fields) set.startedAt = fields.startedAt;
    if ("pausedAt" in fields) set.pausedAt = fields.pausedAt;
    if ("endedAt" in fields) set.endedAt = fields.endedAt;
    await this.db.update(gameRooms).set(set).where(eq(gameRooms.id, roomId));
  }

  /**
   * Persist the public projection plus runtime-only state that the engine
   * relies on but doesn't model in RoomProjection itself.
   */
  async saveProjection(room: StoredGameRoom): Promise<void> {
    if (!room.projection) return;
    const payload: PersistedProjectionPayload = {
      projection: room.projection,
      runtime: {
        speechQueue: room.speechQueue,
        pendingNightActions: room.pendingNightActions,
        pendingVotes: room.pendingVotes,
        tiePlayerIds: room.tiePlayerIds,
      },
    };
    await this.db
      .insert(roomProjection)
      .values({
        gameRoomId: room.id,
        version: room.projection.version,
        publicState: payload,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: roomProjection.gameRoomId,
        set: {
          version: room.projection.version,
          publicState: payload,
          updatedAt: new Date(),
        },
      });
  }

  /** Upsert every player's private state row. */
  async savePrivateStates(
    roomId: string,
    states: PlayerPrivateState[]
  ): Promise<void> {
    if (states.length === 0) return;
    const now = new Date();
    await this.db.transaction(async (tx) => {
      for (const state of states) {
        await tx
          .insert(playerPrivateState)
          .values({
            gameRoomId: roomId,
            playerId: state.playerId,
            privateState: state,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [
              playerPrivateState.gameRoomId,
              playerPrivateState.playerId,
            ],
            set: { privateState: state, updatedAt: now },
          });
      }
    });
  }

  /**
   * Append events to the event log. Existing legacy events are keyed by their
   * event id until the room-actor command pipeline owns this write path.
   */
  async appendEvents(roomId: string, events: GameEvent[]): Promise<void> {
    if (events.length === 0) return;
    await this.db
      .insert(gameEvents)
      .values(events.map((event) => toLegacyGameEventRow(roomId, event)))
      .onConflictDoNothing({
        target: [
          gameEvents.gameRoomId,
          gameEvents.commandId,
          gameEvents.commandEventIndex,
        ],
      });
  }

  async updateEventPayload(
    roomId: string,
    eventId: string,
    payload: GameEvent["payload"]
  ): Promise<void> {
    await this.db
      .update(gameEvents)
      .set({ payload })
      .where(and(eq(gameEvents.gameRoomId, roomId), eq(gameEvents.id, eventId)));
  }

  /**
   * Persist a complete room snapshot and optional newly assigned events in one
   * DB transaction. This is the durable boundary for the runtime: replay data
   * and projection/private snapshots move forward together or not at all.
   */
  async saveSnapshot(room: StoredGameRoom, events: GameEvent[] = []): Promise<void> {
    const now = new Date();
    const deadline = room.projection?.deadlineAt
      ? new Date(room.projection.deadlineAt)
      : null;
    const projectionPayload: PersistedProjectionPayload | null = room.projection
      ? {
          projection: room.projection,
          runtime: {
            speechQueue: room.speechQueue,
            pendingNightActions: room.pendingNightActions,
            pendingVotes: room.pendingVotes,
            tiePlayerIds: room.tiePlayerIds,
          },
        }
      : null;

    await this.db.transaction(async (tx) => {
      await tx
        .insert(gameRooms)
        .values({
          id: room.id,
          creatorUserId: room.creatorUserId,
          status: room.status,
          title: room.title,
          targetPlayerCount: room.targetPlayerCount,
          timing: room.timing,
          createdFromMatrixRoomId: room.createdFromMatrixRoomId,
          agentSourceMatrixRoomId: room.agentSourceMatrixRoomId,
          nextTickAt: deadline,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: gameRooms.id,
          set: {
            status: room.status,
            title: room.title,
            targetPlayerCount: room.targetPlayerCount,
            timing: room.timing,
            agentSourceMatrixRoomId: room.agentSourceMatrixRoomId,
            nextTickAt: deadline,
            updatedAt: now,
          },
        });

      await tx
        .delete(gameRoomPlayers)
        .where(eq(gameRoomPlayers.gameRoomId, room.id));
      if (room.players.length > 0) {
        await tx.insert(gameRoomPlayers).values(
          room.players.map((player) => ({
            id: `${room.id}:${player.id}`,
            gameRoomId: room.id,
            kind: player.kind,
            userId: player.userId ?? null,
            agentId: player.agentId ?? null,
            invitedByUserId: player.invitedByUserId ?? null,
            displayName: player.displayName,
            avatarUrl: player.avatarUrl ?? null,
            seatNo: player.seatNo,
            ready: player.ready,
            onlineState: player.onlineState,
            joinedAt: player.joinedAt ? new Date(player.joinedAt) : now,
            leftAt: player.leftAt ? new Date(player.leftAt) : null,
          }))
        );
      }

      if (projectionPayload && room.projection) {
        await tx
          .insert(roomProjection)
          .values({
            gameRoomId: room.id,
            version: room.projection.version,
            publicState: projectionPayload,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: roomProjection.gameRoomId,
            set: {
              version: room.projection.version,
              publicState: projectionPayload,
              updatedAt: now,
            },
          });
      }

      for (const state of room.privateStates) {
        await tx
          .insert(playerPrivateState)
          .values({
            gameRoomId: room.id,
            playerId: state.playerId,
            privateState: state,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [
              playerPrivateState.gameRoomId,
              playerPrivateState.playerId,
            ],
            set: { privateState: state, updatedAt: now },
          });
      }

      if (events.length > 0) {
        await tx
          .insert(gameEvents)
          .values(events.map((event) => toLegacyGameEventRow(room.id, event)))
          .onConflictDoUpdate({
            target: [
              gameEvents.gameRoomId,
              gameEvents.commandId,
              gameEvents.commandEventIndex,
            ],
            set: {
              type: rawSql`excluded.type`,
              visibility: rawSql`excluded.visibility`,
              actorId: rawSql`excluded.actor_id`,
              subjectId: rawSql`excluded.subject_id`,
              payload: rawSql`excluded.payload`,
              rawEventJson: rawSql`excluded.raw_event_json`,
              rawSsePayload: rawSql`excluded.raw_sse_payload`,
              visibleToPlayerIds: rawSql`excluded.visible_to_player_ids`,
            },
          });
      }
    });
  }

  /**
   * Set when the runtime should next be ticked for this room. The tick
   * worker polls `next_tick_at <= now()` and calls scheduleAdvance for any
   * matches. Passing null clears the schedule (e.g. when a human turn has
   * no deadline yet or the game has ended).
   */
  async updateNextTickAt(roomId: string, deadline: Date | null): Promise<void> {
    await this.db
      .update(gameRooms)
      .set({ nextTickAt: deadline, updatedAt: new Date() })
      .where(eq(gameRooms.id, roomId));
  }

  // ─────────────────────── Reads ───────────────────────

  /**
   * Load all rooms that aren't ended, plus their players, projection,
   * private states. Used at process startup to rebuild the in-memory cache
   * so games keep advancing after a restart.
   */
  async loadActiveRooms(): Promise<StoredGameRoom[]> {
    const roomRows = await this.db
      .select()
      .from(gameRooms)
      .where(
        or(
          eq(gameRooms.status, "waiting"),
          eq(gameRooms.status, "active"),
          eq(gameRooms.status, "paused")
        )
      );
    if (roomRows.length === 0) return [];
    const roomIds = roomRows.map((r) => r.id);

    const [playerRows, projRows, privateRows, eventRows] = await Promise.all([
      this.db
        .select()
        .from(gameRoomPlayers)
        .where(inArray(gameRoomPlayers.gameRoomId, roomIds)),
      this.db
        .select()
        .from(roomProjection)
        .where(inArray(roomProjection.gameRoomId, roomIds)),
      this.db
        .select()
        .from(playerPrivateState)
        .where(inArray(playerPrivateState.gameRoomId, roomIds)),
      this.db
        .select({
          gameRoomId: gameEvents.gameRoomId,
          id: gameEvents.id,
          type: gameEvents.type,
          visibility: gameEvents.visibility,
          actorId: gameEvents.actorId,
          subjectId: gameEvents.subjectId,
          payload: gameEvents.payload,
          rawEventJson: gameEvents.rawEventJson,
          createdAt: gameEvents.createdAt,
        })
        .from(gameEvents)
        .where(inArray(gameEvents.gameRoomId, roomIds)),
    ]);

    const playersByRoom = groupBy(playerRows, (p) => p.gameRoomId);
    const projByRoom = new Map(projRows.map((p) => [p.gameRoomId, p]));
    const privateByRoom = groupBy(privateRows, (p) => p.gameRoomId);
    const eventsByRoom = groupBy(eventRows, (e) => e.gameRoomId);

    return roomRows.map<StoredGameRoom>((r) => {
      const projRow = projByRoom.get(r.id);
      const payload = projRow?.publicState as
        | PersistedProjectionPayload
        | undefined;
      const players = (playersByRoom.get(r.id) ?? []).map<StoredPlayer>((p) => ({
        id: p.id.includes(":") ? p.id.split(":").slice(1).join(":") : p.id,
        kind: p.kind as "user" | "agent",
        ...(p.userId !== null ? { userId: p.userId } : {}),
        ...(p.agentId !== null ? { agentId: p.agentId } : {}),
        ...(p.invitedByUserId !== null
          ? { invitedByUserId: p.invitedByUserId }
          : {}),
        displayName: p.displayName,
        ...(p.avatarUrl !== null ? { avatarUrl: p.avatarUrl } : {}),
        seatNo: p.seatNo,
        ready: p.ready,
        onlineState: p.onlineState as "online" | "offline",
        leftAt: p.leftAt ? p.leftAt.toISOString() : null,
        joinedAt: p.joinedAt.toISOString(),
      }));
      const privateStates = (privateByRoom.get(r.id) ?? []).map(
        (row) => row.privateState as PlayerPrivateState
      );
      const events = (eventsByRoom.get(r.id) ?? [])
        .map((row) => toGameEvent(row))
        .sort((left, right) => compareEventIds(left.id, right.id));
      return {
        id: r.id,
        creatorUserId: r.creatorUserId,
        title: r.title,
        status: r.status as StoredGameRoom["status"],
        targetPlayerCount: r.targetPlayerCount,
        language: "zh-CN",
        timing: r.timing as StoredGameRoom["timing"],
        createdFromMatrixRoomId: r.createdFromMatrixRoomId,
        agentSourceMatrixRoomId: r.agentSourceMatrixRoomId,
        players,
        projection: payload?.projection ?? null,
        privateStates,
        events,
        nextEventIndex: nextLegacyEventIndex(
          r.id,
          events.map((event) => event.id)
        ),
        pendingNightActions: (payload?.runtime?.pendingNightActions ??
          []) as StoredGameRoom["pendingNightActions"],
        pendingVotes: payload?.runtime?.pendingVotes ?? [],
        speechQueue: payload?.runtime?.speechQueue ?? [],
        tiePlayerIds: payload?.runtime?.tiePlayerIds ?? [],
      };
    });
  }

  /**
   * Return room IDs whose next_tick_at deadline has passed. Used by the
   * tick worker to drive auto-advance for rooms with no live client.
   */
  async claimDueRooms(now: Date, leaseMs = 120_000, limit = 25): Promise<string[]> {
    const leaseUntil = new Date(now.getTime() + leaseMs);
    const nowIso = now.toISOString();
    const leaseUntilIso = leaseUntil.toISOString();
    const rows = await this.db.execute<{ id: string }>(rawSql`
      UPDATE game_rooms
      SET runtime_lease_until = ${leaseUntilIso}, updated_at = ${nowIso}
      WHERE id IN (
        SELECT id
        FROM game_rooms
        WHERE status = 'active'
          AND next_tick_at IS NOT NULL
          AND next_tick_at <= ${nowIso}
          AND (runtime_lease_until IS NULL OR runtime_lease_until <= ${nowIso})
        ORDER BY next_tick_at
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id
    `);
    return rows.map((row) => row.id);
  }

  async loadEventsAfter(
    gameRoomId: string,
    afterEventId: string | null | undefined
  ): Promise<GameEvent[]> {
    void gameRoomId;
    void afterEventId;
    return [];
  }

  async loadRawSsePayloadsAfter(
    gameRoomId: string,
    afterEventId: string | null | undefined
  ): Promise<Array<{ id: string; rawSsePayload: string }>> {
    const rows = await this.db
      .select({
        id: gameEvents.id,
        rawSsePayload: gameEvents.rawSsePayload,
      })
      .from(gameEvents)
      .where(eq(gameEvents.gameRoomId, gameRoomId));
    return rows
      .filter((row) => !afterEventId || isEventIdAfter(row.id, afterEventId))
      .sort((a, b) => compareEventIds(a.id, b.id));
  }

  /** Drop everything for a room — only used by tests / dev tools. */
  async deleteRoom(roomId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .delete(playerPrivateState)
        .where(eq(playerPrivateState.gameRoomId, roomId));
      await tx
        .delete(roomProjection)
        .where(eq(roomProjection.gameRoomId, roomId));
      await tx.delete(gameEvents).where(eq(gameEvents.gameRoomId, roomId));
      await tx
        .delete(gameRoomPlayers)
        .where(eq(gameRoomPlayers.gameRoomId, roomId));
      await tx.delete(gameRooms).where(eq(gameRooms.id, roomId));
    });
  }
}

type PersistedGameEventRow = {
  gameRoomId: string;
  id: string;
  type: string;
  visibility: string;
  actorId: string | null;
  subjectId: string | null;
  payload: unknown;
  rawEventJson: string;
  createdAt: Date;
};

function toGameEvent(row: PersistedGameEventRow): GameEvent {
  const parsed = parseRawGameEvent(row.rawEventJson);
  const event = {
    id: parsed?.id ?? row.id,
    gameRoomId: parsed?.gameRoomId ?? row.gameRoomId,
    seq: typeof parsed?.seq === "number" ? parsed.seq : eventSeqFromId(row.id),
    type: parsed?.type ?? row.type,
    visibility: parsed?.visibility ?? row.visibility,
    ...(parsed?.actorId !== undefined || row.actorId !== null
      ? { actorId: parsed?.actorId ?? row.actorId ?? undefined }
      : {}),
    ...(parsed?.subjectId !== undefined || row.subjectId !== null
      ? { subjectId: parsed?.subjectId ?? row.subjectId ?? undefined }
      : {}),
    payload:
      parsed?.payload && typeof parsed.payload === "object"
        ? parsed.payload
        : row.payload && typeof row.payload === "object"
          ? row.payload
          : {},
    createdAt:
      typeof parsed?.createdAt === "string"
        ? parsed.createdAt
        : row.createdAt.toISOString(),
  };
  return event as GameEvent;
}

function parseRawGameEvent(raw: string): Partial<GameEvent> | null {
  if (!raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Partial<GameEvent>)
      : null;
  } catch {
    return null;
  }
}

function eventSeqFromId(eventId: string): number {
  const suffix = eventId.match(/_(\d+)$/)?.[1];
  return suffix ? Number(suffix) : 1;
}

function groupBy<T, K>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const bucket = out.get(k);
    if (bucket) bucket.push(item);
    else out.set(k, [item]);
  }
  return out;
}

export function nextLegacyEventIndex(roomId: string, eventIds: string[]): number {
  let maxIndex = 0;
  const prefix = `${roomId}_`;
  for (const id of eventIds) {
    if (!id.startsWith(prefix)) continue;
    const suffix = id.slice(prefix.length);
    if (!/^\d+$/.test(suffix)) continue;
    maxIndex = Math.max(maxIndex, Number(suffix));
  }
  return Math.max(maxIndex, eventIds.length) + 1;
}

type GameEventInsert = typeof gameEvents.$inferInsert;

export function toLegacyGameEventRow(
  roomId: string,
  event: GameEvent
): GameEventInsert {
  const rawEvent = {
    id: event.id,
    gameRoomId: roomId,
    type: event.type,
    visibility: event.visibility,
    ...(event.actorId !== undefined ? { actorId: event.actorId } : {}),
    ...(event.subjectId !== undefined ? { subjectId: event.subjectId } : {}),
    payload: event.payload,
    createdAt: event.createdAt,
  };
  return {
    id: event.id,
    gameRoomId: roomId,
    commandId: event.id,
    commandEventIndex: 0,
    type: event.type,
    visibility: event.visibility,
    actorId: event.actorId ?? null,
    subjectId: event.subjectId ?? null,
    payload: event.payload,
    rawEventJson: JSON.stringify(rawEvent),
    rawSsePayload: `id: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`,
    visibleToPlayerIds: [],
    createdAt: new Date(event.createdAt),
  };
}
