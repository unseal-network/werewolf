import { describe, expect, it } from "vitest";
import { createApp } from "../app";
import { createTestDeps } from "../test-utils";

describe("games API", () => {
  it("requires Matrix bearer auth", async () => {
    const app = createApp(createTestDeps());
    const response = await app.request("/games", { method: "POST", body: "{}" });
    expect(response.status).toBe(401);
  });

  it("creates a game and defaults agent source room to source room", async () => {
    const app = createApp(createTestDeps());
    const response = await app.request("/games", {
      method: "POST",
      headers: {
        authorization: "Bearer matrix-token-alice",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sourceMatrixRoomId: "!source:example.com",
        title: "Friday Werewolf",
        targetPlayerCount: 6,
        timing: { nightActionSeconds: 45, speechSeconds: 60, voteSeconds: 30 },
        allowedSourceMatrixRoomIds: [],
      }),
    });
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.gameRoomId).toMatch(/^game_/);
    expect(body.card.sourceMatrixRoomId).toBe("!source:example.com");
    expect(body.card.targetPlayerCount).toBe(6);
  });
});
