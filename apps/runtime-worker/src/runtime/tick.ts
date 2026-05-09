import type { RoomProjection } from "@werewolf/engine";

export type RuntimeAction =
  | { kind: "noop" }
  | { kind: "close_phase"; gameRoomId: string; phase: string; day: number };

export interface ComputeNextRuntimeActionInput {
  now: Date;
  projection: RoomProjection;
}

export function computeNextRuntimeAction(
  input: ComputeNextRuntimeActionInput
): RuntimeAction {
  if (input.projection.status !== "active") {
    return { kind: "noop" };
  }
  if (!input.projection.deadlineAt) {
    return { kind: "noop" };
  }
  if (new Date(input.projection.deadlineAt).getTime() > input.now.getTime()) {
    return { kind: "noop" };
  }
  return {
    kind: "close_phase",
    gameRoomId: input.projection.gameRoomId,
    phase: input.projection.phase,
    day: input.projection.day,
  };
}
