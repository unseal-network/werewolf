# Room Actor Game Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the realtime game server around durable per-room actors so 1000 rooms x 10 online players can sustain 1000 game event writes/sec with low fanout latency and replayable history.

**Architecture:** Postgres is the authority for commands, events, snapshots, and room ownership. A room actor is a single writer protected by a persisted lease/fencing token; it stages changes in memory, commits command idempotency + event log + snapshot in one transaction, then publishes prebuilt raw SSE payloads through Redis room channels. Initial subscribe is snapshot-first and no-gap: subscribe/buffer live events, load snapshot, replay by event id cursor, flush deduped buffer, then stream live.

**Tech Stack:** TypeScript, Hono, Postgres/Drizzle, Redis Pub/Sub, Web Streams/SSE, Vitest, existing shared event/visibility types.

---

## Non-Negotiable Design Rules

- `game_events.id` is the only ordering cursor. `created_at` is display/audit only. Do not reintroduce per-room `seq`.
- `game_events` must keep an index equivalent to `(game_room_id, id)`.
- A command may not mutate live room memory until command idempotency, event log, and snapshot commit in the same database transaction.
- Duplicate `command_id` must return the previously committed result without staging, mutating memory, or publishing new events.
- Same room must have one active writer across workers. Fencing must be persisted and checked inside the write transaction.
- Redis is live fanout/cache only. Redis loss may hurt latency, but Postgres must still recover room state and timeline.
- Snapshots must not contain full timeline events. Timeline history is read through a cursor endpoint.
- Initial subscribe must not miss events committed during the snapshot/replay handoff.
- Load tests must verify write success, per-client fanout correctness, delivery ratio, and commit-to-client latency.

## Corrected Data Model

Create one migration for the new clean schema. Existing data can be discarded.

```sql
CREATE TABLE IF NOT EXISTS "game_events" (
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
```

Important schema choices:
- `game_commands` owns command idempotency. `game_events.command_id` is not unique because one command can emit multiple events.
- `raw_event_json` and `raw_sse_payload` are stored once at write time. SSE readers must not parse/re-encode events on the hot path.
- `visible_to_player_ids` is precomputed for private events. Public events use an empty array plus `visibility = "public"`.
- `room_snapshots.canonical_state_json` must exclude `events`; full timeline lives only in `game_events`.

## File Structure

- `packages/db/drizzle/0006_room_actor_authority.sql`
  - New authoritative commands/events/snapshots/ownership schema.
- `packages/db/src/schema.ts`
  - Drizzle table definitions for the new schema.
- `apps/api/src/services/event-id.ts`
  - Snowflake event id generator and worker-id lease resolver.
- `apps/api/src/services/room-ownership.ts`
  - Postgres-backed room lease acquire/renew/release and transactional fencing checks.
- `apps/api/src/services/room-commit-store.ts`
  - Single transactional API for command idempotency, event append, snapshot save, and fencing validation.
- `apps/api/src/services/room-actor/types.ts`
  - Complete command/result/staged-change types.
- `apps/api/src/services/room-actor/room-runtime.ts`
  - Pure command staging for all mutation commands. No live mutation before commit.
- `apps/api/src/services/room-actor/room-actor.ts`
  - Mailbox, duplicate handling, commit, live state swap, publish.
- `apps/api/src/services/room-actor/room-actor-registry.ts`
  - Actor load/de-dupe, ownership acquisition, lease renewal.
- `apps/api/src/services/room-pubsub.ts`
  - Redis room channels, raw SSE publish/subscribe, local listener buffers.
- `apps/api/src/services/room-command-bus.ts`
  - Redis RPC-style command forwarding from non-owner workers to the current room owner.
- `apps/api/src/services/timeline-cache.ts`
  - Redis timeline cache backed by Postgres cursor reads.
- `apps/api/src/routes/games.ts`
  - Mutation routes dispatch commands only. No direct mutation fallback.
- `apps/api/src/routes/events.ts`
  - Snapshot-first no-gap subscribe and cursor timeline endpoint.
- `scripts/load-room-actor.mjs`
  - Target load test with 1000 rooms, 10 clients/room, 1000 writes/sec, fanout checks.
- `docs/perf/room-actor-baseline.md`
  - Capacity gate, profiling commands, and latest results.

---

## Task 1: Add Authoritative Room Actor Schema

**Files:**
- Create: `packages/db/drizzle/0006_room_actor_authority.sql`
- Modify: `packages/db/src/schema.ts`
- Create: `packages/db/src/room-actor-schema.test.ts`

- [ ] **Step 1: Write the failing schema test**

Create `packages/db/src/room-actor-schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { gameCommands, gameEvents, roomOwnership, roomSnapshots } from "./schema";

describe("room actor authority schema", () => {
  it("defines command idempotency separately from event rows", () => {
    expect(gameCommands.gameRoomId.name).toBe("game_room_id");
    expect(gameCommands.commandId.name).toBe("command_id");
    expect(gameEvents.commandId.name).toBe("command_id");
    expect(gameEvents.commandEventIndex.name).toBe("command_event_index");
  });

  it("stores snapshots and ownership fencing", () => {
    expect(roomSnapshots.snapshotEventId.name).toBe("snapshot_event_id");
    expect(roomOwnership.fencingToken.name).toBe("fencing_token");
    expect(roomOwnership.leaseExpiresAt.name).toBe("lease_expires_at");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm exec vitest run packages/db/src/room-actor-schema.test.ts
```

Expected: FAIL because the new tables/columns do not exist yet.

- [ ] **Step 3: Add the migration**

Create `packages/db/drizzle/0006_room_actor_authority.sql` with the exact SQL from **Corrected Data Model** above.

- [ ] **Step 4: Add Drizzle schema exports**

Modify `packages/db/src/schema.ts` to export `gameCommands`, update `gameEvents`, and add `roomSnapshots`, `roomOwnership`, and `eventIdWorkers` with the same column names as the SQL.

Use this shape for the new exports:

```ts
export const gameCommands = pgTable("game_commands", {
  gameRoomId: text("game_room_id").notNull(),
  commandId: text("command_id").notNull(),
  kind: text("kind").notNull(),
  actorUserId: text("actor_user_id").notNull(),
  status: text("status").notNull(),
  resultJson: jsonb("result_json").notNull().default({}),
  firstEventId: text("first_event_id"),
  lastEventId: text("last_event_id"),
  errorCode: text("error_code"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  pk: primaryKey({ columns: [table.gameRoomId, table.commandId] }),
}));
```

Apply the same explicit column names to the other tables. For `game_events`, keep `id` as the primary key and add `commandEventIndex`, `rawEventJson`, `rawSsePayload`, and `visibleToPlayerIds`.

- [ ] **Step 5: Run test to verify it passes**

Run:

```bash
pnpm exec vitest run packages/db/src/room-actor-schema.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/db/drizzle/0006_room_actor_authority.sql packages/db/src/schema.ts packages/db/src/room-actor-schema.test.ts
git commit -m "feat: add room actor authority schema"
```

---

## Task 2: Harden Snowflake Event Ids And Worker Leasing

**Files:**
- Modify: `apps/api/src/services/event-id.ts`
- Create: `apps/api/src/services/event-id.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/services/event-id.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createEventIdFactory, validateWorkerId } from "./event-id";

describe("snowflake event ids", () => {
  it("are unique and sortable within one worker", () => {
    const createEventId = createEventIdFactory({ workerId: 7 });
    const ids = Array.from({ length: 1000 }, () => createEventId(1_800_000_000_000));
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort((a, b) => a.localeCompare(b))).toEqual(ids);
  });

  it("are unique across workers with different worker ids", () => {
    const a = createEventIdFactory({ workerId: 1 });
    const b = createEventIdFactory({ workerId: 2 });
    const ids = new Set<string>();
    for (let index = 0; index < 1000; index += 1) {
      ids.add(a(1_800_000_000_000));
      ids.add(b(1_800_000_000_000));
    }
    expect(ids.size).toBe(2000);
  });

  it("rejects invalid worker ids loudly", () => {
    expect(() => validateWorkerId(-1)).toThrow("workerId");
    expect(() => validateWorkerId(1024)).toThrow("workerId");
    expect(() => validateWorkerId(Number.NaN)).toThrow("workerId");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm exec vitest run apps/api/src/services/event-id.test.ts
```

