import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RuntimeAgentTurnInput } from "./game-service";

const generateWithAgent = vi.fn();

vi.mock("@werewolf/agent-client", () => ({
  generateWithAgent,
  buildAgentTurnTools: vi.fn(() => ({})),
}));

describe("buildRunAgentTurn", () => {
  beforeEach(() => {
    vi.resetModules();
    generateWithAgent.mockReset();
    process.env.UNSEAL_AGENT_API_KEY = "test-key";
  });

  it("passes multi-message prompts when present", async () => {
    generateWithAgent.mockResolvedValue({
      text: "ok",
      toolCalls: [{ toolName: "saySpeech", input: { speech: "hello" } }],
    });
    const { buildRunAgentTurn } = await import("./agent-turn");
    const run = buildRunAgentTurn();
    const input: RuntimeAgentTurnInput = {
      agentId: "@agent:example.com",
      playerId: "p1",
      displayName: "一号",
      role: "villager",
      phase: "day_speak",
      prompt: "fallback prompt",
      messages: [
        { role: "system", content: "system prompt" },
        { role: "user", content: "user prompt" },
      ],
      tools: { saySpeech: {} },
    };

    await run(input);

    expect(generateWithAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          messages: input.messages,
        }),
      })
    );
  });

  it("keeps the single-user-message fallback", async () => {
    generateWithAgent.mockResolvedValue({ text: "ok", toolCalls: [] });
    const { buildRunAgentTurn } = await import("./agent-turn");
    const run = buildRunAgentTurn();

    await run({
      agentId: "@agent:example.com",
      playerId: "p1",
      displayName: "一号",
      role: "villager",
      phase: "day_speak",
      prompt: "fallback prompt",
      tools: { saySpeech: {} },
    });

    expect(generateWithAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          messages: [{ role: "user", content: "fallback prompt" }],
        }),
      })
    );
  });
});
