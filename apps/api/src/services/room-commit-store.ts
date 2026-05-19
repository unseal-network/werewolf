import { and, asc, eq, gt, sql as rawSql } from "drizzle-orm";
import {
  type DbClient,
  gameCommands,
  gameEvents,
  roomOwnership,
  roomSnapshots,
} from "@werewolf/db";
import { compareEventIds, isEventIdAfter } from "./event-id-cursor";

export interface RoomCommittedEvent {
  id: string;
  gameRoomId: string;
  type: string;
  visibility: string;
  actorId?: string;
  subjectId?: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface RoomSnapshot {
  gameRoomId: string;
  snapshotEventId: string;
  canonicalState: unknown;
  displayState: unknown;
  updatedAt: string;
}

export interface StagedRoomCommit {
  gameRoomId: string;
  commandId: string;
  kind: string;
  actorUserId: string;
  fencingToken: bigint;
  baseSnapshotEventId: string;
  events: readonly RoomCommittedEvent[];
  rawSsePayloads: readonly string[];
  canonicalState: unknown;
  displayState: unknown;
  result: unknown;
}

export type RoomCommitResult =
  | {
      status: "committed";
      result: unknown;
      events: RoomCommittedEvent[];
      rawSsePayloads: string[];
      snapshotEventId: string;
    }
  | {
      status: "duplicate";
      result: unknown;
      events: RoomCommittedEvent[];
      rawSsePayloads: string[];
      snapshotEventId: string;
    };

export interface DuplicateCommand {
  result: unknown;
  events: RoomCommittedEvent[];
  rawSsePayloads: string[];
  snapshotEventId: string;
}

export interface RoomCommitStore {
  commit(staged: StagedRoomCommit): Promise<RoomCommitResult>;
  findCommand(
    gameRoomId: string,
    commandId: string
  ): Promise<DuplicateCommand | null>;
  loadSnapshot(gameRoomId: string): Promise<RoomSnapshot | null>;
  readEventsAfter(
    gameRoomId: string,
    afterEventId: string,
    limit: number
  ): Promise<RoomCommittedEvent[]>;
}

type StoredCommand = DuplicateCommand;

interface OwnershipLease {
  fencingToken: bigint;
  leaseExpiresAt: Date;
}

interface CommandResultEnvelope {
  result: unknown;
  snapshotEventId: string;
}

export class InMemoryRoomCommitStore implements RoomCommitStore {
  private readonly ownership = new Map<string, OwnershipLease>();
  private readonly commands = new Map<string, StoredCommand>();
  private readonly eventsByRoom = new Map<string, RoomCommittedEvent[]>();
  private readonly snapshots = new Map<string, RoomSnapshot>();

  seedOwnership(
    gameRoomId: string,
    fencingToken: bigint,
    leaseExpiresAt = new Date(Date.now() + 60_000)
  ): void {
    this.ownership.set(gameRoomId, { fencingToken, leaseExpiresAt });
  }

  async commit(staged: StagedRoomCommit): Promise<RoomCommitResult> {
    this.assertOwned(staged.gameRoomId, staged.fencingToken);

    const commandKey = commandMapKey(staged.gameRoomId, staged.commandId);
    const existing = this.commands.get(commandKey);
    if (existing) {
      return {
        status: "duplicate",
        result: cloneJsonLike(existing.result),
        events: existing.events.map(copyEvent),
        rawSsePayloads: [...existing.rawSsePayloads],
        snapshotEventId: existing.snapshotEventId,
      };
    }
    assertRawSsePayloadCount(staged);

    const events = staged.events.map(copyEvent);
    const rawSsePayloads = [...staged.rawSsePayloads];
    const snapshotEventId = events.at(-1)?.id ?? staged.baseSnapshotEventId;
    const snapshot: RoomSnapshot = {
      gameRoomId: staged.gameRoomId,
      snapshotEventId,
      canonicalState: cloneJsonLike(staged.canonicalState),
      displayState: cloneJsonLike(staged.displayState),
      updatedAt: new Date().toISOString(),
    };

    this.commands.set(commandKey, {
      result: cloneJsonLike(staged.result),
      events,
      rawSsePayloads,
      snapshotEventId,
    });
    this.eventsByRoom.set(staged.gameRoomId, [
      ...(this.eventsByRoom.get(staged.gameRoomId) ?? []),
      ...events,
    ]);
    this.snapshots.set(staged.gameRoomId, snapshot);

    return {
      status: "committed",
      result: cloneJsonLike(staged.result),
      events: events.map(copyEvent),
      rawSsePayloads: [...rawSsePayloads],
      snapshotEventId,
    };
  }

