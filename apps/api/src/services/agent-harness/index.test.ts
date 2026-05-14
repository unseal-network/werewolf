import { describe, expect, it } from "vitest";
import type { PlayerPrivateState } from "@werewolf/engine";
import type { GamePhase } from "@werewolf/shared";
import type { StoredGameRoom } from "../game-service";
import { buildAgentPrompt } from "./index";

function roomForPhase(phase: GamePhase): {
  room: StoredGameRoom;
  playerState: PlayerPrivateState;
} {
  const playerState: PlayerPrivateState = {
    playerId: "p1",
    role: phase === "night_seer" ? "seer" : phase === "night_wolf" ? "werewolf" : "villager",
    team: phase === "night_wolf" ? "wolf" : "good",
    alive: true,
    knownTeammatePlayerIds: phase === "night_wolf" ? ["p2"] : [],
  };
  return {
    playerState,
    room: {
      id: "room_prompt",
      creatorUserId: "@creator:example.com",
      title: "Prompt",
      status: "active",
      targetPlayerCount: 3,
      language: "zh-CN",
      timing: { nightActionSeconds: 45, speechSeconds: 60, voteSeconds: 30, agentSpeechRate: 1.5 },
      createdFromMatrixRoomId: "!source:example.com",
      agentSourceMatrixRoomId: "!source:example.com",
      players: [
        { id: "p1", kind: "agent", agentId: "@p1:example.com", displayName: "一号", seatNo: 1, ready: true, onlineState: "online", leftAt: null },
        { id: "p2", kind: "agent", agentId: "@p2:example.com", displayName: "二号", seatNo: 2, ready: true, onlineState: "online", leftAt: null },
        { id: "p3", kind: "agent", agentId: "@p3:example.com", displayName: "三号", seatNo: 3, ready: true, onlineState: "online", leftAt: null },
      ],
      projection: {
        gameRoomId: "room_prompt",
        status: "active",
        phase,
        day: 1,
        deadlineAt: "2026-05-13T00:01:00.000Z",
        currentSpeakerPlayerId: phase === "day_speak" ? "p1" : null,
        winner: null,
        alivePlayerIds: ["p1", "p2", "p3"],
        version: 1,
      },
      privateStates: [playerState],
      events: [],
      pendingNightActions: [],
      pendingVotes: [],
      speechQueue: phase === "day_speak" ? ["p1", "p2", "p3"] : [],
      tiePlayerIds: phase === "tie_vote" ? ["p2", "p3"] : [],
    },
  };
}

describe("buildAgentPrompt", () => {
  it("builds separated day speech messages", () => {
    const { room, playerState } = roomForPhase("day_speak");
    const prompt = buildAgentPrompt({
      room,
      player: room.players[0]!,
      state: playerState,
      taskPrompt: "Speak now.",
      tools: { saySpeech: {} },
    });

    expect(prompt.messages).toEqual([
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user },
    ]);
    expect(prompt.system).toContain("白天讨论环节");
    expect(prompt.system).toContain("返回 JSON 字符串数组");
    expect(prompt.user).toContain("<speaking_order>");
    expect(prompt.user).toContain("轮到你发言，返回JSON数组");
  });

  it("builds tool-only day vote messages", () => {
    const { room, playerState } = roomForPhase("day_vote");
    const prompt = buildAgentPrompt({
      room,
      player: room.players[0]!,
      state: playerState,
      taskPrompt: "Vote now.",
      tools: { submitVote: {}, abstain: {} },
    });

    expect(prompt.system).toContain("【投票规则】");
    expect(prompt.system).toContain("可选: 2号(二号), 3号(三号)");
    expect(prompt.user).toContain("你投几号？");
  });

  it("builds wolf night prompt with wolf strategy", () => {
    const { room, playerState } = roomForPhase("night_wolf");
    const prompt = buildAgentPrompt({
      room,
      player: room.players[0]!,
      state: playerState,
      taskPrompt: "Wolf team voting phase.",
      tools: { wolfKill: {}, passAction: {} },
    });

    expect(prompt.system).toContain("【狼人技能】");
    expect(prompt.system).toContain("可选: 2号(二号)、3号(三号)");
    expect(prompt.user).toContain("<your_private_info>");
  });

  it("builds role night prompt for seer", () => {
    const { room, playerState } = roomForPhase("night_seer");
    const prompt = buildAgentPrompt({
      room,
      player: room.players[0]!,
      state: playerState,
      taskPrompt: "Inspect one player.",
      tools: { seerInspect: {}, passAction: {} },
    });

    expect(prompt.system).toContain("【预言家技能】");
    expect(prompt.system).toContain("可选: 2号(二号)、3号(三号)");
    expect(prompt.user).toContain("你要查验几号？");
  });
});
