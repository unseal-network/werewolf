import { describe, expect, it } from "vitest";
import type { StoredGameRoom, StoredPlayer } from "../game-service";
import { buildSpeakingOrderHint } from "./strategy";

const players: StoredPlayer[] = [
  { id: "p1", kind: "agent", agentId: "@p1:example.com", displayName: "一号", seatNo: 1, ready: true, onlineState: "online", leftAt: null },
  { id: "p2", kind: "agent", agentId: "@p2:example.com", displayName: "二号", seatNo: 2, ready: true, onlineState: "online", leftAt: null },
  { id: "p3", kind: "agent", agentId: "@p3:example.com", displayName: "三号", seatNo: 3, ready: true, onlineState: "online", leftAt: null },
];

function room(speechQueue: string[] = ["p1", "p2", "p3"]): StoredGameRoom {
  return {
    id: "room_strategy",
    creatorUserId: "@creator:example.com",
    title: "Strategy",
    status: "active",
    targetPlayerCount: 3,
    language: "zh-CN",
    timing: { nightActionSeconds: 45, speechSeconds: 60, voteSeconds: 30, agentSpeechRate: 1.5 },
    createdFromMatrixRoomId: "!source:example.com",
    agentSourceMatrixRoomId: "!source:example.com",
    players,
    projection: {
      gameRoomId: "room_strategy",
      status: "active",
      phase: "day_speak",
      day: 1,
      deadlineAt: "2026-05-13T00:01:00.000Z",
      currentSpeakerPlayerId: speechQueue[0] ?? null,
      winner: null,
      alivePlayerIds: players.map((player) => player.id),
      version: 1,
    },
    privateStates: [],
    events: [],
    pendingNightActions: [],
    pendingVotes: [],
    speechQueue,
    tiePlayerIds: [],
  };
}

describe("agent harness strategy", () => {
  it("builds speaking-order hint for first and late speakers", () => {
    expect(buildSpeakingOrderHint(room(["p1", "p2", "p3"]), "p1")).toContain("第1个发言");
    expect(buildSpeakingOrderHint(room(["p1", "p2", "p3"]), "p3")).toContain("第3/3个发言");
  });
});