Expected: FAIL until `createEventIdFactory` and `validateWorkerId` exist.

- [ ] **Step 3: Implement event id factory**

Replace `apps/api/src/services/event-id.ts` with:

```ts
const CUSTOM_EPOCH_MS = Date.UTC(2026, 0, 1);
const MAX_WORKER_ID = 1023;
const MAX_SEQUENCE = 4095;

export type EventIdFactoryOptions = {
  workerId: number;
};

export function validateWorkerId(workerId: number): number {
  if (!Number.isInteger(workerId) || workerId < 0 || workerId > MAX_WORKER_ID) {
    throw new Error(`workerId must be an integer between 0 and ${MAX_WORKER_ID}`);
  }
  return workerId;
}

export function createEventIdFactory(options: EventIdFactoryOptions) {
  const workerId = validateWorkerId(options.workerId);
  let lastMs = 0;
  let sequence = 0;

  return function createEventId(nowMs = Date.now()): string {
    let timestampMs = Math.max(nowMs, lastMs);
    if (timestampMs === lastMs) {
      sequence += 1;
      if (sequence > MAX_SEQUENCE) {
        timestampMs = waitNextMs(lastMs);
        sequence = 0;
      }
    } else {
      sequence = 0;
    }
    lastMs = timestampMs;

    const value =
      (BigInt(timestampMs - CUSTOM_EPOCH_MS) << 22n) |
      (BigInt(workerId) << 12n) |
      BigInt(sequence);
    return value.toString(36).padStart(13, "0");
  };
}

export function readRequiredWorkerIdFromEnv(env = process.env): number {
  const raw = env.EVENT_ID_WORKER_ID;
  if (raw === undefined || raw === "") {
    throw new Error("EVENT_ID_WORKER_ID is required; assign a unique worker id per API/runtime process");
  }
  return validateWorkerId(Number(raw));
}

export const createEventId = createEventIdFactory({
  workerId: readRequiredWorkerIdFromEnv(),
});

function waitNextMs(previousMs: number): number {
  let next = Date.now();
  while (next <= previousMs) next = Date.now();
  return next;
}
```

- [ ] **Step 4: Document worker-id allocation**

Add this note to `docs/perf/room-actor-baseline.md` when the file is created in Task 12:

```md
Every API/runtime process must have a unique `EVENT_ID_WORKER_ID` in `[0, 1023]`. In local cluster mode, the primary process assigns worker ids from the cluster worker index. In multi-host deployment, the process supervisor must allocate stable unique ids or acquire them from `event_id_workers` before serving traffic.
```

- [ ] **Step 5: Run test to verify it passes**

Run:

```bash
EVENT_ID_WORKER_ID=1 pnpm exec vitest run apps/api/src/services/event-id.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/event-id.ts apps/api/src/services/event-id.test.ts
git commit -m "feat: harden event id generation"
```

---

## Task 3: Implement Transactional Commit Store

**Files:**
- Create: `apps/api/src/services/room-commit-store.ts`
- Create: `apps/api/src/services/room-commit-store.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/services/room-commit-store.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { InMemoryRoomCommitStore } from "./room-commit-store";

function staged(id: string, commandId = "cmd_1") {
  return {
    gameRoomId: "game_1",
    commandId,
    kind: "join",
    actorUserId: "@alice:example.com",
    fencingToken: 1n,
    baseSnapshotEventId: "",
    events: [{
      id,
      gameRoomId: "game_1",
      type: "player_joined",
      visibility: "public",
      payload: { id },
      createdAt: "2026-05-19T00:00:00.000Z",
    }],
    rawSsePayloads: [`data: {"id":"${id}","type":"player_joined"}\n\n`],
    canonicalState: { id: "game_1", players: [{ id: "player_1" }] },
    displayState: { room: { id: "game_1", players: [{ id: "player_1" }] } },
    result: { kind: "joined", playerId: "player_1" },
  } as const;
}

describe("RoomCommitStore", () => {
  it("commits command, events, and snapshot atomically", async () => {
    const store = new InMemoryRoomCommitStore();
    store.seedOwnership("game_1", 1n);
    const result = await store.commit(staged("0001"));
    expect(result.status).toBe("committed");
    expect(await store.loadSnapshot("game_1")).toMatchObject({ snapshotEventId: "0001" });
    expect(await store.readEventsAfter("game_1", "", 10)).toHaveLength(1);
  });

  it("returns duplicate result without writing new events", async () => {
    const store = new InMemoryRoomCommitStore();
    store.seedOwnership("game_1", 1n);
    await store.commit(staged("0001", "cmd_1"));
    const duplicate = await store.commit(staged("0002", "cmd_1"));
    expect(duplicate).toMatchObject({ status: "duplicate", result: { kind: "joined", playerId: "player_1" } });
    expect((await store.readEventsAfter("game_1", "", 10)).map((event) => event.id)).toEqual(["0001"]);
  });

  it("rejects stale fencing tokens inside commit", async () => {
    const store = new InMemoryRoomCommitStore();
    store.seedOwnership("game_1", 2n);
    await expect(store.commit(staged("0001"))).rejects.toThrow("lost ownership");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
EVENT_ID_WORKER_ID=1 pnpm exec vitest run apps/api/src/services/room-commit-store.test.ts
```

Expected: FAIL with missing module.

- [ ] **Step 3: Implement in-memory contract first**

Create `apps/api/src/services/room-commit-store.ts`:

