import { describe, expect, it } from "vitest";
import type { GameEventDto, GameRoom, RoomProjection } from "../api/client";
import {
  deriveTimelineDisplayState,
  computeTimelineBaseSeq,
  actorDayKey,
  actorPhaseDayKey,
  seerDayKey,
} from "./timelineState";

function event(
  seq: number,
  type: string,
  payload: Record<string, unknown>,
  extra: Partial<GameEventDto> = {}
): GameEventDto {
  return {
    id: `event_${seq}`,
    seq,
    type,
    visibility: "public",
    payload,
    createdAt: `2026-05-12T12:${String(seq).padStart(2, "0")}:00.000Z`,
    ...extra,
  };
}

function projection(overrides: Partial<RoomProjection> = {}): RoomProjection {
  return {
    gameRoomId: "game_1",
    status: "active",
    phase: "day_speak",
    day: 2,
    deadlineAt: "2026-05-12T12:59:00.000Z",
    currentSpeakerPlayerId: "player_6",
    winner: null,
    alivePlayerIds: ["player_5", "player_6", "player_7"],
    version: 159,
    ...overrides,
  };
}

function room(): GameRoom {
  return {
    id: "game_1",
    title: "test room",
    status: "active",
    targetPlayerCount: 6,
    creatorUserId: "user_host",
    language: "zh-CN",
    createdFromMatrixRoomId: "!room:matrix",
    players: [
      {
        id: "player_5",
        agentId: "@agent5:matrix",
        displayName: "5",
        seatNo: 5,
        kind: "agent",
        ready: true,
        onlineState: "online",
        leftAt: null,
      },
      {
        id: "player_6",
        userId: "@user6:matrix",
        displayName: "6",
        seatNo: 6,
        kind: "user",
        ready: true,
        onlineState: "online",
        leftAt: null,
      },
    ],
    projection: projection(),
  };
}

