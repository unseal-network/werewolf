import { describe, expect, it, vi } from "vitest";
import { InMemoryRoomCommandBus } from "../room-command-bus";
import { InMemoryRoomCommitStore } from "../room-commit-store";
import { InMemoryRoomOwnership } from "../room-ownership";
import { InMemoryRoomPubSub } from "../room-pubsub";
import { RoomActorRegistry } from "./room-actor-registry";
import type { RoomCommand } from "./types";

type JoinCommand = Extract<RoomCommand, { kind: "join" }>;

function joinCommand(commandId: string): JoinCommand {
  return {
    commandId,
    gameRoomId: "game_1",
    actorUserId: "@alice:example.com",
    kind: "join",
    displayName: "Alice",
    seatNo: 1,
  };
}

describe("RoomActorRegistry recovery", () => {
  it("recovers a dropped local actor from the durable snapshot", async () => {
    const commitStore = new InMemoryRoomCommitStore();
    const ownership = new InMemoryRoomOwnership();
    const published = vi.fn();
    const pubsub = new InMemoryRoomPubSub();
    await pubsub.subscribe("game_1", published);

    const registry = new RoomActorRegistry({
      ownerId: "worker_owner",
      ownership,
      commitStore,
      pubsub,
      commandBus: new InMemoryRoomCommandBus(),
      loadInitialRoom: async (gameRoomId) => ({ id: gameRoomId, players: [] }),
      createEventId: () => "0001",
    });

    const actor = await registry.get("game_1");
    await actor.dispatch(joinCommand("cmd_1"));
    registry.dropLocal("game_1");

    const recovered = await registry.get("game_1");
    const recoveredJoin = joinCommand("cmd_2");
    recoveredJoin.seatNo = 2;
    await recovered.dispatch(recoveredJoin);

    await expect(commitStore.loadSnapshot("game_1")).resolves.toMatchObject({
      snapshotEventId: "0001",
      canonicalState: { id: "game_1", lastCommandKind: "join" },
    });
    expect(published.mock.calls.map(([payload]) => payload)).toEqual([
      { eventId: "0001", rawSsePayload: expect.stringContaining("id: 0001") },
      { eventId: "0001", rawSsePayload: expect.stringContaining("id: 0001") },
    ]);
  });

  it("forwards dispatch to the current owner instead of rejecting", async () => {
    const ownership = new InMemoryRoomOwnership();
    await ownership.acquire("game_1", "worker_owner", 60_000);

    const commandBus = new InMemoryRoomCommandBus();
    const forwarded: RoomCommand[] = [];
    commandBus.register("worker_owner", async (command) => {
      forwarded.push(command);
      return { kind: "forwarded" };
    });

    const registry = new RoomActorRegistry({
      ownerId: "worker_other",
      ownership,
      commitStore: new InMemoryRoomCommitStore(),
      pubsub: new InMemoryRoomPubSub(),
      commandBus,
      loadInitialRoom: async (gameRoomId) => ({ id: gameRoomId }),
      createEventId: () => "0001",
    });

    await expect(registry.dispatch(joinCommand("cmd_1"))).resolves.toEqual({
      kind: "forwarded",
    });
    expect(forwarded).toEqual([joinCommand("cmd_1")]);
  });
});
