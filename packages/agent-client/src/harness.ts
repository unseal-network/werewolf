import type { GamePhase, Role } from "@werewolf/shared";

export interface ToolDeclaration {
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface BuildAgentTurnToolsInput {
  phase: GamePhase;
  role: Role;
  alivePlayerIds: string[];
  selfPlayerId: string;
}

const emptySchema = {
  type: "object",
  properties: {},
  additionalProperties: false,
};

const targetPlayerSchema = {
  type: "object",
  properties: {
    targetPlayerId: { type: "string" },
    reason: { type: "string" },
  },
  required: ["targetPlayerId"],
  additionalProperties: false,
};

export function buildAgentTurnTools(
  input: BuildAgentTurnToolsInput
): Record<string, ToolDeclaration> {
  if (input.phase === "day_vote") {
    return {
      submitVote: {
        description: "Vote to exile one living player other than yourself.",
        inputSchema: targetPlayerSchema,
      },
      abstain: {
        description: "Abstain from the current vote.",
        inputSchema: emptySchema,
      },
    };
  }

  if (input.phase === "day_speak") {
    return {
      saySpeech: {
        description: "Say your public speech for the current turn.",
        inputSchema: {
          type: "object",
          properties: { speech: { type: "string", minLength: 1 } },
          required: ["speech"],
          additionalProperties: false,
        },
      },
    };
  }

  if (input.phase === "night_seer" && input.role === "seer") {
    return {
      seerInspect: {
        description: "Inspect one living player's alignment.",
        inputSchema: targetPlayerSchema,
      },
      passAction: {
        description: "Skip the seer action.",
        inputSchema: emptySchema,
      },
    };
  }

  if (input.phase === "night_guard" && input.role === "guard") {
    return {
      guardProtect: {
        description: "Protect one living player tonight.",
        inputSchema: targetPlayerSchema,
      },
      passAction: {
        description: "Skip the guard action.",
        inputSchema: emptySchema,
      },
    };
  }

  if (input.phase === "night_wolf" && input.role === "werewolf") {
    return {
      wolfKill: {
        description: "Select the wolf team kill target.",
        inputSchema: targetPlayerSchema,
      },
      passAction: {
        description: "Skip the wolf kill action.",
        inputSchema: emptySchema,
      },
    };
  }

  if (input.phase === "night_witch_heal" && input.role === "witch") {
    return {
      witchHeal: {
        description: "Use heal on the night death target.",
        inputSchema: targetPlayerSchema,
      },
      passAction: {
        description: "Do not use heal.",
        inputSchema: emptySchema,
      },
    };
  }

  if (input.phase === "night_witch_poison" && input.role === "witch") {
    return {
      witchPoison: {
        description: "Poison one living player.",
        inputSchema: targetPlayerSchema,
      },
      passAction: {
        description: "Do not use poison.",
        inputSchema: emptySchema,
      },
    };
  }

  return {};
}
