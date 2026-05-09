import {
  AppError,
  createGameRequestSchema,
  type CreateGameRequest,
  type GameEvent,
  type GamePhase,
  type Role,
} from "@werewolf/shared";
import {
  determineWinner,
  resolveDayVote,
  resolveNight,
  startGame,
  type PlayerPrivateState,
  type RoomProjection,
} from "@werewolf/engine";

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
  projection: RoomProjection | null;
  privateStates: PlayerPrivateState[];
  events: GameEvent[];
  pendingNightActions: RuntimeNightAction[];
  pendingVotes: Array<{ actorPlayerId: string; targetPlayerId: string }>;
  speechQueue: string[];
  tiePlayerIds: string[];
}

export interface StartedGame {
  room: StoredGameRoom;
  projection: RoomProjection;
  privateStates: PlayerPrivateState[];
  events: GameEvent[];
}

export interface RuntimeAgentTurnInput {
  agentId: string;
  playerId: string;
  displayName: string;
  role: Role;
  phase: GamePhase;
  prompt: string;
  tools: Record<string, unknown>;
}

export interface RuntimeTickResult {
  room: StoredGameRoom;
  projection: RoomProjection;
  events: GameEvent[];
  done: boolean;
}

type RuntimeNightAction =
  | { actorPlayerId: string; kind: "wolfKill"; targetPlayerId: string }
  | { actorPlayerId: string; kind: "guardProtect"; targetPlayerId: string }
  | { actorPlayerId: string; kind: "witchHeal"; targetPlayerId: string }
  | { actorPlayerId: string; kind: "witchPoison"; targetPlayerId: string }
  | { actorPlayerId: string; kind: "seerInspect"; targetPlayerId: string }
  | { actorPlayerId: string; kind: "passAction" };

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
      projection: null,
      privateStates: [],
      events: [],
      pendingNightActions: [],
      pendingVotes: [],
      speechQueue: [],
      tiePlayerIds: [],
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

  start(gameRoomId: string, userId: string): StartedGame {
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

    const started = startGame({
      gameRoomId: room.id,
      targetPlayerCount: room.targetPlayerCount,
      seats: activePlayers.map((player) => ({
        playerId: player.id,
        displayName: player.displayName,
        seatNo: player.seatNo,
        kind: player.kind,
      })),
      now: new Date(),
      shuffleSeed: room.id,
      timing: room.timing,
    });

    room.status = "active";
    room.projection = started.projection;
    room.privateStates = started.privateStates;
    room.events = this.assignAndAppendEvents(room, started.events);
    return {
      room,
      projection: room.projection,
      privateStates: room.privateStates,
      events: room.events.slice(-started.events.length),
    };
  }

  snapshot(gameRoomId: string): StoredGameRoom {
    const room = this.rooms.get(gameRoomId);
    if (!room) {
      throw new AppError("not_found", "Game room not found", 404);
    }
    return room;
  }

  async runtimeTick(
    gameRoomId: string,
    userId: string,
    runAgentTurn: (input: RuntimeAgentTurnInput) => Promise<string>
  ): Promise<RuntimeTickResult> {
    const room = this.rooms.get(gameRoomId);
    if (!room) {
      throw new AppError("not_found", "Game room not found", 404);
    }
    if (room.creatorUserId !== userId) {
      throw new AppError("forbidden", "Only creator can run runtime ticks", 403);
    }
    if (room.status !== "active" || !room.projection) {
      throw new AppError("conflict", "Game room is not active", 409);
    }

    const now = new Date();
    const before = room.events.length;

    if (room.projection.phase === "night_guard") {
      const guard = this.requireRolePlayer(room, "guard");
      const target = this.requireRolePlayer(room, "seer");
      this.recordNightAction(room, {
        actorPlayerId: guard.playerId,
        kind: "guardProtect",
        targetPlayerId: target.playerId,
      });
      this.startPhase(room, "night_wolf", now);
    } else if (room.projection.phase === "night_wolf") {
      const wolves = room.privateStates
        .filter((state) => state.role === "werewolf" && state.alive)
        .map((state) => state.playerId);
      const window = {
        gameRoomId: room.id,
        day: room.projection.day,
        phase: "night_wolf",
        visibility: "private:team:wolf",
        allowedSpeakerPlayerIds: wolves,
        openedAt: now.toISOString(),
      };
      this.assignAndAppendEvents(room, [
        {
          id: "pending",
          gameRoomId: room.id,
          seq: 1,
          type: "speech_submitted",
          visibility: "private:team:wolf",
          actorId: "runtime",
          payload: {
            day: room.projection.day,
            speech: "Wolf team discussion window opened.",
            window,
          },
          createdAt: now.toISOString(),
        },
      ]);
      const wolf = this.requireRolePlayer(room, "werewolf");
      const target = room.privateStates.find(
        (state) => state.team === "good" && state.alive
      );
      if (!target) throw new AppError("conflict", "No wolf target", 409);
      this.recordNightAction(room, {
        actorPlayerId: wolf.playerId,
        kind: "wolfKill",
        targetPlayerId: target.playerId,
      });
      this.startPhase(room, "night_witch_heal", now);
    } else if (room.projection.phase === "night_witch_heal") {
      const witch = this.requireRolePlayer(room, "witch");
      this.recordNightAction(room, {
        actorPlayerId: witch.playerId,
        kind: "passAction",
      });
      this.startPhase(room, "night_witch_poison", now);
    } else if (room.projection.phase === "night_witch_poison") {
      const witch = this.requireRolePlayer(room, "witch");
      this.recordNightAction(room, {
        actorPlayerId: witch.playerId,
        kind: "passAction",
      });
      this.startPhase(room, "night_seer", now);
    } else if (room.projection.phase === "night_seer") {
      const seer = this.requireRolePlayer(room, "seer");
      const wolf = this.requireRolePlayer(room, "werewolf");
      this.recordNightAction(room, {
        actorPlayerId: seer.playerId,
        kind: "seerInspect",
        targetPlayerId: wolf.playerId,
      });
      this.startPhase(room, "night_resolution", now);
    } else if (room.projection.phase === "night_resolution") {
      const resolved = resolveNight({
        gameRoomId: room.id,
        day: room.projection.day,
        alivePlayerIds: room.projection.alivePlayerIds,
        actions: room.pendingNightActions,
        now,
      });
      this.assignAndAppendEvents(room, resolved.events);
      this.markEliminated(room, resolved.eliminatedPlayerIds);
      room.pendingNightActions = [];
      this.startPhase(room, "day_speak", now);
      room.speechQueue = room.players
        .filter((player) => room.projection?.alivePlayerIds.includes(player.id))
        .sort((left, right) => left.seatNo - right.seatNo)
        .map((player) => player.id);
      room.projection.currentSpeakerPlayerId = room.speechQueue[0] ?? null;
    } else if (
      room.projection.phase === "day_speak" ||
      room.projection.phase === "tie_speech"
    ) {
      await this.runCurrentSpeaker(room, runAgentTurn, now);
      if (!room.projection.currentSpeakerPlayerId) {
        this.startPhase(
          room,
          room.projection.phase === "tie_speech" ? "tie_vote" : "day_vote",
          now
        );
      }
    } else if (
      room.projection.phase === "day_vote" ||
      room.projection.phase === "tie_vote"
    ) {
      const tiedOnly =
        room.projection.phase === "tie_vote" ? room.tiePlayerIds : undefined;
      room.pendingVotes = this.buildVotes(room, tiedOnly);
      const resolved = resolveDayVote({
        gameRoomId: room.id,
        day: room.projection.day,
        alivePlayerIds: room.projection.alivePlayerIds,
        ...(tiedOnly ? { allowedTargetPlayerIds: tiedOnly } : {}),
        votes: room.pendingVotes,
        now,
      });
      this.assignAndAppendEvents(
        room,
        room.pendingVotes.map((vote) => ({
          id: "pending",
          gameRoomId: room.id,
          seq: 1,
          type: "vote_submitted" as const,
          visibility: "public" as const,
          actorId: vote.actorPlayerId,
          subjectId: vote.targetPlayerId,
          payload: { day: room.projection?.day ?? 1, targetPlayerId: vote.targetPlayerId },
          createdAt: now.toISOString(),
        }))
      );
      this.assignAndAppendEvents(room, resolved.events);
      room.pendingVotes = [];
      if (resolved.exiledPlayerId) {
        this.markEliminated(room, [resolved.exiledPlayerId]);
        this.startPhase(room, "day_resolution", now);
      } else {
        room.tiePlayerIds = resolved.tiedPlayerIds;
        this.startPhase(room, "tie_speech", now);
        room.speechQueue = resolved.speechQueue;
        room.projection.currentSpeakerPlayerId = room.speechQueue[0] ?? null;
      }
    } else if (room.projection.phase === "day_resolution") {
      const winner = determineWinner(room.privateStates);
      if (winner) {
        this.assignAndAppendEvents(room, [
          {
            id: "pending",
            gameRoomId: room.id,
            seq: 1,
            type: "game_ended",
            visibility: "public",
            actorId: "runtime",
            payload: { day: room.projection.day, winner },
            createdAt: now.toISOString(),
          },
        ]);
        room.status = "ended";
        room.projection = {
          ...room.projection,
          status: "ended",
          phase: "post_game",
          winner,
          deadlineAt: null,
          currentSpeakerPlayerId: null,
        };
      } else {
        room.projection.day += 1;
        this.startPhase(room, "night_guard", now);
      }
    }

    return {
      room,
      projection: room.projection,
      events: room.events.slice(before),
      done: room.status === "ended",
    };
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

  private assignAndAppendEvents(
    room: StoredGameRoom,
    events: GameEvent[]
  ): GameEvent[] {
    const assigned = events.map((event, index) => {
      const seq = room.events.length + index + 1;
      return { ...event, id: `${room.id}_${seq}`, seq };
    });
    room.events.push(...assigned);
    return assigned;
  }

  private startPhase(
    room: StoredGameRoom,
    phase: GamePhase,
    now: Date
  ): void {
    if (!room.projection) throw new Error("projection is required");
    room.projection = {
      ...room.projection,
      phase,
      deadlineAt: null,
      currentSpeakerPlayerId: null,
      version: room.events.length + 1,
    };
    this.assignAndAppendEvents(room, [
      {
        id: "pending",
        gameRoomId: room.id,
        seq: 1,
        type: "phase_started",
        visibility: "public",
        actorId: "runtime",
        payload: { phase, day: room.projection.day, deadlineAt: null },
        createdAt: now.toISOString(),
      },
    ]);
  }

  private recordNightAction(
    room: StoredGameRoom,
    action: RuntimeNightAction
  ): void {
    if (!room.projection) throw new Error("projection is required");
    room.pendingNightActions.push(action);
    this.assignAndAppendEvents(room, [
      {
        id: "pending",
        gameRoomId: room.id,
        seq: 1,
        type: "night_action_submitted",
        visibility: "runtime",
        actorId: action.actorPlayerId,
        subjectId: "targetPlayerId" in action ? action.targetPlayerId : undefined,
        payload: { day: room.projection.day, phase: room.projection.phase, action },
        createdAt: new Date().toISOString(),
      },
    ]);
  }

  private async runCurrentSpeaker(
    room: StoredGameRoom,
    runAgentTurn: (input: RuntimeAgentTurnInput) => Promise<string>,
    now: Date
  ): Promise<void> {
    if (!room.projection?.currentSpeakerPlayerId) return;
    const playerId = room.projection.currentSpeakerPlayerId;
    const player = this.requirePlayer(room, playerId);
    const state = this.requirePrivateState(room, playerId);
    const agentId = player.userId ?? player.agentId ?? player.displayName;
    this.assignAndAppendEvents(room, [
      {
        id: "pending",
        gameRoomId: room.id,
        seq: 1,
        type: "agent_turn_started",
        visibility: "runtime",
        actorId: "runtime",
        subjectId: playerId,
        payload: { phase: room.projection.phase, playerId, agentId },
        createdAt: now.toISOString(),
      },
      {
        id: "pending",
        gameRoomId: room.id,
        seq: 1,
        type: "agent_llm_requested",
        visibility: "runtime",
        actorId: "runtime",
        subjectId: playerId,
        payload: { phase: room.projection.phase, playerId, agentId },
        createdAt: now.toISOString(),
      },
    ]);
    const speech = await runAgentTurn({
      agentId,
      playerId,
      displayName: player.displayName,
      role: state.role,
      phase: room.projection.phase,
      prompt: `You are ${player.displayName} in a Werewolf game. Speak briefly for ${room.projection.phase}. Your role is ${state.role}.`,
      tools: {},
    });
    this.assignAndAppendEvents(room, [
      {
        id: "pending",
        gameRoomId: room.id,
        seq: 1,
        type: "agent_llm_completed",
        visibility: "runtime",
        actorId: "runtime",
        subjectId: playerId,
        payload: { phase: room.projection.phase, playerId, agentId },
        createdAt: now.toISOString(),
      },
      {
        id: "pending",
        gameRoomId: room.id,
        seq: 1,
        type: "speech_submitted",
        visibility: "public",
        actorId: playerId,
        payload: { day: room.projection.day, speech },
        createdAt: now.toISOString(),
      },
    ]);
    room.speechQueue = room.speechQueue.filter((candidate) => candidate !== playerId);
    room.projection.currentSpeakerPlayerId = room.speechQueue[0] ?? null;
  }

  private buildVotes(
    room: StoredGameRoom,
    allowedTargetPlayerIds?: string[]
  ): Array<{ actorPlayerId: string; targetPlayerId: string }> {
    const wolf = room.privateStates.find(
      (state) => state.role === "werewolf" && state.alive
    );
    const allowedTargets = allowedTargetPlayerIds ?? room.projection?.alivePlayerIds ?? [];
    const fallbackTarget = allowedTargets[0];
    if (!fallbackTarget) return [];
    return (room.projection?.alivePlayerIds ?? []).map((playerId) => {
      if (wolf && playerId !== wolf.playerId && allowedTargets.includes(wolf.playerId)) {
        return { actorPlayerId: playerId, targetPlayerId: wolf.playerId };
      }
      const target =
        allowedTargets.find((candidate) => candidate !== playerId) ?? fallbackTarget;
      return { actorPlayerId: playerId, targetPlayerId: target };
    });
  }

  private markEliminated(room: StoredGameRoom, playerIds: string[]): void {
    if (!room.projection) throw new Error("projection is required");
    const eliminated = new Set(playerIds);
    room.privateStates = room.privateStates.map((state) =>
      eliminated.has(state.playerId) ? { ...state, alive: false } : state
    );
    room.projection = {
      ...room.projection,
      alivePlayerIds: room.projection.alivePlayerIds.filter(
        (playerId) => !eliminated.has(playerId)
      ),
    };
  }

  private requireRolePlayer(room: StoredGameRoom, role: Role): PlayerPrivateState {
    const player = room.privateStates.find(
      (state) => state.role === role && state.alive
    );
    if (!player) throw new AppError("conflict", `Missing alive ${role}`, 409);
    return player;
  }

  private requirePlayer(room: StoredGameRoom, playerId: string): StoredPlayer {
    const player = room.players.find((candidate) => candidate.id === playerId);
    if (!player) throw new AppError("not_found", "Player not found", 404);
    return player;
  }

  private requirePrivateState(
    room: StoredGameRoom,
    playerId: string
  ): PlayerPrivateState {
    const state = room.privateStates.find((candidate) => candidate.playerId === playerId);
    if (!state) throw new AppError("not_found", "Player state not found", 404);
    return state;
  }
}
