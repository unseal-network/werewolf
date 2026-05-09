import { Hono } from "hono";
import { buildAgentTurnTools, generateWithAgent } from "@werewolf/agent-client";
import { AppError } from "@werewolf/shared";
import { authenticateRequest, type MatrixAuthClient } from "../context/auth";
import type {
  InMemoryGameService,
  RuntimeAgentTurnInput,
} from "../services/game-service";

export interface GamesRouteDeps {
  matrix: MatrixAuthClient;
  games: InMemoryGameService;
  runAgentTurn?: (input: RuntimeAgentTurnInput) => Promise<string>;
}

export function createGamesRoutes(deps: GamesRouteDeps): Hono {
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

  app.post("/", async (c) => {
    try {
      const user = await authenticateRequest(c.req.raw, deps.matrix);
      const body = await c.req.json();
      const { room, card } = deps.games.createGame(body, user.id);
      return c.json({ gameRoomId: room.id, card }, 201);
    } catch (error) {
      if (error instanceof AppError) {
        return appErrorResponse(error);
      }
      return c.json(
        { error: error instanceof Error ? error.message : String(error) },
        400
      );
    }
  });

  app.post("/:gameRoomId/join", async (c) => {
    try {
      const user = await authenticateRequest(c.req.raw, deps.matrix);
      const player = deps.games.join(
        c.req.param("gameRoomId"),
        user.id,
        user.displayName
      );
      return c.json({ player });
    } catch (error) {
      if (error instanceof AppError) return appErrorResponse(error);
      return c.json(
        { error: error instanceof Error ? error.message : String(error) },
        400
      );
    }
  });

  app.post("/:gameRoomId/leave", async (c) => {
    try {
      const user = await authenticateRequest(c.req.raw, deps.matrix);
      const player = deps.games.leave(c.req.param("gameRoomId"), user.id);
      return c.json({ player });
    } catch (error) {
      if (error instanceof AppError) return appErrorResponse(error);
      return c.json(
        { error: error instanceof Error ? error.message : String(error) },
        400
      );
    }
  });

  app.post("/:gameRoomId/start", async (c) => {
    try {
      const user = await authenticateRequest(c.req.raw, deps.matrix);
      const started = deps.games.start(c.req.param("gameRoomId"), user.id);
      return c.json({
        status: started.room.status,
        projection: started.projection,
        privateStates: started.privateStates,
        events: started.events,
      });
    } catch (error) {
      if (error instanceof AppError) return appErrorResponse(error);
      return c.json(
        { error: error instanceof Error ? error.message : String(error) },
        400
      );
    }
  });

  app.post("/:gameRoomId/runtime/tick", async (c) => {
    try {
      const user = await authenticateRequest(c.req.raw, deps.matrix);
      const body = await readOptionalJson(c.req.raw);
      const agentApiBaseUrl =
        stringValue(body.agentApiBaseUrl) ??
        process.env.UNSEAL_AGENT_API_BASE_URL ??
        "https://keepsecret.io/chatbot/v1";
      const agentApiKey =
        stringValue(body.agentApiKey) ?? process.env.UNSEAL_AGENT_API_KEY;
      const runAgentTurn =
        deps.runAgentTurn ??
        (async (input: RuntimeAgentTurnInput) => {
          if (!agentApiKey) {
            throw new AppError(
              "invalid_action",
              "UNSEAL_AGENT_API_KEY or agentApiKey is required",
              400
            );
          }
          const generated = await generateWithAgent({
            apiBaseUrl: agentApiBaseUrl,
            adminToken: agentApiKey,
            agentId: input.agentId,
            body: {
              messages: [{ role: "user", content: input.prompt }],
              temperature: 0.2,
              maxOutputTokens: 80,
              tools: buildAgentTurnTools({
                phase: input.phase,
                role: input.role,
                alivePlayerIds:
                  deps.games.snapshot(c.req.param("gameRoomId")).projection
                    ?.alivePlayerIds ?? [],
                selfPlayerId: input.playerId,
              }),
            },
          });
          return generated.text || `${input.displayName} passes.`;
        });
      const tick = await deps.games.runtimeTick(
        c.req.param("gameRoomId"),
        user.id,
        runAgentTurn
      );
      return c.json({
        status: tick.room.status,
        done: tick.done,
        projection: tick.projection,
        events: tick.events,
      });
    } catch (error) {
      if (error instanceof AppError) return appErrorResponse(error);
      return c.json(
        { error: error instanceof Error ? error.message : String(error) },
        400
      );
    }
  });

  app.get("/:gameRoomId", async (c) => {
    try {
      await authenticateRequest(c.req.raw, deps.matrix);
      const room = deps.games.snapshot(c.req.param("gameRoomId"));
      return c.json({
        room,
        projection: room.projection,
        privateStates: room.privateStates,
        events: room.events,
      });
    } catch (error) {
      if (error instanceof AppError) return appErrorResponse(error);
      return c.json(
        { error: error instanceof Error ? error.message : String(error) },
        400
      );
    }
  });

  return app;
}

async function readOptionalJson(request: Request): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return {};
  const text = await request.text();
  if (!text.trim()) return {};
  const parsed = JSON.parse(text) as unknown;
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