  async findCommand(
    gameRoomId: string,
    commandId: string
  ): Promise<DuplicateCommand | null> {
    const existing = this.commands.get(commandMapKey(gameRoomId, commandId));
    if (!existing) return null;
    return {
      result: cloneJsonLike(existing.result),
      events: existing.events.map(copyEvent),
      rawSsePayloads: [...existing.rawSsePayloads],
      snapshotEventId: existing.snapshotEventId,
    };
  }

  async loadSnapshot(gameRoomId: string): Promise<RoomSnapshot | null> {
    const snapshot = this.snapshots.get(gameRoomId);
    return snapshot ? copySnapshot(snapshot) : null;
  }

  async readEventsAfter(
    gameRoomId: string,
    afterEventId: string,
    limit: number
  ): Promise<RoomCommittedEvent[]> {
    return (this.eventsByRoom.get(gameRoomId) ?? [])
      .filter((event) => !afterEventId || isEventIdAfter(event.id, afterEventId))
      .sort((a, b) => compareEventIds(a.id, b.id))
      .slice(0, limit)
      .map(copyEvent);
  }

  private assertOwned(gameRoomId: string, fencingToken: bigint): void {
    const ownership = this.ownership.get(gameRoomId);
    if (
      !ownership ||
      ownership.fencingToken !== fencingToken ||
      ownership.leaseExpiresAt <= new Date()
    ) {
      throw new Error("lost ownership");
    }
  }
}

export class DrizzleRoomCommitStore implements RoomCommitStore {
  constructor(private readonly db: DbClient) {}

