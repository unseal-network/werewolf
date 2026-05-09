import { Hono } from "hono";
import { createEventsRoutes } from "./routes/events";
import { createGamesRoutes, type GamesRouteDeps } from "./routes/games";
import { SseBroker } from "./services/sse-broker";

export type AppDeps = GamesRouteDeps & { broker?: SseBroker };

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();
  const broker = deps.broker ?? new SseBroker();
  app.route("/games", createGamesRoutes(deps));
  app.route("/games", createEventsRoutes(broker));
  return app;
}
