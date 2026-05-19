import { describe, expect, it, vi } from "vitest";
import { InMemoryRoomCommitStore } from "../room-commit-store";
import { RoomActor } from "./room-actor";
import { RoomRuntime } from "./room-runtime";

describe("RoomActor", () => {
  it("does not stage, mutate, or publish duplicate commands", async () => {
    const store = new InMemoryRoomCommitStore();
    store.seedOwnership("game_1", 1n);
    const runtime = new RoomRuntime({ id: "game_1", players: [] }, () => "0001");
    const stage = vi.spyOn(runtime, "stage");
    const commit = vi.spyOn(runtime, "commit");
    const published: string[] = [];
    const actor = new RoomActor({
      gameRoomId: "game_1",
      fencingToken: 1n,
      runtime,
      commitStore: store,
      publishRaw: async (_roomId, payloads) => {
        published.push(...payloads);
      },
    });

    await actor.dispatch({
      commandId: "cmd_1",
      gameRoomId: "game_1",
      actorUserId: "@alice:example.com",
      kind: "join",
      displayName: "Alice",
      seatNo: 1,
    });
    await actor.dispatch({
      commandId: "cmd_1",
      gameRoomId: "game_1",
      actorUserId: "@alice:example.com",
      kind: "join",
      displayName: "Alice",
      seatNo: 2,
    });

    expect(stage).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(
      (await store.readEventsAfter("game_1", "", 10)).map((event) => event.id)
    ).toEqual(["0001"]);
    expect(published).toHaveLength(1);
  });
});
