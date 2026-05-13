import { describe, expect, it } from "vitest";
import { createApp } from "../app";
import { createTestDeps } from "../test-utils";

describe("games API", () => {
  it("requires Matrix bearer auth", async () => {
    const app = createApp(createTestDeps());
    const response = await app.request("/games", { method: "POST", body: "{}" });
    expect(response.status).toBe(401);
  });

  it("requires Matrix bearer auth for SSE subscriptions", async () => {
    const app = createApp(createTestDeps());
    const response = await app.request("/games/game_missing/subscribe");
    expect(response.status).toBe(401);
  });

  it("streams a subscribe snapshot as the room read model", async () => {
    const deps = createTestDeps();
    const app = createApp(deps);
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

    const response = await app.request(`/games/${room.id}/subscribe`, {
      headers: { authorization: "Bearer matrix-token-alice" },
    });

    expect(response.status).toBe(200);
    const reader = response.body?.getReader();
    expect(reader).toBeTruthy();
    const chunk = await Promise.race([
      reader!.read(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("subscribe snapshot timeout")), 1000)
      ),
    ]);
    await reader!.cancel();
    const text = new TextDecoder().decode(chunk.value);
    const json = text.match(/^data: (.*)\n\n$/)?.[1];
    expect(json).toBeTruthy();
    const message = JSON.parse(json!) as {
      snapshot?: {
        room?: { id?: string };
        projection?: unknown;
        privateStates?: unknown[];
        events?: unknown[];
      };
    };
    expect(message.snapshot?.room?.id).toBe(room.id);
    expect(Array.isArray(message.snapshot?.events)).toBe(true);
    expect(Array.isArray(message.snapshot?.privateStates)).toBe(true);
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
      }),
    });
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.gameRoomId).toMatch(/^game_/);
    expect(body.card.sourceMatrixRoomId).toBe("!source:example.com");
    expect(body.card.targetPlayerCount).toBe(6);
  });

  it("downloads a visible transcript event by id", async () => {
    const deps = createTestDeps();
    const app = createApp(deps);
    const { room } = deps.games.createGame(
      {
        sourceMatrixRoomId: "!source:example.com",
        title: "Friday Werewolf",
        targetPlayerCount: 6,
        timing: { nightActionSeconds: 45, speechSeconds: 60, voteSeconds: 30 },
      },
      "@alice:example.com"
    );
    for (const [token, name] of [
      ["@alice:example.com", "Alice"],
      ["@bob:example.com", "Bob"],
      ["@cara:example.com", "Cara"],
      ["@dan:example.com", "Dan"],
      ["@erin:example.com", "Erin"],
      ["@finn:example.com", "Finn"],
    ] as const) {
      deps.games.join(room.id, token, name);
    }
    deps.games.start(room.id, "@alice:example.com");
    const speaker = deps.games.snapshot(room.id).players[0]!;
    const event = deps.games.recordSpeechTranscript(room.id, {
      playerId: speaker.id,
      text: "live subtitle text",
      final: false,
    });

    const response = await app.request(
      `/games/${room.id}/events/${event!.id}/transcript`,
      {
        headers: { authorization: "Bearer matrix-token-alice" },
      }
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/plain");
    expect(await response.text()).toBe("live subtitle text\n");
  });

  it("rejects malformed action expectation guards", async () => {
    const deps = createTestDeps();
    const app = createApp(deps);
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
    for (const [userId, name] of [
      ["@bob:example.com", "Bob"],
      ["@cara:example.com", "Cara"],
      ["@dan:example.com", "Dan"],
      ["@erin:example.com", "Erin"],
      ["@finn:example.com", "Finn"],
    ] as const) {
      deps.games.join(room.id, userId, name);
    }
    deps.games.start(room.id, "@alice:example.com");

    const response = await app.request(`/games/${room.id}/actions`, {
      method: "POST",
      headers: {
        authorization: "Bearer matrix-token-alice",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        kind: "pass",
        expectedPhase: "night_guard",
        expectedDay: "bogus",
        expectedVersion: 1,
      }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(
      expect.objectContaining({
        code: "invalid_action",
        error: "expectedDay must be a positive integer",
      })
    );
  });

  it("lets non-creators add agents to the waiting room with Matrix avatar data", async () => {
    const deps = createTestDeps();
    const app = createApp({
      ...deps,
      matrixHomeserverUrl: "https://matrix.example",
    });
    const created = await app.request("/games", {
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
      }),
    });
    const { gameRoomId } = (await created.json()) as { gameRoomId: string };

    const response = await app.request(`/games/${gameRoomId}/agents`, {
      method: "POST",
      headers: {
        authorization: "Bearer matrix-token-bob",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        agentUserId: "@agent:example.com",
        displayName: "Agent One",
        avatarUrl: "mxc://example.com/avatar123",
      }),
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.player.agentId).toBe("@agent:example.com");
    expect(body.player.displayName).toBe("Agent One");
    expect(body.player.avatarUrl).toBe(
      "https://matrix.example/_matrix/media/v3/download/example.com/avatar123"
    );
  });
});
