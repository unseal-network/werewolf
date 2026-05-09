import { describe, expect, it } from "vitest";
import { determineWinner, resolveDayVote } from "./day";

describe("resolveDayVote", () => {
  it("exiles the highest voted player", () => {
    const result = resolveDayVote({
      gameRoomId: "game_1",
      day: 1,
      alivePlayerIds: ["p1", "p2", "p3", "p4"],
      votes: [
        { actorPlayerId: "p1", targetPlayerId: "p3" },
        { actorPlayerId: "p2", targetPlayerId: "p3" },
        { actorPlayerId: "p3", targetPlayerId: "p2" },
      ],
      now: new Date("2026-05-09T10:00:00.000Z"),
    });
    expect(result.exiledPlayerId).toBe("p3");
    expect(result.events.map((event) => event.type)).toContain("player_eliminated");
  });

  it("exiles nobody on tie", () => {
    const result = resolveDayVote({
      gameRoomId: "game_1",
      day: 1,
      alivePlayerIds: ["p1", "p2", "p3", "p4"],
      votes: [
        { actorPlayerId: "p1", targetPlayerId: "p3" },
        { actorPlayerId: "p2", targetPlayerId: "p4" },
      ],
      now: new Date("2026-05-09T10:00:00.000Z"),
    });
    expect(result.exiledPlayerId).toBeNull();
  });
});

describe("determineWinner", () => {
  it("returns wolf when wolves reach parity", () => {
    expect(
      determineWinner([
        { playerId: "w1", role: "werewolf", alive: true },
        { playerId: "g1", role: "villager", alive: true },
      ])
    ).toBe("wolf");
  });

  it("returns good when all wolves are dead", () => {
    expect(
      determineWinner([
        { playerId: "w1", role: "werewolf", alive: false },
        { playerId: "g1", role: "villager", alive: true },
      ])
    ).toBe("good");
  });
});
