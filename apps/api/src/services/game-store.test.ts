import { describe, expect, it } from "vitest";
import type { GameEvent } from "@werewolf/shared";
import { toLegacyGameEventRow } from "./game-store";

describe("GameStore event persistence", () => {
  it("stores raw SSE payloads with id and data lines while keeping raw event JSON as the body", () => {
    const event = {
      id: "game_1_2",
      gameRoomId: "game_1",
      type: "phase_started",
      visibility: "public",
      payload: { phase: "day_discussion" },
      createdAt: "2026-05-19T00:00:00.000Z",
    } as unknown as GameEvent;

    const row = toLegacyGameEventRow("game_1", event);

    expect(row.rawSsePayload).toBe(
      `id: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`
    );
    expect(row.rawEventJson).toBe(
      JSON.stringify({
        id: event.id,
        gameRoomId: "game_1",
        type: event.type,
        visibility: event.visibility,
        payload: event.payload,
        createdAt: event.createdAt,
      })
    );
  });
});
