import type { GameEvent } from "@werewolf/shared";
import { assignRoles } from "./roles";
import type {
  PlayerPrivateState,
  RoomProjection,
  SeatSnapshot,
  TimingConfig,
} from "./state";

export interface StartGameInput {
  gameRoomId: string;
  targetPlayerCount: number;
  seats: SeatSnapshot[];
  now: Date;
  shuffleSeed: string;
  timing: TimingConfig;
}

export interface StartGameResult {
  projection: RoomProjection;
  privateStates: PlayerPrivateState[];
  events: GameEvent[];
}

export function startGame(input: StartGameInput): StartGameResult {
  if (input.seats.length !== input.targetPlayerCount) {
    throw new Error(
      `Cannot start game: expected ${input.targetPlayerCount} players, got ${input.seats.length}`
    );
  }

  const assigned = assignRoles(input.seats, input.shuffleSeed);
  const nowIso = input.now.toISOString();
  const deadlineAt = new Date(
    input.now.getTime() + input.timing.nightActionSeconds * 1000
  ).toISOString();
  const wolves = assigned
    .filter((player) => player.role === "werewolf")
    .map((player) => player.playerId);

  const privateStates = assigned.map((player) => ({
    playerId: player.playerId,
    role: player.role,
    team: player.team,
    alive: true,
    knownTeammatePlayerIds:
      player.role === "werewolf"
        ? wolves.filter((playerId) => playerId !== player.playerId)
        : [],
    ...(player.role === "witch"
      ? { witchItems: { healAvailable: true, poisonAvailable: true } }
      : {}),
  }));

  const projection: RoomProjection = {
    gameRoomId: input.gameRoomId,
    status: "active",
    phase: "night_guard",
    day: 1,
    deadlineAt,
    currentSpeakerPlayerId: null,
    winner: null,
    alivePlayerIds: assigned.map((player) => player.playerId),
    version: 1,
  };

  const events: GameEvent[] = [
    {
      id: "pending",
      gameRoomId: input.gameRoomId,
      seq: 1,
      type: "game_started",
      visibility: "public",
      actorId: "runtime",
      payload: {
        targetPlayerCount: input.targetPlayerCount,
        playerIds: assigned.map((player) => player.playerId),
      },
      createdAt: nowIso,
    },
    {
      id: "pending",
      gameRoomId: input.gameRoomId,
      seq: 2,
      type: "roles_assigned",
      visibility: "runtime",
      actorId: "runtime",
      payload: {
        players: assigned.map((player) => ({
          playerId: player.playerId,
          role: player.role,
          team: player.team,
        })),
      },
      createdAt: nowIso,
    },
    {
      id: "pending",
      gameRoomId: input.gameRoomId,
      seq: 3,
      type: "phase_started",
      visibility: "public",
      actorId: "runtime",
      payload: { phase: "night_guard", day: 1, deadlineAt },
      createdAt: nowIso,
    },
  ];

  return { projection, privateStates, events };
}
