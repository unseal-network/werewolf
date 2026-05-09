import type { GameEvent } from "@werewolf/shared";

export interface DrizzleEventAppendPlan {
  lockKey: string;
  insertCount: number;
}

export function createDrizzleEventRepositorySql(
  gameRoomId: string,
  insertCount: number
): DrizzleEventAppendPlan {
  return {
    lockKey: `events:${gameRoomId}`,
    insertCount,
  };
}

export interface DrizzleEventRepository {
  append(gameRoomId: string, events: GameEvent[]): Promise<GameEvent[]>;
  listAfter(gameRoomId: string, afterSeq: number): Promise<GameEvent[]>;
}
