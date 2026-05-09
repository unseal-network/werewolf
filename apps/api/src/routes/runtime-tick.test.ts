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
  return gameRoomId;
}

describe("runtime tick API", () => {
  it("runs real runtime ticks through night, ordered day speeches, vote, exile, and game end", async () => {
    const app = createApp({
      ...createTestDeps(),
      async runAgentTurn(input) {
        return `${input.displayName} speaks during ${input.phase}.`;
      },
    });
    const gameRoomId = await createStartedGame(app);
    const eventTypes: string[] = [];
    let done = false;
    let winner: string | null = null;

    for (let index = 0; index < 20 && !done; index += 1) {
      const tick = await app.request(`/games/${gameRoomId}/runtime/tick`, {
        method: "POST",
        headers: { authorization: "Bearer matrix-token-alice" },
      });
      expect(tick.status).toBe(200);
      const body = (await tick.json()) as {
        done: boolean;
        projection: { winner: string | null };
        events: Array<{ type: string }>;
      };
      done = body.done;
      winner = body.projection.winner;
      eventTypes.push(...body.events.map((event) => event.type));
    }

    expect(done).toBe(true);
    expect(winner).toBe("good");
    expect(eventTypes).toContain("night_action_submitted");
    expect(eventTypes).toContain("night_resolved");
    expect(eventTypes).toContain("speech_submitted");
    expect(eventTypes).toContain("vote_submitted");
    expect(eventTypes).toContain("player_eliminated");
    expect(eventTypes).toContain("game_ended");
  });
});
