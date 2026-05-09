import type { GamePhase } from "@werewolf/shared";

export interface WolfDiscussionWindowInput {
  gameRoomId: string;
  day: number;
  wolfPlayerIds: string[];
  now: Date;
}

export interface WolfDiscussionWindow {
  gameRoomId: string;
  day: number;
  phase: Extract<GamePhase, "night_wolf">;
  visibility: "private:team:wolf";
  allowedSpeakerPlayerIds: string[];
  openedAt: string;
}

export function openWolfDiscussionWindow(
  input: WolfDiscussionWindowInput
): WolfDiscussionWindow {
  return {
    gameRoomId: input.gameRoomId,
    day: input.day,
    phase: "night_wolf",
    visibility: "private:team:wolf",
    allowedSpeakerPlayerIds: [...input.wolfPlayerIds],
    openedAt: input.now.toISOString(),
  };
}

export interface SpeechQueuePlayer {
  playerId: string;
  seatNo: number;
  alive: boolean;
}

export function buildDaySpeechQueue(input: {
  players: SpeechQueuePlayer[];
}): string[] {
  return input.players
    .filter((player) => player.alive)
    .sort((left, right) => left.seatNo - right.seatNo)
    .map((player) => player.playerId);
}
