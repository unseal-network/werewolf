import type { GamePhase, Role } from "@werewolf/shared";
import type { PlayerPrivateState } from "@werewolf/engine";
import type { StoredGameRoom, StoredPlayer } from "../game-service";

export interface AgentPromptMessage {
  role: "system" | "user";
  content: string;
}

export interface AgentPromptPart {
  text: string;
  cacheable?: boolean;
  ttl?: "5m" | "1h";
}

export type AgentTurnKind =
  | "day_speech"
  | "day_vote"
  | "wolf_discussion"
  | "wolf_vote"
  | "night_action";

export interface AgentPromptResult {
  messages: AgentPromptMessage[];
  system: string;
  user: string;
  textPrompt: string;
}

export interface BuildAgentPromptInput {
  room: StoredGameRoom;
  player: StoredPlayer;
  state: PlayerPrivateState;
  taskPrompt: string;
  tools: Record<string, unknown>;
  turnKind?: AgentTurnKind;
  languageInstruction?: string;
}

export interface HarnessContextInput {
  room: StoredGameRoom;
  player: StoredPlayer;
  state: PlayerPrivateState;
  maxSpeechHistory?: number;
}

export interface HarnessContextResult {
  text: string;
  timelineText: string;
  selfSpeechText: string;
  phase: GamePhase;
  role: Role;
  alivePlayerIds: string[];
  targetPlayerIds: string[];
}
