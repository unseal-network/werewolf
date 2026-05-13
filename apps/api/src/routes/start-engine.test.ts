import { describe, expect, it } from "vitest";
import { createApp } from "../app";
import { createTestDeps } from "../test-utils";

async function createGame(app: ReturnType<typeof createApp>) {
  const response = await app.request("/games", {
    method: "POST",
    headers: {
      authorization: "Bearer matrix-token-alice",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sourceMatrixRoomId: "!source:example.com",
      title: "Start Engine",
      targetPlayerCount: 6,
      timing: { nightActionSeconds: 45, speechSeconds: 60, voteSeconds: 30 },
    }),
  });
  const body = (await response.json()) as { gameRoomId: string };
  return body.gameRoomId;
}

describe("start API engine integration", () => {
  it("returns start events when six players are seated", async () => {
    const deps = createTestDeps();
    const app = createApp(deps);
    const gameRoomId = await createGame(app);

    for (const token of [
      "matrix-token-alice",
      "matrix-token-bob",
      "matrix-token-cara",
      "matrix-token-dan",
      "matrix-token-erin",
      "matrix-token-finn",
    ]) {
      const join = await app.request(`/games/${gameRoomId}/join`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(join.status).toBe(200);
    }

    const start = await app.request(`/games/${gameRoomId}/start`, {
      method: "POST",
      headers: { authorization: "Bearer matrix-token-alice" },
    });
    expect(start.status).toBe(200);
    const body = (await start.json()) as {
      status: string;
      events: Array<{ type: string }>;
    };
    expect(body.status).toBe("active");
    expect(body.events.map((event) => event.type)).toEqual([
      "game_started",
      "phase_started",
    ]);
  });
});
