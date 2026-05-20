import { describe, expect, it } from "vitest";
import type { GameEvent } from "@werewolf/shared";
import { gameEvents, gameRoomPlayers, gameRooms, playerPrivateState, roomProjection } from "@werewolf/db";
import { nextLegacyEventIndex, toLegacyGameEventRow } from "./game-store";
import { GameStore } from "./game-store";

function fakeDb(rowsByTable: Map<unknown, unknown[]>) {
  return {
    select() {
      return {
        from(table: unknown) {
          return {
            where() {
              return Promise.resolve(rowsByTable.get(table) ?? []);
            },
          };
        },
      };
    },
  } as never;
}

describe("GameStore event persistence", () => {
  it("stores raw SSE payloads with id and data lines while keeping raw event JSON as the body", () => {
    const event = {
      id: "game_1_2",
      gameRoomId: "game_1",
      type: "phase_started",
      visibility: "public",
      payload: { phase: "day_discussion" },
      createdAt: "2026-05-19T00:00:00.000Z",
    } as unknown as GameEvent;

    const row = toLegacyGameEventRow("game_1", event);

    expect(row.rawSsePayload).toBe(
      `id: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`
    );
    expect(row.rawEventJson).toBe(
      JSON.stringify({
        id: event.id,
        gameRoomId: "game_1",
        type: event.type,
        visibility: event.visibility,
        payload: event.payload,
        createdAt: event.createdAt,
      })
    );
  });

  it("restores the next legacy event index from durable event ids without relying on seq", () => {
    expect(
      nextLegacyEventIndex("game_1", ["game_1_2", "game_1_10", "game_1_3"])
    ).toBe(11);
    expect(nextLegacyEventIndex("game_1", ["snowflake_a", "snowflake_b"])).toBe(3);
  });

  it("hydrates active rooms with their durable event history", async () => {
    const event = {
      id: "game_1_7",
      gameRoomId: "game_1",
      seq: 7,
      type: "night_action_submitted",
      visibility: "runtime",
      actorId: "player_1",
      subjectId: "player_2",
      payload: {
        day: 1,
        phase: "night_guard",
        action: { kind: "guardProtect", targetPlayerId: "player_2" },
      },
      createdAt: "2026-05-19T00:00:00.000Z",
    } satisfies GameEvent;
    const eventRow = toLegacyGameEventRow("game_1", event);

    const store = new GameStore(
      fakeDb(
        new Map<unknown, unknown[]>([
          [
            gameRooms,
            [
              {
                id: "game_1",
                creatorUserId: "@alice:example.com",
                status: "active",
                title: "Friday Werewolf",
                targetPlayerCount: 6,
                timing: {
                  nightActionSeconds: 45,
                  speechSeconds: 60,
                  voteSeconds: 30,
                },
                createdFromMatrixRoomId: "!source:example.com",
                agentSourceMatrixRoomId: "!source:example.com",
              },
            ],
          ],
          [gameRoomPlayers, []],
          [
            roomProjection,
            [
              {
                gameRoomId: "game_1",
                publicState: {
                  projection: {
                    gameRoomId: "game_1",
                    status: "active",
                    phase: "night_wolf",
                    day: 1,
                    deadlineAt: "2026-05-19T00:01:00.000Z",
                    currentSpeakerPlayerId: null,
                    winner: null,
                    alivePlayerIds: ["player_1", "player_2"],
                    version: 3,
                  },
                  runtime: {
                    speechQueue: [],
                    pendingNightActions: [],
                    pendingVotes: [],
                    tiePlayerIds: [],
                  },
                },
              },
            ],
          ],
          [playerPrivateState, []],
          [gameEvents, [eventRow]],
        ])
      )
    );

    const [room] = await store.loadActiveRooms();

    expect(room?.events).toEqual([event]);
    expect(room?.nextEventIndex).toBe(8);
  });
});
