import { describe, expect, it } from "vitest";
import { gameEventSchema, visibilitySchema } from "./events";

describe("game event contracts", () => {
  it("validates public events", () => {
    const event = gameEventSchema.parse({
      id: "evt_1",
      gameRoomId: "game_1",
      seq: 1,
      type: "phase_started",
      visibility: "public",
      actorId: "runtime",
      payload: { phase: "night_guard", day: 1 },
      createdAt: "2026-05-09T10:00:00.000Z",
    });
    expect(event.seq).toBe(1);
    expect(visibilitySchema.parse("private:team:wolf")).toBe(
      "private:team:wolf"
    );
  });

  it("rejects user lifecycle events from the game timeline", () => {
    expect(() =>
      gameEventSchema.parse({
        id: "evt_2",
        gameRoomId: "game_1",
        seq: 2,
        type: "player_joined",
        visibility: "public",
        payload: {},
        createdAt: "2026-05-09T10:00:01.000Z",
      })
    ).toThrow();
  });
});
