import { z } from "zod";

export const llmGenerateResponseSchema = z
  .object({
    text: z.string().default(""),
    toolCalls: z
      .array(
        z
          .object({
            toolName: z.string(),
            input: z.record(z.string(), z.unknown()).optional(),
          })
          .passthrough()
      )
      .optional(),
    content: z.array(z.unknown()).optional(),
  })
  .passthrough();

export interface GenerateWithAgentInput {
  apiBaseUrl: string;
  adminToken: string;
  agentId: string;
  body: Record<string, unknown>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export async function generateWithAgent(input: GenerateWithAgentInput) {
  const fetcher = input.fetchImpl ?? fetch;
  const init: RequestInit = {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": input.adminToken,
    },
    body: JSON.stringify(input.body),
  };
  if (input.timeoutMs) {
    init.signal = AbortSignal.timeout(input.timeoutMs);
  }
  const response = await fetcher(
    `${input.apiBaseUrl}/agents/${encodeURIComponent(input.agentId)}/llm/generate`,
    init
  );
  if (!response.ok) {
    throw new Error(`Unseal agent generate failed: HTTP ${response.status}`);
  }
  return llmGenerateResponseSchema.parse(await response.json());
}
