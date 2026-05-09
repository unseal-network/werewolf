import { z } from "zod";

const responseSchema = z.object({
  agents: z.array(
    z.object({
      user_id: z.string(),
      display_name: z.string().optional(),
      avatar_url: z.string().optional(),
      user_type: z.string(),
      membership: z.string(),
    })
  ),
  total: z.number(),
});

export interface ListRoomAgentsInput {
  homeserverUrl: string;
  roomId: string;
  matrixToken: string;
  fetchImpl?: typeof fetch;
}

export async function listRoomAgents(input: ListRoomAgentsInput) {
  const fetcher = input.fetchImpl ?? fetch;
  const url = `${input.homeserverUrl}/chatbot/v1/rooms/${encodeURIComponent(
    input.roomId
  )}/agents?membership=join`;
  const response = await fetcher(url, {
    headers: { authorization: `Bearer ${input.matrixToken}` },
  });
  if (!response.ok) {
    throw new Error(`Synapse room agents failed: HTTP ${response.status}`);
  }
  const parsed = responseSchema.parse(await response.json());
  return {
    agents: parsed.agents.map((agent) => ({
      userId: agent.user_id,
      displayName: agent.display_name ?? agent.user_id,
      avatarUrl: agent.avatar_url,
      userType: agent.user_type,
      membership: agent.membership,
    })),
    total: parsed.total,
  };
}
