import {
  gamePhaseSchema,
  type GameEvent,
  type GamePhase,
} from "@werewolf/shared";

export interface PublicProjection {
  gameRoomId: string;
  phase: GamePhase | null;
  day: number;
  deadlineAt: string | null;
  currentSpeakerPlayerId: string | null;
  eliminatedPlayerIds: string[];
  winner: "wolf" | "good" | null;
  version: number;
}

export function createInitialProjection(gameRoomId: string): PublicProjection {
  return {
    gameRoomId,
    phase: null,
    day: 0,
    deadlineAt: null,
    currentSpeakerPlayerId: null,
    eliminatedPlayerIds: [],
    winner: null,
    version: 0,
  };
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${name} is required`);
  }
  return value;
}

export function applyEventToProjection(
  projection: PublicProjection,
  event: GameEvent
): PublicProjection {
  if (event.visibility !== "public") {
    return projection;
  }

  const next = { ...projection, version: event.seq };
  if (event.type === "phase_started") {
    next.phase = gamePhaseSchema.parse(event.payload.phase);
    next.day = Number(event.payload.day ?? next.day);
    next.deadlineAt =
      typeof event.payload.deadlineAt === "string"
        ? event.payload.deadlineAt
        : null;
    next.currentSpeakerPlayerId =
      typeof event.payload.currentSpeakerPlayerId === "string"
        ? event.payload.currentSpeakerPlayerId
        : null;
  }
  if (event.type === "turn_started") {
    next.currentSpeakerPlayerId = requireString(
      event.payload.playerId,
      "turn_started.payload.playerId"
    );
  }
  if (event.type === "player_eliminated") {
    const playerId = requireString(
      event.payload.playerId,
      "player_eliminated.payload.playerId"
    );
    next.eliminatedPlayerIds = [
      ...new Set([...next.eliminatedPlayerIds, playerId]),
    ];
  }
  if (event.type === "game_ended") {
    next.phase = "post_game";
    next.winner =
      event.payload.winner === "wolf" || event.payload.winner === "good"
        ? event.payload.winner
        : null;
    next.deadlineAt = null;
  }
  return next;
}
