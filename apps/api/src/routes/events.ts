import { Hono } from "hono";
import { AppError, type GameEvent } from "@werewolf/shared";
import {
  authenticateRequest,
  type MatrixAuthClient,
  type MatrixProfileCache,
} from "../context/auth";
import type { SseBroker } from "../services/sse-broker";
import type { GameStore } from "../services/game-store";
import type { InMemoryGameService } from "../services/game-service";
import { compareEventIds, isEventIdAfter } from "../services/event-id-cursor";
import { filterEventsForUser } from "./games";

export interface EventsRouteDeps {
  broker: SseBroker;
  store?: GameStore | null;
  games: InMemoryGameService;
  matrix: MatrixAuthClient;
  profileCache?: MatrixProfileCache | undefined;
}

export function createEventsRoutes(deps: EventsRouteDeps): Hono {
  const { broker, store } = deps;
  const games = deps.games;
  const matrix = deps.matrix;
  const app = new Hono();

  function appErrorResponse(error: AppError): Response {
    return new Response(
      JSON.stringify({ error: error.message, code: error.code }),
      {
        status: error.status,
        headers: { "content-type": "application/json" },
      }
    );
  }

  app.get("/:gameRoomId/subscribe", async (c) => {
    try {
      const user = await authenticateRequest(c.req.raw, matrix, deps.profileCache);
      const gameRoomId = c.req.param("gameRoomId");
      games.snapshot(gameRoomId);
      const lastEventId = c.req.header("last-event-id") ?? "";

      const stream = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();
          const perspective = () => buildPerspective(games, gameRoomId, user.id);
          const serializeSnapshot = (eventId?: string) => {
            const view = perspective();
            const snapshotEventId = eventId ?? view.snapshotEventId;
            const data = `data: ${JSON.stringify({
              snapshot: {
                room: view.room,
                projection: view.room.projection,
                privateStates: view.privateStates,
                events: view.events,
                snapshotEventId,
              },
            })}\n\n`;
            return eventId ? `id: ${snapshotEventId}\n${data}` : data;
          };
          const pushVisible = (payload: string) => {
            const event = eventFromSsePayload(payload);
            if (!event) return;
            const view = perspective();
            const visible = Boolean(
              filterEventsForUser(
                [event],
                view.myPlayerId,
                view.isWolf,
                view.revealAll
              ).length
            );
            if (eventRefreshesPerspectiveSnapshot(event, visible)) {
              controller.enqueue(encoder.encode(serializeSnapshot(event.id)));
              return;
            }
            if (!visible) return;
            controller.enqueue(encoder.encode(payload));
          };

          controller.enqueue(encoder.encode(serializeSnapshot()));

          const liveBuffer: Array<{ id: string; payload: string }> = [];
          let initialReplayComplete = false;
          const pushOrBufferLive = (payload: string) => {
            if (initialReplayComplete) {
              pushVisible(payload);
              return;
            }
            const event = eventFromSsePayload(payload);
            if (event) liveBuffer.push({ id: event.id, payload });
          };

          const { replay, unsubscribe } = broker.subscribe(
            gameRoomId,
            lastEventId,
            pushOrBufferLive
          );

          const replayedEventIds = new Set<string>();
          if (store) {
            try {
              const dbEvents = (
                await store.loadRawSsePayloadsAfter(gameRoomId, lastEventId)
              ).flatMap((row) => {
                const event = eventFromSsePayload(row.rawSsePayload);
                return event ? [{ ...row, event }] : [];
              });
              for (const row of dbEvents) {
                replayedEventIds.add(row.id);
              }
              for (const row of dbEvents) {
                pushVisible(row.rawSsePayload);
              }
            } catch (err) {
              console.error("[SSE] DB replay failed:", err);
            }
          }

          for (const item of replay) {
            if (replayedEventIds.has(item.id)) continue;
            replayedEventIds.add(item.id);
            pushVisible(item.payload);
          }

          for (const item of liveBuffer.sort((a, b) => compareEventIds(a.id, b.id))) {
            if (!isEventIdAfter(item.id, lastEventId)) continue;
            if (replayedEventIds.has(item.id)) continue;
            replayedEventIds.add(item.id);
            pushVisible(item.payload);
          }
          liveBuffer.length = 0;
          initialReplayComplete = true;

          c.req.raw.signal.addEventListener("abort", () => unsubscribe(), {
            once: true,
          });
        },
      });

      return new Response(stream, {
        headers: {
          "cache-control": "no-cache",
          "content-type": "text/event-stream",
        },
      });
    } catch (error) {
      if (error instanceof AppError) return appErrorResponse(error);
      return new Response(
        JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }
  });

  return app;
}

function buildPerspective(
  games: InMemoryGameService,
  gameRoomId: string,
  userId: string
) {
  const room = games.snapshot(gameRoomId);
  const myPlayer = room.players.find(
    (player) => player.userId === userId && !player.leftAt
  );
  const myPrivateState = myPlayer
    ? room.privateStates.find((state) => state.playerId === myPlayer.id)
    : undefined;
  const revealAll = room.status === "ended" || room.projection?.status === "ended";
  const isWolf = Boolean(myPrivateState?.team === "wolf" && myPrivateState.alive);
  const events = filterEventsForUser(
    room.events,
    myPlayer?.id,
    isWolf,
    revealAll
  );
  const privateStates = myPrivateState ? [myPrivateState] : [];
  return {
    room: { ...room, events, privateStates },
    events,
    privateStates,
    snapshotEventId: room.events.at(-1)?.id ?? "",
    myPlayerId: myPlayer?.id,
    isWolf,
    revealAll,
  };
}

function eventRefreshesPerspectiveSnapshot(
  event: GameEvent,
  visible: boolean
): boolean {
  if (event.type === "roles_assigned") {
    return true;
  }
  if (!visible) {
    return false;
  }
  return event.type === "night_action_submitted";
}

function eventFromSsePayload(payload: string): GameEvent | null {
  const dataLine = payload
    .split("\n")
    .find((line) => line.startsWith("data:"));
  if (!dataLine) return null;
  try {
    return JSON.parse(dataLine.slice(5).trim()) as GameEvent;
  } catch {
    return null;
  }
}