  async commit(staged: StagedRoomCommit): Promise<RoomCommitResult> {
    return this.db.transaction(async (tx) => {
      const ownershipRows = await tx
        .select({ gameRoomId: roomOwnership.gameRoomId })
        .from(roomOwnership)
        .where(
          and(
            eq(roomOwnership.gameRoomId, staged.gameRoomId),
            eq(roomOwnership.fencingToken, staged.fencingToken),
            gt(roomOwnership.leaseExpiresAt, new Date())
          )
        )
        .limit(1)
        .for("update");
      if (ownershipRows.length === 0) {
        throw new Error("lost ownership");
      }

      const existingCommands = await tx
        .select()
        .from(gameCommands)
        .where(
          and(
            eq(gameCommands.gameRoomId, staged.gameRoomId),
            eq(gameCommands.commandId, staged.commandId)
          )
        )
        .limit(1);
      const existingCommand = existingCommands[0];
      if (existingCommand) {
        const eventRows = await tx
          .select()
          .from(gameEvents)
          .where(
            and(
              eq(gameEvents.gameRoomId, staged.gameRoomId),
              eq(gameEvents.commandId, staged.commandId)
            )
          )
          .orderBy(asc(gameEvents.commandEventIndex));
        const snapshotRows = await tx
          .select({ snapshotEventId: roomSnapshots.snapshotEventId })
          .from(roomSnapshots)
          .where(eq(roomSnapshots.gameRoomId, staged.gameRoomId))
          .limit(1);
        const result = decodeCommandResultEnvelope(
          existingCommand.resultJson,
          existingCommand.lastEventId,
          snapshotRows[0]?.snapshotEventId ?? ""
        );
        return {
          status: "duplicate",
          result: result.result,
          events: eventRows.map(eventFromRow),
          rawSsePayloads: eventRows.map((event) => event.rawSsePayload),
          snapshotEventId: result.snapshotEventId,
        };
      }
      assertRawSsePayloadCount(staged);

      const now = new Date();
      const events = staged.events.map(copyEvent);
      const firstEventId = events[0]?.id ?? null;
      const lastEventId = events.at(-1)?.id ?? null;
      const snapshotEventId = lastEventId ?? staged.baseSnapshotEventId;

      await tx.insert(gameCommands).values({
        gameRoomId: staged.gameRoomId,
        commandId: staged.commandId,
        kind: staged.kind,
        actorUserId: staged.actorUserId,
        status: "committed",
        resultJson: encodeCommandResultEnvelope(staged.result, snapshotEventId),
        firstEventId,
        lastEventId,
        errorCode: null,
        createdAt: now,
        updatedAt: now,
      });

      if (events.length > 0) {
        await tx.insert(gameEvents).values(
          events.map((event, index) =>
            eventToRow(
              staged.commandId,
              index,
              event,
              staged.rawSsePayloads[index]
            )
          )
        );
      }

      await tx
        .insert(roomSnapshots)
        .values({
          gameRoomId: staged.gameRoomId,
          snapshotEventId,
          canonicalStateJson: staged.canonicalState,
          displayStateJson: staged.displayState,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: roomSnapshots.gameRoomId,
          set: {
            snapshotEventId,
            canonicalStateJson: rawSql`excluded.canonical_state_json`,
            displayStateJson: rawSql`excluded.display_state_json`,
            updatedAt: now,
          },
        });

      return {
        status: "committed",
        result: cloneJsonLike(staged.result),
        events,
        rawSsePayloads: [...staged.rawSsePayloads],
        snapshotEventId,
      };
    });
  }

  async findCommand(
    gameRoomId: string,
    commandId: string
  ): Promise<DuplicateCommand | null> {
    const commandRows = await this.db
      .select()
      .from(gameCommands)
      .where(
        and(
          eq(gameCommands.gameRoomId, gameRoomId),
          eq(gameCommands.commandId, commandId)
        )
      )
      .limit(1);
    const command = commandRows[0];
    if (!command) return null;

    const eventRows = await this.db
      .select()
      .from(gameEvents)
      .where(
        and(
          eq(gameEvents.gameRoomId, gameRoomId),
          eq(gameEvents.commandId, commandId)
        )
      )
      .orderBy(asc(gameEvents.commandEventIndex));
    const snapshotRows = await this.db
      .select({ snapshotEventId: roomSnapshots.snapshotEventId })
      .from(roomSnapshots)
      .where(eq(roomSnapshots.gameRoomId, gameRoomId))
      .limit(1);
    const decoded = decodeCommandResultEnvelope(
      command.resultJson,
      command.lastEventId,
      snapshotRows[0]?.snapshotEventId ?? ""
    );

    return {
      result: decoded.result,
      events: eventRows.map(eventFromRow),
      rawSsePayloads: eventRows.map((event) => event.rawSsePayload),
      snapshotEventId: decoded.snapshotEventId,
    };
  }

