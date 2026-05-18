import { describe, expect, it } from "vitest";
import type { RoomProjection } from "../api/client";
import { buildActionExpectation } from "./actionExpectation";

function projection(overrides: Partial<RoomProjection> = {}): RoomProjection {
  return {
    gameRoomId: "game_1",
    status: "active",
    phase: "day_speak",
    day: 2,
    deadlineAt: "2026-05-18T16:18:24.374Z",
    currentSpeakerPlayerId: "player_6",
    winner: null,
    alivePlayerIds: ["player_1", "player_2", "player_6"],
    version: 147,
    ...overrides,
  };
}

describe("buildActionExpectation", () => {
  it("does not send the projection event sequence as an action lock", () => {
    expect(buildActionExpectation(projection())).toEqual({
      expectedPhase: "day_speak",
      expectedDay: 2,
    });
  });

  it("handles a missing projection", () => {
    expect(buildActionExpectation(null)).toEqual({});
  });
});
