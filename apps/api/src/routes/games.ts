import { Hono } from "hono";
import { AppError } from "@werewolf/shared";
import { authenticateRequest, type MatrixAuthClient } from "../context/auth";
import type { InMemoryGameService } from "../services/game-service";

export interface GamesRouteDeps {
  matrix: MatrixAuthClient;
  games: InMemoryGameService;
}

export function createGamesRoutes(deps: GamesRouteDeps): Hono {
  const app = new Hono();

  app.post("/", async (c) => {
    try {
      const user = await authenticateRequest(c.req.raw, deps.matrix);
      const body = await c.req.json();
      const { room, card } = deps.games.createGame(body, user.id);
      return c.json({ gameRoomId: room.id, card }, 201);
    } catch (error) {
      if (error instanceof AppError) {
        return new Response(
          JSON.stringify({ error: error.message, code: error.code }),
          {
            status: error.status,
            headers: { "content-type": "application/json" },
          }
        );
      }
      return c.json(
        { error: error instanceof Error ? error.message : String(error) },
        400
      );
    }
  });

  return app;
}
