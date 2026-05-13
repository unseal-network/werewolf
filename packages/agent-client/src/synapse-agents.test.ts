import { describe, expect, it, vi } from "vitest";
import { listRoomAgents } from "./synapse-agents";

describe("listRoomAgents", () => {
  it("calls Synapse room agents endpoint with Matrix bearer token", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          agents: [
            {
              user_id: "@bot:test",
              display_name: "Bot",
              user_type: "bot",
              membership: "join",
            },
          ],
          total: 1,
        }),
        { status: 200 }
      )
    );
    const result = await listRoomAgents({
      homeserverUrl: "https://matrix.example.com",
      roomId: "!room:test",
      matrixToken: "token",
      fetchImpl,
    });
    const calls = fetchImpl.mock.calls as unknown as Array<
      [string, RequestInit?]
    >;
    expect(calls[0]?.[0]).toBe(
      "https://matrix.example.com/chatbot/v1/rooms/!room%3Atest/agents?membership=join"
    );
    expect(result.agents[0]?.userId).toBe("@bot:test");
  });

  it("includes the requested Synapse URL when fetch fails", async () => {
    await expect(
      listRoomAgents({
        homeserverUrl: "http://localhost:8008",
        roomId: "!room:test",
        matrixToken: "token",
        fetchImpl: vi.fn(async () => {
          throw new Error("fetch failed");
        }) as unknown as typeof fetch,
      })
    ).rejects.toThrow(
      "Synapse room agents request failed: http://localhost:8008/chatbot/v1/rooms/!room%3Atest/agents?membership=join: fetch failed"
    );
  });
});
