import type { GamePhase, PlayerKind, Role, Team } from "@werewolf/shared";

export interface SeatSnapshot {
  playerId: string;
  displayName: string;
  seatNo: number;
  kind: PlayerKind;
}

export interface AssignedPlayer extends SeatSnapshot {
  role: Role;
  team: Team;
  alive: boolean;
  eliminated: boolean;
}

export interface TimingConfig {
  nightActionSeconds: number;
  speechSeconds: number;
  voteSeconds: number;
}

export interface RoomProjection {
  gameRoomId: string;
  status: "active" | "paused" | "ended";
  phase: GamePhase;
  day: number;
  deadlineAt: string | null;
  currentSpeakerPlayerId: string | null;
  winner: "wolf" | "good" | null;
  alivePlayerIds: string[];
  version: number;
}

export interface PlayerPrivateState {
  playerId: string;
  role: Role;
  team: Team;
  alive: boolean;
  knownTeammatePlayerIds: string[];
  witchItems?: {
    healAvailable: boolean;
    poisonAvailable: boolean;
  };
}