describe("timeline state derivation", () => {
  it("does not replay historical turn events over the current subscribe snapshot", () => {
    const history = [
      event(154, "turn_started", {
        phase: "day_speak",
        day: 2,
        currentSpeakerPlayerId: "player_5",
        deadlineAt: "2026-05-12T12:55:00.000Z",
      }),
      event(158, "speech_submitted", { day: 2, speech: "5 finished" }, { actorId: "player_5" }),
      event(159, "turn_started", {
        phase: "day_speak",
        day: 2,
        currentSpeakerPlayerId: "player_6",
        deadlineAt: "2026-05-12T12:59:00.000Z",
      }),
    ];

    expect(computeTimelineBaseSeq(history)).toBe(159);
    const display = deriveTimelineDisplayState(
      room(),
      projection(),
      history,
      computeTimelineBaseSeq(history)
    );
    expect(display.projection?.currentSpeakerPlayerId).toBe("player_6");
  });

  it("applies only events newer than the snapshot base sequence", () => {
    const base = projection();
    const next = deriveTimelineDisplayState(
      room(),
      base,
      [
        event(154, "turn_started", {
          phase: "day_speak",
          day: 2,
          currentSpeakerPlayerId: "player_5",
        }),
        event(160, "turn_started", {
          phase: "day_speak",
          day: 2,
          currentSpeakerPlayerId: "player_7",
          deadlineAt: "2026-05-12T13:01:00.000Z",
        }),
      ],
      159
    );

    expect(next.projection?.currentSpeakerPlayerId).toBe("player_7");
    expect(next.projection?.version).toBe(160);
  });

  it("returns one synchronized display state for live projection events", () => {
    const baseRoom = room();
    const baseProjection = projection({
      alivePlayerIds: ["player_5", "player_6", "player_7"],
      version: 159,
    });
    const next = deriveTimelineDisplayState(
      { ...baseRoom, projection: baseProjection },
      baseProjection,
      [
        event(
          160,
          "player_eliminated",
          { playerId: "player_6" },
          { subjectId: "player_6" }
        ),
      ],
      159
    );

    expect(next.projection?.alivePlayerIds).toEqual(["player_5", "player_7"]);
    expect(next.room?.projection?.alivePlayerIds).toEqual([
      "player_5",
      "player_7",
    ]);
    expect(next.room?.projection).toBe(next.projection);
  });

  it("keeps old room events as log history without mutating snapshot state", () => {
    const derived = deriveTimelineDisplayState(
      room(),
      projection(),
      [
        event(10, "player_removed", { playerId: "player_6" }, { actorId: "player_6" }),
        event(11, "player_seat_changed", { fromSeatNo: 6, toSeatNo: 1 }, { actorId: "player_6" }),
      ],
      11
    );

    const player6 = derived.room?.players.find((player) => player.id === "player_6");
    expect(player6?.leftAt).toBeNull();
    expect(player6?.seatNo).toBe(6);
  });

  it("applies live player join events to the room seats", () => {
    const derived = deriveTimelineDisplayState(
      room(),
      projection(),
      [
        event(160, "player_joined", {
          player: {
            id: "player_3",
            agentId: "@bot3:matrix",
            displayName: "Bot 3",
            seatNo: 3,
            kind: "agent",
            ready: true,
            onlineState: "online",
            leftAt: null,
          },
        }, { actorId: "player_3" }),
      ],
      159
    );

    expect(derived.room?.players.find((player) => player.id === "player_3")).toMatchObject({
      agentId: "@bot3:matrix",
      displayName: "Bot 3",
      seatNo: 3,
      kind: "agent",
    });
  });

  it("derives reusable display facts from private and action payloads", () => {
    const display = deriveTimelineDisplayState(
      room(),
      projection({ phase: "night_guard", day: 1 }),
      [
        event(20, "seer_result_revealed", {
          day: 1,
          seerPlayerId: "player_5",
          inspectedPlayerId: "player_2",
          alignment: "wolf",
        }, { actorId: "runtime", subjectId: "player_2", visibility: "private:user:player_5" }),
        event(21, "seer_result_revealed", {
          day: 1,
          seerPlayerId: "player_6",
          inspectedPlayerId: "player_3",
          alignment: "good",
        }, { actorId: "runtime", subjectId: "player_3", visibility: "private:user:player_6" }),
        event(22, "phase_closed", {
          tiedPlayerIds: ["player_5", "player_6"],
        }),
        event(
          23,
          "witch_kill_revealed",
          { day: 1, targetPlayerId: "player_7" },
          { subjectId: "player_7" }
        ),
        event(
          24,
          "night_action_submitted",
          {
            day: 1,
            phase: "night_guard",
            action: { kind: "guardProtect", targetPlayerId: "player_5" },
          },
          { actorId: "player_6", subjectId: "player_5" }
        ),
        event(25, "vote_submitted", { day: 1 }, { actorId: "player_6" }),
      ],
      25
    );

    expect([
      ...(display.facts.seerCheckedTargetIdsBySeerId.get("player_5") ??
        new Set<string>()),
    ]).toEqual(["player_2"]);
    expect(
      display.facts.latestSeerResultBySeerDay.get(seerDayKey("player_5", 1))
    ).toMatchObject({ inspectedPlayerId: "player_2", alignment: "wolf" });
    expect(display.facts.tieCandidateIds).toEqual(["player_5", "player_6"]);
    expect(display.facts.witchKillTargetIdByDay.get(1)).toBe("player_7");
    expect(
      display.facts.guardProtectTargetIdByActorDay.get(
        actorDayKey("player_6", 1)
      )
    ).toBe("player_5");
    expect(
      display.facts.nightActionSubmittedByActorPhaseDay.has(
        actorPhaseDayKey("player_6", "night_guard", 1)
      )
    ).toBe(true);
    expect(
      display.facts.voteSubmittedByActorDay.has(actorDayKey("player_6", 1))
    ).toBe(true);
  });
});
