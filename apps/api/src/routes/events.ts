import { Hono } from "hono";
import type { SseBroker } from "../services/sse-broker";

export function createEventsRoutes(broker: SseBroker): Hono {
  const app = new Hono();

  app.get("/:gameRoomId/subscribe", (c) => {
    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        const unsubscribe = broker.subscribe(
          c.req.param("gameRoomId"),
          (payload) => {
            controller.enqueue(encoder.encode(payload));
          }
        );

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
