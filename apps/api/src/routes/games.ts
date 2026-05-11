import { Hono } from "hono";
import {
  listRoomAgents,
} from "@werewolf/agent-client";
import { AppError, type GameEvent } from "@werewolf/shared";
import { authenticateRequest, type MatrixAuthClient } from "../context/auth";
import type {
  InMemoryGameService,
  PlayerSubmittedAction,
  RuntimeAgentTurnInput,
  RuntimeAgentTurnOutput,
} from "../services/game-service";

export interface GamesRouteDeps {
  matrix: MatrixAuthClient;
  games: InMemoryGameService;
  matrixHomeserverUrl?: string;
  runAgentTurn?: (input: RuntimeAgentTurnInput) => Promise<RuntimeAgentTurnOutput>;
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
      // runAgentTurn is set globally at server startup (server.ts) so the
      // tick worker can advance rooms even after a restart without waiting
      // for a client API call. Just kick the advance loop.
      void deps.games.scheduleAdvance(c.req.param("gameRoomId"));
      const myPlayer = started.room.players.find(
        (p) => p.userId === user.id && !p.leftAt
      );
      const myPrivateState = myPlayer
        ? started.privateStates.find((s) => s.playerId === myPlayer.id)
        : undefined;
      return c.json({
        status: started.room.status,
        projection: started.projection,
        privateStates: myPrivateState ? [myPrivateState] : [],
        events: filterEventsForUser(started.events, myPlayer?.id, myPrivateState?.team === "wolf"),
      });
    } catch (error) {
      if (error instanceof AppError) return appErrorResponse(error);
      return c.json(
        { error: error instanceof Error ? error.message : String(error) },
        400
      );
    }
  });

  app.post("/:gameRoomId/actions", async (c) => {
    try {
      const user = await authenticateRequest(c.req.raw, deps.matrix);
      const body = (await c.req.json()) as Record<string, unknown>;
      const room = deps.games.snapshot(c.req.param("gameRoomId"));
      const player = room.players.find(
        (p) => p.userId === user.id && !p.leftAt
      );
      if (!player) {
        throw new AppError("not_found", "You are not in this room", 404);
      }
      const kind = stringValue(body.kind);
      if (
        !kind ||
        !["speech", "speechComplete", "vote", "nightAction", "pass"].includes(kind)
      ) {
        throw new AppError("invalid_action", "Invalid action kind", 400);
      }
      const action: PlayerSubmittedAction =
        kind === "speech"
          ? { kind: "speech", speech: String(body.speech ?? "") }
          : kind === "speechComplete"
            ? { kind: "speechComplete" }
            : kind === "vote"
              ? { kind: "vote", targetPlayerId: String(body.targetPlayerId ?? "") }
              : kind === "nightAction"
                ? { kind: "nightAction", targetPlayerId: String(body.targetPlayerId ?? "") }
                : { kind: "pass" };
      const event = await deps.games.submitAction(
        c.req.param("gameRoomId"),
        player.id,
        action
      );
      return c.json({ success: true, event });
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
      const user = await authenticateRequest(c.req.raw, deps.matrix);
      const room = deps.games.snapshot(c.req.param("gameRoomId"));
      const myPlayer = room.players.find(
        (p) => p.userId === user.id && !p.leftAt
      );
      const myPlayerId = myPlayer?.id;
      const myPrivateState = myPlayerId
        ? room.privateStates.find((s) => s.playerId === myPlayerId)
        : undefined;
      const isWolf = myPrivateState?.team === "wolf";

      const filteredEvents = filterEventsForUser(room.events, myPlayerId, isWolf);
      const filteredPrivateStates = myPrivateState ? [myPrivateState] : [];

      return c.json({
        room: { ...room, events: filteredEvents, privateStates: filteredPrivateStates },
        projection: room.projection,
        privateStates: filteredPrivateStates,
        events: filteredEvents,
      });
    } catch (error) {
      if (error instanceof AppError) return appErrorResponse(error);
      return c.json(
        { error: error instanceof Error ? error.message : String(error) },
        400
      );
    }
  });

  app.get("/:gameRoomId/agent-candidates", async (c) => {
    try {
      await authenticateRequest(c.req.raw, deps.matrix);
      const room = deps.games.snapshot(c.req.param("gameRoomId"));
      const homeserverUrl =
        deps.matrixHomeserverUrl ??
        process.env.MATRIX_BASE_URL ??
        "https://keepsecret.io";
      const matrixToken = extractBearer(c.req.raw);
      // Single source of truth: the Matrix room. If Synapse is unreachable or
      // returns an error, propagate it to the client — we used to silently
      // fall back to a hardcoded list which made the "demo" path look like a
      // separate mode. There is no demo mode now: the demo user is just a
      // pre-configured login, the game flow is identical to any other user.
      const result = await listRoomAgents({
        homeserverUrl,
        roomId: room.agentSourceMatrixRoomId,
        matrixToken,
      });
      const seenAgentIds = new Set(
        room.players
          .filter((player) => !player.leftAt && player.kind === "agent")
          .map((player) => player.agentId)
      );
      return c.json({
        agents: result.agents.map((agent) => ({
          userId: agent.userId,
          displayName: agent.displayName,
          avatarUrl: agent.avatarUrl,
          userType: agent.userType,
          membership: agent.membership,
          alreadyJoined: seenAgentIds.has(agent.userId),
        })),
        total: result.total,
        roomId: room.agentSourceMatrixRoomId,
      });
    } catch (error) {
      if (error instanceof AppError) return appErrorResponse(error);
      return c.json(
        { error: error instanceof Error ? error.message : String(error) },
        400
      );
    }
  });

  app.post("/:gameRoomId/agents", async (c) => {
    try {
      const user = await authenticateRequest(c.req.raw, deps.matrix);
      const body = (await c.req.json()) as Record<string, unknown>;
      const agentUserId = stringValue(body.agentUserId);
      const displayName = stringValue(body.displayName) ?? agentUserId ?? "";
      if (!agentUserId) {
        throw new AppError("invalid_action", "agentUserId is required", 400);
      }
      const player = deps.games.addAgentPlayer(
        c.req.param("gameRoomId"),
        user.id,
        agentUserId,
        displayName
      );
      return c.json({ player }, 201);
    } catch (error) {
      if (error instanceof AppError) return appErrorResponse(error);
      return c.json(
        { error: error instanceof Error ? error.message : String(error) },
        400
      );
    }
  });

  app.post("/:gameRoomId/seat", async (c) => {
    try {
      const user = await authenticateRequest(c.req.raw, deps.matrix);
      const body = (await c.req.json()) as Record<string, unknown>;
      const seatNo = numberValue(body.seatNo);
      if (!seatNo) {
        throw new AppError("invalid_action", "seatNo is required", 400);
      }
      const result = deps.games.swapSeat(
        c.req.param("gameRoomId"),
        user.id,
        seatNo
      );
      return c.json(result);
    } catch (error) {
      if (error instanceof AppError) return appErrorResponse(error);
      return c.json(
        { error: error instanceof Error ? error.message : String(error) },
        400
      );
    }
  });

  app.delete("/:gameRoomId/players/:playerId", async (c) => {
    try {
      const user = await authenticateRequest(c.req.raw, deps.matrix);
      const player = deps.games.removePlayer(
        c.req.param("gameRoomId"),
        user.id,
        c.req.param("playerId")
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

  return app;
}

function extractBearer(request: Request): string {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/);
  if (!match?.[1]) {
    throw new AppError("unauthorized", "Matrix bearer token is required", 401);
  }
  return match[1];
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

function numberValue(value: unknown): number | undefined {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function filterEventsForUser(
  events: GameEvent[],
  myPlayerId: string | undefined,
  isWolf: boolean
): GameEvent[] {
  return events.filter((event) => {
    if (event.visibility === "public") return true;
    if (event.visibility === "runtime") return false;
    if (event.visibility === "private:team:wolf") return isWolf;
    if (event.visibility.startsWith("private:user:")) {
      return event.visibility === `private:user:${myPlayerId}`;
    }
    return false;
  });
}
