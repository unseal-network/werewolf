import { describe, expect, it } from "vitest";
import { computeNextRuntimeAction } from "./tick";

describe("computeNextRuntimeAction", () => {
  it("closes an expired phase", () => {
    const action = computeNextRuntimeAction({
      now: new Date("2026-05-09T10:01:00.000Z"),
      projection: {
        gameRoomId: "game_1",
        status: "active",
        phase: "night_guard",
        day: 1,
        deadlineAt: "2026-05-09T10:00:45.000Z",
        currentSpeakerPlayerId: null,
        winner: null,
        alivePlayerIds: ["p1", "p2"],
        version: 1,
      },
    });
    expect(action.kind).toBe("close_phase");
  });

  it("does nothing while paused", () => {
    const action = computeNextRuntimeAction({
      now: new Date("2026-05-09T10:01:00.000Z"),
      projection: {
        gameRoomId: "game_1",
        status: "paused",
        phase: "night_guard",
        day: 1,
        deadlineAt: "2026-05-09T10:00:45.000Z",
        currentSpeakerPlayerId: null,
        winner: null,
        alivePlayerIds: ["p1", "p2"],
        version: 1,
      },
    });
    expect(action.kind).toBe("noop");
  });
});
