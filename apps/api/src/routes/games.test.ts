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

  it("pushes a fresh perspective snapshot to subscribed players when roles are assigned", async () => {
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
    deps.games.join(room.id, "@bob:example.com", "Bob", undefined, 2);
    for (let seatNo = 3; seatNo <= 6; seatNo += 1) {
      deps.games.addAgentPlayer(
        room.id,
        "@alice:example.com",
        `@agent${seatNo}:example.com`,
        `Agent ${seatNo}`
      );
    }

    const response = await app.request(`/games/${room.id}/subscribe`, {
      headers: { authorization: "Bearer matrix-token-bob" },
    });
    expect(response.status).toBe(200);
    const reader = response.body?.getReader();
    expect(reader).toBeTruthy();
    await readNextSseJson(reader!);

    deps.games.start(room.id, "@alice:example.com");

    const roleSnapshot = await readSseUntil(
      reader!,
      (message) =>
        Array.isArray(message.snapshot?.privateStates) &&
        message.snapshot.privateStates.length === 1
    );
    await reader!.cancel();

    expect(roleSnapshot.snapshot?.privateStates?.[0]).toMatchObject({
      playerId: "player_2",
      alive: true,
    });
    expect(roleSnapshot.snapshot?.projection).toMatchObject({
      status: "active",
      phase: "night_guard",
    });
  });

  it("streams phase changes as timeline events instead of replacing them with snapshots", async () => {
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
    deps.games.join(room.id, "@bob:example.com", "Bob", undefined, 2);
    for (let seatNo = 3; seatNo <= 6; seatNo += 1) {
      deps.games.addAgentPlayer(
        room.id,
        "@alice:example.com",
        `@agent${seatNo}:example.com`,
        `Agent ${seatNo}`
      );
    }

    const response = await app.request(`/games/${room.id}/subscribe`, {
      headers: { authorization: "Bearer matrix-token-bob" },
    });
    expect(response.status).toBe(200);
    const reader = response.body?.getReader();
    expect(reader).toBeTruthy();
    await readNextSseJson(reader!);

    deps.games.start(room.id, "@alice:example.com");

    const phaseStarted = await readSseUntil(
      reader!,
      (message) => message.type === "phase_started"
    );
    await reader!.cancel();

    expect(phaseStarted).toMatchObject({
      type: "phase_started",
      visibility: "public",
      payload: { phase: "night_guard" },
    });
    expect(phaseStarted.snapshot).toBeUndefined();
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

  it("issues LiveKit tokens with Matrix user id as participant identity", async () => {
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
    const player = deps.games.join(
      room.id,
      "@alice:example.com",
      "Alice",
      undefined,
      1
    );

    const response = await app.request(`/games/${room.id}/livekit-token`, {
      method: "POST",
      headers: { authorization: "Bearer matrix-token-alice" },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.identity).toBe("@alice:example.com");
    expect(body.identity).not.toBe(player.id);
    expect(body.canPublish).toBe(true);
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
    const startedRoom = deps.games.snapshot(room.id);
    const speaker = startedRoom.players[0]!;
    startedRoom.projection = startedRoom.projection
      ? {
          ...startedRoom.projection,
          phase: "day_speak",
          currentSpeakerPlayerId: speaker.id,
        }
      : null;
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

  it("accepts Matrix user id as the action target at the API boundary", async () => {
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
    const alice = deps.games.join(
      room.id,
      "@alice:example.com",
      "Alice",
      undefined,
      1
    );
    const bob = deps.games.join(room.id, "@bob:example.com", "Bob", undefined, 2);
    for (const [userId, name] of [
      ["@cara:example.com", "Cara"],
      ["@dan:example.com", "Dan"],
      ["@erin:example.com", "Erin"],
      ["@finn:example.com", "Finn"],
    ] as const) {
      deps.games.join(room.id, userId, name);
    }
    deps.games.start(room.id, "@alice:example.com");
    room.projection = {
      ...room.projection!,
      phase: "day_vote",
      currentSpeakerPlayerId: null,
      deadlineAt: new Date(Date.now() + 30_000).toISOString(),
    };
    room.pendingVotes = [];

    const response = await app.request(`/games/${room.id}/actions`, {
      method: "POST",
      headers: {
        authorization: "Bearer matrix-token-alice",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        kind: "vote",
        targetMatrixUserId: "@bob:example.com",
        expectedPhase: "day_vote",
        expectedDay: room.projection.day,
        expectedVersion: room.projection.version,
      }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.event).toMatchObject({
      actorId: alice.id,
      subjectId: bob.id,
      payload: expect.objectContaining({ targetPlayerId: bob.id }),
    });
  });

  it("rejects internal player id as an action target at the API boundary", async () => {
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
    const bob = deps.games.join(room.id, "@bob:example.com", "Bob", undefined, 2);
    for (const [userId, name] of [
      ["@cara:example.com", "Cara"],
      ["@dan:example.com", "Dan"],
      ["@erin:example.com", "Erin"],
      ["@finn:example.com", "Finn"],
    ] as const) {
      deps.games.join(room.id, userId, name);
    }
    deps.games.start(room.id, "@alice:example.com");
    room.projection = {
      ...room.projection!,
      phase: "day_vote",
      currentSpeakerPlayerId: null,
      deadlineAt: new Date(Date.now() + 30_000).toISOString(),
    };

    const response = await app.request(`/games/${room.id}/actions`, {
      method: "POST",
      headers: {
        authorization: "Bearer matrix-token-alice",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        kind: "vote",
        targetPlayerId: bob.id,
        expectedPhase: "day_vote",
        expectedDay: room.projection.day,
        expectedVersion: room.projection.version,
      }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(
      expect.objectContaining({
        code: "invalid_action",
        error: "targetMatrixUserId is required",
      })
    );
  });

  it("removes players by Matrix user id at the API boundary", async () => {
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
    const bob = deps.games.join(room.id, "@bob:example.com", "Bob", undefined, 2);

    const response = await app.request(
      `/games/${room.id}/players/${encodeURIComponent("@bob:example.com")}`,
      {
        method: "DELETE",
        headers: { authorization: "Bearer matrix-token-alice" },
      }
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.player).toMatchObject({
      id: bob.id,
      userId: "@bob:example.com",
      leftAt: expect.any(String),
    });
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

  it("returns the fixed agent candidate list with joined state", async () => {
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
    deps.games.addAgentPlayer(
      room.id,
      "@alice:example.com",
      "@game-10:keepsecret.io",
      "game-10"
    );

    const response = await app.request(`/games/${room.id}/agent-candidates`, {
      headers: { authorization: "Bearer matrix-token-alice" },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.total).toBe(17);
    expect(body.roomId).toBe("!source:example.com");
    expect(body.agents.map((agent: { userId: string }) => agent.userId)).toEqual([
      "@game-10:keepsecret.io",
      "@game-12:keepsecret.io",
      "@game-13:keepsecret.io",
      "@game-1:keepsecret.io",
      "@game-2:keepsecret.io",
      "@game-3:keepsecret.io",
      "@game-4:keepsecret.io",
      "@game-5:keepsecret.io",
      "@game-6:keepsecret.io",
      "@game-7:keepsecret.io",
      "@game-8:keepsecret.io",
      "@kimigame1:keepsecret.io",
      "@kimigame2:keepsecret.io",
      "@kimigame3:keepsecret.io",
      "@kimigame4:keepsecret.io",
      "@kimigame5:keepsecret.io",
      "@kimigame6:keepsecret.io",
    ]);
    expect(body.agents[0]).toMatchObject({
      userId: "@game-10:keepsecret.io",
      displayName: "game-10",
      userType: "bot",
      membership: "join",
      alreadyJoined: true,
    });
    expect(body.agents[11]).toMatchObject({
      userId: "@kimigame1:keepsecret.io",
      displayName: "kimi game 1",
      avatarUrl: "https://api.dicebear.com/9.x/bottts/svg?seed=Felix",
      alreadyJoined: false,
    });
  });
});

async function readNextSseJson(
  reader: ReadableStreamDefaultReader<Uint8Array>
): Promise<Record<string, any>> {
  const chunk = await Promise.race([
    reader.read(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("subscribe message timeout")), 1000)
    ),
  ]);
  const text = new TextDecoder().decode(chunk.value);
  const json = text.match(/data: (.*)\n\n/)?.[1];
  if (!json) throw new Error(`Missing SSE json in: ${text}`);
  return JSON.parse(json) as Record<string, any>;
}

async function readSseUntil(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  predicate: (message: Record<string, any>) => boolean
): Promise<Record<string, any>> {
  for (let index = 0; index < 10; index += 1) {
    const message = await readNextSseJson(reader);
    if (predicate(message)) return message;
  }
  throw new Error("Expected SSE message was not received");
}
