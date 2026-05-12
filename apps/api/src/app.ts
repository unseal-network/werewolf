import { Hono } from "hono";
import { cors } from "hono/cors";
import { createEventsRoutes } from "./routes/events";
import { createGamesRoutes, type GamesRouteDeps } from "./routes/games";
import { createLivekitRoutes } from "./routes/livekit";
import { createWebhookRoutes } from "./routes/webhook";
import { SseBroker } from "./services/sse-broker";
import type { GameStore } from "./services/game-store";

export type AppDeps = GamesRouteDeps & {
  broker?: SseBroker;
  /** Optional DB-backed store so the SSE route can replay events even
   *  after a process restart (when the broker's in-memory history is empty). */
  store?: GameStore | null;
};

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();
  const broker = deps.broker ?? new SseBroker();
  deps.games.setBroker(broker);
  if (deps.runAgentTurn) {
    deps.games.setRunAgentTurn(deps.runAgentTurn);
  }
  app.use("*", cors());
  app.route("/games", createGamesRoutes(deps));
  app.route("/", createWebhookRoutes());
  app.route(
    "/games",
    createEventsRoutes({
      broker,
      store: deps.store ?? null,
      games: deps.games,
      matrix: deps.matrix,
    })
  );
  app.route("/games", createLivekitRoutes(deps));
  return app;
}
