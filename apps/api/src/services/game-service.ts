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
  validatePlayerAction,
  type PlayerPrivateState,
  type RoomProjection,
} from "@werewolf/engine";
import { buildAgentTurnTools } from "@werewolf/agent-client";
import { buildAgentContext } from "./agent-context";
import type { SseBroker } from "./sse-broker";
import type { VoiceAgentRegistry } from "./voice-agent";
import type { GameStore } from "./game-store";

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
  joinedAt?: string;
}

export interface StoredGameRoom {
  id: string;
  creatorUserId: string;
  title: string;
  status: "waiting" | "active" | "paused" | "ended";
  targetPlayerCount: number;
  language: CreateGameRequest["language"];
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

export interface RuntimeAgentTurnResult {
  text: string;
  toolName?: string | undefined;
  input?: Record<string, unknown> | undefined;
  /**
   * Set to true when the LLM call failed and the engine had to use a
   * placeholder "did not act before deadline" speech instead of a real
   * response. Used to skip TTS playback for these turns (which would just
   * waste up to the 120s speak timeout trying to synthesize speech for an
   * agent_id that doesn't exist on the TTS gateway either).
   */
  fallback?: boolean;
}

export type RuntimeAgentTurnOutput = string | RuntimeAgentTurnResult;

export interface RuntimeTickResult {
  room: StoredGameRoom;
  projection: RoomProjection;
  events: GameEvent[];
  done: boolean;
}

export interface DeadlineGuard {
  phase: GamePhase;
  version: number;
  deadlineAt: string;
}

type RuntimeNightAction =
  | { actorPlayerId: string; kind: "wolfKill"; targetPlayerId: string }
  | { actorPlayerId: string; kind: "guardProtect"; targetPlayerId: string }
  | { actorPlayerId: string; kind: "witchHeal"; targetPlayerId: string }
  | { actorPlayerId: string; kind: "witchPoison"; targetPlayerId: string }
  | { actorPlayerId: string; kind: "seerInspect"; targetPlayerId: string }
  | { actorPlayerId: string; kind: "passAction" };

export type PlayerSubmittedAction =
  | { kind: "speech"; speech: string }
  | { kind: "speechComplete" }
  | { kind: "vote"; targetPlayerId: string }
  | { kind: "nightAction"; targetPlayerId: string }
  | { kind: "pass" };

const absentNightActorAutoAdvanceMs = 15_000;

export class InMemoryGameService {
  private rooms = new Map<string, StoredGameRoom>();
  private advanceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private advancing = new Map<string, boolean>();
  private runAgentTurnImpl: ((input: RuntimeAgentTurnInput) => Promise<RuntimeAgentTurnOutput>) | null = null;
  private broker: SseBroker | null = null;
  private voiceAgents: VoiceAgentRegistry | null = null;
  private store: GameStore | null = null;

  setBroker(broker: SseBroker) {
    this.broker = broker;
  }

  setVoiceAgents(registry: VoiceAgentRegistry) {
    this.voiceAgents = registry;
  }

  /**
   * Wire a persistent store. Once set, every mutation also writes through
   * to the DB (best-effort, fire-and-forget so DB latency doesn't slow the
   * game loop). Recovery on restart goes via `hydrateFromStore()`.
   */
  setStore(store: GameStore) {
    this.store = store;
  }

  /**
   * Load all non-ended rooms from the store into the in-memory cache.
   * Caller should invoke this once at process startup, BEFORE the tick
   * worker begins polling, so the cache is warm when ticks fire.
   */
  async hydrateFromStore(): Promise<string[]> {
    if (!this.store) return [];
    const rooms = await this.store.loadActiveRooms();
    for (const room of rooms) {
      this.rooms.set(room.id, room);
    }
    return rooms.map((r) => r.id);
  }

  /**
   * Fire-and-forget persistence of the room's full state. Errors are
   * logged but never re-thrown — a transient DB hiccup must not stall the
   * game-state machine. Called at the end of every public mutation.
   */
  private persistRoom(room: StoredGameRoom): void {
    if (!this.store) return;
    const store = this.store;
    const snapshot = structuredClone(room);
    void store
      .saveSnapshot(snapshot)
      .catch((err) => console.error("[Store] persistRoom failed:", err));
  }

  setRunAgentTurn(impl: (input: RuntimeAgentTurnInput) => Promise<RuntimeAgentTurnOutput>) {
    this.runAgentTurnImpl = impl;
  }

