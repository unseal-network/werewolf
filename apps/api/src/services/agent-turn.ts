import { generateWithAgent, buildAgentTurnTools } from "@werewolf/agent-client";
import { AppError } from "@werewolf/shared";
import type {
  RuntimeAgentTurnInput,
  RuntimeAgentTurnOutput,
} from "./game-service";

/**
 * Build a single game-agnostic `runAgentTurn` closure that wraps the Unseal
 * `generateWithAgent` LLM call. The closure relies entirely on `input`
 * (which already carries agentId / playerId / role / phase / prompt / tools)
 * and does NOT close over a specific gameRoomId — so it can be set once at
 * process startup and re-used by the tick worker for every active room,
 * even ones that came back from the persistence layer after a restart.
 */
export function buildRunAgentTurn(): (
  input: RuntimeAgentTurnInput
) => Promise<RuntimeAgentTurnOutput> {
  const agentApiBaseUrl =
    process.env.UNSEAL_AGENT_API_BASE_URL ??
    "https://un-server.dev-excel-alt.pagepeek.org/api";
  const agentApiKey = process.env.UNSEAL_AGENT_API_KEY;
  const agentTimeoutMs = Number(process.env.UNSEAL_AGENT_TIMEOUT_MS) || 8000;

  return async (input: RuntimeAgentTurnInput) => {
    if (!agentApiKey) {
      throw new AppError(
        "invalid_action",
        "UNSEAL_AGENT_API_KEY is required",
        400
      );
    }
    const generated = await generateWithAgent({
      apiBaseUrl: agentApiBaseUrl,
      adminToken: agentApiKey,
      agentId: input.agentId,
      timeoutMs: agentTimeoutMs,
      body: {
        messages: input.messages ?? [{ role: "user", content: input.prompt }],
        temperature: 0.2,
        maxOutputTokens: 256,
        // Game-service always builds and passes a tools manifest in
        // `input.tools` (see runAgentToolTurn). The fallback here only fires
        // if a caller forgot — keep it cheap and self-contained, no room
        // snapshot lookup needed.
        tools:
          Object.keys(input.tools).length > 0
            ? input.tools
            : buildAgentTurnTools({
                phase: input.phase,
                role: input.role,
                alivePlayerIds: [],
                selfPlayerId: input.playerId,
              }),
      },
    });
    const toolCall =
      generated.toolCalls?.[0] ??
      extractToolCallFromContent(generated.content);
    return {
      text: generated.text || `${input.displayName} passes.`,
      toolName: toolCall?.toolName,
      input: toolCall?.input ?? {},
    };
  };
}

function extractToolCallFromContent(
  content: unknown[] | undefined
): { toolName: string; input?: Record<string, unknown> } | undefined {
  for (const item of content ?? []) {
    if (!item || typeof item !== "object") continue;
    const candidate = item as Record<string, unknown>;
    if (
      candidate.type !== "tool-call" ||
      typeof candidate.toolName !== "string"
    ) {
      continue;
    }
    const input =
      candidate.input &&
      typeof candidate.input === "object" &&
      !Array.isArray(candidate.input)
        ? (candidate.input as Record<string, unknown>)
        : {};
    return { toolName: candidate.toolName, input };
  }
  return undefined;
}
