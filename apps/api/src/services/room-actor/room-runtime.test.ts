import { describe, expect, it } from "vitest";
import { RoomRuntime } from "./room-runtime";
import type { RoomCommand } from "./types";

function room() {
  return {
    id: "game_1",
    status: "waiting",
    events: [{ id: "legacy_event" }],
    players: [],
    privateStates: [],
    pendingNightActions: [],
    pendingVotes: [{ events: [{ id: "nested_legacy_event" }] }],
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
  ])("stages $kind without mutating live state", (payload) => {
    let nextId = 1;
    const runtime = new RoomRuntime(room(), () =>
      String(nextId++).padStart(4, "0")
    );
    const before = runtime.snapshot();

    const staged = runtime.stage({
      commandId: `cmd_${payload.kind}`,
      gameRoomId: "game_1",
      actorUserId: "@alice:example.com",
      ...payload,
    } as RoomCommand);

    expect(runtime.snapshot()).toEqual(before);
    expect(staged.events).toHaveLength(1);
    expect(staged.events[0]).not.toHaveProperty("seq");
    expect(staged.canonicalState).not.toHaveProperty("events");
    expect(JSON.stringify(staged.canonicalState)).not.toContain("legacy_event");
  });

  it("prebuilds raw SSE payloads with event ids and advances snapshot event id on commit", () => {
    let nextId = 1;
    const runtime = new RoomRuntime(room(), () =>
      String(nextId++).padStart(4, "0")
    );

    const first = runtime.stage({
      commandId: "cmd_join",
      gameRoomId: "game_1",
      actorUserId: "@alice:example.com",
      kind: "join",
      displayName: "Alice",
      seatNo: 1,
    });

    expect(first.events[0]).toMatchObject({ id: "0001" });
    expect(first.rawSsePayloads).toEqual([
      `id: 0001\ndata: ${JSON.stringify(first.events[0])}\n\n`,
    ]);

    runtime.commit(first);
    const second = runtime.stage({
      commandId: "cmd_leave",
      gameRoomId: "game_1",
      actorUserId: "@alice:example.com",
      kind: "leave",
    });

    expect(second.baseSnapshotEventId).toBe("0001");
    expect(second.events[0]).toMatchObject({ id: "0002" });
    expect(second.displayState).toMatchObject({
      room: { lastCommandKind: "leave" },
    });
    expect(JSON.stringify(second.displayState)).not.toContain("events");
  });
});
