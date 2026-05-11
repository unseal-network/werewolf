import { Hono } from "hono";
import type { SseBroker } from "../services/sse-broker";
import type { GameStore } from "../services/game-store";

export interface EventsRouteDeps {
  broker: SseBroker;
  store?: GameStore | null;
}

export function createEventsRoutes(
  brokerOrDeps: SseBroker | EventsRouteDeps
): Hono {
  const deps: EventsRouteDeps =
    brokerOrDeps instanceof Object && "broker" in brokerOrDeps
      ? brokerOrDeps
      : { broker: brokerOrDeps as SseBroker };
  const { broker, store } = deps;
  const app = new Hono();

  app.get("/:gameRoomId/subscribe", (c) => {
    const gameRoomId = c.req.param("gameRoomId");
    const lastEventId = c.req.header("last-event-id");
    const lastSeq = lastEventId ? Number(lastEventId) : 0;

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        const { replay, unsubscribe } = broker.subscribe(
          gameRoomId,
          Number.isFinite(lastSeq) ? lastSeq : 0,
          (payload) => {
            controller.enqueue(encoder.encode(payload));
          }
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
            const dbEvents = await store.loadEventsSince(gameRoomId, lastSeq);
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
          controller.enqueue(encoder.encode(item.payload));
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
  });

  return app;
}
