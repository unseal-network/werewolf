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
] as const;

function createStartedServiceGame() {
  const games = new InMemoryGameService();
  const { room } = games.createGame(
    {
      sourceMatrixRoomId: "!source:example.com",
      title: "Rules",
      targetPlayerCount: 6,
      timing: { nightActionSeconds: 45, speechSeconds: 60, voteSeconds: 30 },
      allowedSourceMatrixRoomIds: [],
    },
    players[0][0]
  );
  for (const [userId, name] of players) {
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
  it("does not let users swap seats with another human player", () => {
    const games = new InMemoryGameService();
    const { room } = games.createGame(
      {
        sourceMatrixRoomId: "!source:example.com",
        title: "Seats",
        targetPlayerCount: 6,
        timing: { nightActionSeconds: 45, speechSeconds: 60, voteSeconds: 30 },
        allowedSourceMatrixRoomIds: [],
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
        allowedSourceMatrixRoomIds: [],
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

  it("reveals the wolf kill target to the witch before the heal phase action", async () => {
    const { games, gameRoomId } = createStartedServiceGame();
    const room = games.snapshot(gameRoomId);
    const guard = room.privateStates.find((state) => state.role === "guard");
    const wolf = room.privateStates.find((state) => state.role === "werewolf");
    const witch = room.privateStates.find((state) => state.role === "witch");
    expect(guard).toBeDefined();
    expect(wolf).toBeDefined();
    expect(witch).toBeDefined();

    await games.submitAction(gameRoomId, guard!.playerId, { kind: "pass" });
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

  it("waits for agent TTS playout before completing the speech turn", async () => {
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

    resolveSpeak();
    await advance;

    expect(room.projection.currentSpeakerPlayerId).toBe(humanSpeaker.id);
    expect(room.events).toContainEqual(
      expect.objectContaining({
        type: "turn_started",
        subjectId: humanSpeaker.id,
      })
    );
  });

  it("starts the next human speaker deadline after agent TTS finishes", async () => {
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
});
