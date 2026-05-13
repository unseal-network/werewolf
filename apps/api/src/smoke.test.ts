import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import { createTestDeps } from "./test-utils";

describe("werewolf vertical smoke", () => {
  it("creates a game, joins creator, and rejects early start", async () => {
    const app = createApp(createTestDeps());

    const create = await app.request("/games", {
      method: "POST",
      headers: {
        authorization: "Bearer matrix-token-alice",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sourceMatrixRoomId: "!source:example.com",
        title: "Smoke Game",
        targetPlayerCount: 6,
        timing: { nightActionSeconds: 45, speechSeconds: 60, voteSeconds: 30 },
      }),
    });
    expect(create.status).toBe(201);
    const { gameRoomId } = (await create.json()) as { gameRoomId: string };

    const join = await app.request(`/games/${gameRoomId}/join`, {
      method: "POST",
      headers: { authorization: "Bearer matrix-token-alice" },
    });
    expect(join.status).toBe(200);

    const start = await app.request(`/games/${gameRoomId}/start`, {
      method: "POST",
      headers: { authorization: "Bearer matrix-token-alice" },
    });
    expect(start.status).toBe(409);
  });
});
