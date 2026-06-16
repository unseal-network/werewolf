import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import { AppError, type GameEvent } from "@werewolf/shared";
import {
  authenticateFromBody,
  authenticateRequest,
  type MatrixAuthClient,
  type MatrixProfileCache,
} from "../context/auth";
import type {
  InMemoryGameService,
  PlayerSubmittedAction,
  RuntimeAgentTurnInput,
  RuntimeAgentTurnOutput,
  StoredGameRoom,
} from "../services/game-service";
import {
  roomCommandSchema,
  type RoomActorDispatcher,
  type RoomCommand,
} from "../services/room-actor/types";

export interface GamesRouteDeps {
  matrix: MatrixAuthClient;
  profileCache?: MatrixProfileCache | undefined;
  games: InMemoryGameService;
  matrixHomeserverUrl?: string;
  fetchImpl?: typeof fetch;
  runAgentTurn?: (input: RuntimeAgentTurnInput) => Promise<RuntimeAgentTurnOutput>;
  roomActors: RoomActorDispatcher;
}

type DefaultAgentCandidate = {
  userId: string;
  displayName: string;
  avatarUrl?: string;
};

type AgentCandidateResponse = {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  userType: string;
  membership: string;
  alreadyJoined: boolean;
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
    console.log('homeserverUrl', homeserverUrl)
    return `${homeserverUrl.replace(/\/+$/, "")}/_matrix/media/v3/download/${encodeURIComponent(
      path.slice(0, slash)
    )}/${encodeURIComponent(path.slice(slash + 1))}`;
  }

  function matrixBearerToken(request: Request): string | undefined {
    const header = request.headers.get("authorization") ?? "";
    const match = header.match(/^Bearer\s+(.+)$/);
    return match?.[1] ?? undefined;
  }

  function toAgentCandidate(
    agent: DefaultAgentCandidate,
    seenAgentIds: Set<string | undefined>
  ): AgentCandidateResponse {
    const avatarUrl = matrixMediaUrl(agent.avatarUrl);
    return {
      userId: agent.userId,
      displayName: agent.displayName,
      ...(avatarUrl ? { avatarUrl } : {}),
      userType: "bot",
      membership: "join",
      alreadyJoined: seenAgentIds.has(agent.userId),
    };
  }

  function stringField(value: unknown): string | undefined {
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  }

  function normalizeExternalAgent(
    raw: unknown,
    seenAgentIds: Set<string | undefined>
  ): AgentCandidateResponse | null {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const record = raw as Record<string, unknown>;
    const userId =
      stringField(record.user_id) ??
      stringField(record.userId) ??
      stringField(record.matrix_user_id) ??
      stringField(record.matrixUserId) ??
      stringField(record.agent_id) ??
      stringField(record.agentId) ??
      stringField(record.id);
    if (!userId) return null;
    const displayName =
      stringField(record.display_name) ??
      stringField(record.displayName) ??
      stringField(record.name) ??
      userId;
    const avatarUrl =
      stringField(record.avatar_url) ??
      stringField(record.avatarUrl) ??
      stringField(record.avatar);
    const normalizedAvatarUrl = matrixMediaUrl(avatarUrl);
    return {
      userId,
      displayName,
      ...(normalizedAvatarUrl ? { avatarUrl: normalizedAvatarUrl } : {}),
      userType:
        stringField(record.user_type) ??
        stringField(record.userType) ??
        "agent",
      membership: stringField(record.membership) ?? "join",
      alreadyJoined: seenAgentIds.has(userId),
    };
  }

  function agentListFromBody(body: unknown): unknown[] {
    if (Array.isArray(body)) return body;
    if (!body || typeof body !== "object") return [];
    const record = body as Record<string, unknown>;
    const agents = record.agents ?? record.data ?? record.items;
    return Array.isArray(agents) ? agents : [];
  }

  async function listCurrentUserAgents(
    request: Request,
    seenAgentIds: Set<string | undefined>
  ): Promise<AgentCandidateResponse[]> {
    const token = matrixBearerToken(request);
    if (!token) return [];
    const homeserverUrl =
      deps.matrixHomeserverUrl ??
      process.env.MATRIX_BASE_URL ??
      "https://keepsecret.io";
    const url = `${homeserverUrl.replace(/\/+$/, "")}/chatbot/v1/agents`;
    const fetcher = deps.fetchImpl ?? fetch;
    try {
      const response = await fetcher(url, {
        headers: { authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return agentListFromBody(await response.json())
        .map((agent) => normalizeExternalAgent(agent, seenAgentIds))
        .filter((agent): agent is AgentCandidateResponse => Boolean(agent));
    } catch (error) {
      console.warn("[Agents] current user agents unavailable", {
        url,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  app.get("/me", async (c) => {
    try {
      const user = await authenticateRequest(c.req.raw, deps.matrix, deps.profileCache);
      return c.json({
        user_id: user.id,
        display_name: user.displayName,
        ...(user.avatarUrl ? { avatar_url: user.avatarUrl } : {}),
      });
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

  app.post("/", async (c) => {
    try {
      const body = await c.req.json();
      const user = await authenticateFromBody(c.req.raw, deps.matrix, {
        userId: stringField(body.userId),
        displayName: stringField(body.displayName),
        avatarUrl: stringField(body.avatarUrl),
      }, deps.profileCache);
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
      const body = await readOptionalJson(c.req.raw);
      const user = await authenticateFromBody(c.req.raw, deps.matrix, {
        userId: stringField(body.userId),
        displayName: stringField(body.displayName),
        avatarUrl: stringField(body.avatarUrl),
      }, deps.profileCache);
      const seatNo = numberValue(body.seatNo);
      const resolvedDisplayName = stringField(body.displayName) ?? user.displayName;
      const resolvedAvatarUrl = stringField(body.avatarUrl) ?? user.avatarUrl;

      const result = await dispatchActorCommand(deps, c.req.raw, {
        commandId: commandId(c.req.raw),
        gameRoomId: c.req.param("gameRoomId"),
        actorUserId: user.id,
        kind: "join",
        displayName: resolvedDisplayName,
        ...(resolvedAvatarUrl ? { avatarUrl: resolvedAvatarUrl } : {}),
        ...(seatNo ? { seatNo } : {}),
      });

      return c.json(result);
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
      const body = await readOptionalJson(c.req.raw);
      const user = await authenticateFromBody(c.req.raw, deps.matrix, {
        userId: stringField(body.userId),
        displayName: stringField(body.displayName),
        avatarUrl: stringField(body.avatarUrl),
      }, deps.profileCache);
      return c.json(
        await dispatchActorCommand(deps, c.req.raw, {
          commandId: commandId(c.req.raw),
          gameRoomId: c.req.param("gameRoomId"),
          actorUserId: user.id,
          kind: "leave",
        })
      );
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
      const body = await readOptionalJson(c.req.raw);
      const user = await authenticateFromBody(c.req.raw, deps.matrix, {
        userId: stringField(body.userId),
        displayName: stringField(body.displayName),
        avatarUrl: stringField(body.avatarUrl),
      }, deps.profileCache);
      return c.json(
        await dispatchActorCommand(deps, c.req.raw, {
          commandId: commandId(c.req.raw),
          gameRoomId: c.req.param("gameRoomId"),
          actorUserId: user.id,
          kind: "start",
        })
      );
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
      const body = (await c.req.json()) as Record<string, unknown>;
      const user = await authenticateFromBody(c.req.raw, deps.matrix, {
        userId: stringField(body.userId),
        displayName: stringField(body.displayName),
        avatarUrl: stringField(body.avatarUrl),
      }, deps.profileCache);
      const kind = stringValue(body.kind);
      if (
        !kind ||
        !["speech", "speechComplete", "vote", "nightAction", "pass"].includes(kind)
      ) {
        throw new AppError("invalid_action", "Invalid action kind", 400);
      }
      const room =
        kind === "vote" || kind === "nightAction"
          ? deps.games.snapshot(c.req.param("gameRoomId"))
          : null;
      const targetPlayerId =
        kind === "vote" || kind === "nightAction"
          ? resolveSubmittedTargetPlayerId(room!, body)
          : "";
      const action: PlayerSubmittedAction =
        kind === "speech"
          ? { kind: "speech", speech: String(body.speech ?? "") }
          : kind === "speechComplete"
            ? { kind: "speechComplete" }
            : kind === "vote"
              ? { kind: "vote", targetPlayerId }
              : kind === "nightAction"
                ? { kind: "nightAction", targetPlayerId }
                : { kind: "pass" };
      return c.json(
        await dispatchActorCommand(deps, c.req.raw, {
          commandId: commandId(c.req.raw),
          gameRoomId: c.req.param("gameRoomId"),
          actorUserId: user.id,
          kind: "submitAction",
          action,
        })
      );
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

  app.get("/:gameRoomId/events/:eventId/stream", async (c) => {
    try {
      const user = await authenticateRequest(c.req.raw, deps.matrix, deps.profileCache);
      const room = deps.games.snapshot(c.req.param("gameRoomId"));
      const eventId = c.req.param("eventId");
      const event = room.events.find((candidate) => candidate.id === eventId);
      if (!event || event.type !== "stream") {
        throw new AppError("not_found", "Stream event not found", 404);
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
        throw new AppError("not_found", "Stream event not found", 404);
      }
      return c.json({
        eventId: event.id,
        seq: event.seq,
        kind: event.payload.kind ?? "stream",
        text: String(event.payload.text ?? ""),
        final: Boolean(event.payload.final),
        source: event.payload.source ?? null,
        updatedAt: event.createdAt,
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
      const view = buildGameReadView(room, user.id);
      const snapshotEventId = room.events.at(-1)?.id ?? "";
      return c.json({
        snapshot: {
          snapshotEventId,
          latestEventId: snapshotEventId,
          displayState: {
            room: view.room,
            projection: view.room.projection,
            privateStates: view.privateStates,
          },
        },
        timelineCursor: { after: snapshotEventId },
      });
    } catch (error) {
      if (error instanceof AppError) return appErrorResponse(error);
      return c.json(
        { error: error instanceof Error ? error.message : String(error) },
        400
      );
    }
  });

  app.get("/:gameRoomId/timeline", async (c) => {
    try {
      const user = await authenticateRequest(c.req.raw, deps.matrix, deps.profileCache);
      const room = deps.games.snapshot(c.req.param("gameRoomId"));
      const after = c.req.query("after") ?? "";
      const before = c.req.query("before") ?? "";
      if (after && before) {
        throw new AppError("invalid_action", "Only one of before or after may be provided", 400);
      }
      const requestedLimit = Number(c.req.query("limit") ?? 100);
      const limit = Math.min(
        500,
        Math.max(1, Number.isFinite(requestedLimit) ? Math.trunc(requestedLimit) : 100)
      );
      const view = buildGameReadView(room, user.id);
      const ordered = [...view.events].sort((a, b) => a.id.localeCompare(b.id));
      const events = before
        ? ordered.filter((event) => event.id < before).slice(-limit)
        : ordered.filter((event) => !after || event.id > after).slice(0, limit);
      return c.json({
        events,
        cursor: {
          before: events[0]?.id ?? (before || null),
          after: events.at(-1)?.id ?? (after || null),
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

  app.get("/:gameRoomId/agent-candidates", async (c) => {
    try {
      await authenticateRequest(c.req.raw, deps.matrix, deps.profileCache);
      const room = deps.games.snapshot(c.req.param("gameRoomId"));
      const seenAgentIds = new Set(
        room.players
          .filter((player) => !player.leftAt && player.kind === "agent")
          .map((player) => player.agentId)
      );
      const fixedAgents = DEFAULT_AGENT_CANDIDATES.map((agent) =>
        toAgentCandidate(agent, seenAgentIds)
      );
      const currentUserAgents = await listCurrentUserAgents(
        c.req.raw,
        seenAgentIds
      );
      const agentsById = new Map<string, AgentCandidateResponse>();
      for (const agent of [...currentUserAgents, ...fixedAgents]) {
        if (!agentsById.has(agent.userId)) agentsById.set(agent.userId, agent);
      }
      const agents = Array.from(agentsById.values());
      return c.json({
        agents,
        total: agents.length,
      });
    } catch (error) {
      if (error instanceof AppError) return appErrorResponse(error);
      return c.json(
        { error: error instanceof Error ? error.message : String(error) },
        400
      );
    }
  });

  app.post("/:gameRoomId/agents/fill", async (c) => {
    try {
      const body = (await c.req.json()) as Record<string, unknown>;
      const user = await authenticateFromBody(c.req.raw, deps.matrix, {
        userId: stringField(body.userId),
        displayName: stringField(body.displayName),
        avatarUrl: stringField(body.avatarUrl),
      }, deps.profileCache);
      const targetPlayerCount = positiveIntegerValue(body.targetPlayerCount);
      if (!targetPlayerCount) {
        throw new AppError("invalid_action", "targetPlayerCount is required", 400);
      }

      const room = deps.games.snapshot(c.req.param("gameRoomId"));
      if (targetPlayerCount > room.targetPlayerCount) {
        throw new AppError(
          "invalid_action",
          `targetPlayerCount is outside the room limit (1-${room.targetPlayerCount})`,
          400
        );
      }

      const activePlayers = room.players.filter((player) => !player.leftAt);
      const missingSeats = Math.max(targetPlayerCount - activePlayers.length, 0);
      if (missingSeats === 0) {
        return c.json({ addedPlayers: [], targetPlayerCount }, 200);
      }

      const seenAgentIds = new Set(
        activePlayers
          .filter((player) => player.kind === "agent")
          .map((player) => player.agentId)
      );
      const currentUserAgents = await listCurrentUserAgents(
        c.req.raw,
        seenAgentIds
      );
      const selectedById = new Set<string>();
      const userOwnedCandidates = shuffled(
        currentUserAgents.filter((agent) => !agent.alreadyJoined)
      );
      const fixedCandidates = shuffled(
        DEFAULT_AGENT_CANDIDATES
          .map((agent) => toAgentCandidate(agent, seenAgentIds))
          .filter((agent) => !agent.alreadyJoined)
      );
      const candidates: AgentCandidateResponse[] = [];
      for (const agent of [...userOwnedCandidates, ...fixedCandidates]) {
        if (selectedById.has(agent.userId)) continue;
        selectedById.add(agent.userId);
        candidates.push(agent);
      }

      if (candidates.length < missingSeats) {
        throw new AppError("conflict", "Not enough available agents to fill seats", 409);
      }

      const baseCommandId = commandId(c.req.raw);
      const addedPlayers: unknown[] = [];
      for (const [index, agent] of candidates.slice(0, missingSeats).entries()) {
        const result = await dispatchActorCommand(deps, c.req.raw, {
          commandId: `${baseCommandId}:fill:${index + 1}`,
          gameRoomId: room.id,
          actorUserId: user.id,
          kind: "addAgent",
          agentUserId: agent.userId,
          displayName: agent.displayName,
          ...(agent.avatarUrl ? { avatarUrl: matrixMediaUrl(agent.avatarUrl) } : {}),
        });
        const player = resultPlayer(result);
        if (player) addedPlayers.push(player);
      }

      return c.json({ addedPlayers, targetPlayerCount }, 201);
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
      const body = (await c.req.json()) as Record<string, unknown>;
      const user = await authenticateFromBody(c.req.raw, deps.matrix, {
        userId: stringField(body.userId),
        displayName: stringField(body.displayName),
        avatarUrl: stringField(body.avatarUrl),
      }, deps.profileCache);
      const agentUserId = stringValue(body.agentUserId);
      if (!agentUserId) {
        throw new AppError("invalid_action", "agentUserId is required", 400);
      }
      return c.json(
        await dispatchActorCommand(deps, c.req.raw, {
          commandId: commandId(c.req.raw),
          gameRoomId: c.req.param("gameRoomId"),
          actorUserId: user.id,
          kind: "addAgent",
          agentUserId,
          displayName: stringValue(body.displayName) ?? agentUserId,
          ...(stringValue(body.avatarUrl)
            ? { avatarUrl: matrixMediaUrl(stringValue(body.avatarUrl)) }
            : {}),
        }),
        201
      );
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
      const body = (await c.req.json()) as Record<string, unknown>;
      const user = await authenticateFromBody(c.req.raw, deps.matrix, {
        userId: stringField(body.userId),
        displayName: stringField(body.displayName),
        avatarUrl: stringField(body.avatarUrl),
      }, deps.profileCache);
      const seatNo = numberValue(body.seatNo);
      if (!seatNo) {
        throw new AppError("invalid_action", "seatNo is required", 400);
      }
      return c.json(
        await dispatchActorCommand(deps, c.req.raw, {
          commandId: commandId(c.req.raw),
          gameRoomId: c.req.param("gameRoomId"),
          actorUserId: user.id,
          kind: "swapSeat",
          seatNo,
        })
      );
    } catch (error) {
      if (error instanceof AppError) return appErrorResponse(error);
      return c.json(
        { error: error instanceof Error ? error.message : String(error) },
        400
      );
    }
  });

  app.delete("/:gameRoomId/players/:matrixUserId", async (c) => {
    try {
      const user = await authenticateRequest(c.req.raw, deps.matrix, deps.profileCache);
      const room = deps.games.snapshot(c.req.param("gameRoomId"));
      const playerId = resolvePlayerIdByMatrixUserId(
        room,
        c.req.param("matrixUserId")
      );
      return c.json(
        await dispatchActorCommand(deps, c.req.raw, {
          commandId: commandId(c.req.raw),
          gameRoomId: c.req.param("gameRoomId"),
          actorUserId: user.id,
          kind: "removePlayer",
          playerId,
        })
      );
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

function commandId(request: Request): string {
  const value = request.headers.get("x-command-id");
  return value && value.trim() ? value : `cmd_${randomUUID()}`;
}

async function dispatchActorCommand(
  deps: GamesRouteDeps,
  _request: Request,
  command: RoomCommand
): Promise<unknown> {
  return deps.roomActors.dispatch(roomCommandSchema.parse(command));
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

function resolveSubmittedTargetPlayerId(
  room: StoredGameRoom,
  body: Record<string, unknown>
): string {
  const targetMatrixUserId = stringValue(body.targetMatrixUserId);
  if (!targetMatrixUserId) {
    throw new AppError("invalid_action", "targetMatrixUserId is required", 400);
  }
  return resolvePlayerIdByMatrixUserId(room, targetMatrixUserId);
}

function resolvePlayerIdByMatrixUserId(
  room: StoredGameRoom,
  matrixUserId: string
): string {
  const player = room.players.find(
    (candidate) =>
      !candidate.leftAt &&
      (candidate.userId === matrixUserId || candidate.agentId === matrixUserId)
  );
  if (!player) {
    throw new AppError("invalid_action", "Matrix user is not in this room", 400);
  }
  return player.id;
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

function positiveIntegerValue(value: unknown): number | undefined {
  const parsed = numberValue(value);
  return parsed && Number.isInteger(parsed) ? parsed : undefined;
}

function shuffled<T>(items: readonly T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex]!, result[index]!];
  }
  return result;
}

function resultPlayer(result: unknown): unknown | null {
  if (!result || typeof result !== "object") return null;
  return (result as { player?: unknown }).player ?? null;
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

function buildGameReadView(room: StoredGameRoom, userId: string) {
  const myPlayer = room.players.find((p) => p.userId === userId && !p.leftAt);
  const myPlayerId = myPlayer?.id;
  const myPrivateState = myPlayerId
    ? room.privateStates.find((s) => s.playerId === myPlayerId)
    : undefined;
  const isWolf = Boolean(myPrivateState?.team === "wolf" && myPrivateState.alive);
  const revealAll = room.status === "ended" || room.projection?.status === "ended";
  const events = filterEventsForUser(room.events, myPlayerId, isWolf, revealAll);
  const privateStates = myPrivateState ? [myPrivateState] : [];
  const {
    events: _events,
    privateStates: _privateStates,
    agentSourceMatrixRoomId: _agentSourceMatrixRoomId,
    ...roomWithoutTimeline
  } = room;
  return {
    room: { ...roomWithoutTimeline, privateStates },
    events,
    privateStates,
  };
}
