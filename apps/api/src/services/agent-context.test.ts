import { describe, expect, it } from "vitest";
import type { GameEvent } from "@werewolf/shared";
import type { PlayerPrivateState } from "@werewolf/engine";
import { buildAgentContext } from "./agent-context";
import type { StoredGameRoom } from "./game-service";

function wolfRoom(phase: "night_wolf" | "day_speak"): {
  room: StoredGameRoom;
  wolfState: PlayerPrivateState;
} {
  const wolfState: PlayerPrivateState = {
    playerId: "player_1",
    role: "werewolf",
    team: "wolf",
    alive: true,
    knownTeammatePlayerIds: ["player_2"],
  };
  const events: GameEvent[] = [
    {
      id: "evt_1",
      gameRoomId: "game_ctx",
      seq: 1,
      type: "speech_submitted",
      visibility: "private:team:wolf",
      actorId: "player_1",
      payload: { day: 1, phase: "night_wolf", speech: "secret night plan" },
      createdAt: "2026-05-12T00:00:00.000Z",
    },
    {
      id: "evt_2",
      gameRoomId: "game_ctx",
      seq: 2,
      type: "wolf_vote_submitted",
      visibility: "private:team:wolf",
      actorId: "player_1",
      subjectId: "player_3",
      payload: { day: 1, targetPlayerId: "player_3" },
      createdAt: "2026-05-12T00:00:01.000Z",
    },
    {
      id: "evt_3",
      gameRoomId: "game_ctx",
      seq: 3,
      type: "speech_submitted",
      visibility: "public",
      actorId: "player_3",
      payload: { day: 1, speech: "public accusation" },
      createdAt: "2026-05-12T00:00:02.000Z",
    },
  ];
  return {
    wolfState,
    room: {
      id: "game_ctx",
      creatorUserId: "@alice:example.com",
      title: "Context",
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
        {
          id: "player_1",
          kind: "agent",
          agentId: "@wolf:example.com",
          displayName: "Wolf",
          seatNo: 1,
          ready: true,
          onlineState: "online",
          leftAt: null,
        },
        {
          id: "player_2",
          kind: "agent",
          agentId: "@wolf2:example.com",
          displayName: "Wolf Two",
          seatNo: 2,
          ready: true,
          onlineState: "online",
          leftAt: null,
        },
        {
          id: "player_3",
          kind: "agent",
          agentId: "@seer:example.com",
          displayName: "Seer",
          seatNo: 3,
          ready: true,
          onlineState: "online",
          leftAt: null,
        },
      ],
      projection: {
        gameRoomId: "game_ctx",
        status: "active",
        phase,
        day: 1,
        deadlineAt: "2026-05-12T00:01:00.000Z",
        currentSpeakerPlayerId: phase === "day_speak" ? "player_1" : null,
        winner: null,
        alivePlayerIds: ["player_1", "player_2", "player_3"],
        version: 3,
      },
      privateStates: [wolfState],
      events,
      pendingNightActions: [],
      pendingVotes: [],
      speechQueue: phase === "day_speak" ? ["player_1"] : [],
      tiePlayerIds: [],
    },
  };
}

describe("buildAgentContext", () => {
  it("does not include wolf night discussion in a wolf agent's public day context", () => {
    const { room, wolfState } = wolfRoom("day_speak");
    const context = buildAgentContext(room, "player_1", wolfState);
    expect(context).toContain("public accusation");
    expect(context).not.toContain("secret night plan");
    expect(context).not.toContain("狼人团队记录");
  });

  it("includes wolf team context during the wolf night phase", () => {
    const { room, wolfState } = wolfRoom("night_wolf");
    const context = buildAgentContext(room, "player_1", wolfState);
    expect(context).toContain("secret night plan");
    expect(context).toContain("狼人团队记录");
  });
});
