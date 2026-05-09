import { buildAgentTurnTools } from "@werewolf/agent-client";
import type { GamePhase, Role } from "@werewolf/shared";

export interface BuildAiTurnInput {
  phase: GamePhase;
  role: Role;
  selfPlayerId: string;
  alivePlayerIds: string[];
}

export function buildAiTurn(input: BuildAiTurnInput) {
  return {
    tools: buildAgentTurnTools(input),
    messages: [
      {
        role: "system" as const,
        content:
          "You are playing Werewolf. Use exactly one available tool to act.",
      },
    ],
  };
}
