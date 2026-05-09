import { z } from "zod";

export const llmGenerateResponseSchema = z
  .object({
    text: z.string().default(""),
  })
  .passthrough();

export interface GenerateWithAgentInput {
  apiBaseUrl: string;
  adminToken: string;
  agentId: string;
  body: Record<string, unknown>;
  fetchImpl?: typeof fetch;
}

export async function generateWithAgent(input: GenerateWithAgentInput) {
  const fetcher = input.fetchImpl ?? fetch;
  const response = await fetcher(
    `${input.apiBaseUrl}/agents/${encodeURIComponent(input.agentId)}/llm/generate`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": input.adminToken,
      },
      body: JSON.stringify(input.body),
    }
  );
  if (!response.ok) {
    throw new Error(`Unseal agent generate failed: HTTP ${response.status}`);
  }
  return llmGenerateResponseSchema.parse(await response.json());
}
