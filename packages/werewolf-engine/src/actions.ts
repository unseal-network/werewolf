import type { GameEvent, GamePhase, Role } from "@werewolf/shared";
import type { PlayerAction } from "./commands";
import type { NightAction } from "./night";
import type { PlayerPrivateState } from "./state";

export interface ValidatePlayerActionInput {
  gameRoomId: string;
  day: number;
  phase: GamePhase;
  actorPlayerId: string;
  currentSpeakerPlayerId: string | null;
  alivePlayerIds: string[];
  eliminatedPlayerIds: string[];
  action: PlayerAction;
  privateStates?: PlayerPrivateState[];
  submittedNightActions?: NightAction[];
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

const phaseToNightAction: Partial<Record<GamePhase, PlayerAction["kind"]>> = {
  night_guard: "guardProtect",
  night_wolf: "wolfKill",
  night_witch_heal: "witchHeal",
  night_witch_poison: "witchPoison",
  night_seer: "seerInspect",
};

const phaseToRole: Partial<Record<GamePhase, Role>> = {
  night_guard: "guard",
  night_wolf: "werewolf",
  night_witch_heal: "witch",
  night_witch_poison: "witch",
  night_seer: "seer",
};

function requirePrivateState(
  input: ValidatePlayerActionInput,
  playerId: string
): PlayerPrivateState {
  const state = input.privateStates?.find((candidate) => candidate.playerId === playerId);
  if (!state) {
    throw new Error(`Private state for ${playerId} is required`);
  }
  return state;
}

function validateNightAction(input: ValidatePlayerActionInput): void {
  const expectedAction = phaseToNightAction[input.phase];
  if (!expectedAction) {
    throw new Error("Night action is only allowed during night phases");
  }
  if (input.action.kind !== expectedAction) {
    throw new Error(`${input.action.kind} is not allowed during ${input.phase}`);
  }
  if (!("targetPlayerId" in input.action)) {
    throw new Error("Night action target is required");
  }
  assertAlive(input, input.action.targetPlayerId);
  if (
    input.action.targetPlayerId === input.actorPlayerId &&
    input.action.kind !== "guardProtect" &&
    input.action.kind !== "wolfKill" &&
    input.action.kind !== "witchHeal"
  ) {
    throw new Error("Cannot target yourself");
  }

  const actorState = requirePrivateState(input, input.actorPlayerId);
  if (actorState.role !== phaseToRole[input.phase]) {
    throw new Error("You do not have the role for this action");
  }
  requirePrivateState(input, input.action.targetPlayerId);
  if (input.phase === "night_witch_heal") {
    if (!actorState.witchItems?.healAvailable) {
      throw new Error("Heal item is not available");
    }
  }
  if (input.phase === "night_witch_poison" && !actorState.witchItems?.poisonAvailable) {
    throw new Error("Poison item is not available");
  }

  const alreadyActed = input.submittedNightActions?.some(
    (action) =>
      action.actorPlayerId === input.actorPlayerId &&
      action.day === input.day &&
      action.phase === input.phase
  );
  if (alreadyActed) {
    throw new Error("You have already acted this phase");
  }
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
      subjectId: input.action.targetPlayerId,
      payload: {
        day: input.day,
        targetPlayerId: input.action.targetPlayerId,
      },
    };
  }

  validateNightAction(input);
  return {
    ...baseEvent(input),
    visibility: "runtime",
    type: "night_action_submitted",
    payload: { day: input.day, phase: input.phase, action: input.action },
  };
}
