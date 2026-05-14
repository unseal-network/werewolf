import { describe, expect, it } from "vitest";
import type { GameEvent } from "@werewolf/shared";
import type { PlayerPrivateState } from "@werewolf/engine";
import type { StoredGameRoom } from "../game-service";
import { buildHarnessContext } from "./context";

function makeRoom(phase: "day_speak" | "night_wolf" | "night_seer"): {
  room: StoredGameRoom;
  wolfState: PlayerPrivateState;
  seerState: PlayerPrivateState;
} {
  const wolfState: PlayerPrivateState = {
    playerId: "player_1",
    role: "werewolf",
    team: "wolf",
    alive: true,
    knownTeammatePlayerIds: ["player_2"],
  };
  const seerState: PlayerPrivateState = {
    playerId: "player_3",
    role: "seer",
    team: "good",
    alive: true,
    knownTeammatePlayerIds: [],
  };
  const events: GameEvent[] = [
    {
      id: "wolf_speech",
      gameRoomId: "room_1",
      seq: 1,
      type: "speech_submitted",
      visibility: "private:team:wolf",
      actorId: "player_1",
      payload: { day: 1, phase: "night_wolf", speech: "secret night plan" },
      createdAt: "2026-05-13T00:00:00.000Z",
    },
    {
      id: "public_speech",
      gameRoomId: "room_1",
      seq: 2,
      type: "speech_submitted",
      visibility: "public",
      actorId: "player_4",
      payload: { day: 1, speech: "我觉得 1 号视角不太自然。" },
      createdAt: "2026-05-13T00:00:01.000Z",
    },
    {
      id: "seer_result",
      gameRoomId: "room_1",
      seq: 3,
      type: "seer_result_revealed",
      visibility: "private:user:player_3",
      actorId: "runtime",
      payload: {
        seerPlayerId: "player_3",
        inspectedPlayerId: "player_1",
        alignment: "wolf",
      },
      createdAt: "2026-05-13T00:00:02.000Z",
    },
    {
      id: "vote_1",
      gameRoomId: "room_1",
      seq: 4,
      type: "vote_submitted",
      visibility: "public",
      actorId: "player_4",
      subjectId: "player_1",
      payload: { day: 1, phase: "day_vote", targetPlayerId: "player_1" },
      createdAt: "2026-05-13T00:00:03.000Z",
    },
  ];

  return {
    wolfState,
    seerState,
    room: {
      id: "room_1",
      creatorUserId: "@creator:example.com",
      title: "Harness",
      status: "active",
      targetPlayerCount: 6,
      language: "zh-CN",
      timing: {
        nightActionSeconds: 45,
        speechSeconds: 60,
        voteSeconds: 30,
        agentSpeechRate: 1.5,
      },
      createdFromMatrixRoomId: "!source:example.com",
      agentSourceMatrixRoomId: "!source:example.com",
      players: [
        { id: "player_1", kind: "agent", agentId: "@wolf:example.com", displayName: "一号狼", seatNo: 1, ready: true, onlineState: "online", leftAt: null },
        { id: "player_2", kind: "agent", agentId: "@wolf2:example.com", displayName: "二号狼", seatNo: 2, ready: true, onlineState: "online", leftAt: null },
        { id: "player_3", kind: "agent", agentId: "@seer:example.com", displayName: "三号预言家", seatNo: 3, ready: true, onlineState: "online", leftAt: null },
        { id: "player_4", kind: "user", userId: "@villager:example.com", displayName: "四号村民", seatNo: 4, ready: true, onlineState: "online", leftAt: null },
      ],
      projection: {
        gameRoomId: "room_1",
        status: "active",
        phase,
        day: 1,
        deadlineAt: "2026-05-13T00:01:00.000Z",
        currentSpeakerPlayerId: phase === "day_speak" ? "player_1" : null,
        winner: null,
        alivePlayerIds: ["player_1", "player_2", "player_3", "player_4"],
        version: 4,
      },
      privateStates: [wolfState, seerState],
      events,
      pendingNightActions: [],
      pendingVotes: [],
      speechQueue: phase === "day_speak" ? ["player_1", "player_2", "player_3", "player_4"] : [],
      tiePlayerIds: [],
    },
  };
}