  createGame(
    input: unknown,
    creatorUserId: string
  ): { room: StoredGameRoom; card: Record<string, unknown> } {
    const parsed = createGameRequestSchema.parse(input);
    // Use a timestamp + random suffix so game IDs are globally unique across
    // server restarts. A pure counter resets to 1 on each restart and reuses
    // old IDs, which confuses anyone with a stale URL.
    const id = `game_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 6)}`;
    const room: StoredGameRoom = {
      id,
      creatorUserId,
      title: parsed.title,
      status: "waiting",
      targetPlayerCount: parsed.targetPlayerCount ?? 12,
      language: parsed.language,
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
    this.persistRoom(room);
    return {
      room,
      card: {
        gameRoomId: id,
        sourceMatrixRoomId: parsed.sourceMatrixRoomId,
        title: parsed.title,
        targetPlayerCount: parsed.targetPlayerCount ?? 12,
        language: parsed.language,
        webUrl: `/games/${id}?sourceMatrixRoomId=${encodeURIComponent(
          parsed.sourceMatrixRoomId
        )}`,
      },
    };
  }

  getGame(gameRoomId: string): StoredGameRoom | null {
    return this.rooms.get(gameRoomId) ?? null;
  }

  /**
   * Find the smallest seat number 1..targetPlayerCount that is NOT already
   * occupied (active or left — we don't reuse player.ids). `players.length+1`
   * is wrong because seat swaps can leave gaps: after moving from seat 1 to
   * seat 7, the next agent must NOT pick seatNo=5 because that would collide
   * with the player at seat 5 once the count math catches up.
   */
  private nextAvailableSeatNo(room: StoredGameRoom): number {
    const taken = new Set(
      room.players.filter((player) => !player.leftAt).map((p) => p.seatNo)
    );
    for (let n = 1; n <= room.targetPlayerCount; n += 1) {
      if (!taken.has(n)) return n;
    }
    throw new AppError("conflict", "Room is full", 409);
  }

  join(gameRoomId: string, userId: string, displayName: string): StoredPlayer {
    const room = this.requireWaitingRoom(gameRoomId);
    const activeCount = room.players.filter((player) => !player.leftAt).length;
    if (activeCount >= 12) {
      throw new AppError("conflict", "Room is full (max 12 players)", 409);
    }
    const existing = room.players.find((player) => player.userId === userId);
    if (existing) {
      const activeAtOldSeat = room.players.some(
        (player) =>
          player.id !== existing.id &&
          !player.leftAt &&
          player.seatNo === existing.seatNo
      );
      if (!activeAtOldSeat) {
        existing.leftAt = null;
        existing.onlineState = "online";
        this.persistRoom(room);
        return existing;
      }
      room.players = room.players.filter((player) => player.id !== existing.id);
    }
    const seatNo = this.nextAvailableSeatNo(room);
    room.players = room.players.filter(
      (player) => !(player.leftAt && player.seatNo === seatNo)
    );
    const player: StoredPlayer = {
      id: `player_${seatNo}`,
      kind: "user",
      userId,
      displayName,
      seatNo,
      ready: true,
      onlineState: "online",
      leftAt: null,
      joinedAt: new Date().toISOString(),
    };
    room.players.push(player);
    this.persistRoom(room);
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
    this.persistRoom(room);
    return player;
  }

  addAgentPlayer(
    gameRoomId: string,
    callerUserId: string,
    agentUserId: string,
    displayName: string
  ): StoredPlayer {
    const room = this.requireWaitingRoom(gameRoomId);
    if (room.creatorUserId !== callerUserId) {
      throw new AppError("forbidden", "Only creator can add agent players", 403);
    }
    const existing = room.players.find(
      (candidate) => candidate.agentId === agentUserId
    );
    if (existing) {
      const activeAtOldSeat = room.players.some(
        (player) =>
          player.id !== existing.id &&
          !player.leftAt &&
          player.seatNo === existing.seatNo
      );
      if (!existing.leftAt || !activeAtOldSeat) {
        existing.leftAt = null;
        existing.onlineState = "online";
        this.persistRoom(room);
        return existing;
      }
      room.players = room.players.filter((player) => player.id !== existing.id);
    }
    const activeCount = room.players.filter((player) => !player.leftAt).length;
    if (activeCount >= room.targetPlayerCount) {
      throw new AppError("conflict", "Room is full", 409);
    }
    const seatNo = this.nextAvailableSeatNo(room);
    room.players = room.players.filter(
      (player) => !(player.leftAt && player.seatNo === seatNo)
    );
    const player: StoredPlayer = {
      id: `player_${seatNo}`,
      kind: "agent",
      agentId: agentUserId,
      displayName: displayName || agentUserId,
      seatNo,
      ready: true,
      onlineState: "online",
      leftAt: null,
      joinedAt: new Date().toISOString(),
    };
    room.players.push(player);
    this.persistRoom(room);
    return player;
  }

  removePlayer(
    gameRoomId: string,
    callerUserId: string,
    playerId: string
  ): StoredPlayer {
    const room = this.requireWaitingRoom(gameRoomId);
    if (room.creatorUserId !== callerUserId) {
      throw new AppError("forbidden", "Only creator can remove players", 403);
    }
    const player = room.players.find(
      (candidate) => candidate.id === playerId && !candidate.leftAt
    );
    if (!player) {
      throw new AppError("not_found", "Player not found in room", 404);
    }
    player.leftAt = new Date().toISOString();
    player.onlineState = "offline";
    this.persistRoom(room);
    return player;
  }

  /**
   * Move the caller to seat `targetSeatNo`. Server validates whether the
   * caller can enter that slot:
   *   - Empty target: user moves, their old player slot is freed.
   *   - Occupied by another player: identity DATA is swapped (id/seatNo
   *     pairs stay put — player_N.seatNo always == N — but who SITS at each
   *     slot changes). Picks an effective "swap" UX without violating the
   *     id→seat invariant.
   *   - Self-seat: no-op.
   *   - Outside [1, targetPlayerCount]: rejected with `invalid_action`.
   *
   * On success, a public `player_seat_changed` event is appended so other
   * clients learn about the move via the event stream (no need for a manual
   * room refetch — the SSE consumer treats it as a projection-shaping event
   * and refreshes the seat layout).
   */
  swapSeat(
    gameRoomId: string,
    callerUserId: string,
    targetSeatNo: number
  ): { player: StoredPlayer; swappedWith: StoredPlayer | null } {
    const room = this.requireWaitingRoom(gameRoomId);
    const caller = room.players.find(
      (candidate) => candidate.userId === callerUserId && !candidate.leftAt
    );
    if (!caller) {
      throw new AppError("not_found", "You are not in this room", 404);
    }
    if (!Number.isInteger(targetSeatNo) || targetSeatNo < 1) {
      throw new AppError("invalid_action", "Invalid seat number", 400);
    }
    if (targetSeatNo > room.targetPlayerCount) {
      throw new AppError(
        "invalid_action",
        `Seat ${targetSeatNo} is outside the room limit (1-${room.targetPlayerCount})`,
        400
      );
    }
    if (caller.seatNo === targetSeatNo) {
      return { player: caller, swappedWith: null };
    }

    const fromSeatNo = caller.seatNo;
    const occupant = room.players.find(
      (candidate) =>
        candidate.seatNo === targetSeatNo && !candidate.leftAt && candidate.id !== caller.id
    );

    if (occupant) {
      // Swap identity DATA between the two slots. player.id / seatNo stay
      // pinned to their seat slot so player_N.seatNo == N still holds.
      const callerSnapshot = {
        kind: caller.kind,
        userId: caller.userId,
        agentId: caller.agentId,
        displayName: caller.displayName,
      };
      caller.kind = occupant.kind;
      caller.displayName = occupant.displayName;
      if (occupant.userId !== undefined) caller.userId = occupant.userId;
      else delete caller.userId;
      if (occupant.agentId !== undefined) caller.agentId = occupant.agentId;
      else delete caller.agentId;
      occupant.kind = callerSnapshot.kind;
      occupant.displayName = callerSnapshot.displayName;
      if (callerSnapshot.userId !== undefined) occupant.userId = callerSnapshot.userId;
      else delete occupant.userId;
      if (callerSnapshot.agentId !== undefined) occupant.agentId = callerSnapshot.agentId;
      else delete occupant.agentId;
      // The "caller record" is now at the target seat; "occupant record" is
      // back at the original seat. Return the post-swap views.
      this.emitSeatChangedEvent(room, {
        fromSeatNo,
        toSeatNo: targetSeatNo,
        movedUserId: callerUserId,
        movedDisplayName: occupant.displayName, // caller's displayName before the swap
        displacedSeatNo: fromSeatNo,
        displacedPlayerId: caller.id,
        displacedDisplayName: caller.displayName,
      });
      this.persistRoom(room);
      return { player: occupant, swappedWith: caller };
    }

    // Empty target: delete caller's old slot record and re-add them at the
    // target seat. This keeps `player_<seatNo>` matching `seatNo` while
    // letting the old slot truly become empty. Also drop any stale record
    // sitting at targetSeatNo (e.g., a player who left earlier) so the
    // (room, seat) unique index doesn't trip.
    const moved: StoredPlayer = {
      id: `player_${targetSeatNo}`,
      kind: caller.kind,
      displayName: caller.displayName,
      seatNo: targetSeatNo,
      ready: caller.ready,
      onlineState: caller.onlineState,
      leftAt: null,
      ...(caller.userId !== undefined ? { userId: caller.userId } : {}),
      ...(caller.agentId !== undefined ? { agentId: caller.agentId } : {}),
      ...(caller.joinedAt !== undefined ? { joinedAt: caller.joinedAt } : {}),
    };
    room.players = room.players.filter(
      (p) => p.id !== caller.id && p.seatNo !== targetSeatNo
    );
    room.players.push(moved);

    this.emitSeatChangedEvent(room, {
      fromSeatNo,
      toSeatNo: targetSeatNo,
      movedUserId: callerUserId,
      movedDisplayName: moved.displayName,
    });
    this.persistRoom(room);
    return { player: moved, swappedWith: null };
  }

  private emitSeatChangedEvent(
    room: StoredGameRoom,
    move: {
      fromSeatNo: number;
      toSeatNo: number;
      movedUserId: string;
      movedDisplayName: string;
      displacedSeatNo?: number;
      displacedPlayerId?: string;
      displacedDisplayName?: string;
    }
  ): void {
    this.assignAndAppendEvents(room, [
      {
        id: "pending",
        gameRoomId: room.id,
        seq: 1,
        type: "player_seat_changed",
        visibility: "public",
        actorId: `player_${move.toSeatNo}`,
        subjectId:
          move.displacedPlayerId !== undefined
            ? move.displacedPlayerId
            : undefined,
        payload: {
          fromSeatNo: move.fromSeatNo,
          toSeatNo: move.toSeatNo,
          movedUserId: move.movedUserId,
          movedDisplayName: move.movedDisplayName,
          ...(move.displacedSeatNo !== undefined
            ? {
                displacedSeatNo: move.displacedSeatNo,
                displacedPlayerId: move.displacedPlayerId,
                displacedDisplayName: move.displacedDisplayName,
              }
            : {}),
        },
        createdAt: new Date().toISOString(),
      },
    ]);
  }

  start(gameRoomId: string, userId: string): StartedGame {
    const room = this.requireWaitingRoom(gameRoomId);
    if (room.creatorUserId !== userId) {
      throw new AppError("forbidden", "Only creator can start the game", 403);
    }
    const activePlayers = room.players.filter((player) => !player.leftAt);
    if (activePlayers.length < 6) {
      throw new AppError(
        "conflict",
        `Need at least 6 active players to start (currently ${activePlayers.length})`,
        409
      );
    }
    if (activePlayers.length > 12) {
      throw new AppError(
        "conflict",
        `Cannot start with more than 12 players (currently ${activePlayers.length})`,
        409
      );
    }

    const started = startGame({
      gameRoomId: room.id,
      targetPlayerCount: activePlayers.length,
      seats: activePlayers.map((player) => ({
        playerId: player.id,
        displayName: player.displayName,
        seatNo: player.seatNo,
        kind: player.kind,
      })),
      now: new Date(),
      shuffleSeed: `${room.id}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      timing: room.timing,
    });

    room.status = "active";
    room.projection = started.projection;
    room.privateStates = started.privateStates;
    room.events = this.assignAndAppendEvents(room, started.events);

    // Lazily connect the voice agent for this room. Best-effort: if LiveKit
    // or the Unseal gateway is unavailable, the game still works via text.
    // Once connected, register each player's Unseal agent_id so STT/TTS use
    // the same per-player id we already pass to the LLM `generate` endpoint.
    if (this.voiceAgents) {
      const registry = this.voiceAgents;
      void registry
        .getOrCreate(gameRoomId)
        .then((voiceAgent) => {
          for (const player of room.players) {
            if (player.leftAt) continue;
            voiceAgent.registerPlayerAgentId(
              player.id,
              resolvePlayerAgentId(player)
            );
          }
        })
        .catch((err) => console.error("[VoiceAgent] getOrCreate failed:", err));
    }

    if (this.store) {
      void this.store
        .setRoomLifecycle(room.id, { startedAt: new Date() })
        .catch((err) => console.error("[Store] setRoomLifecycle failed:", err));
    }
    this.persistRoom(room);

    return {
      room,
      projection: room.projection,
      privateStates: room.privateStates,
      events: room.events.slice(-started.events.length),
    };
  }

  async submitAction(
    gameRoomId: string,
    playerId: string,
    action: PlayerSubmittedAction
  ): Promise<GameEvent> {
    const room = this.rooms.get(gameRoomId);
    if (!room) {
      throw new AppError("not_found", "Game room not found", 404);
    }
    if (room.status !== "active" || !room.projection) {
      throw new AppError("conflict", "Game is not active", 409);
    }
    const player = this.requirePlayer(room, playerId);
    if (player.leftAt) {
      throw new AppError("forbidden", "Player has left the game", 403);
    }
    if (!room.projection.alivePlayerIds.includes(playerId)) {
      throw new AppError("forbidden", "Player is eliminated", 403);
    }

    const phase = room.projection.phase;
    const now = new Date();

    if (action.kind === "speech") {
      const privateState = this.requirePrivateState(room, playerId);
      const isWolfDiscussion =
        phase === "night_wolf" && privateState.role === "werewolf";
      if (phase !== "day_speak" && phase !== "tie_speech" && !isWolfDiscussion) {
        throw new AppError("invalid_phase", "Speech not allowed in this phase", 400);
      }
      if (!isWolfDiscussion && room.projection.currentSpeakerPlayerId !== playerId) {
        throw new AppError("invalid_action", "Not your turn to speak", 400);
      }
      const event = isWolfDiscussion
        ? {
            ...this.baseEvent(room, playerId, "private:team:wolf"),
            type: "speech_submitted" as const,
            payload: {
              day: room.projection.day,
              phase: "night_wolf",
              speech: action.speech,
            },
          }
        : validatePlayerAction({
            gameRoomId,
            day: room.projection.day,
            phase,
            actorPlayerId: playerId,
            currentSpeakerPlayerId: room.projection.currentSpeakerPlayerId,
            alivePlayerIds: room.projection.alivePlayerIds,
            eliminatedPlayerIds: room.privateStates
              .filter((s) => !s.alive)
              .map((s) => s.playerId),
            action: { kind: "saySpeech", speech: action.speech },
            now,
      });
      if (!isWolfDiscussion) {
        this.advanceSpeechSpeaker(room, playerId, now);
      }
      const [assigned] = this.assignAndAppendEvents(room, [event]);
      this.resetPlayerTranscript(gameRoomId, playerId);
      void this.scheduleAdvance(gameRoomId);
      return assigned!;
    }

    if (action.kind === "speechComplete") {
      if (phase !== "day_speak" && phase !== "tie_speech") {
        throw new AppError("invalid_phase", "Speech complete not allowed in this phase", 400);
      }
      if (room.projection.currentSpeakerPlayerId !== playerId) {
        throw new AppError("invalid_action", "Not your turn to speak", 400);
      }
      // Flush the player's STT transcript buffer and write it as a speech event
      let transcript = "";
      if (this.voiceAgents) {
        const agent = this.voiceAgents.get(gameRoomId);
        if (agent) {
          transcript = await agent.flushPlayerTranscript(playerId);
        }
      }
      const speechText = transcript.trim() || `${player.displayName} fell silent.`;
      const event = validatePlayerAction({
        gameRoomId,
        day: room.projection.day,
        phase,
        actorPlayerId: playerId,
        currentSpeakerPlayerId: room.projection.currentSpeakerPlayerId,
        alivePlayerIds: room.projection.alivePlayerIds,
        eliminatedPlayerIds: room.privateStates
          .filter((s) => !s.alive)
          .map((s) => s.playerId),
        action: { kind: "saySpeech", speech: speechText },
        now,
      });
      this.advanceSpeechSpeaker(room, playerId, now);
      this.assignAndAppendEvents(room, [event]);
      void this.scheduleAdvance(gameRoomId);
      return event;
    }

    if (action.kind === "vote") {
      if (phase !== "day_vote" && phase !== "tie_vote") {
        throw new AppError("invalid_phase", "Vote not allowed in this phase", 400);
      }
      if (!action.targetPlayerId) {
        throw new AppError("invalid_action", "Vote target is required", 400);
      }
      if (action.targetPlayerId === playerId) {
        throw new AppError("invalid_action", "Self vote is not allowed", 400);
      }
      if (!room.projection.alivePlayerIds.includes(action.targetPlayerId)) {
        throw new AppError("invalid_action", "Target is not alive", 400);
      }
      if (phase === "tie_vote" && !room.tiePlayerIds.includes(action.targetPlayerId)) {
        throw new AppError("invalid_action", "Target is not a tied candidate", 400);
      }
      const alreadyVoted = room.pendingVotes.some((v) => v.actorPlayerId === playerId);
      if (alreadyVoted) {
        throw new AppError("conflict", "You have already voted", 409);
      }
      const event = validatePlayerAction({
        gameRoomId,
        day: room.projection.day,
        phase,
        actorPlayerId: playerId,
        currentSpeakerPlayerId: room.projection.currentSpeakerPlayerId,
        alivePlayerIds: room.projection.alivePlayerIds,
        eliminatedPlayerIds: room.privateStates
          .filter((s) => !s.alive)
          .map((s) => s.playerId),
        action: { kind: "submitVote", targetPlayerId: action.targetPlayerId },
        now,
      });
      room.pendingVotes.push({ actorPlayerId: playerId, targetPlayerId: action.targetPlayerId });
      const [assigned] = this.assignAndAppendEvents(room, [event]);
      void this.scheduleAdvance(gameRoomId);
      return assigned!;
    }

    if (action.kind === "nightAction") {
      const nightPhases: GamePhase[] = [
        "night_guard",
        "night_wolf",
        "night_witch_heal",
        "night_witch_poison",
        "night_seer",
      ];
      if (!nightPhases.includes(phase)) {
        throw new AppError("invalid_phase", "Night action not allowed in this phase", 400);
      }
      if (!action.targetPlayerId) {
        throw new AppError("invalid_action", "Target is required", 400);
      }
      if (!room.projection.alivePlayerIds.includes(action.targetPlayerId)) {
        throw new AppError("invalid_action", "Target is not alive", 400);
      }
      if (action.targetPlayerId === playerId) {
        throw new AppError("invalid_action", "Cannot target yourself", 400);
      }
      const privateState = this.requirePrivateState(room, playerId);
      const phaseToRole: Partial<Record<GamePhase, Role>> = {
        night_guard: "guard",
        night_wolf: "werewolf",
        night_witch_heal: "witch",
        night_witch_poison: "witch",
        night_seer: "seer",
      };
      if (privateState.role !== phaseToRole[phase]) {
        throw new AppError("forbidden", "You do not have the role for this action", 403);
      }
      if (phase === "night_witch_heal" && !privateState.witchItems?.healAvailable) {
        throw new AppError("invalid_action", "Heal item is not available", 400);
      }
      if (phase === "night_witch_heal") {
        const wolfKill = room.pendingNightActions.find(
          (nightAction): nightAction is Extract<RuntimeNightAction, { kind: "wolfKill" }> =>
            nightAction.kind === "wolfKill"
        );
        if (!wolfKill) {
          throw new AppError("invalid_action", "No wolf kill target to heal", 400);
        }
        if (action.targetPlayerId !== wolfKill.targetPlayerId) {
          throw new AppError("invalid_action", "Witch can only heal tonight's wolf target", 400);
        }
      }
      if (phase === "night_witch_poison" && !privateState.witchItems?.poisonAvailable) {
        throw new AppError("invalid_action", "Poison item is not available", 400);
      }
      const alreadyActed = room.pendingNightActions.some(
        (a) => a.actorPlayerId === playerId
      );
      if (alreadyActed) {
        throw new AppError("conflict", "You have already acted this phase", 409);
      }
      const kindMap: Partial<Record<GamePhase, RuntimeNightAction["kind"]>> = {
        night_guard: "guardProtect",
        night_wolf: "wolfKill",
        night_witch_heal: "witchHeal",
        night_witch_poison: "witchPoison",
        night_seer: "seerInspect",
      };
      const nightActionKind = kindMap[phase];
      if (!nightActionKind) {
        throw new AppError("invalid_phase", "Invalid night phase", 400);
      }
      const nightAction = {
        actorPlayerId: playerId,
        kind: nightActionKind,
        targetPlayerId: action.targetPlayerId,
      } as RuntimeNightAction;
      this.recordNightAction(room, nightAction);
      void this.scheduleAdvance(gameRoomId);
      return room.events[room.events.length - 1]!;
    }

    if (action.kind === "pass") {
      if (phase === "day_vote" || phase === "tie_vote") {
        const alreadyVoted = room.pendingVotes.some((v) => v.actorPlayerId === playerId);
        if (alreadyVoted) {
          throw new AppError("conflict", "You have already voted", 409);
        }
        room.pendingVotes.push({ actorPlayerId: playerId, targetPlayerId: "" });
        this.assignAndAppendEvents(room, [
          {
            ...this.baseEvent(room, playerId, "public"),
            type: "vote_submitted",
            subjectId: undefined,
            payload: { day: room.projection.day, targetPlayerId: "" },
          },
        ]);
        void this.scheduleAdvance(gameRoomId);
        return room.events[room.events.length - 1]!;
      }
      if (phase === "day_speak" || phase === "tie_speech") {
        if (room.projection.currentSpeakerPlayerId !== playerId) {
          throw new AppError("invalid_action", "Not your turn to speak", 400);
        }
        this.advanceSpeechSpeaker(room, playerId, now);
        this.assignAndAppendEvents(room, [
          {
            ...this.baseEvent(room, playerId, "public"),
            type: "speech_submitted",
            payload: { day: room.projection.day, speech: `${player.displayName} chose to remain silent.` },
          },
        ]);
        this.resetPlayerTranscript(gameRoomId, playerId);
        void this.scheduleAdvance(gameRoomId);
        return room.events[room.events.length - 1]!;
      }
      const nightPhases: GamePhase[] = [
        "night_guard",
        "night_wolf",
        "night_witch_heal",
        "night_witch_poison",
        "night_seer",
      ];
      if (nightPhases.includes(phase)) {
        const alreadyActed = room.pendingNightActions.some(
          (a) => a.actorPlayerId === playerId
        );
        if (alreadyActed) {
          throw new AppError("conflict", "You have already acted this phase", 409);
        }
        this.recordNightAction(room, { actorPlayerId: playerId, kind: "passAction" });
        void this.scheduleAdvance(gameRoomId);
        return room.events[room.events.length - 1]!;
      }
      throw new AppError("invalid_phase", "Pass not allowed in this phase", 400);
    }

    throw new AppError("invalid_action", "Unknown action kind", 400);
  }

  async scheduleAdvance(gameRoomId: string): Promise<void> {
    if (this.advancing.get(gameRoomId)) return; // prevent concurrent advancement
    this.advancing.set(gameRoomId, true);

    try {
      const existing = this.advanceTimers.get(gameRoomId);
      if (existing) {
        clearTimeout(existing);
        this.advanceTimers.delete(gameRoomId);
      }

      if (!this.runAgentTurnImpl) return;

      const room = this.rooms.get(gameRoomId);
      if (!room || room.status !== "active" || !room.projection) return;

      // Keep advancing until we hit a human player turn or game ends
      let safety = 0;
      while (safety < 20) {
        safety++;
        if (room.status !== "active" || !room.projection) break;
        const beforeEvents = room.events.length;
        const beforeStatus = room.status;
        await this.advanceGame(gameRoomId, this.runAgentTurnImpl);
        const advanced =
          room.events.length > beforeEvents ||
          room.status !== beforeStatus;
        if (!advanced) break; // Stuck at human player turn
      }

      // Persist whatever the room looks like after the advance batch — the
      // tick worker (or the deadline setTimeout below) will read next_tick_at
      // back from the DB to drive the next turn even after a restart.
      this.persistRoom(room);
      if ((room.status as StoredGameRoom["status"]) === "ended" && this.store) {
        void this.store
          .setRoomLifecycle(room.id, { endedAt: new Date() })
          .catch((err) =>
            console.error("[Store] setRoomLifecycle endedAt failed:", err)
          );
      }

      // Set deadline timer if still waiting for a human player
      if (room.status === "active" && room.projection?.deadlineAt) {
        const deadlineMs = new Date(room.projection.deadlineAt).getTime();
        const nowMs = Date.now();
        if (deadlineMs > nowMs) {
          const guard: DeadlineGuard = {
            phase: room.projection.phase,
            version: room.projection.version,
            deadlineAt: room.projection.deadlineAt,
          };
          const timer = setTimeout(() => {
            void this.scheduleDeadlineAdvance(gameRoomId, guard);
          }, deadlineMs - nowMs);
          this.advanceTimers.set(gameRoomId, timer);
        } else {
          // Deadline passed, try advancing again
          void this.scheduleAdvance(gameRoomId);
        }
      }
    } finally {
      this.advancing.set(gameRoomId, false);
    }
  }

  async scheduleDeadlineAdvance(
    gameRoomId: string,
    expected?: DeadlineGuard
  ): Promise<boolean> {
    const room = this.rooms.get(gameRoomId);
    if (!room || room.status !== "active" || !room.projection?.deadlineAt) {
      return false;
    }
    if (expected) {
      if (
        room.projection.phase !== expected.phase ||
        room.projection.version !== expected.version ||
        room.projection.deadlineAt !== expected.deadlineAt
      ) {
        return false;
      }
    }
    if (new Date(room.projection.deadlineAt).getTime() > Date.now()) {
      return false;
    }
    await this.scheduleAdvance(gameRoomId);
    return true;
  }

  snapshot(gameRoomId: string): StoredGameRoom {
    const room = this.rooms.get(gameRoomId);
    if (!room) {
      throw new AppError("not_found", "Game room not found", 404);
    }
    return room;
  }

  async advanceGame(
    gameRoomId: string,
    runAgentTurn: (input: RuntimeAgentTurnInput) => Promise<RuntimeAgentTurnOutput>
  ): Promise<RuntimeTickResult> {
    const room = this.rooms.get(gameRoomId);
    if (!room) {
      throw new AppError("not_found", "Game room not found", 404);
    }
    if (room.status !== "active" || !room.projection) {
      throw new AppError("conflict", "Game room is not active", 409);
    }

    const now = new Date();
    const before = room.events.length;

    if (room.projection.phase === "night_guard") {
      const guard = this.findRolePlayer(room, "guard");
      if (guard) {
        const player = this.requirePlayer(room, guard.playerId);
        if (player.kind === "user") {
          const pending = room.pendingNightActions.find(
            (a) => a.actorPlayerId === guard.playerId
          );
          if (!pending) {
            if (!this.deadlinePassed(room, now)) {
              return this.tickResult(room, before);
            }
            this.recordNightAction(room, {
              actorPlayerId: guard.playerId,
              kind: "passAction",
            });
          }
        } else {
          const target = this.findRolePlayer(room, "seer");
          const targetPlayer = target ? room.players.find((p) => p.id === target.playerId) : undefined;
          await this.runNightAgentAction(
            room,
            guard.playerId,
            runAgentTurn,
            now,
            targetPlayer
              ? `Use guardProtect on ${targetPlayer.displayName} (seat ${targetPlayer.seatNo}). You must respond by calling one tool.`
              : "Use passAction. You must respond by calling one tool."
          );
        }
      } else if (!this.advanceAfterAbsentNightActor(room, "night_wolf", now)) {
        return this.tickResult(room, before);
      }
      this.startPhase(room, "night_wolf", now);
    } else if (room.projection.phase === "night_wolf") {
      const wolves = room.privateStates
        .filter((state) => state.role === "werewolf" && state.alive)
        .map((state) => state.playerId);

      // Check if any human wolf hasn't acted yet; if so, wait like other night phases
      const pendingHumanWolves = wolves.filter((id) => {
        const player = room.players.find((p) => p.id === id);
        if (player?.kind !== "user") return false;
        const acted = room.pendingNightActions.some(
          (a) =>
            a.actorPlayerId === id &&
            (a.kind === "wolfKill" || a.kind === "passAction")
        );
        return !acted;
      });
      if (pendingHumanWolves.length > 0) {
        if (!this.deadlinePassed(room, now)) {
          // Publish discussion window event once
          const hasWindowEvent = room.events.some(
            (e) =>
              e.type === "speech_submitted" &&
              e.visibility === "private:team:wolf" &&
              e.actorId === "runtime" &&
              String(e.payload?.speech) === "Wolf team discussion window opened." &&
              Number(e.payload?.day) === room.projection?.day
          );
          if (!hasWindowEvent) {
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
          }
          return this.tickResult(room, before);
        }
        // Deadline passed — auto-pass pending human wolves
        for (const id of pendingHumanWolves) {
          this.recordNightAction(room, {
            actorPlayerId: id,
            kind: "passAction",
          });
        }
      }

      await this.runWolfDiscussion(room, wolves, runAgentTurn, now);
      await this.runWolfKillVote(room, wolves, runAgentTurn, now);
      this.revealWolfKillToWitch(room, now);
      this.startPhase(room, "night_witch_heal", now);
    } else if (room.projection.phase === "night_witch_heal") {
      const witch = this.findRolePlayer(room, "witch");
      if (witch) {
        const player = this.requirePlayer(room, witch.playerId);
        if (player.kind === "user") {
          const pending = room.pendingNightActions.find(
            (a) => a.actorPlayerId === witch.playerId
          );
          if (!pending) {
            if (!this.deadlinePassed(room, now)) {
              return this.tickResult(room, before);
            }
            this.recordNightAction(room, {
              actorPlayerId: witch.playerId,
              kind: "passAction",
            });
          }
        } else {
          await this.runNightAgentAction(
            room,
            witch.playerId,
            runAgentTurn,
            now,
            "Use passAction unless you are certain healing changes the outcome. You must respond by calling one tool."
          );
        }
      } else if (
        !this.advanceAfterAbsentNightActor(room, "night_witch_poison", now)
      ) {
        return this.tickResult(room, before);
      }
      this.startPhase(room, "night_witch_poison", now);
    } else if (room.projection.phase === "night_witch_poison") {
      const witch = this.findRolePlayer(room, "witch");
      if (witch) {
        const player = this.requirePlayer(room, witch.playerId);
        if (player.kind === "user") {
          const pending = room.pendingNightActions.find(
            (a) => a.actorPlayerId === witch.playerId
          );
          if (!pending) {
            if (!this.deadlinePassed(room, now)) {
              return this.tickResult(room, before);
            }
            this.recordNightAction(room, {
              actorPlayerId: witch.playerId,
              kind: "passAction",
            });
          }
        } else {
          await this.runNightAgentAction(
            room,
            witch.playerId,
            runAgentTurn,
            now,
            "Use passAction for poison tonight. You must respond by calling one tool."
          );
        }
      } else if (!this.advanceAfterAbsentNightActor(room, "night_seer", now)) {
        return this.tickResult(room, before);
      }
      this.startPhase(room, "night_seer", now);
    } else if (room.projection.phase === "night_seer") {
      const seer = this.findRolePlayer(room, "seer");
      if (seer) {
        const player = this.requirePlayer(room, seer.playerId);
        if (player.kind === "user") {
          const pending = room.pendingNightActions.find(
            (a) => a.actorPlayerId === seer.playerId
          );
          if (!pending) {
            if (!this.deadlinePassed(room, now)) {
              return this.tickResult(room, before);
            }
            this.recordNightAction(room, {
              actorPlayerId: seer.playerId,
              kind: "passAction",
            });
          }
        } else {
          const wolf = this.findRolePlayer(room, "werewolf");
          const wolfPlayer = wolf ? room.players.find((p) => p.id === wolf.playerId) : undefined;
          await this.runNightAgentAction(
            room,
            seer.playerId,
            runAgentTurn,
            now,
            wolfPlayer
              ? `Use seerInspect on ${wolfPlayer.displayName} (seat ${wolfPlayer.seatNo}). You must respond by calling one tool.`
              : "Use passAction. You must respond by calling one tool."
          );
        }
      } else if (
        !this.advanceAfterAbsentNightActor(room, "night_resolution", now)
      ) {
        return this.tickResult(room, before);
      }
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
      const voteResult = await this.runAgentVotes(
        room,
        runAgentTurn,
        now,
        tiedOnly
      );
      if (voteResult === null) {
        return this.tickResult(room, before);
      }
      room.pendingVotes = voteResult;
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
        room.pendingVotes
          .filter(
            (vote) =>
              !room.events.some(
                (event) =>
                  event.type === "vote_submitted" &&
                  event.actorId === vote.actorPlayerId &&
                  Number(event.payload?.day) === room.projection?.day
              )
          )
          .map((vote) => ({
            id: "pending",
            gameRoomId: room.id,
            seq: 1,
            type: "vote_submitted" as const,
            visibility: "public" as const,
            actorId: vote.actorPlayerId,
            subjectId: vote.targetPlayerId || undefined,
            payload: { day: room.projection?.day ?? 1, targetPlayerId: vote.targetPlayerId },
            createdAt: now.toISOString(),
          }))
      );
      this.assignAndAppendEvents(room, resolved.events);
      room.pendingVotes = [];
      if (resolved.exiledPlayerId) {
        this.markEliminated(room, [resolved.exiledPlayerId]);
        this.startPhase(room, "day_resolution", now);
      } else if (resolved.tiedPlayerIds.length > 0) {
        room.tiePlayerIds = resolved.tiedPlayerIds;
        this.startPhase(room, "tie_speech", now);
        room.speechQueue = resolved.speechQueue;
        room.projection.currentSpeakerPlayerId = room.speechQueue[0] ?? null;
      } else {
        this.startPhase(room, "day_resolution", now);
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
        // Tear down voice agent when the game ends.
        if (this.voiceAgents) {
          void this.voiceAgents
            .destroy(gameRoomId)
            .catch((err) => console.error("[VoiceAgent] destroy failed:", err));
        }
      } else {
        room.projection.day += 1;
        this.startPhase(room, "night_guard", now);
      }
    }

    return this.tickResult(room, before);
  }

  private tickResult(room: StoredGameRoom, before: number): RuntimeTickResult {
    if (!room.projection) throw new Error("projection is required");
    return {
      room,
      projection: room.projection,
      events: room.events.slice(before),
      done: room.status === "ended",
    };
  }

  async autoAdvance(
    gameRoomId: string,
    runAgentTurn: (input: RuntimeAgentTurnInput) => Promise<RuntimeAgentTurnOutput>
  ): Promise<void> {
    let safety = 0;
    while (safety < 20) {
      safety++;
      const result = await this.advanceGame(gameRoomId, runAgentTurn);
      if (result.done) break;
      // Stop if no progress was made (human player turn or waiting)
      if (result.events.length === 0) break;
    }
  }

  private deadlinePassed(room: StoredGameRoom, now: Date): boolean {
    if (!room.projection?.deadlineAt) return true;
    return new Date(room.projection.deadlineAt).getTime() <= now.getTime();
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

  private requireActiveRoom(gameRoomId: string): StoredGameRoom {
    const room = this.rooms.get(gameRoomId);
    if (!room) {
      throw new AppError("not_found", "Game room not found", 404);
    }
    if (room.status !== "active" || !room.projection) {
      throw new AppError("conflict", "Game is not active", 409);
    }
    return room;
  }

  private baseEvent(
    room: StoredGameRoom,
    actorId: string,
    visibility: GameEvent["visibility"]
  ): Omit<GameEvent, "type" | "payload"> {
    return {
      id: "pending",
      gameRoomId: room.id,
      seq: 1,
      visibility,
      actorId,
      createdAt: new Date().toISOString(),
    };
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
    if (this.broker) {
      for (const event of assigned) {
        this.broker.publish(room.id, event.seq, event);
      }
    }
    // Persist async — events table has (room, seq) UNIQUE so duplicates
    // from retries are silently ignored.
    if (this.store && assigned.length > 0) {
      const store = this.store;
      const snapshot = structuredClone(room);
      void store
        .saveSnapshot(snapshot, assigned)
        .catch((err) => console.error("[Store] appendEvents failed:", err));
    }
    return assigned;
  }

  private startPhase(
    room: StoredGameRoom,
    phase: GamePhase,
    now: Date
  ): void {
    if (!room.projection) throw new Error("projection is required");
    const deadlineAt = this.deadlineForPhase(room, phase, now);
    room.projection = {
      ...room.projection,
      phase,
      deadlineAt,
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
        payload: { phase, day: room.projection.day, deadlineAt },
        createdAt: now.toISOString(),
      },
    ]);
  }

  private deadlineForPhase(
    room: StoredGameRoom,
    phase: GamePhase,
    now: Date
  ): string | null {
    const seconds =
      phase === "night_resolution" || phase === "day_resolution"
        ? 1
        : phase.startsWith("night_")
          ? room.timing.nightActionSeconds
          : phase === "day_speak" || phase === "tie_speech"
            ? room.timing.speechSeconds
            : phase === "day_vote" || phase === "tie_vote"
              ? room.timing.voteSeconds
              : 1;
    return seconds ? new Date(now.getTime() + seconds * 1000).toISOString() : null;
  }

  private advanceAfterAbsentNightActor(
    room: StoredGameRoom,
    _nextPhase: GamePhase,
    now: Date
  ): boolean {
    if (!room.projection) throw new Error("projection is required");
    const currentDeadline = room.projection.deadlineAt
      ? new Date(room.projection.deadlineAt).getTime()
      : null;
    const absentDeadline = now.getTime() + absentNightActorAutoAdvanceMs;
    if (!currentDeadline || currentDeadline > absentDeadline) {
      room.projection = {
        ...room.projection,
        deadlineAt: new Date(absentDeadline).toISOString(),
      };
      return false;
    }
    if (currentDeadline > now.getTime()) {
      return false;
    }
    return true;
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
        visibility: `private:user:${action.actorPlayerId}`,
        actorId: action.actorPlayerId,
        subjectId: "targetPlayerId" in action ? action.targetPlayerId : undefined,
        payload: { day: room.projection.day, phase: room.projection.phase, action },
        createdAt: new Date().toISOString(),
      },
    ]);
    if (action.kind === "seerInspect") {
      const inspected = this.requirePrivateState(room, action.targetPlayerId);
      this.assignAndAppendEvents(room, [
        {
          id: "pending",
          gameRoomId: room.id,
          seq: 1,
          type: "seer_result_revealed",
          visibility: `private:user:${action.actorPlayerId}`,
          actorId: "runtime",
          subjectId: action.targetPlayerId,
          payload: {
            day: room.projection.day,
            seerPlayerId: action.actorPlayerId,
            inspectedPlayerId: action.targetPlayerId,
            alignment: inspected.team === "wolf" ? "wolf" : "good",
          },
          createdAt: new Date().toISOString(),
        },
      ]);
    }
  }

  private async runWolfDiscussion(
    room: StoredGameRoom,
    wolfPlayerIds: string[],
    runAgentTurn: (input: RuntimeAgentTurnInput) => Promise<RuntimeAgentTurnOutput>,
    now: Date
  ): Promise<void> {
    for (const playerId of wolfPlayerIds) {
      // Skip wolves that already acted (human wolves who submitted their vote)
      const alreadyActed = room.pendingNightActions.some(
        (a) =>
          a.actorPlayerId === playerId &&
          (a.kind === "wolfKill" || a.kind === "passAction")
      );
      if (alreadyActed) continue;

      const player = this.requirePlayer(room, playerId);
      const state = this.requirePrivateState(room, playerId);
      const result = await this.runAgentToolTurn(room, player, state, runAgentTurn, now, {
        prompt: `${this.languageInstruction(room)} You are ${player.displayName}, a werewolf. Speak briefly to your wolf teammates about tonight's kill target before the team acts.`,
        tools: {
          saySpeech: {
            description: "Say a private speech to the wolf team.",
            inputSchema: {
              type: "object",
              properties: { speech: { type: "string", minLength: 1 } },
              required: ["speech"],
              additionalProperties: false,
            },
          },
        },
      });
      const speech = stringValue(result.input?.speech) ?? result.text;
      this.assignAndAppendEvents(room, [
        {
          id: "pending",
          gameRoomId: room.id,
          seq: 1,
          type: "speech_submitted",
          visibility: "private:team:wolf",
          actorId: playerId,
          payload: { day: room.projection?.day ?? 1, phase: "night_wolf", speech },
          createdAt: now.toISOString(),
        },
      ]);
    }
  }