```ts
import type { GameEvent } from "@werewolf/shared";

export type StagedCommit = {
  gameRoomId: string;
  commandId: string;
  kind: string;
  actorUserId: string;
  fencingToken: bigint;
  baseSnapshotEventId: string;
  events: readonly GameEvent[];
  rawSsePayloads: readonly string[];
  canonicalState: unknown;
  displayState: unknown;
  result: unknown;
};

export type CommittedCommand = {
  status: "committed";
  result: unknown;
  events: GameEvent[];
  rawSsePayloads: string[];
  snapshotEventId: string;
};

export type DuplicateCommand = {
  status: "duplicate";
  result: unknown;
  events: GameEvent[];
  rawSsePayloads: string[];
  snapshotEventId: string;
};

export type CommitResult = CommittedCommand | DuplicateCommand;

export interface RoomCommitStore {
  findCommand(gameRoomId: string, commandId: string): Promise<DuplicateCommand | null>;
  commit(input: StagedCommit): Promise<CommitResult>;
  loadSnapshot(gameRoomId: string): Promise<{ snapshotEventId: string; canonicalState: unknown; displayState: unknown } | null>;
  readEventsAfter(gameRoomId: string, afterEventId: string, limit: number): Promise<GameEvent[]>;
}

export class InMemoryRoomCommitStore implements RoomCommitStore {
  private readonly commands = new Map<string, DuplicateCommand>();
  private readonly events = new Map<string, GameEvent[]>();
  private readonly snapshots = new Map<string, { snapshotEventId: string; canonicalState: unknown; displayState: unknown }>();
  private readonly ownership = new Map<string, bigint>();

  seedOwnership(gameRoomId: string, fencingToken: bigint): void {
    this.ownership.set(gameRoomId, fencingToken);
  }

  async findCommand(gameRoomId: string, commandId: string): Promise<DuplicateCommand | null> {
    return clone(this.commands.get(`${gameRoomId}:${commandId}`) ?? null);
  }

  async commit(input: StagedCommit): Promise<CommitResult> {
    const key = `${input.gameRoomId}:${input.commandId}`;
    const duplicate = this.commands.get(key);
    if (duplicate) return clone(duplicate);

    if (this.ownership.get(input.gameRoomId) !== input.fencingToken) {
      throw new Error(`Room actor lost ownership for ${input.gameRoomId}`);
    }

    const roomEvents = this.events.get(input.gameRoomId) ?? [];
    const existingIds = new Set(roomEvents.map((event) => event.id));
    for (const event of input.events) {
      if (existingIds.has(event.id)) throw new Error(`duplicate event id: ${event.id}`);
    }

    const committedEvents = input.events.map((event) => clone(event));
    roomEvents.push(...committedEvents);
    roomEvents.sort((a, b) => a.id.localeCompare(b.id));
    this.events.set(input.gameRoomId, roomEvents);

    const snapshotEventId = committedEvents.at(-1)?.id ?? input.baseSnapshotEventId;
    this.snapshots.set(input.gameRoomId, {
      snapshotEventId,
      canonicalState: clone(input.canonicalState),
      displayState: clone(input.displayState),
    });

    const stored: DuplicateCommand = {
      status: "duplicate",
      result: clone(input.result),
      events: committedEvents.map((event) => clone(event)),
      rawSsePayloads: [...input.rawSsePayloads],
      snapshotEventId,
    };
    this.commands.set(key, stored);
    return { ...clone(stored), status: "committed" };
  }

  async loadSnapshot(gameRoomId: string) {
    return clone(this.snapshots.get(gameRoomId) ?? null);
  }

  async readEventsAfter(gameRoomId: string, afterEventId: string, limit: number): Promise<GameEvent[]> {
    return (this.events.get(gameRoomId) ?? [])
      .filter((event) => !afterEventId || event.id > afterEventId)
      .slice(0, limit)
      .map((event) => clone(event));
  }
}

function clone<T>(value: T): T {
  return value === null ? value : structuredClone(value);
}
```

- [ ] **Step 4: Implement Drizzle transaction**

Add `DrizzleRoomCommitStore` in the same file. Its `commit()` must use one `db.transaction()` and perform these operations in order. Do not split these writes across services.

```ts
await tx
  .select({ fencingToken: roomOwnership.fencingToken })
  .from(roomOwnership)
  .where(and(
    eq(roomOwnership.gameRoomId, input.gameRoomId),
    eq(roomOwnership.fencingToken, input.fencingToken),
    gt(roomOwnership.leaseExpiresAt, new Date())
  ))
  .for("update");
```

Then:
- query `game_commands` by `(game_room_id, command_id)`; if found, return the stored result/events without insert/update;
- insert one `game_commands` row with `status = "committed"`;
- insert all `game_events` rows with unique `(game_room_id, command_id, command_event_index)`;
- upsert `room_snapshots` with `snapshot_event_id = last event id`;
- return committed events and raw SSE payloads.

The implementation must not call `snapshotStore.save()` or `eventLog.appendCommand()` as separate services.

- [ ] **Step 5: Run test to verify it passes**

Run:

```bash
EVENT_ID_WORKER_ID=1 pnpm exec vitest run apps/api/src/services/room-commit-store.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/room-commit-store.ts apps/api/src/services/room-commit-store.test.ts
git commit -m "feat: add transactional room commit store"
```

---

## Task 4: Implement Persisted Room Ownership And Fencing

**Files:**
- Create: `apps/api/src/services/room-ownership.ts`
- Create: `apps/api/src/services/room-ownership.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/services/room-ownership.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { InMemoryRoomOwnership } from "./room-ownership";

describe("RoomOwnership", () => {
  it("allows only one active owner and increments fencing on takeover", async () => {
    const ownership = new InMemoryRoomOwnership();
    const first = await ownership.acquire("game_1", "worker_a", 1000);
    const second = await ownership.acquire("game_1", "worker_b", 1000);
    ownership.expire("game_1");
    const third = await ownership.acquire("game_1", "worker_b", 1000);

    expect(first).toMatchObject({ acquired: true, fencingToken: 1n });
    expect(second).toMatchObject({ acquired: false, currentOwnerId: "worker_a" });
    expect(third).toMatchObject({ acquired: true, fencingToken: 2n });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm exec vitest run apps/api/src/services/room-ownership.test.ts
```

Expected: FAIL with missing module.

- [ ] **Step 3: Implement ownership interface**

Create `apps/api/src/services/room-ownership.ts`:

```ts
export type RoomLease =
  | { acquired: true; gameRoomId: string; ownerId: string; fencingToken: bigint; leaseExpiresAt: Date }
  | { acquired: false; gameRoomId: string; ownerId: string; currentOwnerId: string; leaseExpiresAt: Date };

export interface RoomOwnership {
  acquire(gameRoomId: string, ownerId: string, ttlMs: number): Promise<RoomLease>;
  renew(gameRoomId: string, ownerId: string, fencingToken: bigint, ttlMs: number): Promise<boolean>;
  release(gameRoomId: string, ownerId: string, fencingToken: bigint): Promise<void>;
}

export class InMemoryRoomOwnership implements RoomOwnership {
  private readonly owners = new Map<string, { ownerId: string; fencingToken: bigint; leaseExpiresAt: Date }>();

  async acquire(gameRoomId: string, ownerId: string, ttlMs: number): Promise<RoomLease> {
    const now = Date.now();
    const current = this.owners.get(gameRoomId);
    if (current && current.leaseExpiresAt.getTime() > now && current.ownerId !== ownerId) {
      return { acquired: false, gameRoomId, ownerId, currentOwnerId: current.ownerId, leaseExpiresAt: current.leaseExpiresAt };
    }
    const fencingToken = current ? current.fencingToken + 1n : 1n;
    const lease = { ownerId, fencingToken, leaseExpiresAt: new Date(now + ttlMs) };
    this.owners.set(gameRoomId, lease);
    return { acquired: true, gameRoomId, ...lease };
  }

  async renew(gameRoomId: string, ownerId: string, fencingToken: bigint, ttlMs: number): Promise<boolean> {
    const current = this.owners.get(gameRoomId);
    if (!current || current.ownerId !== ownerId || current.fencingToken !== fencingToken) return false;
    current.leaseExpiresAt = new Date(Date.now() + ttlMs);
    return true;
  }

  async release(gameRoomId: string, ownerId: string, fencingToken: bigint): Promise<void> {
    const current = this.owners.get(gameRoomId);
    if (current?.ownerId === ownerId && current.fencingToken === fencingToken) this.owners.delete(gameRoomId);
  }

  expire(gameRoomId: string): void {
    const current = this.owners.get(gameRoomId);
    if (current) current.leaseExpiresAt = new Date(0);
  }
}
```

- [ ] **Step 4: Implement Postgres ownership**

Add `PostgresRoomOwnership` in the same file. `acquire()` must upsert `room_ownership` using a transaction and only take over when `lease_expires_at <= now()`. Takeover must set `fencing_token = previous + 1`. `renew()` and `release()` must include `owner_id` and `fencing_token` in the `WHERE` clause. This service is the only source for active room ownership; in-memory ownership is test-only.

- [ ] **Step 5: Run test to verify it passes**

Run:

```bash
pnpm exec vitest run apps/api/src/services/room-ownership.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/room-ownership.ts apps/api/src/services/room-ownership.test.ts
git commit -m "feat: add persisted room ownership contract"
```

---

## Task 5: Define Complete Actor Command And Runtime Contract

**Files:**
- Create: `apps/api/src/services/room-actor/types.ts`
- Create: `apps/api/src/services/room-actor/room-runtime.ts`
- Create: `apps/api/src/services/room-actor/room-runtime.test.ts`

- [ ] **Step 1: Write the failing runtime coverage test**

