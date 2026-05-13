import { Hono } from "hono";
import { AppError, gamePhaseSchema, type GameEvent } from "@werewolf/shared";
import {
  authenticateRequest,
  type MatrixAuthClient,
  type MatrixProfileCache,
} from "../context/auth";
import type {
  InMemoryGameService,
  PlayerSubmittedAction,
  RuntimeAgentTurnInput,
  RuntimeAgentTurnOutput,
} from "../services/game-service";

export interface GamesRouteDeps {
  matrix: MatrixAuthClient;
  profileCache?: MatrixProfileCache | undefined;
  games: InMemoryGameService;
  matrixHomeserverUrl?: string;
  runAgentTurn?: (input: RuntimeAgentTurnInput) => Promise<RuntimeAgentTurnOutput>;
}

type DefaultAgentCandidate = {
  userId: string;
  displayName: string;
  avatarUrl?: string;
};

const DEFAULT_AGENT_CANDIDATES: readonly DefaultAgentCandidate[] = [
  { userId: "@game-10:keepsecret.io", displayName: "game-10" },
  { userId: "@game-12:keepsecret.io", displayName: "game-12" },
  { userId: "@game-13:keepsecret.io", displayName: "game-13" },
  { userId: "@game-1:keepsecret.io", displayName: "game-1" },
  { userId: "@game-2:keepsecret.io", displayName: "game-2" },
  { userId: "@game-3:keepsecret.io", displayName: "game-3" },
  { userId: "@game-4:keepsecret.io", displayName: "game-4" },
  { userId: "@game-5:keepsecret.io", displayName: "game-5" },
  { userId: "@game-6:keepsecret.io", displayName: "game-6" },
  { userId: "@game-7:keepsecret.io", displayName: "game-7" },
  { userId: "@game-8:keepsecret.io", displayName: "game-8" },
  {
    userId: "@kimigame1:keepsecret.io",
    displayName: "kimi game 1",
    avatarUrl: "https://api.dicebear.com/9.x/bottts/svg?seed=Felix",
  },
  { userId: "@kimigame2:keepsecret.io", displayName: "kimi game 2" },
  { userId: "@kimigame3:keepsecret.io", displayName: "kimi game 3" },
  { userId: "@kimigame4:keepsecret.io", displayName: "kimi game 4" },
  { userId: "@kimigame5:keepsecret.io", displayName: "kimi game 5" },
  { userId: "@kimigame6:keepsecret.io", displayName: "kimi game 6" },
] as const;

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

  function matrixMediaUrl(uri: string | undefined): string | undefined {
    if (!uri) return undefined;
    if (!uri.startsWith("mxc://")) return uri;
    const homeserverUrl =
      deps.matrixHomeserverUrl ??
      process.env.MATRIX_BASE_URL ??
      "https://keepsecret.io";
    const path = uri.slice("mxc://".length);
    const slash = path.indexOf("/");
    if (slash <= 0 || slash === path.length - 1) return undefined;
    return `${homeserverUrl.replace(/\/+$/, "")}/_matrix/media/v3/download/${encodeURIComponent(
      path.slice(0, slash)
    )}/${encodeURIComponent(path.slice(slash + 1))}`;
  }

  app.post("/", async (c) => {
    try {
      const user = await authenticateRequest(c.req.raw, deps.matrix, deps.profileCache);
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
      const user = await authenticateRequest(c.req.raw, deps.matrix, deps.profileCache);
      const body = await readOptionalJson(c.req.raw);
      const seatNo = numberValue(body.seatNo);
      const player = deps.games.join(
        c.req.param("gameRoomId"),
        user.id,
        user.displayName,
        user.avatarUrl,
        seatNo
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
      const user = await authenticateRequest(c.req.raw, deps.matrix, deps.profileCache);
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
      const user = await authenticateRequest(c.req.raw, deps.matrix, deps.profileCache);
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
        events: filterEventsForUser(
          started.events,
          myPlayer?.id,
          myPrivateState?.team === "wolf" && myPrivateState.alive,
          started.room.status === "ended"
        ),
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
      const user = await authenticateRequest(c.req.raw, deps.matrix, deps.profileCache);
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
      const expectedPhaseRaw = stringValue(body.expectedPhase);
      const expectedPhase = expectedPhaseRaw
        ? gamePhaseSchema.parse(expectedPhaseRaw)
        : undefined;
      const expectedDay = optionalPositiveInteger(body, "expectedDay");
      const expectedVersion = optionalPositiveInteger(body, "expectedVersion");
      if (expectedPhase !== undefined) action.expectedPhase = expectedPhase;
      if (expectedDay !== undefined) action.expectedDay = expectedDay;
      if (expectedVersion !== undefined) action.expectedVersion = expectedVersion;
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

  app.post("/:gameRoomId/runtime/tick", async (c) => {
    try {
      const user = await authenticateRequest(c.req.raw, deps.matrix, deps.profileCache);
      if (!deps.games.hasRunAgentTurn()) {
        throw new AppError("conflict", "Runtime agent turn runner is not configured", 409);
      }
      const gameRoomId = c.req.param("gameRoomId");
      const beforeRoom = deps.games.snapshot(gameRoomId);
      const myPlayer = beforeRoom.players.find(
        (p) => p.userId === user.id && !p.leftAt
      );
      const isCreator = beforeRoom.creatorUserId === user.id;
      if (!myPlayer && !isCreator) {
        throw new AppError("not_found", "You are not in this room", 404);
      }
      const myPrivateState = beforeRoom.privateStates.find(
        (state) => state.playerId === myPlayer?.id
      );
      const beforeSeq = beforeRoom.events.length;

      await deps.games.scheduleAdvance(gameRoomId);

      const room = deps.games.snapshot(gameRoomId);
      const revealAll = room.status === "ended" || room.projection?.status === "ended";
      const isWolf = myPrivateState?.team === "wolf" && myPrivateState.alive;
      const events = filterEventsForUser(
        room.events.slice(beforeSeq),
        myPlayer?.id,
        Boolean(isWolf),
        revealAll
      );
      return c.json({
        status: room.status,
        done: room.status === "ended",
        projection: room.projection,
        events,
      });
    } catch (error) {
      if (error instanceof AppError) return appErrorResponse(error);
      return c.json(
        { error: error instanceof Error ? error.message : String(error) },
        400
      );
    }
  });

  app.get("/:gameRoomId/events/:eventId/transcript", async (c) => {
    try {
      const user = await authenticateRequest(c.req.raw, deps.matrix, deps.profileCache);
      const room = deps.games.snapshot(c.req.param("gameRoomId"));
      const eventId = c.req.param("eventId");
      const event = room.events.find((candidate) => candidate.id === eventId);
      if (!event) {
        throw new AppError("not_found", "Transcript event not found", 404);
      }
      const myPlayer = room.players.find(
        (p) => p.userId === user.id && !p.leftAt
      );
      const myPrivateState = myPlayer
        ? room.privateStates.find((s) => s.playerId === myPlayer.id)
        : undefined;
      const visible = filterEventsForUser(
        [event],
        myPlayer?.id,
        Boolean(myPrivateState?.team === "wolf" && myPrivateState.alive),
        room.status === "ended" || room.projection?.status === "ended"
      );
      if (visible.length === 0) {
        throw new AppError("not_found", "Transcript event not found", 404);
      }
      const text =
        typeof event.payload.text === "string"
          ? event.payload.text
          : typeof event.payload.speech === "string"
            ? event.payload.speech
            : "";
      if (!text.trim()) {
        throw new AppError("not_found", "Transcript text not found", 404);
      }
      console.log(`[TranscriptDownload] ${room.id} ${event.id}: ${text}`);
      return new Response(`${text}\n`, {
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "content-disposition": `attachment; filename="${event.id}.txt"`,
        },
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
      const user = await authenticateRequest(c.req.raw, deps.matrix, deps.profileCache);
      const room = deps.games.snapshot(c.req.param("gameRoomId"));
      const myPlayer = room.players.find(
        (p) => p.userId === user.id && !p.leftAt
      );
      const myPlayerId = myPlayer?.id;
      const myPrivateState = myPlayerId
        ? room.privateStates.find((s) => s.playerId === myPlayerId)
        : undefined;
      const isWolf = myPrivateState?.team === "wolf" && myPrivateState.alive;

      const filteredEvents = filterEventsForUser(
        room.events,
        myPlayerId,
        isWolf,
        room.status === "ended" || room.projection?.status === "ended"
      );
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
      await authenticateRequest(c.req.raw, deps.matrix, deps.profileCache);
      const room = deps.games.snapshot(c.req.param("gameRoomId"));
      const seenAgentIds = new Set(
        room.players
          .filter((player) => !player.leftAt && player.kind === "agent")
          .map((player) => player.agentId)
      );
      return c.json({
        agents: DEFAULT_AGENT_CANDIDATES.map((agent) => ({
          userId: agent.userId,
          displayName: agent.displayName,
          avatarUrl: matrixMediaUrl(agent.avatarUrl),
          userType: "bot",
          membership: "join",
          alreadyJoined: seenAgentIds.has(agent.userId),
        })),
        total: DEFAULT_AGENT_CANDIDATES.length,
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
      const user = await authenticateRequest(c.req.raw, deps.matrix, deps.profileCache);
      const body = (await c.req.json()) as Record<string, unknown>;
      const agentUserId = stringValue(body.agentUserId);
      if (!agentUserId) {
        throw new AppError("invalid_action", "agentUserId is required", 400);
      }
      const player = deps.games.addAgentPlayer(
        c.req.param("gameRoomId"),
        user.id,
        agentUserId,
        stringValue(body.displayName) ?? agentUserId,
        matrixMediaUrl(stringValue(body.avatarUrl))
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
      const user = await authenticateRequest(c.req.raw, deps.matrix, deps.profileCache);
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
      const user = await authenticateRequest(c.req.raw, deps.matrix, deps.profileCache);
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

function optionalPositiveInteger(
  body: Record<string, unknown>,
  key: string
): number | undefined {
  if (!Object.prototype.hasOwnProperty.call(body, key)) return undefined;
  const value = body[key];
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN;
  if (Number.isInteger(parsed) && parsed > 0) return parsed;
  throw new AppError("invalid_action", `${key} must be a positive integer`, 400);
}

export function filterEventsForUser(
  events: GameEvent[],
  myPlayerId: string | undefined,
  isWolf: boolean,
  revealAll = false
): GameEvent[] {
  return events.filter((event) => {
    if (event.visibility === "runtime") return false;
    if (revealAll) return true;
    if (event.visibility === "public") return true;
    if (event.visibility === "private:team:wolf") return isWolf;
    if (event.visibility.startsWith("private:user:")) {
      return event.visibility === `private:user:${myPlayerId}`;
    }
    return false;
  });
}
