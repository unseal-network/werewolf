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
    expect(staged.events.length).toBeGreaterThanOrEqual(0);
    expect(staged.canonicalState).not.toHaveProperty("events");
  });
});