describe("buildHarnessContext", () => {
  it("keeps wolf private history out of public day context", () => {
    const { room, wolfState } = makeRoom("day_speak");
    const context = buildHarnessContext({
      room,
      player: room.players[0]!,
      state: wolfState,
      maxSpeechHistory: 6,
    });

    expect(context.text).toContain("<current_status>");
    expect(context.text).toContain("<seat_index>");
    expect(context.text).toContain("座位1 = 一号狼（存活，你）");
    expect(context.text).toContain("<history>");
    expect(context.text).toContain("第1天 座位4（四号村民）发言：我觉得 1 号视角不太自然。");
    expect(context.text).toContain("我觉得 1 号视角不太自然。");
    expect(context.text).not.toContain("secret night plan");
    expect(context.text).not.toContain("<wolf_team_history>");
  });

  it("summarizes resolved night result without making the agent infer deaths", () => {
    const { room, wolfState } = makeRoom("day_speak");
    room.events.push({
      id: "night_resolved",
      gameRoomId: "room_1",
      seq: 5,
      type: "night_resolved",
      visibility: "runtime",
      actorId: "runtime",
      payload: { day: 1, eliminatedPlayerIds: ["player_4"] },
      createdAt: "2026-05-13T00:00:04.000Z",
    });
    room.events.push({
      id: "player_eliminated",
      gameRoomId: "room_1",
      seq: 6,
      type: "player_eliminated",
      visibility: "public",
      actorId: "runtime",
      subjectId: "player_4",
      payload: { playerId: "player_4", reason: "night" },
      createdAt: "2026-05-13T00:00:04.000Z",
    });
    room.projection!.alivePlayerIds = ["player_1", "player_2", "player_3"];
    const context = buildHarnessContext({
      room,
      player: room.players[0]!,
      state: wolfState,
      maxSpeechHistory: 6,
    });

    expect(context.text).toContain("<night_result>");
    expect(context.text).toContain("第1夜结果：四号村民(座位4)");
    expect(context.text).toContain("座位4 = 四号村民（死亡）");
  });

  it("states peaceful night explicitly when a resolved night has no deaths", () => {
    const { room, wolfState } = makeRoom("day_speak");
    room.events.push({
      id: "night_resolved",
      gameRoomId: "room_1",
      seq: 5,
      type: "night_resolved",
      visibility: "runtime",
      actorId: "runtime",
      payload: { day: 1, eliminatedPlayerIds: [] },
      createdAt: "2026-05-13T00:00:04.000Z",
    });
    const context = buildHarnessContext({
      room,
      player: room.players[0]!,
      state: wolfState,
      maxSpeechHistory: 6,
    });

    expect(context.text).toContain("第1夜结果：平安夜，没有玩家死亡");
  });

  it("includes wolf team history during wolf night", () => {
    const { room, wolfState } = makeRoom("night_wolf");
    const context = buildHarnessContext({
      room,
      player: room.players[0]!,
      state: wolfState,
      maxSpeechHistory: 6,
    });

    expect(context.text).toContain("<your_private_info>");
    expect(context.text).toContain("狼队友：二号狼(座位2)");
    expect(context.text).toContain("<wolf_team_history>");
    expect(context.text).toContain("secret night plan");
  });

  it("shows seer private inspections only to the seer", () => {
    const { room, seerState } = makeRoom("night_seer");
    const context = buildHarnessContext({
      room,
      player: room.players[2]!,
      state: seerState,
      maxSpeechHistory: 6,
    });

    expect(context.text).toContain("预言家查验记录");
    expect(context.text).toContain("一号狼(座位1)：狼人");
  });

  it("includes legal target seats and vote history", () => {
    const { room, wolfState } = makeRoom("day_speak");
    const context = buildHarnessContext({
      room,
      player: room.players[0]!,
      state: wolfState,
      maxSpeechHistory: 6,
    });

    expect(context.text).toContain("<action_options>");
    expect(context.text).toContain("targetPlayerId 可填座位号 2（二号狼）");
    expect(context.text).toContain("<votes>");
    expect(context.text).toContain("四号村民 -> 一号狼");
  });
});
