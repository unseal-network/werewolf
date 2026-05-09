import { describe, expect, it } from "vitest";
import { startGame } from "./start";

const seats = Array.from({ length: 6 }, (_, index) => ({
  playerId: `p${index + 1}`,
  displayName: `Player ${index + 1}`,
  seatNo: index + 1,
  kind: index === 5 ? ("agent" as const) : ("user" as const),
}));

describe("startGame", () => {
  it("snapshots seats, assigns private roles, and starts night guard", () => {
    const result = startGame({
      gameRoomId: "game_1",
      targetPlayerCount: 6,
      seats,
      now: new Date("2026-05-09T10:00:00.000Z"),
      shuffleSeed: "fixed",
      timing: { nightActionSeconds: 45, speechSeconds: 60, voteSeconds: 30 },
    });

    expect(result.projection.phase).toBe("night_guard");
    expect(result.projection.day).toBe(1);
    expect(result.privateStates).toHaveLength(6);
    expect(result.events.map((event) => event.type)).toEqual([
      "game_started",
      "roles_assigned",
      "phase_started",
    ]);
    expect(result.events[1]?.visibility).toBe("runtime");
  });
});