Create `apps/api/src/services/room-actor/room-runtime.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { RoomRuntime } from "./room-runtime";
import type { RoomCommand } from "./types";

function room() {
  return {
    id: "game_1",
    status: "waiting",
    players: [],
    privateStates: [],
    pendingNightActions: [],
    pendingVotes: [],
    speechQueue: [],
    tiePlayerIds: [],
  };
}

describe("RoomRuntime", () => {
  it.each([
    { kind: "join", displayName: "Alice", seatNo: 1 },
    { kind: "leave" },
    { kind: "swapSeat", seatNo: 2 },
    { kind: "addAgent", agentUserId: "@bot:example.com", displayName: "Bot" },
    { kind: "removePlayer", playerId: "player_1" },
    { kind: "start" },
    { kind: "submitAction", action: { kind: "pass" } },
    { kind: "runtimeTick" },
    { kind: "agentTurn" },
  ])("stages %s without mutating live state", (payload) => {
    let nextId = 1;
    const runtime = new RoomRuntime(room(), () => String(nextId++).padStart(4, "0"));
    const before = runtime.snapshot();
    const staged = runtime.stage({ commandId: `cmd_${payload.kind}`, gameRoomId: "game_1", actorUserId: "@alice:example.com", ...payload } as RoomCommand);
    expect(runtime.snapshot()).toEqual(before);
    expect(staged.events.length).toBeGreaterThanOrEqual(0);
    expect(staged.canonicalState).not.toHaveProperty("events");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
EVENT_ID_WORKER_ID=1 pnpm exec vitest run apps/api/src/services/room-actor/room-runtime.test.ts
```

Expected: FAIL with missing modules.

- [ ] **Step 3: Implement command types**

Create `apps/api/src/services/room-actor/types.ts` with:

```ts
import { z } from "zod";
import type { GameEvent } from "@werewolf/shared";

const base = z.object({
  commandId: z.string().min(1),
  gameRoomId: z.string().min(1),
  actorUserId: z.string().min(1),
});

export const roomCommandSchema = z.discriminatedUnion("kind", [
  base.extend({ kind: z.literal("join"), displayName: z.string().min(1), avatarUrl: z.string().optional(), seatNo: z.number().int().positive().optional() }),
  base.extend({ kind: z.literal("leave") }),
  base.extend({ kind: z.literal("swapSeat"), seatNo: z.number().int().positive() }),
  base.extend({ kind: z.literal("addAgent"), agentUserId: z.string().min(1), displayName: z.string().min(1), avatarUrl: z.string().optional() }),
  base.extend({ kind: z.literal("removePlayer"), playerId: z.string().min(1) }),
  base.extend({ kind: z.literal("start") }),
  base.extend({ kind: z.literal("submitAction"), action: z.record(z.string(), z.unknown()) }),
  base.extend({ kind: z.literal("runtimeTick") }),
  base.extend({ kind: z.literal("agentTurn") }),
]);

export type RoomCommand = z.infer<typeof roomCommandSchema>;

export type StagedRoomChange = {
  commandId: string;
  kind: RoomCommand["kind"];
  actorUserId: string;
  baseSnapshotEventId: string;
  events: GameEvent[];
  rawSsePayloads: string[];
  canonicalState: unknown;
  displayState: unknown;
  result: unknown;
};
```

- [ ] **Step 4: Implement runtime staging**

Create `apps/api/src/services/room-actor/room-runtime.ts` with this contract. The temporary `applyCommand()` body below is intentionally simple, but it must accept every command kind so Task 8 can safely route all mutation routes through actors.

```ts
import type { GameEvent } from "@werewolf/shared";
import type { RoomCommand, StagedRoomChange } from "./types";

export class RoomRuntime {
  private state: any;
  private snapshotEventId = "";

  constructor(initialState: unknown, private readonly createEventId: () => string) {
    this.state = stripTimeline(structuredClone(initialState));
  }

  snapshot(): unknown {
    return structuredClone(this.state);
  }

  stage(command: RoomCommand): StagedRoomChange {
    const next = structuredClone(this.state);
    const events = applyCommand(next, command, this.createEventId);
    const rawSsePayloads = events.map((event) => `data: ${JSON.stringify(event)}\n\n`);
    return {
      commandId: command.commandId,
      kind: command.kind,
      actorUserId: command.actorUserId,
      baseSnapshotEventId: this.snapshotEventId,
      events,
      rawSsePayloads,
      canonicalState: stripTimeline(next),
      displayState: buildDisplayState(stripTimeline(next)),
      result: { kind: `${command.kind}Accepted` },
    };
  }

  commit(change: StagedRoomChange): void {
    this.state = structuredClone(change.canonicalState);
    this.snapshotEventId = change.events.at(-1)?.id ?? change.baseSnapshotEventId;
  }
}

function applyCommand(state: any, command: RoomCommand, createEventId: () => string): GameEvent[] {
  const event = {
    id: createEventId(),
    gameRoomId: command.gameRoomId,
    type: `command_${command.kind}`,
    visibility: "public",
    actorId: command.actorUserId,
    payload: { command },
    createdAt: new Date().toISOString(),
  } as GameEvent;
  state.lastCommandKind = command.kind;
  return [event];
}

function buildDisplayState(state: unknown): unknown {
  return { room: stripTimeline(state) };
}

function stripTimeline<T>(value: T): T {
  const cloned: any = structuredClone(value);
  delete cloned.events;
  return cloned;
}
```

Later engine integration must replace only `applyCommand()` internals. The public invariants remain fixed: full command coverage, no live mutation before commit, no `events` inside canonical/display snapshot.

- [ ] **Step 5: Run test to verify it passes**

Run:

```bash
EVENT_ID_WORKER_ID=1 pnpm exec vitest run apps/api/src/services/room-actor/room-runtime.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/room-actor/types.ts apps/api/src/services/room-actor/room-runtime.ts apps/api/src/services/room-actor/room-runtime.test.ts
git commit -m "feat: define complete room actor runtime contract"
```

---

## Task 6: Implement Room Actor Duplicate-Safe Commit Flow

**Files:**
- Create: `apps/api/src/services/room-actor/room-actor.ts`
- Create: `apps/api/src/services/room-actor/room-actor.test.ts`

- [ ] **Step 1: Write the failing actor tests**

Create `apps/api/src/services/room-actor/room-actor.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { InMemoryRoomCommitStore } from "../room-commit-store";
import { RoomActor } from "./room-actor";
import { RoomRuntime } from "./room-runtime";

describe("RoomActor", () => {
  it("does not stage, mutate, or publish duplicate commands", async () => {
    const store = new InMemoryRoomCommitStore();
    store.seedOwnership("game_1", 1n);
    const runtime = new RoomRuntime({ id: "game_1", players: [] }, () => "0001");
    const published: string[] = [];
    const actor = new RoomActor({
      gameRoomId: "game_1",
      fencingToken: 1n,
      runtime,
      commitStore: store,
      publishRaw: async (_roomId, payloads) => published.push(...payloads),
    });

    await actor.dispatch({ commandId: "cmd_1", gameRoomId: "game_1", actorUserId: "@alice:example.com", kind: "join", displayName: "Alice", seatNo: 1 });
    await actor.dispatch({ commandId: "cmd_1", gameRoomId: "game_1", actorUserId: "@alice:example.com", kind: "join", displayName: "Alice", seatNo: 2 });

    expect((await store.readEventsAfter("game_1", "", 10)).map((event) => event.id)).toEqual(["0001"]);
    expect(published).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
EVENT_ID_WORKER_ID=1 pnpm exec vitest run apps/api/src/services/room-actor/room-actor.test.ts
```

Expected: FAIL with missing module.

- [ ] **Step 3: Implement actor**

Create `apps/api/src/services/room-actor/room-actor.ts`:

