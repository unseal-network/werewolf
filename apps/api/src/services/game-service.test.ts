import { describe, expect, it, vi } from "vitest";
import { InMemoryGameService, type RuntimeAgentTurnInput } from "./game-service";
import type { VoiceAgentRegistry } from "./voice-agent";

const players = [
  ["@alice:example.com", "Alice"],
  ["@bob:example.com", "Bob"],
  ["@cara:example.com", "Cara"],
  ["@dan:example.com", "Dan"],
  ["@erin:example.com", "Erin"],
  ["@finn:example.com", "Finn"],
  ["@gina:example.com", "Gina"],
] as const;

function createStartedServiceGame() {
  const games = new InMemoryGameService();
  const { room } = games.createGame(
    {
      sourceMatrixRoomId: "!source:example.com",
      title: "Rules",
      targetPlayerCount: 6,
      timing: { nightActionSeconds: 45, speechSeconds: 60, voteSeconds: 30 },
    },
    players[0][0]
  );
  for (const [userId, name] of players.slice(0, 6)) {
    games.join(room.id, userId, name);
  }
  games.start(room.id, players[0][0]);
  return { games, gameRoomId: room.id };
}

function createStartedServiceGameWithPlayers(playerCount: number) {
  const games = new InMemoryGameService();
  const { room } = games.createGame(
    {
      sourceMatrixRoomId: "!source:example.com",
      title: "Rules",
      targetPlayerCount: playerCount,
      timing: { nightActionSeconds: 45, speechSeconds: 60, voteSeconds: 30 },
    },
    players[0][0]
  );
  for (const [userId, name] of players.slice(0, playerCount)) {
    games.join(room.id, userId, name);
  }
  games.start(room.id, players[0][0]);
  return { games, gameRoomId: room.id };
}

function passAgentTurn(input: RuntimeAgentTurnInput) {
  return Promise.resolve({
    text: `${input.displayName} passes.`,
    toolName: "passAction",
    input: {},
  });
}

