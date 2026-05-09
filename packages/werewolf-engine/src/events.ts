import type { GameEvent } from "@werewolf/shared";

export function withAssignedEventIds(
  events: GameEvent[],
  startSeq: number,
  idPrefix: string
): GameEvent[] {
  return events.map((event, index) => ({
    ...event,
    id: `${idPrefix}_${startSeq + index}`,
    seq: startSeq + index,
  }));
}