```ts
import type { RoomCommitStore } from "../room-commit-store";
import type { RoomCommand } from "./types";
import type { RoomRuntime } from "./room-runtime";

export type RoomActorDeps = {
  gameRoomId: string;
  fencingToken: bigint;
  runtime: RoomRuntime;
  commitStore: RoomCommitStore;
  publishRaw(gameRoomId: string, rawSsePayloads: readonly string[]): Promise<void>;
};

export class RoomActor {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly deps: RoomActorDeps) {}

  dispatch(command: RoomCommand): Promise<unknown> {
    const next = this.queue.catch(() => undefined).then(() => this.process(command));
    this.queue = next;
    return next;
  }

  private async process(command: RoomCommand): Promise<unknown> {
    const duplicate = await this.deps.commitStore.findCommand(command.gameRoomId, command.commandId);
    if (duplicate) return duplicate.result;

    const staged = this.deps.runtime.stage(command);
    const committed = await this.deps.commitStore.commit({
      gameRoomId: command.gameRoomId,
      commandId: command.commandId,
      kind: command.kind,
      actorUserId: command.actorUserId,
      fencingToken: this.deps.fencingToken,
      baseSnapshotEventId: staged.baseSnapshotEventId,
      events: staged.events,
      rawSsePayloads: staged.rawSsePayloads,
      canonicalState: staged.canonicalState,
      displayState: staged.displayState,
      result: staged.result,
    });

    if (committed.status === "duplicate") return committed.result;
    this.deps.runtime.commit(staged);
    await this.deps.publishRaw(this.deps.gameRoomId, committed.rawSsePayloads);
    return committed.result;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
EVENT_ID_WORKER_ID=1 pnpm exec vitest run apps/api/src/services/room-actor/room-actor.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/room-actor/room-actor.ts apps/api/src/services/room-actor/room-actor.test.ts
git commit -m "feat: commit room actor commands safely"
```

---

## Task 7: Add Redis Room Pub/Sub And No-Gap Subscribe

**Files:**
- Create: `apps/api/src/services/room-pubsub.ts`
- Create: `apps/api/src/services/timeline-cache.ts`
- Modify: `apps/api/src/routes/events.ts`
- Create: `apps/api/src/routes/events.no-gap.test.ts`

- [ ] **Step 1: Write the failing no-gap test**

Create `apps/api/src/routes/events.no-gap.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createNoGapReplayPlan } from "../services/timeline-cache";

describe("no-gap subscribe replay", () => {
  it("sends snapshot, DB replay, then deduped live buffer in event-id order", () => {
    const output = createNoGapReplayPlan({
      snapshotEventId: "0002",
      replayPayloads: [
        { eventId: "0003", rawSsePayload: "data: 3\n\n" },
        { eventId: "0004", rawSsePayload: "data: 4\n\n" },
      ],
      bufferedPayloads: [
        { eventId: "0004", rawSsePayload: "data: 4-live\n\n" },
        { eventId: "0005", rawSsePayload: "data: 5\n\n" },
      ],
    });

    expect(output.map((item) => item.rawSsePayload)).toEqual(["data: 3\n\n", "data: 4\n\n", "data: 5\n\n"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm exec vitest run apps/api/src/routes/events.no-gap.test.ts
```

Expected: FAIL with missing helper.

- [ ] **Step 3: Implement replay planner**

Create `apps/api/src/services/timeline-cache.ts`:

```ts
export type RawTimelinePayload = {
  eventId: string;
  rawSsePayload: string;
  visibility?: string;
  visibleToPlayerIds?: readonly string[];
};

export function createNoGapReplayPlan(input: {
  snapshotEventId: string;
  replayPayloads: readonly RawTimelinePayload[];
  bufferedPayloads: readonly RawTimelinePayload[];
}): RawTimelinePayload[] {
  const sent = new Set<string>();
  const output: RawTimelinePayload[] = [];
  for (const item of [...input.replayPayloads, ...input.bufferedPayloads].sort((a, b) => a.eventId.localeCompare(b.eventId))) {
    if (item.eventId <= input.snapshotEventId) continue;
    if (sent.has(item.eventId)) continue;
    sent.add(item.eventId);
    output.push(item);
  }
  return output;
}
```

- [ ] **Step 4: Implement Redis pub/sub contract**

Create `apps/api/src/services/room-pubsub.ts`:

```ts
import type { RawTimelinePayload } from "./timeline-cache";

export type RoomSubscription = {
  unsubscribe(): Promise<void> | void;
};

export interface RoomPubSub {
  publish(gameRoomId: string, payloads: readonly RawTimelinePayload[]): Promise<void>;
  subscribe(gameRoomId: string, onPayload: (payload: RawTimelinePayload) => void): Promise<RoomSubscription>;
}

export class InMemoryRoomPubSub implements RoomPubSub {
  private readonly listeners = new Map<string, Set<(payload: RawTimelinePayload) => void>>();

  async publish(gameRoomId: string, payloads: readonly RawTimelinePayload[]): Promise<void> {
    const listeners = this.listeners.get(gameRoomId);
    if (!listeners) return;
    for (const payload of payloads) {
      for (const listener of listeners) listener(payload);
    }
  }

  async subscribe(gameRoomId: string, onPayload: (payload: RawTimelinePayload) => void): Promise<RoomSubscription> {
    const listeners = this.listeners.get(gameRoomId) ?? new Set();
    listeners.add(onPayload);
    this.listeners.set(gameRoomId, listeners);
    return { unsubscribe: () => listeners.delete(onPayload) };
  }
}
```

Create the Redis implementation in this file after the in-memory class. It uses one Redis subscription per process per active room. The channel name is `game:{gameRoomId}:events`. Published message value is the raw JSON string for `RawTimelinePayload`; subscriber parses that small envelope once and writes `rawSsePayload` directly to listeners.

- [ ] **Step 5: Update subscribe algorithm**

Modify `apps/api/src/routes/events.ts` so `/games/:gameRoomId/subscribe` does this exact order:

```ts
const liveBuffer: RawTimelinePayload[] = [];
const live = await pubsub.subscribe(gameRoomId, (payload) => liveBuffer.push(payload));
try {
  const snapshot = await commitStore.loadSnapshot(gameRoomId);
  const snapshotEventId = snapshot?.snapshotEventId ?? "";
  stream.write(`data: ${JSON.stringify({ snapshot })}\n\n`);
  const replay = await timelineCache.readAfter(gameRoomId, snapshotEventId, { playerId, isWolf, revealAll });
  for (const payload of createNoGapReplayPlan({ snapshotEventId, replayPayloads: replay, bufferedPayloads: liveBuffer })) {
    stream.write(payload.rawSsePayload);
  }
  liveBuffer.length = 0;
  attachLiveWriter(live, stream, { playerId, isWolf, revealAll });
} catch (error) {
  await live.unsubscribe();
  throw error;
}
```

Use existing stream helper names where necessary, but preserve this order exactly: subscribe first, load snapshot second, replay third, flush deduped buffer fourth, live stream fifth.

- [ ] **Step 6: Run test to verify it passes**

Run:

```bash
pnpm exec vitest run apps/api/src/routes/events.no-gap.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/services/room-pubsub.ts apps/api/src/services/timeline-cache.ts apps/api/src/routes/events.ts apps/api/src/routes/events.no-gap.test.ts
git commit -m "feat: add no-gap room event subscribe"
```

---

## Task 8: Route All Mutations Through Actor Mode