describe("InMemoryGameService rules", () => {
  it("emits lobby player join events for humans and agents", () => {
    const games = new InMemoryGameService();
    const { room } = games.createGame(
      {
        sourceMatrixRoomId: "!source:example.com",
        title: "Seats",
        targetPlayerCount: 6,
        timing: { nightActionSeconds: 45, speechSeconds: 60, voteSeconds: 30 },
      },
      players[0][0]
    );

    const human = games.join(room.id, players[0][0], players[0][1]);
    const agent = games.addAgentPlayer(
      room.id,
      players[0][0],
      "@bot:example.com",
      "Bot"
    );

    const joinEvents = room.events.filter((event) => event.type === "player_joined");
    expect(joinEvents).toHaveLength(2);
    expect(joinEvents[0]?.actorId).toBe(human.id);
    expect(joinEvents[0]?.payload.player).toMatchObject({
      id: human.id,
      userId: players[0][0],
      seatNo: 1,
      kind: "user",
    });
    expect(joinEvents[1]?.actorId).toBe(agent.id);
    expect(joinEvents[1]?.payload.player).toMatchObject({
      id: agent.id,
      agentId: "@bot:example.com",
      seatNo: 2,
      kind: "agent",
    });
  });

  it("emits a player removed event when a user leaves the waiting room", () => {
    const games = new InMemoryGameService();
    const { room } = games.createGame(
      {
        sourceMatrixRoomId: "!source:example.com",
        title: "Seats",
        targetPlayerCount: 6,
        timing: { nightActionSeconds: 45, speechSeconds: 60, voteSeconds: 30 },
      },
      players[0][0]
    );
    const human = games.join(room.id, players[0][0], players[0][1]);

    games.leave(room.id, players[0][0]);

    const removed = room.events.find((event) => event.type === "player_removed");
    expect(removed?.actorId).toBe(human.id);
    expect(removed?.payload).toMatchObject({
      playerId: human.id,
      seatNo: 1,
    });
  });

  it("preserves waiting-room events and keeps event sequence monotonic after start", () => {
    const games = new InMemoryGameService();
    const { room } = games.createGame(
      {
        sourceMatrixRoomId: "!source:example.com",
        title: "Seats",
        targetPlayerCount: 6,
        timing: { nightActionSeconds: 45, speechSeconds: 60, voteSeconds: 30 },
      },
      players[0][0]
    );
    for (const [userId, name] of players.slice(0, 6)) {
      games.join(room.id, userId, name);
    }
    const lobbyEventCount = room.events.length;

    const started = games.start(room.id, players[0][0]);
    const seqs = room.events.map((event) => event.seq);

    expect(room.events).toHaveLength(lobbyEventCount + started.events.length);
    expect(started.events.map((event) => event.seq)).toEqual([
      lobbyEventCount + 1,
      lobbyEventCount + 2,
      lobbyEventCount + 3,
    ]);
    expect(seqs).toEqual(Array.from({ length: seqs.length }, (_, index) => index + 1));
    expect(room.events.slice(0, lobbyEventCount).every((event) => event.type === "player_joined")).toBe(true);
  });

  it("does not let users swap seats with another human player", () => {
    const games = new InMemoryGameService();
    const { room } = games.createGame(
      {
        sourceMatrixRoomId: "!source:example.com",
        title: "Seats",
        targetPlayerCount: 6,
        timing: { nightActionSeconds: 45, speechSeconds: 60, voteSeconds: 30 },
      },
      players[0][0]
    );
    games.join(room.id, players[0][0], players[0][1]);
    games.join(room.id, players[1][0], players[1][1]);

    expect(() => games.swapSeat(room.id, players[0][0], 2)).toThrow(
      "Cannot swap seats with another human player"
    );
    expect(room.players.find((player) => player.userId === players[0][0])?.seatNo).toBe(1);
    expect(room.players.find((player) => player.userId === players[1][0])?.seatNo).toBe(2);
  });

  it("lets users swap seats with agent players before the game starts", () => {
    const games = new InMemoryGameService();
    const { room } = games.createGame(
      {
        sourceMatrixRoomId: "!source:example.com",
        title: "Seats",
        targetPlayerCount: 6,
        timing: { nightActionSeconds: 45, speechSeconds: 60, voteSeconds: 30 },
      },
      players[0][0]
    );
    games.join(room.id, players[0][0], players[0][1]);
    games.addAgentPlayer(room.id, players[0][0], "@bot:example.com", "Bot");

    const result = games.swapSeat(room.id, players[0][0], 2);

    expect(result.player.userId).toBe(players[0][0]);
    expect(result.player.seatNo).toBe(2);
    expect(room.players.find((player) => player.seatNo === 1)?.agentId).toBe("@bot:example.com");
  });

  it("lets the creator remove any waiting-room player and users remove their invited agents", () => {
    const games = new InMemoryGameService();
    const { room } = games.createGame(
      {
        sourceMatrixRoomId: "!source:example.com",
        title: "Seats",
        targetPlayerCount: 6,
        timing: { nightActionSeconds: 45, speechSeconds: 60, voteSeconds: 30 },
      },
      players[0][0]
    );
    const human = games.join(room.id, players[1][0], players[1][1]);
    const invited = games.addAgentPlayer(
      room.id,
      players[1][0],
      "@bot:example.com",
      "Bot"
    );

    expect(() =>
      games.removePlayer(room.id, players[2][0], invited.id)
    ).toThrow("Only creator can remove players");

    const removedAgent = games.removePlayer(room.id, players[1][0], invited.id);
    expect(removedAgent.leftAt).not.toBeNull();

    const removedHuman = games.removePlayer(room.id, players[0][0], human.id);
    expect(removedHuman.leftAt).not.toBeNull();
    expect(room.events.map((event) => event.type)).toContain("player_removed");
  });

  it("joins a human directly into the clicked empty seat", () => {
    const games = new InMemoryGameService();
    const { room } = games.createGame(
      {
        sourceMatrixRoomId: "!source:example.com",
        title: "Seats",
        targetPlayerCount: 6,
        timing: { nightActionSeconds: 45, speechSeconds: 60, voteSeconds: 30 },
      },
      players[0][0]
    );

    const joined = games.join(room.id, players[1][0], players[1][1], undefined, 4);

    expect(joined.seatNo).toBe(4);
    expect(joined.id).toBe("player_4");
  });

  it("rejoins a previously-left human into the clicked empty seat instead of the old seat", () => {
    const games = new InMemoryGameService();
    const { room } = games.createGame(
      {
        sourceMatrixRoomId: "!source:example.com",
        title: "Seats",
        targetPlayerCount: 6,
        timing: { nightActionSeconds: 45, speechSeconds: 60, voteSeconds: 30 },
      },
      players[0][0]
    );
    games.join(room.id, players[0][0], players[0][1], undefined, 4);
    games.leave(room.id, players[0][0]);
    games.join(room.id, players[1][0], players[1][1], undefined, 1);
    games.join(room.id, players[2][0], players[2][1], undefined, 2);
    const bot = games.addAgentPlayer(room.id, players[1][0], "@bot:example.com", "Bot");
    games.removePlayer(room.id, players[1][0], bot.id);

    const rejoined = games.join(room.id, players[0][0], players[0][1], undefined, bot.seatNo);

    expect(rejoined.seatNo).toBe(bot.seatNo);
    expect(rejoined.id).toBe(`player_${bot.seatNo}`);
    expect(room.players.find((player) => player.id === "player_4")).toBeUndefined();
  });

  it("reveals the wolf kill target to the witch before the heal phase action", async () => {
    const { games, gameRoomId } = createStartedServiceGame();
    const room = games.snapshot(gameRoomId);
    const guard = room.privateStates.find((state) => state.role === "guard");
    const wolf = room.privateStates.find((state) => state.role === "werewolf");
    const witch = room.privateStates.find((state) => state.role === "witch");
    expect(guard).toBeDefined();
    expect(wolf).toBeDefined();
    expect(witch).toBeDefined();

    await games.submitAction(gameRoomId, guard!.playerId, {
      kind: "nightAction",
      targetPlayerId: wolf!.playerId,
    });
    await games.advanceGame(gameRoomId, passAgentTurn);

    const target = room.privateStates.find(
      (state) => state.playerId !== wolf!.playerId && state.alive
    );
    expect(target).toBeDefined();
    await games.submitAction(gameRoomId, wolf!.playerId, {
      kind: "nightAction",
      targetPlayerId: target!.playerId,
    });
    await games.advanceGame(gameRoomId, passAgentTurn);

    expect(room.projection?.phase).toBe("night_witch_heal");
    expect(room.events).toContainEqual(
      expect.objectContaining({
        type: "witch_kill_revealed",
        visibility: `private:user:${witch!.playerId}`,
        subjectId: target!.playerId,
      })
    );
  });

  it("passes a timed-out human speaker without asking the LLM to speak for them", async () => {
    const { games, gameRoomId } = createStartedServiceGame();
    const room = games.snapshot(gameRoomId);
    const speaker = room.players[0]!;
    const nextSpeaker = room.players[1]!;
    let agentCalls = 0;

    room.projection = {
      ...room.projection!,
      phase: "day_speak",
      currentSpeakerPlayerId: speaker.id,
      deadlineAt: new Date(Date.now() - 1000).toISOString(),
    };
    room.speechQueue = [speaker.id, nextSpeaker.id];

    await games.advanceGame(gameRoomId, async (input) => {
      agentCalls += 1;
      return {
        text: `${input.displayName} should not be generated.`,
        toolName: "saySpeech",
        input: { speech: `${input.displayName} should not be generated.` },
      };
    });

    expect(agentCalls).toBe(0);
    expect(room.projection.currentSpeakerPlayerId).toBe(nextSpeaker.id);
    expect(room.events).toContainEqual(
      expect.objectContaining({
        type: "speech_submitted",
        actorId: speaker.id,
        payload: expect.objectContaining({
          speech: `${speaker.displayName} chose to remain silent.`,
        }),
      })
    );
    expect(room.events.at(-1)).toEqual(
      expect.objectContaining({
        type: "turn_started",
        subjectId: nextSpeaker.id,
      })
    );
  });

  it("uses flushed STT transcript when a human speaker times out", async () => {
    const { games, gameRoomId } = createStartedServiceGame();
    const room = games.snapshot(gameRoomId);
    const speaker = room.players[0]!;
    const nextSpeaker = room.players[1]!;

    games.setVoiceAgents({
      get: () => ({
        flushPlayerTranscript: async () => "I heard enough to accuse seat 3.",
        resetPlayerTranscript: () => undefined,
      }),
      setTranscriptHandler: () => undefined,
    } as unknown as VoiceAgentRegistry);
    room.projection = {
      ...room.projection!,
      phase: "day_speak",
      currentSpeakerPlayerId: speaker.id,
      deadlineAt: new Date(Date.now() - 1000).toISOString(),
    };
    room.speechQueue = [speaker.id, nextSpeaker.id];

    await games.advanceGame(gameRoomId, passAgentTurn);

    expect(room.projection.currentSpeakerPlayerId).toBe(nextSpeaker.id);
    expect(room.events).toContainEqual(
      expect.objectContaining({
        type: "speech_submitted",
        actorId: speaker.id,
        payload: expect.objectContaining({
          speech: "I heard enough to accuse seat 3.",
        }),
      })
    );
  });

  it("allows pass to affect only the phase version it was submitted for", async () => {
    const { games, gameRoomId } = createStartedServiceGame();
    const room = games.snapshot(gameRoomId);
    const seer = room.privateStates.find((state) => state.role === "seer");
    expect(seer).toBeDefined();
    const staleVersion = 24;
    room.projection = {
      ...room.projection!,
      phase: "night_seer",
      deadlineAt: new Date(Date.now() + 45_000).toISOString(),
      alivePlayerIds: room.privateStates.map((state) => state.playerId),
      version: 25,
    };
    room.pendingNightActions = [];

    await expect(
      games.submitAction(gameRoomId, seer!.playerId, {
        kind: "pass",
        expectedPhase: "night_witch_poison",
        expectedDay: room.projection.day,
        expectedVersion: staleVersion,
      })
    ).rejects.toThrow("Action phase has changed");

    expect(room.projection.phase).toBe("night_seer");
    expect(
      room.pendingNightActions.some((action) => action.actorPlayerId === seer!.playerId)
    ).toBe(false);
    expect(
      room.events.some(
        (event) =>
          event.type === "night_action_submitted" &&
          event.actorId === seer!.playerId
      )
    ).toBe(false);

    const event = await games.submitAction(gameRoomId, seer!.playerId, {
      kind: "pass",
      expectedPhase: "night_seer",
      expectedDay: room.projection.day,
      expectedVersion: room.projection.version,
    });
    expect(event).toEqual(
      expect.objectContaining({
        type: "night_action_submitted",
        actorId: seer!.playerId,
        payload: expect.objectContaining({
          action: expect.objectContaining({ kind: "passAction" }),
        }),
      })
    );
  });

  it("keeps witch heal and poison passes scoped to separate night phases", async () => {
    const { games, gameRoomId } = createStartedServiceGame();
    const room = games.snapshot(gameRoomId);
    const witch = room.privateStates.find((state) => state.role === "witch");
    expect(witch).toBeDefined();

    room.projection = {
      ...room.projection!,
      phase: "night_witch_heal",
      day: 1,
      version: 30,
      deadlineAt: new Date(Date.now() + 45_000).toISOString(),
      alivePlayerIds: room.privateStates.map((state) => state.playerId),
    };
    room.pendingNightActions = [];
    await games.submitAction(gameRoomId, witch!.playerId, {
      kind: "pass",
      expectedPhase: "night_witch_heal",
      expectedDay: 1,
      expectedVersion: 30,
    });

    room.projection = {
      ...room.projection,
      phase: "night_witch_poison",
      version: 31,
      deadlineAt: new Date(Date.now() + 45_000).toISOString(),
    };
    const poisonPass = await games.submitAction(gameRoomId, witch!.playerId, {
      kind: "pass",
      expectedPhase: "night_witch_poison",
      expectedDay: 1,
      expectedVersion: 31,
    });

    expect(poisonPass).toEqual(
      expect.objectContaining({
        type: "night_action_submitted",
        actorId: witch!.playerId,
      })
    );
    expect(
      room.pendingNightActions.filter(
        (action) => action.actorPlayerId === witch!.playerId
      )
    ).toHaveLength(2);
  });

  it("consumes the witch heal item after a successful heal", async () => {
    const { games, gameRoomId } = createStartedServiceGame();
    const room = games.snapshot(gameRoomId);
    const witch = room.privateStates.find((state) => state.role === "witch");
    const victim = room.privateStates.find(
      (state) => state.role !== "witch" && state.role !== "werewolf" && state.alive
    );
    expect(witch).toBeDefined();
    expect(victim).toBeDefined();
    witch!.witchItems = { healAvailable: true, poisonAvailable: true };
    room.pendingNightActions = [
      {
        actorPlayerId: "wolf_team",
        kind: "wolfKill",
        targetPlayerId: victim!.playerId,
        day: 1,
        phase: "night_wolf",
      },
    ];
    room.projection = {
      ...room.projection!,
      phase: "night_witch_heal",
      day: 1,
      version: 32,
      deadlineAt: new Date(Date.now() + 45_000).toISOString(),
      alivePlayerIds: room.privateStates.map((state) => state.playerId),
    };

    await games.submitAction(gameRoomId, witch!.playerId, {
      kind: "nightAction",
      targetPlayerId: victim!.playerId,
      expectedPhase: "night_witch_heal",
      expectedDay: 1,
      expectedVersion: 32,
    });

    expect(witch!.witchItems).toEqual({
      healAvailable: false,
      poisonAvailable: true,
    });

    room.pendingNightActions = [
      {
        actorPlayerId: "wolf_team",
        kind: "wolfKill",
        targetPlayerId: victim!.playerId,
        day: 2,
        phase: "night_wolf",
      },
    ];
    room.projection = {
      ...room.projection,
      phase: "night_witch_heal",
      day: 2,
      version: 33,
      deadlineAt: new Date(Date.now() + 45_000).toISOString(),
    };

    await expect(
      games.submitAction(gameRoomId, witch!.playerId, {
        kind: "nightAction",
        targetPlayerId: victim!.playerId,
        expectedPhase: "night_witch_heal",
        expectedDay: 2,
        expectedVersion: 33,
      })
    ).rejects.toThrow("Heal item is not available");
  });

  it("consumes the witch poison item after a successful poison", async () => {
    const { games, gameRoomId } = createStartedServiceGame();
    const room = games.snapshot(gameRoomId);
    const witch = room.privateStates.find((state) => state.role === "witch");
    const target = room.privateStates.find(
      (state) => state.playerId !== witch?.playerId && state.alive
    );
    expect(witch).toBeDefined();
    expect(target).toBeDefined();
    witch!.witchItems = { healAvailable: true, poisonAvailable: true };
    room.pendingNightActions = [];
    room.projection = {
      ...room.projection!,
      phase: "night_witch_poison",
      day: 1,
      version: 34,
      deadlineAt: new Date(Date.now() + 45_000).toISOString(),
      alivePlayerIds: room.privateStates.map((state) => state.playerId),
    };

    await games.submitAction(gameRoomId, witch!.playerId, {
      kind: "nightAction",
      targetPlayerId: target!.playerId,
      expectedPhase: "night_witch_poison",
      expectedDay: 1,
      expectedVersion: 34,
    });

    expect(witch!.witchItems).toEqual({
      healAvailable: true,
      poisonAvailable: false,
    });

    room.pendingNightActions = [];
    room.projection = {
      ...room.projection,
      phase: "night_witch_poison",
      day: 2,
      version: 35,
      deadlineAt: new Date(Date.now() + 45_000).toISOString(),
    };

    await expect(
      games.submitAction(gameRoomId, witch!.playerId, {
        kind: "nightAction",
        targetPlayerId: target!.playerId,
        expectedPhase: "night_witch_poison",
        expectedDay: 2,
        expectedVersion: 35,
      })
    ).rejects.toThrow("Poison item is not available");
  });

  it("does not complete a stale speech turn after STT flush yields", async () => {
    const { games, gameRoomId } = createStartedServiceGame();
    const room = games.snapshot(gameRoomId);
    const speaker = room.players[0]!;
    const nextSpeaker = room.players[1]!;

    room.projection = {
      ...room.projection!,
      phase: "day_speak",
      day: 1,
      version: 40,
      currentSpeakerPlayerId: speaker.id,
      deadlineAt: new Date(Date.now() + 60_000).toISOString(),
    };
    room.speechQueue = [speaker.id, nextSpeaker.id];
    games.setVoiceAgents({
      get: () => ({
        flushPlayerTranscript: async () => {
          room.projection = {
            ...room.projection!,
            version: 41,
            currentSpeakerPlayerId: nextSpeaker.id,
          };
          return "late transcript";
        },
        resetPlayerTranscript: () => undefined,
      }),
      setTranscriptHandler: () => undefined,
    } as unknown as VoiceAgentRegistry);

    await expect(
      games.submitAction(gameRoomId, speaker.id, {
        kind: "speechComplete",
        expectedPhase: "day_speak",
        expectedDay: 1,
        expectedVersion: 40,
      })
    ).rejects.toThrow("Action turn has changed");

    expect(
      room.events.some(
        (event) =>
          event.type === "speech_submitted" &&
          event.actorId === speaker.id &&
          String(event.payload?.speech) === "late transcript"
      )
    ).toBe(false);
  });

  it("rejects night actions from players without the current phase role", async () => {
    const { games, gameRoomId } = createStartedServiceGame();
    const room = games.snapshot(gameRoomId);
    const witch = room.privateStates.find((state) => state.role === "witch");
    const wolf = room.privateStates.find((state) => state.role === "werewolf");
    const seer = room.privateStates.find((state) => state.role === "seer");
    expect(witch).toBeDefined();
    expect(wolf).toBeDefined();
    expect(seer).toBeDefined();

    room.projection = {
      ...room.projection!,
      phase: "night_seer",
      day: 1,
      version: 50,
      deadlineAt: new Date(Date.now() + 45_000).toISOString(),
      alivePlayerIds: room.privateStates.map((state) => state.playerId),
    };
    await expect(
      games.submitAction(gameRoomId, witch!.playerId, {
        kind: "nightAction",
        targetPlayerId: wolf!.playerId,
        expectedPhase: "night_seer",
        expectedDay: 1,
        expectedVersion: 50,
      })
    ).rejects.toThrow("You do not have the role for this action");

    room.pendingNightActions = [
      {
        actorPlayerId: "wolf_team",
        kind: "wolfKill",
        targetPlayerId: seer!.playerId,
        day: 1,
        phase: "night_wolf",
      },
    ];
    room.projection = {
      ...room.projection,
      phase: "night_witch_heal",
      version: 51,
    };
    await expect(
      games.submitAction(gameRoomId, wolf!.playerId, {
        kind: "nightAction",
        targetPlayerId: seer!.playerId,
        expectedPhase: "night_witch_heal",
        expectedDay: 1,
        expectedVersion: 51,
      })
    ).rejects.toThrow("You do not have the role for this action");
  });

  it("allows human wolf kills targeting wolf teammates", async () => {
    const { games, gameRoomId } = createStartedServiceGameWithPlayers(7);
    const room = games.snapshot(gameRoomId);
    const wolves = room.privateStates.filter(
      (state) => state.role === "werewolf"
    );
    expect(wolves).toHaveLength(2);

    room.projection = {
      ...room.projection!,
      phase: "night_wolf",
      day: 1,
      version: 55,
      deadlineAt: new Date(Date.now() + 45_000).toISOString(),
      alivePlayerIds: room.privateStates.map((state) => state.playerId),
    };
    room.pendingNightActions = [];

    const event = await games.submitAction(gameRoomId, wolves[0]!.playerId, {
      kind: "nightAction",
      targetPlayerId: wolves[1]!.playerId,
      expectedPhase: "night_wolf",
      expectedDay: 1,
      expectedVersion: 55,
    });

    expect(event).toEqual(
      expect.objectContaining({
        type: "night_action_submitted",
        actorId: wolves[0]!.playerId,
        subjectId: wolves[1]!.playerId,
      })
    );
  });

  it("allows the guard to protect themself", async () => {
    const { games, gameRoomId } = createStartedServiceGame();
    const room = games.snapshot(gameRoomId);
    const guard = room.privateStates.find((state) => state.role === "guard");
    expect(guard).toBeDefined();
    room.projection = {
      ...room.projection!,
      phase: "night_guard",
      day: 1,
      version: 56,
      deadlineAt: new Date(Date.now() + 45_000).toISOString(),
      alivePlayerIds: room.privateStates.map((state) => state.playerId),
    };
    room.pendingNightActions = [];

    const event = await games.submitAction(gameRoomId, guard!.playerId, {
      kind: "nightAction",
      targetPlayerId: guard!.playerId,
      expectedPhase: "night_guard",
      expectedDay: 1,
      expectedVersion: 56,
    });

    expect(event).toEqual(
      expect.objectContaining({
        type: "night_action_submitted",
        actorId: guard!.playerId,
        subjectId: guard!.playerId,
      })
    );
  });

  it("allows a wolf to target themself at night", async () => {
    const { games, gameRoomId } = createStartedServiceGame();
    const room = games.snapshot(gameRoomId);
    const wolf = room.privateStates.find((state) => state.role === "werewolf");
    expect(wolf).toBeDefined();
    room.projection = {
      ...room.projection!,
      phase: "night_wolf",
      day: 1,
      version: 57,
      deadlineAt: new Date(Date.now() + 45_000).toISOString(),
      alivePlayerIds: room.privateStates.map((state) => state.playerId),
    };
    room.pendingNightActions = [];

    const event = await games.submitAction(gameRoomId, wolf!.playerId, {
      kind: "nightAction",
      targetPlayerId: wolf!.playerId,
      expectedPhase: "night_wolf",
      expectedDay: 1,
      expectedVersion: 57,
    });

    expect(event).toEqual(
      expect.objectContaining({
        type: "night_action_submitted",
        actorId: wolf!.playerId,
        subjectId: wolf!.playerId,
      })
    );
  });

  it("allows the witch to heal themself when they are the wolf target", async () => {
    const { games, gameRoomId } = createStartedServiceGame();
    const room = games.snapshot(gameRoomId);
    const witch = room.privateStates.find((state) => state.role === "witch");
    expect(witch).toBeDefined();
    witch!.witchItems = { healAvailable: true, poisonAvailable: true };
    room.pendingNightActions = [
      {
        actorPlayerId: "wolf_team",
        kind: "wolfKill",
        targetPlayerId: witch!.playerId,
        day: 1,
        phase: "night_wolf",
      },
    ];
    room.projection = {
      ...room.projection!,
      phase: "night_witch_heal",
      day: 1,
      version: 58,
      deadlineAt: new Date(Date.now() + 45_000).toISOString(),
      alivePlayerIds: room.privateStates.map((state) => state.playerId),
    };

    const event = await games.submitAction(gameRoomId, witch!.playerId, {
      kind: "nightAction",
      targetPlayerId: witch!.playerId,
      expectedPhase: "night_witch_heal",
      expectedDay: 1,
      expectedVersion: 58,
    });

    expect(event).toEqual(
      expect.objectContaining({
        type: "night_action_submitted",
        actorId: witch!.playerId,
        subjectId: witch!.playerId,
      })
    );
    expect(witch!.witchItems?.healAvailable).toBe(false);
  });

  it("rejects ending another player's speech turn", async () => {
    const { games, gameRoomId } = createStartedServiceGame();
    const room = games.snapshot(gameRoomId);
    const speaker = room.players[0]!;
    const other = room.players[1]!;
    room.projection = {
      ...room.projection!,
      phase: "day_speak",
      day: 1,
      version: 60,
      currentSpeakerPlayerId: speaker.id,
      deadlineAt: new Date(Date.now() + 60_000).toISOString(),
    };
    room.speechQueue = [speaker.id, other.id];

    await expect(
      games.submitAction(gameRoomId, other.id, {
        kind: "speechComplete",
        expectedPhase: "day_speak",
        expectedDay: 1,
        expectedVersion: 60,
      })
    ).rejects.toThrow("Not your turn to speak");

    expect(room.projection.currentSpeakerPlayerId).toBe(speaker.id);
  });

  it("rejects wolf-team night speech from non-wolves", async () => {
    const { games, gameRoomId } = createStartedServiceGame();
    const room = games.snapshot(gameRoomId);
    const villager = room.privateStates.find((state) => state.role === "villager");
    expect(villager).toBeDefined();
    room.projection = {
      ...room.projection!,
      phase: "night_wolf",
      day: 1,
      version: 70,
      deadlineAt: new Date(Date.now() + 45_000).toISOString(),
    };

    await expect(
      games.submitAction(gameRoomId, villager!.playerId, {
        kind: "speech",
        speech: "I should not be in wolf chat.",
        expectedPhase: "night_wolf",
        expectedDay: 1,
        expectedVersion: 70,
      })
    ).rejects.toThrow("Speech not allowed in this phase");
  });

  it("records live STT transcript deltas as stream events", () => {
    const { games, gameRoomId } = createStartedServiceGame();
    const room = games.snapshot(gameRoomId);
    const speaker = room.players[0]!;

    room.projection = {
      ...room.projection!,
      phase: "day_speak",
      currentSpeakerPlayerId: speaker.id,
    };

    games.recordSpeechTranscript(gameRoomId, {
      playerId: speaker.id,
      text: "I think seat 2 is suspicious",
      final: false,
    });

    expect(room.events.at(-1)).toEqual(
      expect.objectContaining({
        type: "speech_transcript_delta",
        visibility: "public",
        actorId: speaker.id,
        payload: expect.objectContaining({
          stream: true,
          final: false,
          text: "I think seat 2 is suspicious",
        }),
      })
    );
  });

  it("ignores stale STT transcript deltas after the speaker turn ends", () => {
    const { games, gameRoomId } = createStartedServiceGame();
    const room = games.snapshot(gameRoomId);
    const speaker = room.players[0]!;
    const before = room.events.length;

    room.projection = {
      ...room.projection!,
      phase: "day_vote",
      currentSpeakerPlayerId: null,
    };

    const event = games.recordSpeechTranscript(gameRoomId, {
      playerId: speaker.id,
      text: "late transcript chunk",
      final: false,
    });

    expect(event).toBeNull();
    expect(room.events).toHaveLength(before);
  });

  it("resets the speech deadline for each next speaker", async () => {
    const { games, gameRoomId } = createStartedServiceGame();
    const room = games.snapshot(gameRoomId);
    const speaker = room.players[0]!;
    const nextSpeaker = room.players[1]!;
    const expiredDeadline = new Date(Date.now() - 1000).toISOString();

    room.projection = {
      ...room.projection!,
      phase: "day_speak",
      currentSpeakerPlayerId: speaker.id,
      deadlineAt: expiredDeadline,
    };
    room.speechQueue = [speaker.id, nextSpeaker.id];

    await games.advanceGame(gameRoomId, passAgentTurn);

    expect(room.projection.currentSpeakerPlayerId).toBe(nextSpeaker.id);
    expect(room.projection.deadlineAt).not.toBe(expiredDeadline);
    expect(new Date(room.projection.deadlineAt!).getTime()).toBeGreaterThan(Date.now());
  });

  it("emits a public turn event after an agent finishes speaking", async () => {
    const { games, gameRoomId } = createStartedServiceGame();
    const room = games.snapshot(gameRoomId);
    const agentSpeaker = room.players[0]!;
    const humanSpeaker = room.players[1]!;

    agentSpeaker.kind = "agent";
    agentSpeaker.agentId = "@agent-speaker:example.com";
    room.projection = {
      ...room.projection!,
      phase: "day_speak",
      currentSpeakerPlayerId: agentSpeaker.id,
      deadlineAt: new Date(Date.now() + 60_000).toISOString(),
    };
    room.speechQueue = [agentSpeaker.id, humanSpeaker.id];

    await games.advanceGame(gameRoomId, async (input) => ({
      text: `${input.displayName} has a short claim.`,
      toolName: "saySpeech",
      input: { speech: `${input.displayName} has a short claim.` },
    }));

    const speechEvent = [...room.events]
      .reverse()
      .find(
        (event) =>
          event.type === "speech_submitted" && event.actorId === agentSpeaker.id
      );
    const turnEvent = [...room.events]
      .reverse()
      .find((event) => event.type === "turn_started");
    expect(room.projection.currentSpeakerPlayerId).toBe(humanSpeaker.id);
    expect(speechEvent).toBeDefined();
    expect(turnEvent).toEqual(
      expect.objectContaining({
        visibility: "public",
        actorId: "runtime",
        subjectId: humanSpeaker.id,
        payload: expect.objectContaining({
          previousSpeakerPlayerId: agentSpeaker.id,
          currentSpeakerPlayerId: humanSpeaker.id,
        }),
      })
    );
    expect(turnEvent!.seq).toBeGreaterThan(speechEvent!.seq);
  });

  it("sends phase-aware harness messages to agent turns", async () => {
    const { games, gameRoomId } = createStartedServiceGame();
    const room = games.snapshot(gameRoomId);
    const agentSpeaker = room.players[0]!;
    const humanSpeaker = room.players[1]!;
    const capturedInputs: RuntimeAgentTurnInput[] = [];

    agentSpeaker.kind = "agent";
    agentSpeaker.agentId = "@agent-speaker:example.com";
    room.projection = {
      ...room.projection!,
      phase: "day_speak",
      currentSpeakerPlayerId: agentSpeaker.id,
      deadlineAt: new Date(Date.now() + 60_000).toISOString(),
    };
    room.speechQueue = [agentSpeaker.id, humanSpeaker.id];

    await games.advanceGame(gameRoomId, async (input) => {
      capturedInputs.push(input);
      return {
        text: "我先给一个明确判断，2号目前偏好。",
        toolName: "saySpeech",
        input: { speech: "我先给一个明确判断，2号目前偏好。" },
      };
    });

    expect(capturedInputs).toHaveLength(1);
    expect(capturedInputs[0]!.messages).toEqual([
      { role: "system", content: expect.stringContaining("白天讨论环节") },
      { role: "user", content: expect.stringContaining("<speaking_order>") },
    ]);
    expect(capturedInputs[0]!.messages![0]!.content).toContain("返回 JSON 字符串数组");
    expect(capturedInputs[0]!.messages![1]!.content).toContain("轮到你发言，返回JSON数组");
    expect(capturedInputs[0]!.prompt).toContain("白天讨论环节");
  });

  it("does not derive the agent seer task target from hidden wolf identity", async () => {
    const { games, gameRoomId } = createStartedServiceGame();
    const room = games.snapshot(gameRoomId);
    const seer = room.privateStates.find((state) => state.role === "seer")!;
    const wolf = room.privateStates.find((state) => state.role === "werewolf")!;
    const seerPlayer = room.players.find((player) => player.id === seer.playerId)!;
    const wolfPlayer = room.players.find((player) => player.id === wolf.playerId)!;
    const capturedInputs: RuntimeAgentTurnInput[] = [];

    seerPlayer.kind = "agent";
    seerPlayer.agentId = "@seer-agent:example.com";
    room.projection = {
      ...room.projection!,
      phase: "night_seer",
      currentSpeakerPlayerId: null,
      deadlineAt: new Date(Date.now() - 1000).toISOString(),
      alivePlayerIds: room.privateStates.map((state) => state.playerId),
    };

    await games.advanceGame(gameRoomId, async (input) => {
      capturedInputs.push(input);
      return { text: "pass", toolName: "passAction", input: {} };
    });

    const promptText = capturedInputs
      .flatMap((input) => input.messages?.map((message) => message.content) ?? [input.prompt])
      .join("\n");
    expect(promptText).toContain(
      `${wolf.playerId}(座位${wolfPlayer.seatNo} ${wolfPlayer.displayName})`
    );
    expect(promptText).not.toContain(`Use seerInspect on ${wolfPlayer.displayName}`);
    expect(promptText).not.toContain("角色：狼人");
  });

  it("does not derive agent wolf kill targets from hidden good-team identity", async () => {
    const { games, gameRoomId } = createStartedServiceGame();
    const room = games.snapshot(gameRoomId);
    const wolf = room.privateStates.find((state) => state.role === "werewolf")!;
    const wolfPlayer = room.players.find((player) => player.id === wolf.playerId)!;
    const capturedInputs: RuntimeAgentTurnInput[] = [];

    wolfPlayer.kind = "agent";
    wolfPlayer.agentId = "@wolf-agent:example.com";
    room.projection = {
      ...room.projection!,
      phase: "night_wolf",
      currentSpeakerPlayerId: null,
      deadlineAt: new Date(Date.now() - 1000).toISOString(),
      alivePlayerIds: room.privateStates.map((state) => state.playerId),
    };

    await games.advanceGame(gameRoomId, async (input) => {
      capturedInputs.push(input);
      if (input.tools && "saySpeech" in input.tools) {
        return {
          text: "private speech",
          toolName: "saySpeech",
          input: { speech: "今晚先看发言和站边。" },
        };
      }
      return { text: "pass", toolName: "passAction", input: {} };
    });

    const wolfKillPrompt = capturedInputs.find(
      (input) => input.tools && "wolfKill" in input.tools
    );
    const promptText = wolfKillPrompt
      ? (wolfKillPrompt.messages?.map((message) => message.content).join("\n") ??
        wolfKillPrompt.prompt)
      : "";
    expect(wolfKillPrompt).toBeDefined();
    expect(promptText).not.toContain("Suggested target");
  });

  it("does not derive public voting task targets from hidden wolf identity", async () => {
    const { games, gameRoomId } = createStartedServiceGame();
    const room = games.snapshot(gameRoomId);
    const wolf = room.privateStates.find((state) => state.role === "werewolf")!;
    const villager = room.privateStates.find((state) => state.role === "villager")!;
    const wolfPlayer = room.players.find((player) => player.id === wolf.playerId)!;
    const villagerPlayer = room.players.find(
      (player) => player.id === villager.playerId
    )!;
    const capturedInputs: RuntimeAgentTurnInput[] = [];

    villagerPlayer.kind = "agent";
    villagerPlayer.agentId = "@villager-agent:example.com";
    room.privateStates = room.privateStates.map((state) => ({
      ...state,
      alive: state.playerId === villagerPlayer.id || state.playerId === wolfPlayer.id,
    }));
    room.projection = {
      ...room.projection!,
      phase: "day_vote",
      currentSpeakerPlayerId: null,
      deadlineAt: new Date(Date.now() + 30_000).toISOString(),
      alivePlayerIds: [villagerPlayer.id, wolfPlayer.id],
    };
    room.pendingVotes = [];

    await games.advanceGame(gameRoomId, async (input) => {
      capturedInputs.push(input);
      return {
        text: "vote",
        toolName: "submitVote",
        input: { targetPlayerId: wolfPlayer.id },
      };
    });

    const promptText = capturedInputs
      .flatMap((input) => input.messages?.map((message) => message.content) ?? [input.prompt])
      .join("\n");
    expect(promptText).toContain(
      `${wolfPlayer.id}(座位${wolfPlayer.seatNo} ${wolfPlayer.displayName})`
    );
    expect(promptText).not.toContain(`Use submitVote on ${wolfPlayer.displayName}`);
    expect(promptText).not.toContain("角色：狼人");
  });

  it("scheduleAdvance advances an agent speaker immediately before the speech deadline", async () => {
    const { games, gameRoomId } = createStartedServiceGame();
    const room = games.snapshot(gameRoomId);
    const agentSpeaker = room.players[0]!;
    const humanSpeaker = room.players[1]!;

    games.setRunAgentTurn(async (input) => ({
      text: `${input.displayName} has a short claim.`,
      toolName: "saySpeech",
      input: { speech: `${input.displayName} has a short claim.` },
    }));
    agentSpeaker.kind = "agent";
    agentSpeaker.agentId = "@agent-speaker:example.com";
    room.projection = {
      ...room.projection!,
      phase: "day_speak",
      currentSpeakerPlayerId: agentSpeaker.id,
      deadlineAt: new Date(Date.now() + 60_000).toISOString(),
    };
    room.speechQueue = [agentSpeaker.id, humanSpeaker.id];

    await games.scheduleAdvance(gameRoomId);

    expect(room.projection.currentSpeakerPlayerId).toBe(humanSpeaker.id);
    expect(new Date(room.projection.deadlineAt!).getTime()).toBeGreaterThan(
      Date.now() + 55_000
    );
  });

  it("waits for agent TTS completion before completing the speech turn", async () => {
    const { games, gameRoomId } = createStartedServiceGame();
    const room = games.snapshot(gameRoomId);
    const agentSpeaker = room.players[0]!;
    const humanSpeaker = room.players[1]!;
    const expectedPlaybackRate = 1.75;
    let resolveSpeak: () => void = () => undefined;
    let speakStarted = false;
    const speakDone = new Promise<void>((resolve) => {
      resolveSpeak = resolve;
    });

    games.setVoiceAgents({
      get: () => ({
        speak: (_text: string, _playerId?: string | null, playbackRate?: number) => {
          expect(playbackRate).toBe(expectedPlaybackRate);
          speakStarted = true;
          return speakDone;
        },
      }),
    } as unknown as VoiceAgentRegistry);
    agentSpeaker.kind = "agent";
    agentSpeaker.agentId = "@agent-speaker:example.com";
    room.projection = {
      ...room.projection!,
      phase: "day_speak",
      currentSpeakerPlayerId: agentSpeaker.id,
      deadlineAt: new Date(Date.now() + 60_000).toISOString(),
    };
    room.timing.agentSpeechRate = expectedPlaybackRate;
    room.speechQueue = [agentSpeaker.id, humanSpeaker.id];

    const advance = games.advanceGame(gameRoomId, async (input) => ({
      text: `${input.displayName} has a short claim.`,
      toolName: "saySpeech",
      input: { speech: `${input.displayName} has a short claim.` },
    }));

    await vi.waitFor(() => expect(speakStarted).toBe(true));

    expect(room.projection.currentSpeakerPlayerId).toBe(agentSpeaker.id);
    expect(room.events.some((event) => event.type === "turn_started")).toBe(false);
    expect(
      room.events.some(
        (event) =>
          event.type === "speech_submitted" && event.actorId === agentSpeaker.id
      )
    ).toBe(false);

    resolveSpeak();
    await advance;

    expect(room.projection.currentSpeakerPlayerId).toBe(humanSpeaker.id);
    const speechEventIndex = room.events.findIndex(
      (event) =>
        event.type === "speech_submitted" && event.actorId === agentSpeaker.id
    );
    const turnEventIndex = room.events.findIndex(
      (event) => event.type === "turn_started" && event.subjectId === humanSpeaker.id
    );
    expect(speechEventIndex).toBeGreaterThan(-1);
    expect(turnEventIndex).toBe(speechEventIndex + 1);
    expect(room.events).toContainEqual(
      expect.objectContaining({
        type: "turn_started",
        subjectId: humanSpeaker.id,
      })
    );
  });

  it("does not treat raw agent text as a completed saySpeech tool call", async () => {
    const { games, gameRoomId } = createStartedServiceGame();
    const room = games.snapshot(gameRoomId);
    const agentSpeaker = room.players[0]!;
    const humanSpeaker = room.players[1]!;
    const speak = vi.fn();

    games.setVoiceAgents({
      get: () => ({ speak }),
    } as unknown as VoiceAgentRegistry);
    agentSpeaker.kind = "agent";
    agentSpeaker.agentId = "@agent-speaker:example.com";
    room.projection = {
      ...room.projection!,
      phase: "day_speak",
      currentSpeakerPlayerId: agentSpeaker.id,
      deadlineAt: new Date(Date.now() + 60_000).toISOString(),
    };
    room.speechQueue = [agentSpeaker.id, humanSpeaker.id];

    await games.advanceGame(gameRoomId, async () => ({
      text: "raw text that did not come from saySpeech",
      input: {},
    }));

    const speechEvent = [...room.events]
      .reverse()
      .find(
        (event) =>
          event.type === "speech_submitted" && event.actorId === agentSpeaker.id
      );
    expect(speak).not.toHaveBeenCalled();
    expect(room.projection.currentSpeakerPlayerId).toBe(humanSpeaker.id);
    expect(speechEvent?.payload.speech).toBe(
      `${agentSpeaker.displayName} did not provide a valid speech.`
    );
  });

  it("does not assign a deadline to an agent speech turn", async () => {
    const { games, gameRoomId } = createStartedServiceGame();
    const room = games.snapshot(gameRoomId);
    const humanSpeaker = room.players[0]!;
    const agentSpeaker = room.players[1]!;

    agentSpeaker.kind = "agent";
    agentSpeaker.agentId = "@agent-speaker:example.com";
    room.projection = {
      ...room.projection!,
      phase: "day_speak",
      currentSpeakerPlayerId: humanSpeaker.id,
      deadlineAt: new Date(Date.now() + 60_000).toISOString(),
    };
    room.speechQueue = [humanSpeaker.id, agentSpeaker.id];

    await games.submitAction(gameRoomId, humanSpeaker.id, {
      kind: "speech",
      speech: "我先说完，交给下一位。",
    });

    const turnEvent = [...room.events]
      .reverse()
      .find(
        (event) =>
          event.type === "turn_started" && event.subjectId === agentSpeaker.id
      );
    expect(room.projection.currentSpeakerPlayerId).toBe(agentSpeaker.id);
    expect(room.projection.deadlineAt).toBeNull();
    expect(turnEvent?.payload.deadlineAt).toBeNull();
  });

  it("starts the next human speaker deadline after agent TTS completes", async () => {
    vi.useFakeTimers();
    try {
      const { games, gameRoomId } = createStartedServiceGame();
      const room = games.snapshot(gameRoomId);
      const agentSpeaker = room.players[0]!;
      const humanSpeaker = room.players[1]!;
      let resolveSpeak: () => void = () => undefined;
      const speakDone = new Promise<void>((resolve) => {
        resolveSpeak = resolve;
      });

      games.setVoiceAgents({
        get: () => ({
          speak: () => speakDone,
        }),
      } as unknown as VoiceAgentRegistry);
      agentSpeaker.kind = "agent";
      agentSpeaker.agentId = "@agent-speaker:example.com";
      room.projection = {
        ...room.projection!,
        phase: "day_speak",
        currentSpeakerPlayerId: agentSpeaker.id,
        deadlineAt: new Date(Date.now() + 60_000).toISOString(),
      };
      room.speechQueue = [agentSpeaker.id, humanSpeaker.id];

      const advance = games.advanceGame(gameRoomId, async (input) => ({
        text: `${input.displayName} has a short claim.`,
        toolName: "saySpeech",
        input: { speech: `${input.displayName} has a short claim.` },
      }));

      await vi.advanceTimersByTimeAsync(57_000);
      resolveSpeak();
      await advance;

      const remainingMs =
        new Date(room.projection.deadlineAt!).getTime() - Date.now();
      expect(room.projection.currentSpeakerPlayerId).toBe(humanSpeaker.id);
      expect(remainingMs).toBeGreaterThanOrEqual(59_000);
    } finally {
      vi.useRealTimers();
    }
  });

  it("emits a turn event with a fresh deadline when day speech opens", async () => {
    const { games, gameRoomId } = createStartedServiceGame();
    const room = games.snapshot(gameRoomId);
    const firstSpeaker = room.players[0]!;

    room.projection = {
      ...room.projection!,
      phase: "night_resolution",
      deadlineAt: new Date(Date.now() - 1000).toISOString(),
    };
    room.pendingNightActions = [];

    await games.advanceGame(gameRoomId, passAgentTurn);

    const turnEvent = room.events.find(
      (event) => event.type === "turn_started" && event.subjectId === firstSpeaker.id
    );
    expect(room.projection.phase).toBe("day_speak");
    expect(room.projection.currentSpeakerPlayerId).toBe(firstSpeaker.id);
    expect(turnEvent).toEqual(
      expect.objectContaining({
        type: "turn_started",
        subjectId: firstSpeaker.id,
        payload: expect.objectContaining({
          currentSpeakerPlayerId: firstSpeaker.id,
          deadlineAt: room.projection.deadlineAt,
        }),
      })
    );
    expect(new Date(room.projection.deadlineAt!).getTime()).toBeGreaterThan(Date.now());
  });

  it("ends immediately during night resolution when witch poison kills the last wolf", async () => {
    const { games, gameRoomId } = createStartedServiceGame();
    const room = games.snapshot(gameRoomId);
    const witch = room.privateStates.find((state) => state.role === "witch");
    const wolf = room.privateStates.find((state) => state.role === "werewolf");
    expect(witch).toBeDefined();
    expect(wolf).toBeDefined();

    room.projection = {
      ...room.projection!,
      phase: "night_resolution",
      day: 1,
      deadlineAt: new Date(Date.now() - 1000).toISOString(),
      alivePlayerIds: room.privateStates.map((state) => state.playerId),
    };
    room.pendingNightActions = [
      {
        actorPlayerId: witch!.playerId,
        kind: "witchPoison",
        targetPlayerId: wolf!.playerId,
        day: 1,
        phase: "night_witch_poison",
      },
    ];

    await games.advanceGame(gameRoomId, passAgentTurn);

    expect(room.status).toBe("ended");
    expect(room.projection?.phase).toBe("post_game");
    expect(room.projection?.winner).toBe("good");
    expect(room.events).toContainEqual(
      expect.objectContaining({
        type: "game_ended",
        payload: expect.objectContaining({ winner: "good" }),
      })
    );
    expect(
      room.events.some(
        (event) =>
          event.type === "phase_started" && event.payload?.phase === "day_speak"
      )
    ).toBe(false);
  });

  it("does not advance when a stale deadline from an older phase fires", async () => {
    const { games, gameRoomId } = createStartedServiceGame();
    const room = games.snapshot(gameRoomId);
    const speaker = room.players[0]!;
    const oldDeadlineAt = new Date(Date.now() - 1000).toISOString();

    room.projection = {
      ...room.projection!,
      phase: "day_speak",
      currentSpeakerPlayerId: speaker.id,
      deadlineAt: oldDeadlineAt,
      version: 10,
    };
    room.speechQueue = [speaker.id];

    let agentCalls = 0;
    games.setRunAgentTurn(async (input) => {
      agentCalls += 1;
      return {
        text: `${input.displayName} should not run.`,
        toolName: "saySpeech",
        input: { speech: `${input.displayName} should not run.` },
      };
    });

    const advanced = await games.scheduleDeadlineAdvance(gameRoomId, {
      phase: "day_speak",
      version: 9,
      deadlineAt: oldDeadlineAt,
    });

    expect(advanced).toBe(false);
    expect(agentCalls).toBe(0);
    expect(room.projection.currentSpeakerPlayerId).toBe(speaker.id);
  });

  it("assigns deadlines to resolution phases so the durable worker can resume them", async () => {
    const { games, gameRoomId } = createStartedServiceGame();
    const room = games.snapshot(gameRoomId);

    room.projection = {
      ...room.projection!,
      phase: "day_resolution",
      deadlineAt: new Date(Date.now() - 1000).toISOString(),
      version: 20,
    };

    games.setRunAgentTurn(passAgentTurn);
    const advanced = await games.scheduleDeadlineAdvance(gameRoomId, {
      phase: "day_resolution",
      version: 20,
      deadlineAt: room.projection.deadlineAt!,
    });

    expect(advanced).toBe(true);
    expect(room.projection?.phase).toBe("night_guard");
    expect(room.projection?.deadlineAt).toBeTruthy();
  });

  it("starts day vote immediately after the final human speaker completes", async () => {
    const { games, gameRoomId } = createStartedServiceGame();
    const room = games.snapshot(gameRoomId);
    const speaker = room.players[0]!;

    games.setRunAgentTurn(passAgentTurn);
    room.projection = {
      ...room.projection!,
      phase: "day_speak",
      currentSpeakerPlayerId: speaker.id,
      deadlineAt: new Date(Date.now() + 60_000).toISOString(),
    };
    room.speechQueue = [speaker.id];

    await games.submitAction(gameRoomId, speaker.id, {
      kind: "speech",
      speech: "Last words before vote.",
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(room.projection?.phase).toBe("day_vote");
    expect(room.events).toContainEqual(
      expect.objectContaining({
        type: "phase_started",
        payload: expect.objectContaining({ phase: "day_vote" }),
      })
    );
  });

  it("returns the assigned speech event when a human speaker completes STT speech", async () => {
    const { games, gameRoomId } = createStartedServiceGame();
    const room = games.snapshot(gameRoomId);
    const speaker = room.players[0]!;

    games.setRunAgentTurn(passAgentTurn);
    room.projection = {
      ...room.projection!,
      phase: "day_speak",
      currentSpeakerPlayerId: speaker.id,
      deadlineAt: new Date(Date.now() + 60_000).toISOString(),
    };
    room.speechQueue = [speaker.id];

    const event = await games.submitAction(gameRoomId, speaker.id, {
      kind: "speechComplete",
    });

    expect(event.id).not.toBe("pending");
    expect(event.seq).toBeGreaterThan(0);
    expect(event.type).toBe("speech_submitted");
  });

  it("does not advance a speech turn while the player's STT finalization is pending", async () => {
    const { games, gameRoomId } = createStartedServiceGame();
    const room = games.snapshot(gameRoomId);
    const speaker = room.players[0]!;
    const nextSpeaker = room.players[1]!;
    let flushCalls = 0;
    let resolveFlush: (value: string) => void = () => undefined;
    const flushDone = new Promise<string>((resolve) => {
      resolveFlush = resolve;
    });

    games.setRunAgentTurn(passAgentTurn);
    games.setVoiceAgents({
      get: () => ({
        flushPlayerTranscript: () => {
          flushCalls += 1;
          return flushDone;
        },
        resetPlayerTranscript: () => undefined,
      }),
      setTranscriptHandler: () => undefined,
    } as unknown as VoiceAgentRegistry);
    room.projection = {
      ...room.projection!,
      phase: "day_speak",
      day: 1,
      version: 80,
      currentSpeakerPlayerId: speaker.id,
      deadlineAt: new Date(Date.now() - 1000).toISOString(),
    };
    room.speechQueue = [speaker.id, nextSpeaker.id];

    const complete = games.submitAction(gameRoomId, speaker.id, {
      kind: "speechComplete",
      expectedPhase: "day_speak",
      expectedDay: 1,
      expectedVersion: 80,
    });
    await vi.waitFor(() => expect(flushCalls).toBe(1));

    const advance = games.scheduleAdvance(gameRoomId);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(flushCalls).toBe(1);
    expect(room.projection.currentSpeakerPlayerId).toBe(speaker.id);
    expect(
      room.events.some(
        (event) => event.type === "speech_submitted" && event.actorId === speaker.id
      )
    ).toBe(false);

    resolveFlush("final player transcript");
    const event = await complete;
    await advance;

    expect(event).toEqual(
      expect.objectContaining({
        type: "speech_submitted",
        actorId: speaker.id,
        payload: expect.objectContaining({ speech: "final player transcript" }),
      })
    );
    expect(room.projection.currentSpeakerPlayerId).toBe(nextSpeaker.id);
    expect(
      room.events.filter(
        (candidate) =>
          candidate.type === "speech_submitted" && candidate.actorId === speaker.id
      )
    ).toHaveLength(1);
  });

  it("does not enter voting before the final speaker's STT speech event is written", async () => {
    const { games, gameRoomId } = createStartedServiceGame();
    const room = games.snapshot(gameRoomId);
    const speaker = room.players[0]!;
    let flushCalls = 0;
    let resolveFlush: (value: string) => void = () => undefined;
    const flushDone = new Promise<string>((resolve) => {
      resolveFlush = resolve;
    });

    games.setRunAgentTurn(passAgentTurn);
    games.setVoiceAgents({
      get: () => ({
        flushPlayerTranscript: () => {
          flushCalls += 1;
          return flushDone;
        },
        resetPlayerTranscript: () => undefined,
      }),
      setTranscriptHandler: () => undefined,
    } as unknown as VoiceAgentRegistry);
    room.projection = {
      ...room.projection!,
      phase: "day_speak",
      day: 1,
      version: 90,
      currentSpeakerPlayerId: speaker.id,
      deadlineAt: new Date(Date.now() - 1000).toISOString(),
    };
    room.speechQueue = [speaker.id];

    const complete = games.submitAction(gameRoomId, speaker.id, {
      kind: "speechComplete",
      expectedPhase: "day_speak",
      expectedDay: 1,
      expectedVersion: 90,
    });
    await vi.waitFor(() => expect(flushCalls).toBe(1));

    const advance = games.scheduleAdvance(gameRoomId);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(room.projection.phase).toBe("day_speak");
    expect(
      room.events.some(
        (event) =>
          event.type === "phase_started" &&
          event.payload.phase === "day_vote"
      )
    ).toBe(false);

    resolveFlush("final claim before voting");
    await complete;
    await advance;

    const speechEventIndex = room.events.findIndex(
      (event) => event.type === "speech_submitted" && event.actorId === speaker.id
    );
    const votePhaseIndex = room.events.findIndex(
      (event) =>
        event.type === "phase_started" && event.payload.phase === "day_vote"
    );
    expect(room.projection.phase).toBe("day_vote");
    expect(speechEventIndex).toBeGreaterThan(-1);
    expect(votePhaseIndex).toBeGreaterThan(speechEventIndex);
  });

  it("leaves day vote immediately after the final human vote", async () => {
    const { games, gameRoomId } = createStartedServiceGame();
    const room = games.snapshot(gameRoomId);
    const [voter, target] = room.players;
    expect(voter).toBeDefined();
    expect(target).toBeDefined();

    games.setRunAgentTurn(passAgentTurn);
    room.projection = {
      ...room.projection!,
      phase: "day_vote",
      currentSpeakerPlayerId: null,
      deadlineAt: new Date(Date.now() + 30_000).toISOString(),
      alivePlayerIds: [voter!.id],
    };
    room.privateStates = room.privateStates.map((state) => ({
      ...state,
      alive: state.playerId === voter!.id || state.playerId === target!.id,
    }));
    room.projection.alivePlayerIds = [voter!.id, target!.id];
    room.pendingVotes = [{ actorPlayerId: target!.id, targetPlayerId: voter!.id }];

    await games.submitAction(gameRoomId, voter!.id, {
      kind: "vote",
      targetPlayerId: target!.id,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(room.projection?.phase).not.toBe("day_vote");
    expect(room.events).toContainEqual(
      expect.objectContaining({
        type: "phase_started",
        payload: expect.objectContaining({ phase: room.projection?.phase }),
      })
    );
  });

  it("records agent votes to the timeline before waiting for human voters", async () => {
    const { games, gameRoomId } = createStartedServiceGame();
    const room = games.snapshot(gameRoomId);
    const [agentVoter, humanVoter, target] = room.players;
    expect(agentVoter).toBeDefined();
    expect(humanVoter).toBeDefined();
    expect(target).toBeDefined();
    agentVoter!.kind = "agent";
    agentVoter!.agentId = "@agent-voter:example.com";
    let agentVoteCalls = 0;

    room.privateStates = room.privateStates.map((state) => ({
      ...state,
      alive:
        state.playerId === agentVoter!.id ||
        state.playerId === humanVoter!.id ||
        state.playerId === target!.id,
    }));
    room.projection = {
      ...room.projection!,
      phase: "day_vote",
      currentSpeakerPlayerId: null,
      deadlineAt: new Date(Date.now() + 30_000).toISOString(),
      alivePlayerIds: [agentVoter!.id, humanVoter!.id, target!.id],
    };
    room.pendingVotes = [];

    await games.advanceGame(gameRoomId, async () => {
      agentVoteCalls += 1;
      return {
        text: "vote",
        toolName: "submitVote",
        input: { targetPlayerId: target!.id },
      };
    });

    expect(room.projection.phase).toBe("day_vote");
    expect(room.pendingVotes).toEqual([
      { actorPlayerId: agentVoter!.id, targetPlayerId: target!.id },
    ]);
    expect(room.events).toContainEqual(
      expect.objectContaining({
        type: "vote_submitted",
        visibility: "public",
        actorId: agentVoter!.id,
        subjectId: target!.id,
        payload: expect.objectContaining({
          phase: "day_vote",
          targetPlayerId: target!.id,
        }),
      })
    );

    await games.advanceGame(gameRoomId, async () => {
      agentVoteCalls += 1;
      return {
        text: "duplicate vote",
        toolName: "submitVote",
        input: { targetPlayerId: target!.id },
      };
    });

    expect(agentVoteCalls).toBe(1);
    expect(
      room.events.filter(
        (event) =>
          event.type === "vote_submitted" && event.actorId === agentVoter!.id
      )
    ).toHaveLength(1);
  });
});
