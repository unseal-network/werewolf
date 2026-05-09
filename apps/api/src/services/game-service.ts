import {
  createGameRequestSchema,
  type CreateGameRequest,
} from "@werewolf/shared";

export interface StoredGameRoom {
  id: string;
  creatorUserId: string;
  title: string;
  status: "waiting";
  targetPlayerCount: number;
  timing: CreateGameRequest["timing"];
  createdFromMatrixRoomId: string;
  allowedSourceMatrixRoomIds: string[];
  agentSourceMatrixRoomId: string;
}

export class InMemoryGameService {
  private rooms = new Map<string, StoredGameRoom>();
  private nextId = 1;

  createGame(
    input: unknown,
    creatorUserId: string
  ): { room: StoredGameRoom; card: Record<string, unknown> } {
    const parsed = createGameRequestSchema.parse(input);
    const id = `game_${this.nextId}`;
    this.nextId += 1;
    const room: StoredGameRoom = {
      id,
      creatorUserId,
      title: parsed.title,
      status: "waiting",
      targetPlayerCount: parsed.targetPlayerCount,
      timing: parsed.timing,
      createdFromMatrixRoomId: parsed.sourceMatrixRoomId,
      allowedSourceMatrixRoomIds: parsed.allowedSourceMatrixRoomIds,
      agentSourceMatrixRoomId:
        parsed.agentSourceMatrixRoomId ?? parsed.sourceMatrixRoomId,
    };
    this.rooms.set(id, room);
    return {
      room,
      card: {
        gameRoomId: id,
        sourceMatrixRoomId: parsed.sourceMatrixRoomId,
        title: parsed.title,
        targetPlayerCount: parsed.targetPlayerCount,
        webUrl: `/games/${id}?sourceMatrixRoomId=${encodeURIComponent(
          parsed.sourceMatrixRoomId
        )}`,
      },
    };
  }

  getGame(gameRoomId: string): StoredGameRoom | null {
    return this.rooms.get(gameRoomId) ?? null;
  }
}