  private async runWolfKillVote(
    room: StoredGameRoom,
    wolfPlayerIds: string[],
    runAgentTurn: (input: RuntimeAgentTurnInput) => Promise<RuntimeAgentTurnOutput>,
    now: Date
  ): Promise<void> {
    if (!room.projection) throw new Error("projection is required");
    // Start with existing human wolf votes already recorded in pendingNightActions
    const existingVotes = room.pendingNightActions
      .filter(
        (a): a is Extract<RuntimeNightAction, { kind: "wolfKill" }> =>
          a.kind === "wolfKill" &&
          a.actorPlayerId !== "wolf_team" &&
          wolfPlayerIds.includes(a.actorPlayerId)
      )
      .map((a) => ({
        actorPlayerId: a.actorPlayerId,
        targetPlayerId: a.targetPlayerId,
      }));
    const votes: Array<{ actorPlayerId: string; targetPlayerId: string }> = [
      ...existingVotes,
    ];
    const fallbackTarget = room.privateStates.find(
      (state) => state.team === "good" && state.alive
    );
    if (!fallbackTarget) throw new AppError("conflict", "No wolf target", 409);
    const fallbackTargetPlayer = room.players.find((p) => p.id === fallbackTarget.playerId);

    for (const playerId of wolfPlayerIds) {
      // Skip wolves that already voted (human wolves who submitted their target)
      const alreadyVoted = votes.some((v) => v.actorPlayerId === playerId);
      if (alreadyVoted) continue;

      // Skip human wolves who were auto-passed after deadline
      const player = this.requirePlayer(room, playerId);
      if (player.kind === "user") {
        const passed = room.pendingNightActions.some(
          (a) => a.actorPlayerId === playerId && a.kind === "passAction"
        );
        if (passed) continue;
      }

      const state = this.requirePrivateState(room, playerId);
      const fallbackName = fallbackTargetPlayer
        ? `${fallbackTargetPlayer.displayName} (seat ${fallbackTargetPlayer.seatNo})`
        : fallbackTarget.playerId;
      const result = await this.runAgentToolTurn(room, player, state, runAgentTurn, now, {
        prompt: `${this.languageInstruction(room)} Wolf team voting phase. Use wolfKill on the player you vote to kill tonight. Suggested target: ${fallbackName}.`,
      });
      const targetPlayerId = stringValue(result.input?.targetPlayerId);
      if (
        result.toolName === "wolfKill" &&
        targetPlayerId &&
        room.projection.alivePlayerIds.includes(targetPlayerId) &&
        this.requirePrivateState(room, targetPlayerId).team === "good"
      ) {
        votes.push({ actorPlayerId: playerId, targetPlayerId });
        this.assignAndAppendEvents(room, [
          {
            id: "pending",
            gameRoomId: room.id,
            seq: 1,
            type: "wolf_vote_submitted",
            visibility: "private:team:wolf",
            actorId: playerId,
            subjectId: targetPlayerId,
            payload: {
              day: room.projection.day,
              targetPlayerId,
            },
            createdAt: now.toISOString(),
          },
        ]);
      }
    }

    const tally: Record<string, number> = {};
    for (const vote of votes) {
      tally[vote.targetPlayerId] = (tally[vote.targetPlayerId] ?? 0) + 1;
    }
    const sorted = Object.entries(tally).sort((left, right) => right[1] - left[1]);
    const top = sorted[0];
    const second = sorted[1];
    const tiedPlayerIds =
      top && second && top[1] === second[1]
        ? sorted
            .filter((entry) => entry[1] === top[1])
            .map(([playerId]) => playerId)
            .sort()
        : [];
    const targetPlayerId = top && tiedPlayerIds.length === 0 ? top[0] : null;
    this.assignAndAppendEvents(room, [
      {
        id: "pending",
        gameRoomId: room.id,
        seq: 1,
        type: "wolf_vote_resolved",
        visibility: "private:team:wolf",
        actorId: "runtime",
        subjectId: targetPlayerId ?? undefined,
        payload: {
          day: room.projection.day,
          tally,
          targetPlayerId,
          tiedPlayerIds,
          valid: Boolean(targetPlayerId),
        },
        createdAt: now.toISOString(),
      },
    ]);

    // Remove individual wolfKill entries before adding the resolved team kill
    room.pendingNightActions = room.pendingNightActions.filter(
      (a) => !(a.kind === "wolfKill" && a.actorPlayerId !== "wolf_team")
    );

    if (targetPlayerId) {
      room.pendingNightActions.push({
        actorPlayerId: "wolf_team",
        kind: "wolfKill",
        targetPlayerId,
      });
      this.assignAndAppendEvents(room, [
        {
          id: "pending",
          gameRoomId: room.id,
          seq: 1,
          type: "night_action_submitted",
          visibility: "private:team:wolf",
          actorId: "wolf_team",
          subjectId: targetPlayerId,
          payload: {
            day: room.projection.day,
            phase: room.projection.phase,
            action: { actorPlayerId: "wolf_team", kind: "wolfKill", targetPlayerId },
          },
          createdAt: now.toISOString(),
        },
      ]);
    }
  }

