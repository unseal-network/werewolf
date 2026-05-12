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
      allowedSourceMatrixRoomIds: [],
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
  it("runs real runtime ticks through night, ordered day speeches, vote, exile, and game end", async () => {
    const deps = createTestDeps();
    let runtimeRoomId = "";
    const chooseAliveTarget = (
      actorPlayerId: string,
      predicate: (state: { playerId: string; role: string; alive: boolean }) => boolean
    ) => {
      const room = deps.games.snapshot(runtimeRoomId);
      return (
        room.privateStates.find(
          (state) => state.playerId !== actorPlayerId && state.alive && predicate(state)
        )?.playerId ??
        room.privateStates.find((state) => state.playerId !== actorPlayerId && state.alive)
          ?.playerId
      );
    };
    const app = createApp({
      ...deps,
      async runAgentTurn(input) {
        if (input.phase === "day_speak" || input.phase === "tie_speech") {
          return {
            text: `${input.displayName} speaks during ${input.phase}.`,
            toolName: "saySpeech",
            input: { speech: `${input.displayName} speaks during ${input.phase}.` },
          };
        }
        if ("saySpeech" in input.tools) {
          return {
            text: `${input.displayName} discusses during ${input.phase}.`,
            toolName: "saySpeech",
            input: { speech: `${input.displayName} discusses during ${input.phase}.` },
          };
        }
        const promptedTarget =
          input.prompt.match(/合法 targetPlayerId [^：:]*[：:][^\n]*(player_\d+)/)?.[1] ??
          input.prompt.match(/(?:on|targets are:|Suggested target:) (player_\d+)/)?.[1];
        if (input.phase === "night_guard") {
          return {
            text: "",
            toolName: "guardProtect",
            input: { targetPlayerId: promptedTarget },
          };
        }
        if (input.phase === "night_wolf") {
          return {
            text: "",
            toolName: "wolfKill",
            input: {
              targetPlayerId: chooseAliveTarget(
                input.playerId,
                (state) => state.role === "villager"
              ),
            },
          };
        }
        if (input.phase === "night_witch_heal" || input.phase === "night_witch_poison") {
          return { text: "", toolName: "passAction", input: {} };
        }
        if (input.phase === "night_seer") {
          return {
            text: "",
            toolName: "seerInspect",
            input: { targetPlayerId: promptedTarget },
          };
        }
        if (input.phase === "day_vote" || input.phase === "tie_vote") {
          return {
            text: "",
            toolName: "submitVote",
            input: {
              targetPlayerId: chooseAliveTarget(
                input.playerId,
                (state) => state.role !== "werewolf"
              ),
            },
          };
        }
        return { text: `${input.displayName} passes.`, toolName: "passAction", input: {} };
      },
    });
    const gameRoomId = await createStartedGame(app);
    runtimeRoomId = gameRoomId;
    const eventTypes: string[] = [];
    let done = false;
    let winner: string | null = null;

    for (let index = 0; index < 300 && !done; index += 1) {
      const room = deps.games.snapshot(gameRoomId);
      if (room.projection?.deadlineAt) {
        room.projection.deadlineAt = new Date(Date.now() - 1000).toISOString();
      }
      const tick = await app.request(`/games/${gameRoomId}/runtime/tick`, {
        method: "POST",
        headers: { authorization: "Bearer matrix-token-alice" },
      });
      expect(tick.status).toBe(200);
      const body = (await tick.json()) as {
        done: boolean;
        projection: { winner: string | null };
        events: Array<{ type: string; payload?: { toolName?: string; action?: { kind?: string } } }>;
      };
      done = body.done;
      winner = body.projection.winner;
      eventTypes.push(...body.events.map((event) => event.type));
    }

    expect(done).toBe(true);
    expect(["good", "wolf"]).toContain(winner);
    expect(eventTypes).toContain("night_action_submitted");
    expect(eventTypes).toContain("wolf_vote_resolved");
    expect(eventTypes).toContain("agent_llm_requested");
    expect(eventTypes).toContain("agent_llm_completed");
    expect(eventTypes).toContain("night_resolved");
    expect(eventTypes).toContain("speech_submitted");
    expect(eventTypes).toContain("vote_submitted");
    expect(eventTypes).toContain("player_eliminated");
    expect(eventTypes).toContain("game_ended");
  });
});
