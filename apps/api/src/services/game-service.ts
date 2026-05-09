import {
  AppError,
  createGameRequestSchema,
  type CreateGameRequest,
} from "@werewolf/shared";

export interface StoredPlayer {
  id: string;
  kind: "user" | "agent";
  userId?: string;
  agentId?: string;
  displayName: string;
  seatNo: number;
  ready: boolean;
  onlineState: "online" | "offline";
  leftAt: string | null;
}

export interface StoredGameRoom {
  id: string;
  creatorUserId: string;
  title: string;
  status: "waiting" | "active" | "paused" | "ended";
  targetPlayerCount: number;
  timing: CreateGameRequest["timing"];
  createdFromMatrixRoomId: string;
  allowedSourceMatrixRoomIds: string[];
  agentSourceMatrixRoomId: string;
  players: StoredPlayer[];
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
      players: [],
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

  join(gameRoomId: string, userId: string, displayName: string): StoredPlayer {
    const room = this.requireWaitingRoom(gameRoomId);
    const existing = room.players.find((player) => player.userId === userId);
    if (existing) {
      existing.leftAt = null;
      existing.onlineState = "online";
      return existing;
    }
    const player: StoredPlayer = {
      id: `player_${room.players.length + 1}`,
      kind: "user",
      userId,
      displayName,
      seatNo: room.players.length + 1,
      ready: true,
      onlineState: "online",
      leftAt: null,
    };
    room.players.push(player);
    return player;
  }

  leave(gameRoomId: string, userId: string): StoredPlayer {
    const room = this.requireWaitingRoom(gameRoomId);
    const player = room.players.find(
      (candidate) => candidate.userId === userId && !candidate.leftAt
    );
    if (!player) {
      throw new AppError("not_found", "Player is not in this room", 404);
    }
    player.leftAt = new Date().toISOString();
    player.onlineState = "offline";
    return player;
  }

  start(gameRoomId: string, userId: string): StoredGameRoom {
    const room = this.requireWaitingRoom(gameRoomId);
    if (room.creatorUserId !== userId) {
      throw new AppError("forbidden", "Only creator can start the game", 403);
    }
    const activePlayers = room.players.filter((player) => !player.leftAt);
    if (activePlayers.length !== room.targetPlayerCount) {
      throw new AppError(
        "conflict",
        `Need ${room.targetPlayerCount} active players to start`,
        409
      );
    }
    room.status = "active";
    return room;
  }

  private requireWaitingRoom(gameRoomId: string): StoredGameRoom {
    const room = this.rooms.get(gameRoomId);
    if (!room) {
      throw new AppError("not_found", "Game room not found", 404);
    }
    if (room.status !== "waiting") {
      throw new AppError("conflict", "Game room is not waiting", 409);
    }
    return room;
  }
}