  private async runNightAgentAction(
    room: StoredGameRoom,
    playerId: string,
    runAgentTurn: (input: RuntimeAgentTurnInput) => Promise<RuntimeAgentTurnOutput>,
    now: Date,
    instruction: string
  ): Promise<void> {
    if (!room.projection) throw new Error("projection is required");
    const player = this.requirePlayer(room, playerId);
    const state = this.requirePrivateState(room, playerId);
    const result = await this.runAgentToolTurn(room, player, state, runAgentTurn, now, {
      prompt: [
        this.languageInstruction(room),
        `You are ${player.displayName} in a Werewolf game.`,
        `Your role is ${state.role}. Current phase is ${room.projection.phase}.`,
        instruction,
      ].join(" "),
    });
    const action = this.nightActionFromTool(room, playerId, result);
    this.recordNightAction(room, action);
  }

  private nightActionFromTool(
    room: StoredGameRoom,
    actorPlayerId: string,
    result: RuntimeAgentTurnResult
  ): RuntimeNightAction {
    if (!room.projection) throw new Error("projection is required");
    const targetPlayerId = stringValue(result.input?.targetPlayerId);
    if (result.toolName === "passAction" || !result.toolName) {
      return { actorPlayerId, kind: "passAction" };
    }

    const phaseToTool: Partial<Record<GamePhase, RuntimeNightAction["kind"]>> = {
      night_guard: "guardProtect",
      night_wolf: "wolfKill",
      night_witch_heal: "witchHeal",
      night_witch_poison: "witchPoison",
      night_seer: "seerInspect",
    };
    const expectedTool = phaseToTool[room.projection.phase];
    if (result.toolName !== expectedTool || !targetPlayerId) {
      return { actorPlayerId, kind: "passAction" };
    }
    if (!room.projection.alivePlayerIds.includes(targetPlayerId)) {
      return { actorPlayerId, kind: "passAction" };
    }
    return { actorPlayerId, kind: expectedTool, targetPlayerId } as RuntimeNightAction;
  }