  async loadSnapshot(gameRoomId: string): Promise<RoomSnapshot | null> {
    const rows = await this.db
      .select()
      .from(roomSnapshots)
      .where(eq(roomSnapshots.gameRoomId, gameRoomId))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return {
      gameRoomId: row.gameRoomId,
      snapshotEventId: row.snapshotEventId,
      canonicalState: cloneJsonLike(row.canonicalStateJson),
      displayState: cloneJsonLike(row.displayStateJson),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async readEventsAfter(
    gameRoomId: string,
    afterEventId: string,
    limit: number
  ): Promise<RoomCommittedEvent[]> {
    const rows = await this.db
      .select()
      .from(gameEvents)
      .where(eq(gameEvents.gameRoomId, gameRoomId));
    return rows
      .map(eventFromRow)
      .filter((event) => !afterEventId || isEventIdAfter(event.id, afterEventId))
      .sort((a, b) => compareEventIds(a.id, b.id))
      .slice(0, limit);
  }
}

type GameEventRow = typeof gameEvents.$inferSelect;
type GameEventInsert = typeof gameEvents.$inferInsert;

function commandMapKey(gameRoomId: string, commandId: string): string {
  return `${gameRoomId}\0${commandId}`;
}

function copyEvent(event: RoomCommittedEvent): RoomCommittedEvent {
  return {
    id: event.id,
    gameRoomId: event.gameRoomId,
    type: event.type,
    visibility: event.visibility,
    ...(event.actorId !== undefined ? { actorId: event.actorId } : {}),
    ...(event.subjectId !== undefined ? { subjectId: event.subjectId } : {}),
    payload: cloneJsonLike(event.payload) as Record<string, unknown>,
    createdAt: event.createdAt,
  };
}

function copySnapshot(snapshot: RoomSnapshot): RoomSnapshot {
  return {
    gameRoomId: snapshot.gameRoomId,
    snapshotEventId: snapshot.snapshotEventId,
    canonicalState: cloneJsonLike(snapshot.canonicalState),
    displayState: cloneJsonLike(snapshot.displayState),
    updatedAt: snapshot.updatedAt,
  };
}

function eventFromRow(row: GameEventRow): RoomCommittedEvent {
  return {
    id: row.id,
    gameRoomId: row.gameRoomId,
    type: row.type,
    visibility: row.visibility,
    ...(row.actorId !== null ? { actorId: row.actorId } : {}),
    ...(row.subjectId !== null ? { subjectId: row.subjectId } : {}),
    payload: cloneJsonLike(row.payload) as Record<string, unknown>,
    createdAt: row.createdAt.toISOString(),
  };
}

function eventToRow(
  commandId: string,
  commandEventIndex: number,
  event: RoomCommittedEvent,
  rawSsePayload: string | undefined
): GameEventInsert {
  return {
    id: event.id,
    gameRoomId: event.gameRoomId,
    commandId,
    commandEventIndex,
    type: event.type,
    visibility: event.visibility,
    actorId: event.actorId ?? null,
    subjectId: event.subjectId ?? null,
    payload: cloneJsonLike(event.payload),
    rawEventJson: JSON.stringify(copyEvent(event)),
    rawSsePayload: rawSsePayload ?? `data: ${JSON.stringify(event)}\n\n`,
    visibleToPlayerIds: [],
    createdAt: new Date(event.createdAt),
  };
}

function assertRawSsePayloadCount(staged: StagedRoomCommit): void {
  if (staged.rawSsePayloads.length !== staged.events.length) {
    throw new Error("raw SSE payload count must match event count");
  }
}

function encodeCommandResultEnvelope(
  result: unknown,
  snapshotEventId: string
): CommandResultEnvelope {
  return {
    result: cloneJsonLike(result),
    snapshotEventId,
  };
}

function decodeCommandResultEnvelope(
  stored: unknown,
  legacyLastEventId: string | null,
  legacySnapshotEventId: string
): CommandResultEnvelope {
  if (isCommandResultEnvelope(stored)) {
    return {
      result: cloneJsonLike(stored.result),
      snapshotEventId: stored.snapshotEventId,
    };
  }

  return {
    result: cloneJsonLike(stored),
    snapshotEventId: legacyLastEventId ?? legacySnapshotEventId,
  };
}

function isCommandResultEnvelope(value: unknown): value is CommandResultEnvelope {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return "result" in record && typeof record.snapshotEventId === "string";
}

function cloneJsonLike<T>(value: T): T {
  if (value === undefined) {
    return value;
  }
  return structuredClone(value);
}

export const encodeCommandResultEnvelopeForTest = encodeCommandResultEnvelope;
export const decodeCommandResultEnvelopeForTest = decodeCommandResultEnvelope;
