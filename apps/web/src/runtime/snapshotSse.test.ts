import { describe, expect, it } from "vitest";
import type { GameEventDto, GameRoom, PlayerPrivateState, RoomProjection } from "../api/client";
import {
  applySubscribeMessage,
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
});

function emptyState(): SnapshotSseState {
  return {
    roomSnapshot: null,
    projectionSnapshot: null,
    privateStates: [],
    timeline: [],
    timelineBaseSeq: 0,
  };
}
