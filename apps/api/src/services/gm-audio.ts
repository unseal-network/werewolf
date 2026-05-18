import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { GamePhase } from "@werewolf/shared";
import type { StoredGameRoom } from "./game-service";

export interface GmAudioFile {
  index: number;
  lang: "zh" | "en";
  file: string;
  text: string;
  bytes: number;
}

export interface GmAudioManifest {
  voiceId: string;
  count: number;
  files: GmAudioFile[];
}

export type GmAudioAnnouncementContext =
  | { kind: "phase"; phase: GamePhase; nightDeathPlayerIds?: string[] }
  | { kind: "vote_result"; exiledPlayerId: string | null }
  | { kind: "game_over"; winner: "good" | "wolf" };

export class GmAudioLibrary {
  private manifest: GmAudioManifest | null = null;
  private byLangAndIndex = new Map<string, GmAudioFile>();

  constructor(private readonly audioDir = defaultGmAudioDir()) {}

  isAvailable(): boolean {
    return existsSync(path.join(this.audioDir, "manifest.json"));
  }

  resolve(room: StoredGameRoom, context: GmAudioAnnouncementContext): string[] {
    if (!this.isAvailable()) return [];
    this.load();
    const lang = room.language === "en" ? "en" : "zh";
    const indexes = this.indexesFor(room, context);
    return indexes
      .map((index) => this.byLangAndIndex.get(`${lang}:${index}`))
      .filter((file): file is GmAudioFile => Boolean(file))
      .map((file) => path.join(this.audioDir, file.file));
  }

  private load(): void {
    if (this.manifest) return;
    const raw = readFileSync(path.join(this.audioDir, "manifest.json"), "utf8");
    this.manifest = JSON.parse(raw) as GmAudioManifest;
    for (const file of this.manifest.files) {
      this.byLangAndIndex.set(`${file.lang}:${file.index}`, file);
    }
  }

  private indexesFor(
    room: StoredGameRoom,
    context: GmAudioAnnouncementContext
  ): number[] {
    switch (context.kind) {
      case "phase":
        return this.phaseIndexes(room, context.phase, context.nightDeathPlayerIds ?? []);
      case "vote_result":
        return context.exiledPlayerId
          ? [34, this.playerIndex(room, context.exiledPlayerId)]
          : [];
      case "game_over":
        return [context.winner === "good" ? 35 : 36];
    }
  }

  private phaseIndexes(
    room: StoredGameRoom,
    phase: GamePhase,
    nightDeathPlayerIds: string[]
  ): number[] {
    switch (phase) {
      case "night_guard":
        return [1, 2];
      case "night_wolf":
        return [3];
      case "night_witch_heal":
        return [4];
      case "night_witch_poison":
        return [5];
      case "night_seer":
        return [6];
      case "day_speak":
        return this.daybreakIndexes(room, nightDeathPlayerIds);
      case "day_vote":
      case "tie_vote":
        return [33];
      default:
        return [];
    }
  }

  private daybreakIndexes(room: StoredGameRoom, playerIds: string[]): number[] {
    const seatNos = playerIds
      .map((playerId) => room.players.find((player) => player.id === playerId)?.seatNo)
      .filter((seatNo): seatNo is number => typeof seatNo === "number")
      .sort((left, right) => left - right);
    if (seatNos.length === 0) return [7];
    const indexes = [8];
    for (let index = 0; index < seatNos.length; index += 1) {
      const seatNo = seatNos[index]!;
      indexes.push(playerNumberIndex(seatNo, index < seatNos.length - 1));
    }
    return indexes;
  }

  private playerIndex(room: StoredGameRoom, playerId: string): number {
    const seatNo = room.players.find((player) => player.id === playerId)?.seatNo;
    return playerNumberIndex(seatNo ?? 1, false);
  }
}

function playerNumberIndex(seatNo: number, withAnd: boolean): number {
  const normalized = Math.max(1, Math.min(12, Math.trunc(seatNo)));
  return (withAnd ? 20 : 8) + normalized;
}

function defaultGmAudioDir(): string {
  return (
    process.env.WEREWOLF_GM_AUDIO_DIR ??
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../assets/gm-audio")
  );
}