  private async runAgentVotes(
    room: StoredGameRoom,
    runAgentTurn: (input: RuntimeAgentTurnInput) => Promise<RuntimeAgentTurnOutput>,
    now: Date,
    allowedTargetPlayerIds?: string[]
  ): Promise<Array<{ actorPlayerId: string; targetPlayerId: string }> | null> {
    if (!room.projection) throw new Error("projection is required");
    const votes: Array<{ actorPlayerId: string; targetPlayerId: string }> = [...room.pendingVotes];
    const allowedTargets = allowedTargetPlayerIds ?? room.projection.alivePlayerIds;
    const wolf = room.privateStates.find(
      (state) => state.role === "werewolf" && state.alive
    );

    for (const playerId of room.projection.alivePlayerIds) {
      const alreadyVoted = votes.some((v) => v.actorPlayerId === playerId);
      if (alreadyVoted) continue;

      const player = this.requirePlayer(room, playerId);

      if (player.kind === "user") {
        if (!this.deadlinePassed(room, now)) {
          return null; // waiting for human player
        }
        continue; // deadline passed, skip vote
      }

      const state = this.requirePrivateState(room, playerId);
      const suggestedTargetId =
        wolf && state.role !== "werewolf" && allowedTargets.includes(wolf.playerId)
          ? wolf.playerId
          : allowedTargets.find((candidate) => candidate !== playerId) ??
            allowedTargets[0];
      if (!suggestedTargetId) continue;
      const suggestedTargetPlayer = room.players.find((p) => p.id === suggestedTargetId);
      const suggestedTargetName = suggestedTargetPlayer
        ? `${suggestedTargetPlayer.displayName} (seat ${suggestedTargetPlayer.seatNo})`
        : suggestedTargetId;
      const allowedTargetNames = allowedTargets
        .map((id) => {
          const p = room.players.find((pl) => pl.id === id);
          return p ? `${p.displayName} (seat ${p.seatNo})` : id;
        })
        .join(", ");
      const result = await this.runAgentToolTurn(room, player, state, runAgentTurn, now, {
        prompt: [
          `You are ${player.displayName} in a Werewolf game. Your role is ${state.role}.`,
          this.languageInstruction(room),
          room.projection.phase === "tie_vote"
            ? `This is a tie revote. Allowed exile targets are: ${allowedTargetNames}.`
            : `This is the public exile vote.`,
          `Use submitVote on ${suggestedTargetName}. You must respond by calling one tool.`,
        ].join(" "),
      });
      const targetPlayerId = stringValue(result.input?.targetPlayerId);
      if (
        result.toolName === "submitVote" &&
        targetPlayerId &&
        targetPlayerId !== playerId &&
        allowedTargets.includes(targetPlayerId)
      ) {
        votes.push({ actorPlayerId: playerId, targetPlayerId });
      }
    }
    return votes;
  }

