import { AppError, type GameEvent } from "@werewolf/shared";
import type {
  InMemoryGameService,
  PlayerSubmittedAction,
} from "../game-service";
import type { RoomActorDispatcher, RoomCommand } from "./types";

export class GameRoomActorDispatcher implements RoomActorDispatcher {
  private readonly actors = new Map<string, GameRoomActor>();

  constructor(private readonly games: InMemoryGameService) {}

  dispatch(command: RoomCommand): Promise<unknown> {
    return this.actorFor(command.gameRoomId).dispatch(command);
  }

  private actorFor(gameRoomId: string): GameRoomActor {
    const existing = this.actors.get(gameRoomId);
    if (existing) return existing;
    const actor = new GameRoomActor(this.games, gameRoomId);
    this.actors.set(gameRoomId, actor);
    return actor;
  }
}

class GameRoomActor {
  private queue: Promise<unknown> = Promise.resolve();
  private readonly commandResults = new Map<string, unknown>();

  constructor(
    private readonly games: InMemoryGameService,
    private readonly gameRoomId: string
  ) {}

  dispatch(command: RoomCommand): Promise<unknown> {
    if (command.gameRoomId !== this.gameRoomId) {
      throw new Error("command gameRoomId does not match actor room");
    }

    const previous = this.queue;
    const next = previous
      .catch(() => undefined)
      .then(async () => {
        const existing = this.commandResults.get(command.commandId);
        if (existing !== undefined) return structuredClone(existing);
        const result = await this.execute(command);
        this.commandResults.set(command.commandId, structuredClone(result));
        return result;
      });

    this.queue = next;
    return next;
  }

  private async execute(command: RoomCommand): Promise<unknown> {
    switch (command.kind) {
      case "join":
        return {
          player: this.games.join(
            command.gameRoomId,
            command.actorUserId,
            command.displayName,
            command.avatarUrl,
            command.seatNo
          ),
        };
      case "leave":
        return {
          player: this.games.leave(command.gameRoomId, command.actorUserId),
        };
      case "swapSeat":
        return this.games.swapSeat(
          command.gameRoomId,
          command.actorUserId,
          command.seatNo
        );
      case "addAgent":
        return {
          player: this.games.addAgentPlayer(
            command.gameRoomId,
            command.actorUserId,
            command.agentUserId,
            command.displayName,
            command.avatarUrl
          ),
        };
      case "removePlayer":
        return {
          player: this.games.removePlayer(
            command.gameRoomId,
            command.actorUserId,
            command.playerId
          ),
        };
      case "start":
        return this.start(command);
      case "submitAction":
        return this.submitAction(command);
      case "runtimeTick":
        return this.runtimeTick(command);
      case "agentTurn":
        await this.games.scheduleAdvance(command.gameRoomId);
        return { accepted: true };
      default:
        return assertNever(command);
    }
  }

  private start(command: Extract<RoomCommand, { kind: "start" }>): unknown {
    const started = this.games.start(command.gameRoomId, command.actorUserId);
    void this.games.scheduleAdvance(command.gameRoomId);
    const myPlayer = started.room.players.find(
      (player) => player.userId === command.actorUserId && !player.leftAt
    );
    const myPrivateState = myPlayer
      ? started.privateStates.find((state) => state.playerId === myPlayer.id)
      : undefined;
    return {
      status: started.room.status,
      projection: started.projection,
      privateStates: myPrivateState ? [myPrivateState] : [],
      events: filterEventsForUser(
        started.events,
        myPlayer?.id,
        Boolean(myPrivateState?.team === "wolf" && myPrivateState.alive),
        started.room.status === "ended"
      ),
    };
  }

  private async submitAction(
    command: Extract<RoomCommand, { kind: "submitAction" }>
  ): Promise<unknown> {
    const room = this.games.snapshot(command.gameRoomId);
    const player = room.players.find(
      (candidate) => candidate.userId === command.actorUserId && !candidate.leftAt
    );
    if (!player) {
      throw new AppError("not_found", "You are not in this room", 404);
    }
    const event = await this.games.submitAction(
      command.gameRoomId,
      player.id,
      command.action as PlayerSubmittedAction
    );
    return { success: true, event };
  }

  private async runtimeTick(
    command: Extract<RoomCommand, { kind: "runtimeTick" }>
  ): Promise<unknown> {
    const beforeRoom = this.games.snapshot(command.gameRoomId);
    const myPlayer = beforeRoom.players.find(
      (player) => player.userId === command.actorUserId && !player.leftAt
    );
    const isCreator = beforeRoom.creatorUserId === command.actorUserId;
    if (!myPlayer && !isCreator) {
      throw new AppError("not_found", "You are not in this room", 404);
    }
    const myPrivateState = beforeRoom.privateStates.find(
      (state) => state.playerId === myPlayer?.id
    );
    const beforeSeq = beforeRoom.events.length;

    await this.games.scheduleAdvance(command.gameRoomId);

    const room = this.games.snapshot(command.gameRoomId);
    const revealAll = room.status === "ended" || room.projection?.status === "ended";
    const isWolf = myPrivateState?.team === "wolf" && myPrivateState.alive;
    const events = filterEventsForUser(
      room.events.slice(beforeSeq),
      myPlayer?.id,
      Boolean(isWolf),
      revealAll
    );
    return {
      status: room.status,
      done: room.status === "ended",
      projection: room.projection,
      events,
    };
  }
}

function filterEventsForUser(
  events: GameEvent[],
  myPlayerId: string | undefined,
  isWolf: boolean,
  revealAll = false
): GameEvent[] {
  return events.filter((event) => {
    if (event.visibility === "runtime") return false;
    if (revealAll) return true;
    if (event.visibility === "public") return true;
    if (event.visibility === "private:team:wolf") return isWolf;
    if (event.visibility.startsWith("private:user:")) {
      return event.visibility === `private:user:${myPlayerId}`;
    }
    return false;
  });
}

function assertNever(value: never): never {
  throw new Error(`Unhandled room command: ${JSON.stringify(value)}`);
}
