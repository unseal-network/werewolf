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

export interface RoomAgent {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  userType: string;
  membership: string;
}

export async function listRoomAgents(
  input: ListRoomAgentsInput
): Promise<{ agents: RoomAgent[]; total: number }> {
  const fetcher = input.fetchImpl ?? fetch;
  const url = `${input.homeserverUrl}/chatbot/v1/rooms/${encodeURIComponent(
    input.roomId
  )}/agents?membership=join`;
  let response: Response;
  try {
    response = await fetcher(url, {
      headers: { authorization: `Bearer ${input.matrixToken}` },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Synapse room agents request failed: ${url}: ${message}`, {
      cause: error,
    });
  }
  if (!response.ok) {
    throw new Error(`Synapse room agents failed: ${url}: HTTP ${response.status}`);
  }
  const parsed = responseSchema.parse(await response.json());
  return {
    agents: parsed.agents.map((agent) => ({
      userId: agent.user_id,
      displayName: agent.display_name ?? agent.user_id,
      userType: agent.user_type,
      membership: agent.membership,
      ...(agent.avatar_url ? { avatarUrl: agent.avatar_url } : {}),
    })),
    total: parsed.total,
  };
}
