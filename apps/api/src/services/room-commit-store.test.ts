import { describe, expect, it } from "vitest";
import {
  decodeCommandResultEnvelopeForTest,
  encodeCommandResultEnvelopeForTest,
  InMemoryRoomCommitStore,
} from "./room-commit-store";

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

function zeroEventStaged(baseSnapshotEventId: string, commandId = "cmd_zero") {
  return {
    ...staged("unused", commandId),
    baseSnapshotEventId,
    events: [],
    rawSsePayloads: [],
    result: { kind: "noop", nested: { count: 1 } },
  } as const;
}

describe("RoomCommitStore", () => {
  it("commits command, events, and snapshot atomically", async () => {
    const store = new InMemoryRoomCommitStore();
    store.seedOwnership("game_1", 1n);
    await expect(store.findCommand("game_1", "cmd_1")).resolves.toBeNull();
    const result = await store.commit(staged("0001"));
    expect(result).toMatchObject({
      status: "committed",
      snapshotEventId: "0001",
    });
    expect(await store.loadSnapshot("game_1")).toMatchObject({ snapshotEventId: "0001" });
    await expect(store.findCommand("game_1", "cmd_1")).resolves.toMatchObject({
      result: { kind: "joined", playerId: "player_1" },
      snapshotEventId: "0001",
      events: [{ id: "0001" }],
    });
    expect(await store.readEventsAfter("game_1", "", 10)).toHaveLength(1);
  });

  it("returns duplicate result without writing new events", async () => {
    const store = new InMemoryRoomCommitStore();
    store.seedOwnership("game_1", 1n);
    await store.commit(staged("0001", "cmd_1"));
    const duplicate = await store.commit(staged("0002", "cmd_1"));
    expect(duplicate).toMatchObject({
      status: "duplicate",
      result: { kind: "joined", playerId: "player_1" },
      snapshotEventId: "0001",
    });
    await expect(store.findCommand("game_1", "cmd_1")).resolves.toMatchObject({
      result: { kind: "joined", playerId: "player_1" },
      snapshotEventId: "0001",
      events: [{ id: "0001" }],
    });
    expect((await store.readEventsAfter("game_1", "", 10)).map((event) => event.id)).toEqual(["0001"]);
  });

  it("returns duplicate result before validating new staged payloads", async () => {
    const store = new InMemoryRoomCommitStore();
    store.seedOwnership("game_1", 1n);
    await store.commit(staged("0001", "cmd_1"));

    const malformedRetry = {
      ...staged("0002", "cmd_1"),
      rawSsePayloads: [],
    };

    await expect(store.commit(malformedRetry)).resolves.toMatchObject({
      status: "duplicate",
      result: { kind: "joined", playerId: "player_1" },
      snapshotEventId: "0001",
      events: [{ id: "0001" }],
    });
    expect((await store.readEventsAfter("game_1", "", 10)).map((event) => event.id)).toEqual(["0001"]);
  });

  it("rejects stale fencing tokens inside commit", async () => {
    const store = new InMemoryRoomCommitStore();
    store.seedOwnership("game_1", 2n);
    await expect(store.commit(staged("0001"))).rejects.toThrow("lost ownership");
  });

  it("rejects raw SSE payload count mismatch before writing", async () => {
    const store = new InMemoryRoomCommitStore();
    store.seedOwnership("game_1", 1n);

    const mismatched = {
      ...staged("0001"),
      rawSsePayloads: [],
    };

    await expect(store.commit(mismatched)).rejects.toThrow(
      "raw SSE payload count must match event count"
    );
    await expect(store.findCommand("game_1", "cmd_1")).resolves.toBeNull();
    await expect(store.loadSnapshot("game_1")).resolves.toBeNull();
    expect(await store.readEventsAfter("game_1", "", 10)).toEqual([]);
  });

  it("returns snapshots and duplicate results that cannot mutate the store", async () => {
    const store = new InMemoryRoomCommitStore();
    store.seedOwnership("game_1", 1n);

    const committed = await store.commit(staged("0001", "cmd_1"));
    (committed.result as { playerId: string }).playerId = "corrupted_return";
    committed.events[0]!.payload.id = "corrupted_event";

    const snapshot = await store.loadSnapshot("game_1");
    expect(snapshot).not.toBeNull();
    ((snapshot!.canonicalState as { players: { id: string }[] }).players[0]!).id =
      "corrupted_snapshot";

    const duplicate = await store.commit(staged("0002", "cmd_1"));
    expect(duplicate.result).toEqual({ kind: "joined", playerId: "player_1" });
    expect(duplicate.events[0]!.payload).toEqual({ id: "0001" });
    expect(await store.loadSnapshot("game_1")).toMatchObject({
      canonicalState: { id: "game_1", players: [{ id: "player_1" }] },
    });

    (duplicate.result as { playerId: string }).playerId = "corrupted_duplicate";
    duplicate.events[0]!.payload.id = "corrupted_duplicate_event";
    await expect(store.findCommand("game_1", "cmd_1")).resolves.toMatchObject({
      result: { kind: "joined", playerId: "player_1" },
      events: [{ payload: { id: "0001" } }],
    });
  });

  it("preserves zero-event command base snapshot id on duplicate", async () => {
    const store = new InMemoryRoomCommitStore();
    store.seedOwnership("game_1", 1n);

    const first = await store.commit(zeroEventStaged("0005"));
    const duplicate = await store.commit(zeroEventStaged("9999"));

    expect(first).toMatchObject({
      status: "committed",
      snapshotEventId: "0005",
    });
    expect(duplicate).toMatchObject({
      status: "duplicate",
      snapshotEventId: "0005",
      result: { kind: "noop", nested: { count: 1 } },
    });
  });

  it("encodes command result envelopes with snapshot event ids", () => {
    const stored = encodeCommandResultEnvelopeForTest(
      { kind: "noop" },
      "base_1"
    );

    expect(decodeCommandResultEnvelopeForTest(stored, null, "")).toEqual({
      result: { kind: "noop" },
      snapshotEventId: "base_1",
    });
    expect(decodeCommandResultEnvelopeForTest({ kind: "legacy" }, "0007", "0009")).toEqual({
      result: { kind: "legacy" },
      snapshotEventId: "0007",
    });
  });
});