  private async runAgentToolTurn(
    room: StoredGameRoom,
    player: StoredPlayer,
    state: PlayerPrivateState,
    runAgentTurn: (input: RuntimeAgentTurnInput) => Promise<RuntimeAgentTurnOutput>,
    now: Date,
    input: { prompt: string; tools?: Record<string, unknown> }
  ): Promise<RuntimeAgentTurnResult> {
    if (!room.projection) throw new Error("projection is required");
    const agentId = resolvePlayerAgentId(player);
    this.assignAndAppendEvents(room, [
      {
        id: "pending",
        gameRoomId: room.id,
        seq: 1,
        type: "agent_turn_started",
        visibility: "runtime",
        actorId: "runtime",
        subjectId: player.id,
        payload: { phase: room.projection.phase, playerId: player.id, agentId },
        createdAt: now.toISOString(),
      },
      {
        id: "pending",
        gameRoomId: room.id,
        seq: 1,
        type: "agent_llm_requested",
        visibility: "runtime",
        actorId: "runtime",
        subjectId: player.id,
        payload: { phase: room.projection.phase, playerId: player.id, agentId },
        createdAt: now.toISOString(),
      },
    ]);
    const context = buildAgentContext(room, player.id, state, {
      maxSpeechHistory: 10,
      includeVotes: true,
    });
    const fullPrompt = `${context}\n---\n${input.prompt}`;

    let output: RuntimeAgentTurnOutput;
    try {
      output = await runAgentTurn({
        agentId,
        playerId: player.id,
        displayName: player.displayName,
        role: state.role,
        phase: room.projection.phase,
        prompt: fullPrompt,
        tools:
          "tools" in input && input.tools
            ? input.tools
            : buildAgentTurnTools({
                phase: room.projection.phase,
                role: state.role,
                alivePlayerIds: room.projection.alivePlayerIds,
                selfPlayerId: player.id,
              }),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(
        `[AgentTurn] ${player.displayName} (${player.id}, ${agentId}) failed in ${room.projection.phase}: ${errorMessage}`
      );
      this.assignAndAppendEvents(room, [
        {
          id: "pending",
          gameRoomId: room.id,
          seq: 1,
          type: "agent_turn_failed",
          visibility: "runtime",
          actorId: "runtime",
          subjectId: player.id,
          payload: {
            phase: room.projection.phase,
            playerId: player.id,
            agentId,
            error: errorMessage,
          },
          createdAt: now.toISOString(),
        },
      ]);
      return {
        text: `${player.displayName} did not act before deadline.`,
        toolName: "passAction",
        input: {},
        fallback: true,
      };
    }
    const result = normalizeAgentTurnOutput(output);
    this.assignAndAppendEvents(room, [
      {
        id: "pending",
        gameRoomId: room.id,
        seq: 1,
        type: "agent_llm_completed",
        visibility: "runtime",
        actorId: "runtime",
        subjectId: player.id,
        payload: {
          phase: room.projection.phase,
          playerId: player.id,
          agentId,
          toolName: result.toolName,
        },
        createdAt: now.toISOString(),
      },
    ]);
    return result;
  }

  private async runCurrentSpeaker(
    room: StoredGameRoom,
    runAgentTurn: (input: RuntimeAgentTurnInput) => Promise<RuntimeAgentTurnOutput>,
    now: Date
  ): Promise<void> {
    if (!room.projection?.currentSpeakerPlayerId) return;
    const playerId = room.projection.currentSpeakerPlayerId;
    const player = this.requirePlayer(room, playerId);
    const state = this.requirePrivateState(room, playerId);

    if (player.kind === "user") {
      if (!this.deadlinePassed(room, now)) {
        return; // 等待人类玩家通过 submitAction 发言
      }
      this.assignAndAppendEvents(room, [
        {
          ...this.baseEvent(room, playerId, "public"),
          type: "speech_submitted",
          payload: {
            day: room.projection.day,
            speech: `${player.displayName} chose to remain silent.`,
          },
        },
      ]);
      this.resetPlayerTranscript(room.id, playerId);
      this.advanceSpeechSpeaker(room, playerId, now);
      return;
    }

    const result = await this.runAgentToolTurn(room, player, state, runAgentTurn, now, {
      prompt: `${this.languageInstruction(room)} You are ${player.displayName} in a Werewolf game. Speak briefly for ${room.projection.phase}. Your role is ${state.role}.`,
    });
    const speech = stringValue(result.input?.speech) ?? result.text;
    this.assignAndAppendEvents(room, [
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
    // Synthesize agent speech via TTS and wait for the audio to fully play
    // out before rotating to the next speaker, so the shared voice track
    // doesn't get interrupted mid-utterance by the next turn.
    //
    // Skip TTS when the LLM call fell back to a placeholder speech: that
    // means the agent_id isn't provisioned on Unseal, and TTS for the same
    // id will just hang the speakQueue against the 120s hard timeout.
    if (
      this.voiceAgents &&
      player.kind === "agent" &&
      speech.trim() &&
      !result.fallback
    ) {
      const voiceAgent = this.voiceAgents.get(room.id);
      if (voiceAgent) {
        try {
          await voiceAgent.speak(speech, playerId);
        } catch (err) {
          console.error("[VoiceAgent] speak failed:", err);
        }
      }
    }

    this.advanceSpeechSpeaker(room, playerId, now);
  }

  private advanceSpeechSpeaker(
    room: StoredGameRoom,
    completedPlayerId: string,
    now: Date
  ): void {
    if (!room.projection) throw new Error("projection is required");
    room.speechQueue = room.speechQueue.filter(
      (candidate) => candidate !== completedPlayerId
    );
    const nextSpeakerPlayerId = room.speechQueue[0] ?? null;
    const nextDeadlineAt = nextSpeakerPlayerId
      ? new Date(now.getTime() + room.timing.speechSeconds * 1000).toISOString()
      : room.projection.deadlineAt;
    room.projection = {
      ...room.projection,
      currentSpeakerPlayerId: nextSpeakerPlayerId,
      deadlineAt: nextDeadlineAt,
      version: room.events.length + 1,
    };
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

  private revealWolfKillToWitch(room: StoredGameRoom, now: Date): void {
    if (!room.projection) throw new Error("projection is required");
    const wolfKill = room.pendingNightActions.find(
      (action): action is Extract<RuntimeNightAction, { kind: "wolfKill" }> =>
        action.kind === "wolfKill"
    );
    if (!wolfKill) return;
    const witch = room.privateStates.find((state) => state.role === "witch" && state.alive);
    if (!witch) return;
    const alreadyRevealed = room.events.some(
      (event) =>
        event.type === "witch_kill_revealed" &&
        event.visibility === `private:user:${witch.playerId}` &&
        Number(event.payload?.day) === room.projection?.day
    );
    if (alreadyRevealed) return;
    this.assignAndAppendEvents(room, [
      {
        id: "pending",
        gameRoomId: room.id,
        seq: 1,
        type: "witch_kill_revealed",
        visibility: `private:user:${witch.playerId}`,
        actorId: "runtime",
        subjectId: wolfKill.targetPlayerId,
        payload: {
          day: room.projection.day,
          targetPlayerId: wolfKill.targetPlayerId,
        },
        createdAt: now.toISOString(),
      },
    ]);
  }

  private resetPlayerTranscript(gameRoomId: string, playerId: string): void {
    const agent = this.voiceAgents?.get(gameRoomId);
    agent?.resetPlayerTranscript(playerId);
  }

  private requireRolePlayer(room: StoredGameRoom, role: Role): PlayerPrivateState {
    const player = this.findRolePlayer(room, role);
    if (!player) throw new AppError("conflict", `Missing alive ${role}`, 409);
    return player;
  }

  private languageInstruction(room: StoredGameRoom): string {
    return room.language === "zh-CN"
      ? "请使用简体中文输出。"
      : "Use English for your response.";
  }

  private findRolePlayer(
    room: StoredGameRoom,
    role: Role
  ): PlayerPrivateState | null {
    return (
      room.privateStates.find((state) => state.role === role && state.alive) ??
      null
    );
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

function normalizeAgentTurnOutput(output: RuntimeAgentTurnOutput): RuntimeAgentTurnResult {
  if (typeof output === "string") {
    return { text: output };
  }
  return {
    text: output.text ?? "",
    toolName: output.toolName,
    input: output.input ?? {},
  };
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function resolvePlayerAgentId(player: StoredPlayer): string {
  return player.userId ?? player.agentId ?? player.displayName;
}
