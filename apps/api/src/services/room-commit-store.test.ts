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
