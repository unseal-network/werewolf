import { Hono } from "hono";
import { createGamesRoutes, type GamesRouteDeps } from "./routes/games";

export type AppDeps = GamesRouteDeps;

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();
  app.route("/games", createGamesRoutes(deps));
  return app;
}
