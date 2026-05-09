import { describe, expect, it } from "vitest";
import { applyEventToProjection, createInitialProjection } from "./projection";

describe("projection", () => {
  it("applies public phase and elimination events", () => {
    let projection = createInitialProjection("game_1");
    projection = applyEventToProjection(projection, {
      id: "evt_1",
      gameRoomId: "game_1",
      seq: 1,
      type: "phase_started",
      visibility: "public",
      actorId: "runtime",
      payload: {
        phase: "day_vote",
        day: 2,
        deadlineAt: "2026-05-09T10:10:00.000Z",
      },
      createdAt: "2026-05-09T10:09:00.000Z",
    });
    projection = applyEventToProjection(projection, {
      id: "evt_2",
      gameRoomId: "game_1",
      seq: 2,
      type: "player_eliminated",
      visibility: "public",
      actorId: "runtime",
      subjectId: "p3",
      payload: { playerId: "p3", reason: "vote" },
      createdAt: "2026-05-09T10:10:00.000Z",
    });
    expect(projection.phase).toBe("day_vote");
    expect(projection.day).toBe(2);
    expect(projection.eliminatedPlayerIds).toEqual(["p3"]);
    expect(projection.version).toBe(2);
  });
});
