import { describe, expect, it } from "vitest";
import type { GameEventDto, GameRoom, PlayerPrivateState, RoomProjection } from "../api/client";
import {
  appendTimelineEvent,
  applySubscribeMessage,
  collapseStreamingTimelineEvents,
  parseSubscribeMessage,
  type SnapshotSseState,
} from "./snapshotSse";

const room = {
  id: "game_1",
  title: "狼人杀",
  status: "active",
  targetPlayerCount: 12,
  creatorUserId: "@alice:example.com",
  language: "zh-CN",
  createdFromMatrixRoomId: "!host:example.com",
  players: [],
  projection: null,
} satisfies GameRoom;

const projection = {
  gameRoomId: "game_1",
  status: "active",
  phase: "day_speak",
  day: 1,
  deadlineAt: null,
  currentSpeakerPlayerId: null,
  winner: null,
  alivePlayerIds: [],
  version: 7,
} satisfies RoomProjection;

const privateState = {
  playerId: "player_1",
  role: "seer",
  team: "good",
  alive: true,
  knownTeammatePlayerIds: [],
} satisfies PlayerPrivateState;

const event = {
  id: "evt_1",
  gameRoomId: "game_1",
  seq: 3,
  type: "phase_started",
  visibility: "public",
  payload: { phase: "day_speak" },
  createdAt: "2026-05-14T00:00:00.000Z",
} satisfies GameEventDto;

describe("snapshot-first SSE state", () => {
  it("rebuilds room state and timeline from the first snapshot message", () => {
    const parsed = parseSubscribeMessage(
      JSON.stringify({
        snapshot: {
          room,
          projection,
          privateStates: [privateState],
          events: [event],
        },
      })
    );

    const next = applySubscribeMessage(emptyState(), parsed);

    expect(next.roomSnapshot?.id).toBe("game_1");
    expect(next.projectionSnapshot?.phase).toBe("day_speak");
    expect(next.privateStates).toEqual([privateState]);
    expect(next.timeline).toEqual([event]);
    expect(next.timelineBaseSeq).toBe(3);
  });

  it("deduplicates replayed live events by id after a snapshot", () => {
    const state = {
      ...emptyState(),
      timeline: [event],
      timelineBaseSeq: 3,
    };

    const parsed = parseSubscribeMessage(JSON.stringify(event));
    const next = applySubscribeMessage(state, parsed);

    expect(next.timeline).toEqual([event]);
    expect(next.timelineBaseSeq).toBe(3);
  });

  it("keeps only the latest live-caption event for one speech stream", () => {
    const first = transcriptEvent(56, "昨晚2号玩家出局，");
    const second = transcriptEvent(57, "昨晚2号玩家出局，目前场上局势不明朗，");
    const third = transcriptEvent(
      58,
      "昨晚2号玩家出局，目前场上局势不明朗，我们需要尽快通过发言找出狼人。"
    );

    expect(collapseStreamingTimelineEvents([first, second, third])).toEqual([third]);
    expect(appendTimelineEvent([first, second], third)).toEqual([third]);
  });

  it("collapses streaming captions from the initial subscribe snapshot", () => {
    const first = transcriptEvent(56, "昨晚2号玩家出局，");
    const latest = transcriptEvent(
      59,
      "昨晚2号玩家出局，目前场上局势不明朗，我们需要尽快通过发言找出狼人。"
    );
    const parsed = parseSubscribeMessage(
      JSON.stringify({
        snapshot: {
          room,
          projection,
          privateStates: [privateState],
          events: [first, latest],
        },
      })
    );

    const next = applySubscribeMessage(emptyState(), parsed);

    expect(next.timeline).toEqual([latest]);
    expect(next.timelineBaseSeq).toBe(59);
  });
});

function transcriptEvent(seq: number, text: string): GameEventDto {
  return {
    id: `caption_${seq}`,
    gameRoomId: "game_1",
    seq,
    type: "stream",
    visibility: "public",
    actorId: "player_1",
    payload: {
      day: 2,
      phase: "day_speak",
      text,
      final: false,
      stream: true,
    },
    createdAt: `2026-05-14T00:00:${String(seq).padStart(2, "0")}.000Z`,
  };
}

function emptyState(): SnapshotSseState {
  return {
    roomSnapshot: null,
    projectionSnapshot: null,
    privateStates: [],
    timeline: [],
    timelineBaseSeq: 0,
  };
}
