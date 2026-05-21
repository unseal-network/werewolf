import { describe, expect, it } from "vitest";
import { createApp } from "../app";
import { createTestDeps } from "../test-utils";

async function createStartedGame(app: ReturnType<typeof createApp>) {
  const create = await app.request("/games", {
    method: "POST",
    headers: {
      authorization: "Bearer matrix-token-alice",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sourceMatrixRoomId: "!source:example.com",
      title: "Runtime Tick",
      targetPlayerCount: 6,
      timing: { nightActionSeconds: 45, speechSeconds: 60, voteSeconds: 30 },
    }),
  });
  const { gameRoomId } = (await create.json()) as { gameRoomId: string };

  for (let index = 1; index <= 6; index += 1) {
    const join = await app.request(`/games/${gameRoomId}/agents`, {
      method: "POST",
      headers: {
        authorization: "Bearer matrix-token-alice",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        agentUserId: `@agent${index}:example.com`,
        displayName: `Agent ${index}`,
      }),
    });
    expect(join.status).toBe(201);
  }

  const start = await app.request(`/games/${gameRoomId}/start`, {
    method: "POST",
    headers: { authorization: "Bearer matrix-token-alice" },
  });
  expect(start.status).toBe(200);
  return gameRoomId;
}

describe("runtime tick API", () => {
  it("does not expose runtime ticks as an HTTP endpoint", async () => {
    const deps = createTestDeps();
    const app = createApp({
      ...deps,
      async runAgentTurn() {
        return { text: "", toolName: "passAction", input: {} };
      },
    });
    const gameRoomId = await createStartedGame(app);

    const tick = await app.request(`/games/${gameRoomId}/runtime/tick`, {
      method: "POST",
      headers: { authorization: "Bearer matrix-token-alice" },
    });

    expect(tick.status).toBe(404);
  });
});
