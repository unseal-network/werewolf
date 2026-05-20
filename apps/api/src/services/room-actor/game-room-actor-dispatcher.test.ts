import { describe, expect, it } from "vitest";
import { InMemoryGameService } from "../game-service";
import { GameRoomActorDispatcher } from "./game-room-actor-dispatcher";

describe("GameRoomActorDispatcher", () => {
  it("serializes and deduplicates game commands per room", async () => {
    const games = new InMemoryGameService();
    const dispatcher = new GameRoomActorDispatcher(games);
    const { room } = games.createGame(
      {
        sourceMatrixRoomId: "!source:example.com",
        title: "Friday Werewolf",
        targetPlayerCount: 6,
        timing: { nightActionSeconds: 45, speechSeconds: 60, voteSeconds: 30 },
      },
      "@alice:example.com"
    );

    const first = await dispatcher.dispatch({
      commandId: "cmd_join_alice",
      gameRoomId: room.id,
      actorUserId: "@alice:example.com",
      kind: "join",
      displayName: "Alice",
      seatNo: 1,
    });
    const duplicate = await dispatcher.dispatch({
      commandId: "cmd_join_alice",
      gameRoomId: room.id,
      actorUserId: "@alice:example.com",
      kind: "join",
      displayName: "Alice",
      seatNo: 2,
    });

    expect(duplicate).toEqual(first);
    expect(games.snapshot(room.id).players).toMatchObject([
      { userId: "@alice:example.com", seatNo: 1 },
    ]);
    expect(games.snapshot(room.id).events).toHaveLength(1);
  });
});
