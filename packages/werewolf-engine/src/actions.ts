import type { GameEvent, GamePhase } from "@werewolf/shared";
import type { PlayerAction } from "./commands";

export interface ValidatePlayerActionInput {
  gameRoomId: string;
  day: number;
  phase: GamePhase;
  actorPlayerId: string;
  currentSpeakerPlayerId: string | null;
  alivePlayerIds: string[];
  eliminatedPlayerIds: string[];
  action: PlayerAction;
  now: Date;
}

function assertAlive(input: ValidatePlayerActionInput, playerId: string): void {
  if (
    !input.alivePlayerIds.includes(playerId) ||
    input.eliminatedPlayerIds.includes(playerId)
  ) {
    throw new Error(`${playerId} is not alive`);
  }
}

function baseEvent(
  input: ValidatePlayerActionInput
): Omit<GameEvent, "type" | "payload"> {
  return {
    id: "pending",
    gameRoomId: input.gameRoomId,
    seq: 1,
    visibility: "public",
    actorId: input.actorPlayerId,
    createdAt: input.now.toISOString(),
  };
}

export function validatePlayerAction(
  input: ValidatePlayerActionInput
): GameEvent {
  assertAlive(input, input.actorPlayerId);

  if (input.action.kind === "saySpeech") {
    if (input.phase !== "day_speak") {
      throw new Error("Speech is only allowed during day_speak");
    }
    if (input.currentSpeakerPlayerId !== input.actorPlayerId) {
      throw new Error("Only the current speaker can speak");
    }
    if (input.action.speech.trim().length === 0) {
      throw new Error("Speech cannot be empty");
    }
    return {
      ...baseEvent(input),
      type: "speech_submitted",
      payload: { day: input.day, speech: input.action.speech.trim() },
    };
  }

  if (input.action.kind === "submitVote") {
    if (input.phase !== "day_vote") {
      throw new Error("Vote is only allowed during day_vote");
    }
    if (input.action.targetPlayerId === input.actorPlayerId) {
      throw new Error("Self vote is not allowed");
    }
    assertAlive(input, input.action.targetPlayerId);
    return {
      ...baseEvent(input),
      type: "vote_submitted",
      payload: {
        day: input.day,
        targetPlayerId: input.action.targetPlayerId,
      },
    };
  }

  return {
    ...baseEvent(input),
    visibility: "runtime",
    type: "night_action_submitted",
    payload: { day: input.day, phase: input.phase, action: input.action },
  };
}
