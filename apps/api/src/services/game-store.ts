import { and, asc, eq, gt, inArray, isNotNull, lte, or, sql as rawSql } from "drizzle-orm";
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
          allowedSourceMatrixRoomIds: room.allowedSourceMatrixRoomIds,
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
            allowedSourceMatrixRoomIds: room.allowedSourceMatrixRoomIds,
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
            displayName: player.displayName,
            seatNo: player.seatNo,
            ready: player.ready,
            onlineState: player.onlineState,
            joinedAt: now,
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
   * Append events to the event log. Existing (room, seq) pairs are ignored —
   * the unique index makes this idempotent so re-runs after partial failure
   * are safe.
   */
  async appendEvents(roomId: string, events: GameEvent[]): Promise<void> {
    if (events.length === 0) return;
    await this.db
      .insert(gameEvents)
      .values(
        events.map((e) => ({
          id: e.id,
          gameRoomId: roomId,
          seq: e.seq,
          type: e.type,
          visibility: e.visibility,
          actorId: e.actorId ?? null,
          subjectId: e.subjectId ?? null,
          payload: e.payload,
          createdAt: new Date(e.createdAt),
        }))
      )
      .onConflictDoNothing({
        target: [gameEvents.gameRoomId, gameEvents.seq],
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
        .select()
        .from(gameEvents)
        .where(inArray(gameEvents.gameRoomId, roomIds))
        .orderBy(asc(gameEvents.seq)),
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
        displayName: p.displayName,
        seatNo: p.seatNo,
        ready: p.ready,
        onlineState: p.onlineState as "online" | "offline",
        leftAt: p.leftAt ? p.leftAt.toISOString() : null,
      }));
      const privateStates = (privateByRoom.get(r.id) ?? []).map(
        (row) => row.privateState as PlayerPrivateState
      );
      const events = (eventsByRoom.get(r.id) ?? []).map<GameEvent>((row) => ({
        id: row.id,
        gameRoomId: row.gameRoomId,
        seq: row.seq,
        type: row.type as GameEvent["type"],
        visibility: row.visibility as GameEvent["visibility"],
        ...(row.actorId !== null ? { actorId: row.actorId } : {}),
        ...(row.subjectId !== null ? { subjectId: row.subjectId } : {}),
        payload: (row.payload ?? {}) as GameEvent["payload"],
        createdAt: row.createdAt.toISOString(),
      }));
      return {
        id: r.id,
        creatorUserId: r.creatorUserId,
        title: r.title,
        status: r.status as StoredGameRoom["status"],
        targetPlayerCount: r.targetPlayerCount,
        language: "zh-CN",
        timing: r.timing as StoredGameRoom["timing"],
        createdFromMatrixRoomId: r.createdFromMatrixRoomId,
        allowedSourceMatrixRoomIds: r.allowedSourceMatrixRoomIds as string[],
        agentSourceMatrixRoomId: r.agentSourceMatrixRoomId,
        players,
        projection: payload?.projection ?? null,
        privateStates,
        events,
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
  async claimDueRooms(now: Date): Promise<string[]> {
    const rows = await this.db
      .select({ id: gameRooms.id })
      .from(gameRooms)
      .where(
        and(
          eq(gameRooms.status, "active"),
          isNotNull(gameRooms.nextTickAt),
          lte(gameRooms.nextTickAt, now)
        )
      );
    return rows.map((r) => r.id);
  }

  /**
   * Load all events for a room with seq > `sinceSeq`, ordered by seq. Used
   * by the SSE subscribe endpoint to replay history after a process restart
   * (when the broker's in-memory history is empty).
   */
  async loadEventsSince(
    gameRoomId: string,
    sinceSeq: number
  ): Promise<GameEvent[]> {
    const rows = await this.db
      .select()
      .from(gameEvents)
      .where(
        and(
          eq(gameEvents.gameRoomId, gameRoomId),
          gt(gameEvents.seq, sinceSeq)
        )
      )
      .orderBy(asc(gameEvents.seq));
    return rows.map<GameEvent>((row) => ({
      id: row.id,
      gameRoomId: row.gameRoomId,
      seq: row.seq,
      type: row.type as GameEvent["type"],
      visibility: row.visibility as GameEvent["visibility"],
      ...(row.actorId !== null ? { actorId: row.actorId } : {}),
      ...(row.subjectId !== null ? { subjectId: row.subjectId } : {}),
      payload: (row.payload ?? {}) as GameEvent["payload"],
      createdAt: row.createdAt.toISOString(),
    }));
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

// Suppress unused-import warnings — `rawSql` is exported for future use.
void rawSql;
