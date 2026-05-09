import { describe, expect, it } from "vitest";
import { createInMemoryRepositories } from "../test-db";

describe("event repository", () => {
  it("assigns monotonic seq values per game room", async () => {
    const repos = createInMemoryRepositories();
    const first = await repos.events.append("game_1", [
      {
        id: "pending",
        gameRoomId: "game_1",
        seq: 1,
        type: "phase_started",
        visibility: "public",
        actorId: "runtime",
        payload: { phase: "night_guard", day: 1 },
        createdAt: "2026-05-09T10:00:00.000Z",
      },
    ]);
    const second = await repos.events.append("game_1", [
      {
        id: "pending",
        gameRoomId: "game_1",
        seq: 1,
        type: "phase_closed",
        visibility: "public",
        actorId: "runtime",
        payload: { phase: "night_guard", day: 1 },
        createdAt: "2026-05-09T10:00:45.000Z",
      },
    ]);

    expect(first[0]?.seq).toBe(1);
    expect(second[0]?.seq).toBe(2);
    expect(await repos.events.listAfter("game_1", 0)).toHaveLength(2);
  });
});
