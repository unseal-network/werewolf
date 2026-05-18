import path from "node:path";
import { describe, expect, it } from "vitest";
import { GmAudioLibrary } from "./gm-audio";
import type { StoredGameRoom } from "./game-service";

function roomWithSeats(): StoredGameRoom {
  return {
    id: "game_1",
    createdFromMatrixRoomId: "!source:example.com",
    agentSourceMatrixRoomId: "!source:example.com",
    title: "Werewolf",
    status: "active",
    creatorUserId: "@alice:example.com",
    targetPlayerCount: 6,
    timing: {
      nightActionSeconds: 45,
      speechSeconds: 60,
      voteSeconds: 30,
      agentSpeechRate: 1,
    },
    language: "zh-CN",
    players: Array.from({ length: 12 }, (_, index) => ({
      id: `player_${index + 1}`,
      kind: "user" as const,
      userId: `@user${index + 1}:example.com`,
      displayName: `Player ${index + 1}`,
      seatNo: index + 1,
      joinedAt: new Date().toISOString(),
      ready: true,
      onlineState: "online" as const,
      leftAt: null,
    })),
    privateStates: [],
    events: [],
    pendingNightActions: [],
    pendingVotes: [],
    speechQueue: [],
    tiePlayerIds: [],
    projection: null,
  };
}

describe("GmAudioLibrary", () => {
  it("loads bundled narration regardless of process cwd", () => {
    const previousCwd = process.cwd();
    try {
      const packageCwd = previousCwd.endsWith(`${path.sep}apps${path.sep}api`)
        ? previousCwd
        : path.resolve(previousCwd, "apps/api");
      process.chdir(packageCwd);
      const library = new GmAudioLibrary();

      expect(library.isAvailable()).toBe(true);
    } finally {
      process.chdir(previousCwd);
    }
  });

  it("builds a single-death daybreak narration from seat audio", () => {
    const library = new GmAudioLibrary();
    const files = library.resolve(roomWithSeats(), {
      kind: "phase",
      phase: "day_speak",
      nightDeathPlayerIds: ["player_9"],
    });

    expect(files.map((file) => file.split("/").at(-1))).toEqual([
      "08_zh.mp3",
      "17_zh.mp3",
    ]);
  });

  it("builds a two-death daybreak narration with the connecting seat audio", () => {
    const library = new GmAudioLibrary();
    const files = library.resolve(roomWithSeats(), {
      kind: "phase",
      phase: "day_speak",
      nightDeathPlayerIds: ["player_9", "player_2"],
    });

    expect(files.map((file) => file.split("/").at(-1))).toEqual([
      "08_zh.mp3",
      "22_zh.mp3",
      "17_zh.mp3",
    ]);
  });
});
