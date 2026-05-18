import type { RoomProjection } from "../api/client";

export interface ActionExpectation {
  expectedPhase?: string | null;
  expectedDay?: number;
}

export function buildActionExpectation(
  projection: RoomProjection | null
): ActionExpectation {
  const expectation: ActionExpectation = {};
  if (projection?.phase !== undefined) expectation.expectedPhase = projection.phase;
  if (projection?.day !== undefined) expectation.expectedDay = projection.day;
  return expectation;
}
