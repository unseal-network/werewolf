import type { GameEvent } from "@werewolf/shared";

export interface EventRepository {
  append(gameRoomId: string, events: GameEvent[]): Promise<GameEvent[]>;
  listAfter(gameRoomId: string, afterSeq: number): Promise<GameEvent[]>;
}

export function createInMemoryRepositories(): { events: EventRepository } {
  const eventsByRoom = new Map<string, GameEvent[]>();
  return {
    events: {
      async append(gameRoomId, events) {
        const existing = eventsByRoom.get(gameRoomId) ?? [];
        const nextEvents = events.map((event, index) => ({
          ...event,
          id:
            event.id === "pending"
              ? `evt_${gameRoomId}_${existing.length + index + 1}`
              : event.id,
          seq: existing.length + index + 1,
        }));
        eventsByRoom.set(gameRoomId, [...existing, ...nextEvents]);
        return nextEvents;
      },
      async listAfter(gameRoomId, afterSeq) {
        return (eventsByRoom.get(gameRoomId) ?? []).filter(
          (event) => event.seq > afterSeq
        );
      },
    },
  };
}
