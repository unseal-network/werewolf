import { describe, expect, it } from "vitest";
import type { GameEvent } from "@werewolf/shared";
import { createApp } from "../app";
import { createTestDeps } from "../test-utils";
import type { GameStore } from "../services/game-store";

describe("events API", () => {
  it("replays stored raw SSE payloads without rebuilding them from GameEvent JSON", async () => {
    const deps = createTestDeps();
    const { room } = deps.games.createGame(
      {
        sourceMatrixRoomId: "!source:example.com",
        title: "Friday Werewolf",
        targetPlayerCount: 6,
        timing: { nightActionSeconds: 45, speechSeconds: 60, voteSeconds: 30 },
      },
      "@alice:example.com"
    );
    deps.games.join(room.id, "@alice:example.com", "Alice", undefined, 1);

    const event = {
      id: "game_1_2",
      gameRoomId: room.id,
      type: "phase_started",
      visibility: "public",
      payload: { phase: "day_discussion" },
      createdAt: "2026-05-19T00:00:00.000Z",
    } as unknown as GameEvent;
    const rawSsePayload = `id: ${event.id}\ndata: ${JSON.stringify({
      ...event,
      rawOnly: true,
    })}\n\n`;
    const store = {
      async loadRawSsePayloadsAfter(gameRoomId: string, afterEventId: string) {
        expect(gameRoomId).toBe(room.id);
        expect(afterEventId).toBe("game_1_1");
        return [{ id: event.id, rawSsePayload }];
      },
    } as unknown as GameStore;
    const app = createApp({ ...deps, store });

    const response = await app.request(`/games/${room.id}/subscribe`, {
      headers: {
        authorization: "Bearer matrix-token-alice",
        "last-event-id": "game_1_1",
      },
    });
    expect(response.status).toBe(200);
    const reader = response.body?.getReader();
    expect(reader).toBeTruthy();

    await readNextSseChunk(reader!);
    const replay = await readNextSseChunk(reader!);
    await reader!.cancel();

    expect(replay).toBe(rawSsePayload);
  });
});

async function readNextSseChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>
): Promise<string> {
  const chunk = await Promise.race([
    reader.read(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("subscribe message timeout")), 1000)
    ),
  ]);
  return new TextDecoder().decode(chunk.value);
}