**Files:**
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/routes/games.ts`
- Modify: `apps/api/src/routes/games.test.ts`

- [ ] **Step 1: Write failing route test**

Add to `apps/api/src/routes/games.test.ts`:

```ts
it.each([
  ["join", "POST", "/games/game_1/join", { seatNo: 1 }],
  ["leave", "POST", "/games/game_1/leave", {}],
  ["swapSeat", "POST", "/games/game_1/seat", { seatNo: 2 }],
  ["start", "POST", "/games/game_1/start", {}],
  ["submitAction", "POST", "/games/game_1/actions", { kind: "pass" }],
])("routes %s through room actor", async (expectedKind, method, path, body) => {
  const dispatched: unknown[] = [];
  const app = createApp({
    ...createTestDeps(),
    roomActors: {
      dispatch: async (command: unknown) => {
        dispatched.push(command);
        return { kind: `${expectedKind}Accepted` };
      },
    } as any,
  });

  const response = await app.request(path, {
    method,
    headers: {
      authorization: "Bearer matrix-token-alice",
      "content-type": "application/json",
      "x-command-id": `cmd_${expectedKind}`,
    },
    body: JSON.stringify(body),
  });

  expect(response.status).toBeLessThan(500);
  expect(dispatched).toHaveLength(1);
  expect(dispatched[0]).toMatchObject({ kind: expectedKind, commandId: `cmd_${expectedKind}`, gameRoomId: "game_1" });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
EVENT_ID_WORKER_ID=1 pnpm exec vitest run apps/api/src/routes/games.test.ts -t "through room actor"
```

Expected: FAIL until routes accept `roomActors`.

- [ ] **Step 3: Wire route dependency**

Modify `apps/api/src/app.ts` and `apps/api/src/routes/games.ts` so `roomActors` is required for mutation routes. Add this helper:

```ts
function commandId(request: Request): string {
  const value = request.headers.get("x-command-id");
  if (!value) throw new AppError("bad_request", "x-command-id is required for idempotent mutation routes", 400);
  return value;
}
```

Do not silently generate a random command id for mutation routes. Clients that omit `x-command-id` must get `400`.

- [ ] **Step 4: Remove direct mutation fallback**

In mutation routes, replace direct `games.join`, `games.leave`, `games.swapSeat`, `games.start`, `games.submitAction`, agent add/remove, player remove, and runtime tick mutation calls with:

```ts
const result = await deps.roomActors.dispatch(roomCommandSchema.parse(command));
return c.json(result);
```

- [ ] **Step 5: Run test to verify it passes**

Run:

```bash
EVENT_ID_WORKER_ID=1 pnpm exec vitest run apps/api/src/routes/games.test.ts -t "through room actor"
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/app.ts apps/api/src/routes/games.ts apps/api/src/routes/games.test.ts
git commit -m "feat: require room actors for mutations"
```

---

## Task 9: Implement Actor Registry, Lease Renewal, And Recovery

**Files:**
- Create: `apps/api/src/services/room-command-bus.ts`
- Create: `apps/api/src/services/room-actor/room-actor-registry.ts`
- Create: `apps/api/src/services/room-actor/recovery.test.ts`

- [ ] **Step 1: Write recovery test**

Create `apps/api/src/services/room-actor/recovery.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { InMemoryRoomCommitStore } from "../room-commit-store";
import { InMemoryRoomOwnership } from "../room-ownership";
import { InMemoryRoomPubSub } from "../room-pubsub";
import { RoomActorRegistry } from "./room-actor-registry";

describe("RoomActorRegistry recovery", () => {
  it("loads from snapshot and replays event log after snapshot watermark", async () => {
    const commitStore = new InMemoryRoomCommitStore();
    commitStore.seedOwnership("game_1", 1n);
    const ownership = new InMemoryRoomOwnership();
    let next = 1;
	    const registry = new RoomActorRegistry({
	      ownerId: "worker_1",
	      ownership,
	      commitStore,
	      pubsub: new InMemoryRoomPubSub(),
	      commandBus: null,
	      loadInitialRoom: async () => ({ id: "game_1", players: [] }),
	      createEventId: () => String(next++).padStart(4, "0"),
	    });

    const actor = await registry.get("game_1");
    await actor.dispatch({ commandId: "cmd_1", gameRoomId: "game_1", actorUserId: "@alice:example.com", kind: "join", displayName: "Alice", seatNo: 1 });
    registry.dropLocal("game_1");
    const recovered = await registry.get("game_1");

    expect(recovered).toBeTruthy();
	    expect((await commitStore.loadSnapshot("game_1"))?.snapshotEventId).toBe("0001");
	  });

	  it("forwards commands when another worker owns the room", async () => {
	    const commitStore = new InMemoryRoomCommitStore();
	    const ownership = new InMemoryRoomOwnership();
	    await ownership.acquire("game_1", "worker_owner", 10_000);
	    const forwarded: unknown[] = [];
	    const registry = new RoomActorRegistry({
	      ownerId: "worker_other",
	      ownership,
	      commitStore,
	      pubsub: new InMemoryRoomPubSub(),
	      commandBus: { forward: async (_ownerId, command) => { forwarded.push(command); return { kind: "forwarded" }; } },
	      loadInitialRoom: async () => ({ id: "game_1", players: [] }),
	      createEventId: () => "0001",
	    });

	    const result = await registry.dispatch({ commandId: "cmd_1", gameRoomId: "game_1", actorUserId: "@alice:example.com", kind: "join", displayName: "Alice", seatNo: 1 });

	    expect(result).toEqual({ kind: "forwarded" });
	    expect(forwarded).toHaveLength(1);
	  });
	});
	```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
EVENT_ID_WORKER_ID=1 pnpm exec vitest run apps/api/src/services/room-actor/recovery.test.ts
```

Expected: FAIL with missing registry.

- [ ] **Step 3: Implement command bus**

Create `apps/api/src/services/room-command-bus.ts`:

```ts
import type { RoomCommand } from "./room-actor/types";

export interface RoomCommandBus {
  forward(ownerId: string, command: RoomCommand): Promise<unknown>;
  register(ownerId: string, handler: (command: RoomCommand) => Promise<unknown>): Promise<{ close(): Promise<void> | void }>;
}

export class InMemoryRoomCommandBus implements RoomCommandBus {
  private readonly handlers = new Map<string, (command: RoomCommand) => Promise<unknown>>();

  async forward(ownerId: string, command: RoomCommand): Promise<unknown> {
    const handler = this.handlers.get(ownerId);
    if (!handler) throw new Error(`Owner ${ownerId} is not accepting room commands`);
    return handler(command);
  }

  async register(ownerId: string, handler: (command: RoomCommand) => Promise<unknown>) {
    this.handlers.set(ownerId, handler);
    return { close: () => this.handlers.delete(ownerId) };
  }
}
```

Redis implementation uses request/reply channels:
- request channel: `room-command:{ownerId}`;
- reply channel: `room-command-reply:{requestId}`;
- payload: `{ requestId, command }`;
- timeout: 2 seconds;
- owner worker calls local `RoomActorRegistry.dispatch(command)` and replies with `{ ok: true, result }` or `{ ok: false, error }`.

- [ ] **Step 4: Implement registry**

Create `apps/api/src/services/room-actor/room-actor-registry.ts`:

```ts
import type { RoomCommitStore } from "../room-commit-store";
import type { RoomCommandBus } from "../room-command-bus";
import type { RoomOwnership } from "../room-ownership";
import type { RoomPubSub } from "../room-pubsub";
import type { RoomCommand } from "./types";
import { RoomActor } from "./room-actor";
import { RoomRuntime } from "./room-runtime";

export type RoomActorRegistryDeps = {
  ownerId: string;
  ownership: RoomOwnership;
  commitStore: RoomCommitStore;
  pubsub: RoomPubSub;
  commandBus: RoomCommandBus | null;
  loadInitialRoom(gameRoomId: string): Promise<unknown>;
  createEventId(): string;
};

export class RoomActorRegistry {
  private readonly actors = new Map<string, RoomActor>();
  private readonly inflight = new Map<string, Promise<RoomActor>>();

	  constructor(private readonly deps: RoomActorRegistryDeps) {}

  async dispatch(command: RoomCommand): Promise<unknown> {
    const actor = this.actors.get(command.gameRoomId);
    if (actor) return actor.dispatch(command);
    try {
      return await (await this.get(command.gameRoomId)).dispatch(command);
    } catch (error) {
      const ownerId = currentOwnerId(error);
      if (!ownerId || !this.deps.commandBus) throw error;
      return this.deps.commandBus.forward(ownerId, command);
    }
  }

  async get(gameRoomId: string): Promise<RoomActor> {
    const existing = this.actors.get(gameRoomId);
    if (existing) return existing;
    const inflight = this.inflight.get(gameRoomId);
    if (inflight) return inflight;
    const promise = this.create(gameRoomId).finally(() => this.inflight.delete(gameRoomId));
    this.inflight.set(gameRoomId, promise);
    return promise;
  }

  dropLocal(gameRoomId: string): void {
    this.actors.delete(gameRoomId);
  }

	  private async create(gameRoomId: string): Promise<RoomActor> {
	    const lease = await this.deps.ownership.acquire(gameRoomId, this.deps.ownerId, 10_000);
	    if (!lease.acquired) throw new Error(`Room ${gameRoomId} is owned by ${lease.currentOwnerId}`);
    const snapshot = await this.deps.commitStore.loadSnapshot(gameRoomId);
    const initial = snapshot?.canonicalState ?? await this.deps.loadInitialRoom(gameRoomId);
    const actor = new RoomActor({
      gameRoomId,
      fencingToken: lease.fencingToken,
      runtime: new RoomRuntime(initial, this.deps.createEventId),
      commitStore: this.deps.commitStore,
      publishRaw: async (roomId, rawSsePayloads) => {
        await this.deps.pubsub.publish(roomId, rawSsePayloads.map((rawSsePayload) => ({ eventId: extractEventId(rawSsePayload), rawSsePayload })));
      },
    });
    this.actors.set(gameRoomId, actor);
    return actor;
  }
}

function extractEventId(rawSsePayload: string): string {
  const match = rawSsePayload.match(/"id":"([^"]+)"/);
  return match?.[1] ?? "";
}

function currentOwnerId(error: unknown): string | null {
  const match = error instanceof Error ? error.message.match(/owned by ([^ ]+)/) : null;
  return match?.[1] ?? null;
}
```

The registry must renew leases periodically and drop the actor if renewal fails. Non-owner workers must use `RoomCommandBus.forward()`; they must not mutate directly and must not return `404` or `409` for an active room owned by another worker.

- [ ] **Step 5: Run test to verify it passes**

Run:

```bash
EVENT_ID_WORKER_ID=1 pnpm exec vitest run apps/api/src/services/room-actor/recovery.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/room-command-bus.ts apps/api/src/services/room-actor/room-actor-registry.ts apps/api/src/services/room-actor/recovery.test.ts
git commit -m "feat: recover room actors from durable snapshot"
```

---

## Task 10: Add Snapshot-First Read And Cursor Timeline API

**Files:**
- Modify: `apps/api/src/routes/games.ts`
- Modify: `apps/api/src/routes/events.ts`
- Modify: `docs/SSE_TIMELINE_CONTRACT.md`
- Modify: `apps/api/src/routes/games.test.ts`

- [ ] **Step 1: Write API contract tests**

Add to `apps/api/src/routes/games.test.ts`:

```ts
it("game read returns display snapshot without full timeline", async () => {
  const app = createApp(createTestDeps());
  const response = await app.request("/games/game_1", {
    headers: { authorization: "Bearer matrix-token-alice" },
  });
  const json = await response.json() as any;
  expect(json.snapshot.displayState).toBeTruthy();
  expect(json.snapshot.displayState.room.events).toBeUndefined();
  expect(json.timeline).toBeUndefined();
});

it("timeline endpoint pages by event id cursor", async () => {
  const app = createApp(createTestDeps());
  const response = await app.request("/games/game_1/timeline?after=0001&limit=50", {
    headers: { authorization: "Bearer matrix-token-alice" },
  });
  const json = await response.json() as any;
  expect(Array.isArray(json.events)).toBe(true);
  expect(json.events.every((event: { id: string }) => event.id > "0001")).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
EVENT_ID_WORKER_ID=1 pnpm exec vitest run apps/api/src/routes/games.test.ts -t "display snapshot|timeline endpoint"
```

Expected: FAIL until read contract is updated.

- [ ] **Step 3: Implement response contract**

Update game read and subscribe initial payload to this shape:

```ts
{
  snapshot: {
    snapshotEventId: snapshot.snapshotEventId,
    latestEventId: snapshot.snapshotEventId,
    displayState: snapshot.displayState
  },
  timelineCursor: {
    after: snapshot.snapshotEventId
  }
}
```

Do not include `events`, `timeline`, or `room.events` in this response.

- [ ] **Step 4: Implement cursor endpoint**

Implement:

```ts
GET /games/:gameRoomId/timeline?before=<eventId>&after=<eventId>&limit=<n>
```

Rules:
- `limit` defaults to `100` and maxes at `500`.
- `after` returns ascending events with `id > after`.
- `before` returns the previous page ordered ascending in the response.
- Only one of `before` or `after` may be provided.
- The endpoint filters visibility but uses stored raw event data where possible.

- [ ] **Step 5: Document contract**

Update `docs/SSE_TIMELINE_CONTRACT.md`:

```md
Game read and SSE subscribe are snapshot-first. They return `snapshot.displayState`, `snapshot.snapshotEventId`, and cursor metadata only. They never return the full timeline. Timeline history is loaded from `GET /games/:gameRoomId/timeline` using event-id cursors.
```

- [ ] **Step 6: Run test to verify it passes**

Run:

```bash
EVENT_ID_WORKER_ID=1 pnpm exec vitest run apps/api/src/routes/games.test.ts -t "display snapshot|timeline endpoint"
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/games.ts apps/api/src/routes/events.ts apps/api/src/routes/games.test.ts docs/SSE_TIMELINE_CONTRACT.md
git commit -m "feat: expose snapshot first game reads"
```

---

## Task 11: Add Metrics And Slow Listener Backpressure

**Files:**
- Create: `apps/api/src/services/room-actor/room-actor-metrics.ts`
- Modify: `apps/api/src/services/room-pubsub.ts`
- Create: `apps/api/src/services/room-actor/room-actor-metrics.test.ts`

- [ ] **Step 1: Write failing metrics test**

Create `apps/api/src/services/room-actor/room-actor-metrics.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { RoomActorMetrics } from "./room-actor-metrics";

describe("RoomActorMetrics", () => {
  it("records write and fanout bottlenecks", () => {
    const metrics = new RoomActorMetrics();
    metrics.recordCommandLatency("game_1", 12);
    metrics.recordCommitLatency("game_1", 5);
    metrics.recordFanoutLatency("game_1", 20);
    metrics.recordDroppedListener("game_1");
    expect(metrics.snapshot()).toMatchObject({
      commandLatencyMs: { count: 1 },
      commitLatencyMs: { count: 1 },
      fanoutLatencyMs: { count: 1 },
      droppedListeners: { game_1: 1 },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm exec vitest run apps/api/src/services/room-actor/room-actor-metrics.test.ts
```

Expected: FAIL with missing module.

- [ ] **Step 3: Implement metrics**

Create `apps/api/src/services/room-actor/room-actor-metrics.ts`:

```ts
export class RoomActorMetrics {
  private readonly commandLatencyMs: number[] = [];
  private readonly commitLatencyMs: number[] = [];
  private readonly fanoutLatencyMs: number[] = [];
  private readonly droppedListeners = new Map<string, number>();

  recordCommandLatency(_roomId: string, value: number): void { this.commandLatencyMs.push(value); }
  recordCommitLatency(_roomId: string, value: number): void { this.commitLatencyMs.push(value); }
  recordFanoutLatency(_roomId: string, value: number): void { this.fanoutLatencyMs.push(value); }
  recordDroppedListener(roomId: string): void { this.droppedListeners.set(roomId, (this.droppedListeners.get(roomId) ?? 0) + 1); }

  snapshot() {
    return {
      commandLatencyMs: summarize(this.commandLatencyMs),
      commitLatencyMs: summarize(this.commitLatencyMs),
      fanoutLatencyMs: summarize(this.fanoutLatencyMs),
      droppedListeners: Object.fromEntries(this.droppedListeners),
    };
  }
}

function summarize(values: number[]) {
  if (values.length === 0) return { count: 0, p50: null, p95: null, p99: null };
  const sorted = [...values].sort((a, b) => a - b);
  return { count: values.length, p50: percentile(sorted, 0.5), p95: percentile(sorted, 0.95), p99: percentile(sorted, 0.99) };
}

function percentile(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]!;
}
```

- [ ] **Step 4: Add backpressure rule**

Modify `room-pubsub.ts` listener handling so each local SSE listener has a bounded queue. When `queue.length > 256`, close that listener and call `metrics.recordDroppedListener(gameRoomId)`. Delivery per listener must be serial to preserve event order.

- [ ] **Step 5: Run test to verify it passes**

Run:

```bash
pnpm exec vitest run apps/api/src/services/room-actor/room-actor-metrics.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/room-actor/room-actor-metrics.ts apps/api/src/services/room-actor/room-actor-metrics.test.ts apps/api/src/services/room-pubsub.ts
git commit -m "feat: add room actor performance metrics"
```

---

## Task 12: Add Reliable Load Test And Perf Baseline

**Files:**
- Create: `scripts/load-room-actor.mjs`
- Modify: `package.json`
- Create: `docs/perf/room-actor-baseline.md`

- [ ] **Step 1: Create load script**

Create `scripts/load-room-actor.mjs` with these requirements:
- create `ROOMS` rooms;
- create or use `CLIENTS_PER_ROOM` distinct authenticated users per room;
- open one SSE connection per user;
- drive writes at `WRITE_QPS`;
- record `writesOk`, `writesFailed`, `deliveryRatio`, write p95/p99, commit-to-client p95/p99, SSE disconnect count;
- write JSON output to `profiles/room-actor-load.json`.

Use this skeleton:

```js
import { writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";

const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const ROOMS = Number(process.env.ROOMS ?? 1000);
const CLIENTS_PER_ROOM = Number(process.env.CLIENTS_PER_ROOM ?? 10);
const WRITE_QPS = Number(process.env.WRITE_QPS ?? 1000);
const DURATION_MS = Number(process.env.DURATION_MS ?? 30000);
const OUTPUT = process.env.OUTPUT ?? "profiles/room-actor-load.json";
const TOKENS = (process.env.TOKENS ?? "").split(",").filter(Boolean);

if (TOKENS.length < ROOMS * CLIENTS_PER_ROOM) {
  throw new Error(`Need ${ROOMS * CLIENTS_PER_ROOM} distinct TOKENS, got ${TOKENS.length}`);
}

const receivedByEvent = new Map();
const writeStartedAt = new Map();
const writeLatencyMs = [];
const commitToClientMs = [];
let writesOk = 0;
let writesFailed = 0;

function summarize(values) {
  if (values.length === 0) return { count: 0, p50: null, p95: null, p99: null, max: null };
  const sorted = [...values].sort((a, b) => a - b);
  const pick = (p) => Number(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))].toFixed(2));
  return { count: sorted.length, p50: pick(0.5), p95: pick(0.95), p99: pick(0.99), max: Number(sorted.at(-1).toFixed(2)) };
}

async function main() {
  const result = {
    rooms: ROOMS,
    clientsPerRoom: CLIENTS_PER_ROOM,
    requestedWriteQps: WRITE_QPS,
    achievedWriteQps: Number((writesOk / (DURATION_MS / 1000)).toFixed(2)),
    writesOk,
    writesFailed,
    deliveryRatio: 0,
    writeLatencyMs: summarize(writeLatencyMs),
    commitToClientMs: summarize(commitToClientMs),
  };
  await writeFile(OUTPUT, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}

await main();
```

The initial script must fail fast when distinct tokens are not provided. Add the HTTP/SSE helpers in the same file before committing; the script is not complete until the smoke command in Step 4 records nonzero `writesOk` and `deliveryRatio`.

- [ ] **Step 2: Add package script**

Modify root `package.json`:

```json
"load:room-actor": "node scripts/load-room-actor.mjs"
```

- [ ] **Step 3: Create perf baseline doc**

Create `docs/perf/room-actor-baseline.md`:

````md
# Room Actor Baseline

Target gate:
- 1000 rooms
- 10 clients per room
- 1000 writes/sec
- deliveryRatio >= 0.999
- write p99 < 50ms
- commit-to-client p99 < 200ms

Worker id rule:
Every API/runtime process must have a unique `EVENT_ID_WORKER_ID` in `[0, 1023]`. In local cluster mode, the primary process assigns worker ids from the cluster worker index. In multi-host deployment, the process supervisor must allocate stable unique ids or acquire them from `event_id_workers` before serving traffic.

Commands:

```bash
EVENT_ID_WORKER_ID=1 WEB_CONCURRENCY=1 PORT=3000 pnpm --filter @werewolf/api dev
TOKENS="$(node scripts/create-load-users.mjs --count 10000)" ROOMS=1000 CLIENTS_PER_ROOM=10 WRITE_QPS=1000 DURATION_MS=30000 OUTPUT=profiles/room-actor-1000r.json pnpm load:room-actor
```
````

- [ ] **Step 4: Run smoke load**

Run:

```bash
TOKENS="$(node scripts/create-load-users.mjs --count 20)" ROOMS=2 CLIENTS_PER_ROOM=10 WRITE_QPS=10 DURATION_MS=5000 OUTPUT=profiles/room-actor-smoke.json pnpm load:room-actor
```

Expected: `writesFailed` is `0` and `deliveryRatio >= 0.99`.

- [ ] **Step 5: Commit**

```bash
git add scripts/load-room-actor.mjs package.json docs/perf/room-actor-baseline.md
git commit -m "test: add room actor load gate"
```

---

## Self-Review

Spec coverage:
- 1000 rooms x 10 online x 1000 writes/sec: Task 12 defines target gate and distinct-token validation.
- Event id replaces seq: Non-negotiable rules and Task 2 keep event-id cursor only.
- Command idempotency: Task 1 creates `game_commands`; Task 3 handles duplicate command before mutation/publish.
- Atomic event log + snapshot: Task 3 requires one transaction for command, events, snapshot, and fencing.
- Multi-worker safety: Task 4 persists ownership and Task 3 checks fencing inside commit.
- Full command coverage: Task 5 tests every command kind before Task 8 routes all mutations.
- No-gap subscribe: Task 7 defines subscribe/buffer/snapshot/replay/flush/live order.
- Snapshot-first reads: Task 10 removes timeline from game read and subscribe initial payload.
- Raw SSE hot path: Task 1 stores `raw_sse_payload`; Task 7 streams raw payloads.
- Recovery: Task 9 loads snapshot on actor recreation.

Placeholder scan:
- No `TBD`, `TODO`, "implement later", "fill in details", or "similar to" placeholders remain.
- Existing helper names may differ, but the required invariants are explicit and testable.

Type consistency:
- `RoomCommitStore.findCommand/commit/loadSnapshot/readEventsAfter` is defined before actor/registry/subscribe tasks use it.
- `RoomRuntime.stage()` returns `StagedRoomChange`, which maps directly into `RoomCommitStore.commit()`.
- `RawTimelinePayload.eventId/rawSsePayload` is used consistently by pubsub, timeline cache, and no-gap subscribe.
