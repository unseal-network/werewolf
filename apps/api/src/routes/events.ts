import { Hono } from "hono";
import { AppError, type GameEvent } from "@werewolf/shared";
import { authenticateRequest, type MatrixAuthClient } from "../context/auth";
import type { SseBroker } from "../services/sse-broker";
import type { GameStore } from "../services/game-store";
import type { InMemoryGameService } from "../services/game-service";
import { filterEventsForUser } from "./games";

export interface EventsRouteDeps {
  broker: SseBroker;
  store?: GameStore | null;
  games: InMemoryGameService;
  matrix: MatrixAuthClient;
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
      const user = await authenticateRequest(c.req.raw, matrix);
      const gameRoomId = c.req.param("gameRoomId");
      const room = games.snapshot(gameRoomId);
      const myPlayer = room.players.find(
        (player) => player.userId === user.id && !player.leftAt
      );
      const myPrivateState = myPlayer
        ? room.privateStates.find((state) => state.playerId === myPlayer.id)
        : undefined;
      const isWolf = myPrivateState?.team === "wolf";
      const lastEventId = c.req.header("last-event-id");
      const lastSeq = lastEventId ? Number(lastEventId) : 0;

      const stream = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();
          const pushVisible = (payload: string) => {
            const event = eventFromSsePayload(payload);
            if (!event) return;
            const latestRoom = games.snapshot(gameRoomId);
            const revealAll =
              latestRoom.status === "ended" ||
              latestRoom.projection?.status === "ended";
            if (
              !filterEventsForUser(
                [event],
                myPlayer?.id,
                Boolean(isWolf),
                revealAll
              ).length
            ) {
              return;
            }
            controller.enqueue(encoder.encode(payload));
          };

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
              const dbEvents = filterEventsForUser(
                await store.loadEventsSince(gameRoomId, lastSeq),
                myPlayer?.id,
                Boolean(isWolf),
                room.status === "ended" || room.projection?.status === "ended"
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
