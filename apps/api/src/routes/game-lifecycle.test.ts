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
      title: "Lifecycle",
      targetPlayerCount: 6,
      timing: { nightActionSeconds: 45, speechSeconds: 60, voteSeconds: 30 },
    }),
  });
  return (await response.json()).gameRoomId as string;
}

describe("game lifecycle", () => {
  it("lets current user join and leave before start", async () => {
    const app = createApp(createTestDeps());
    const gameRoomId = await createGame(app);
    const join = await app.request(`/games/${gameRoomId}/join`, {
      method: "POST",
      headers: { authorization: "Bearer matrix-token-alice" },
    });
    expect(join.status).toBe(200);
    const leave = await app.request(`/games/${gameRoomId}/leave`, {
      method: "POST",
      headers: { authorization: "Bearer matrix-token-alice" },
    });
    expect(leave.status).toBe(200);
  });

  it("rejects start until target player count is reached", async () => {
    const app = createApp(createTestDeps());
    const gameRoomId = await createGame(app);
    const start = await app.request(`/games/${gameRoomId}/start`, {
      method: "POST",
      headers: { authorization: "Bearer matrix-token-alice" },
    });
    expect(start.status).toBe(409);
  });
});
