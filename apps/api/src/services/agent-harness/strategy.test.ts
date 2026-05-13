import { describe, expect, it } from "vitest";
import type { GameEvent } from "@werewolf/shared";
import type { StoredGameRoom, StoredPlayer } from "../game-service";
import {
  buildFocusAngle,
  buildRoleStrategy,
  buildSpeakingOrderHint,
  buildSpeechRules,
} from "./strategy";

const players: StoredPlayer[] = [
  { id: "p1", kind: "agent", agentId: "@p1:example.com", displayName: "一号", seatNo: 1, ready: true, onlineState: "online", leftAt: null },
  { id: "p2", kind: "agent", agentId: "@p2:example.com", displayName: "二号", seatNo: 2, ready: true, onlineState: "online", leftAt: null },
  { id: "p3", kind: "agent", agentId: "@p3:example.com", displayName: "三号", seatNo: 3, ready: true, onlineState: "online", leftAt: null },
];

function room(events: GameEvent[] = [], speechQueue: string[] = ["p1", "p2", "p3"]): StoredGameRoom {
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
    events,
    pendingNightActions: [],
    pendingVotes: [],
    speechQueue,
    tiePlayerIds: [],
  };
}

describe("agent harness strategy", () => {
  it("builds wolf strategy with anti-leak self-check", () => {
    const strategy = buildRoleStrategy("werewolf");
    expect(strategy).toContain("<role_strategy>");
    expect(strategy).toContain("伪装成好人");
    expect(strategy).toContain("不要暴露狼队友");
  });

  it("builds speaking-order hint for first and late speakers", () => {
    expect(buildSpeakingOrderHint(room([], ["p1", "p2", "p3"]), "p1")).toContain("第1个发言");
    expect(buildSpeakingOrderHint(room([], ["p1", "p2", "p3"]), "p3")).toContain("第3/3个发言");
  });

  it("builds focus angle when current player was mentioned", () => {
    const focus = buildFocusAngle(
      room([
        {
          id: "mention",
          gameRoomId: "room_strategy",
          seq: 1,
          type: "speech_submitted",
          visibility: "public",
          actorId: "p2",
          payload: { day: 1, speech: "我觉得 1 号需要解释一下。" },
          createdAt: "2026-05-13T00:00:00.000Z",
        },
      ]),
      "p1"
    );
    expect(focus).toContain("<focus_angle>");
    expect(focus).toContain("你被二号点名");
  });

  it("builds speech rules for tool-call public speech", () => {
    const rules = buildSpeechRules("zh-CN");
    expect(rules).toContain("必须调用 saySpeech");
    expect(rules).toContain("只能调用一次工具");
    expect(rules).toContain("3～5句话");
    expect(rules).toContain("必须给出至少一个具体怀疑、信任判断或归票方向");
    expect(rules).toContain("不要编造没有发生的发言、查验、投票或死亡");
    expect(rules).toContain("不要说自己是 AI，不要输出舞台动作");
    expect(rules).not.toContain("优先一句话说完");
  });
});
