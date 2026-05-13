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
      const lastEventId = c.req.header("last-event-id");
      const lastSeq = lastEventId ? Number(lastEventId) : 0;

      const stream = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();
          const perspective = () => buildPerspective(games, gameRoomId, user.id);
          const serializeSnapshot = (seq?: number) => {
            const view = perspective();
            const data = `data: ${JSON.stringify({
              snapshot: {
                room: view.room,
                projection: view.room.projection,
                privateStates: view.privateStates,
                events: view.events,
              },
            })}\n\n`;
            return seq ? `id: ${seq}\n${data}` : data;
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
              controller.enqueue(encoder.encode(serializeSnapshot(event.seq)));
              return;
            }
            if (!visible) return;
            controller.enqueue(encoder.encode(payload));
          };

          controller.enqueue(encoder.encode(serializeSnapshot()));

          const { replay, unsubscribe } = broker.subscribe(
            gameRoomId,
            Number.isFinite(lastSeq) ? lastSeq : 0,
            pushVisible
          );

          // If the broker can't fully cover everything since `lastSeq` (e.g.,
          // after a process restart its in-memory history is empty), fall back
          // to the durable event log in the DB so the client gets a complete
          // catch-up before live events start streaming. Without this, clients
          // reconnecting after an API restart would silently miss events.
          const replayStart =
            replay.length > 0 && replay[0]?.seq !== undefined
              ? replay[0].seq
              : Infinity;
          const needsDbReplay =
            store && (replay.length === 0 || replayStart > lastSeq + 1);

          if (needsDbReplay) {
            try {
              const view = perspective();
              const dbEvents = filterEventsForUser(
                await store.loadEventsSince(gameRoomId, lastSeq),
                view.myPlayerId,
                view.isWolf,
                view.revealAll
              );
              const minBrokerSeq = replayStart;
              for (const event of dbEvents) {
                if (event.seq >= minBrokerSeq) break; // broker covers the rest
                const serialized = `id: ${event.seq}\ndata: ${JSON.stringify(event)}\n\n`;
                controller.enqueue(encoder.encode(serialized));
              }
            } catch (err) {
              console.error("[SSE] DB replay failed:", err);
            }
          }

          for (const item of replay) {
            pushVisible(item.payload);
          }

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
