import { Hono } from "hono";
import { AccessToken, RoomServiceClient } from "livekit-server-sdk";
import { AppError } from "@werewolf/shared";
import {
  authenticateRequest,
  type MatrixAuthClient,
  type MatrixProfileCache,
} from "../context/auth";
import type { InMemoryGameService } from "../services/game-service";

export interface LivekitRouteDeps {
  matrix: MatrixAuthClient;
  profileCache?: MatrixProfileCache | undefined;
  games: InMemoryGameService;
}

const LIVEKIT_URL = process.env.LIVEKIT_URL || "ws://localhost:7880";
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || "devkey";
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || "secret";
const ensuredLivekitRooms = new Set<string>();
const ensuringLivekitRooms = new Map<string, Promise<void>>();

export function clearEnsuredLivekitRoomsForTests(): void {
  ensuredLivekitRooms.clear();
  ensuringLivekitRooms.clear();
}

export function createLivekitRoutes(deps: LivekitRouteDeps): Hono {
  const app = new Hono();
  const roomService = new RoomServiceClient(
    LIVEKIT_URL,
    LIVEKIT_API_KEY,
    LIVEKIT_API_SECRET
  );

  async function ensureLivekitRoom(gameRoomId: string): Promise<void> {
    if (ensuredLivekitRooms.has(gameRoomId)) return;
    const existing = ensuringLivekitRooms.get(gameRoomId);
    if (existing) return existing;
    const pending = roomService
      .createRoom({
        name: gameRoomId,
        emptyTimeout: 30 * 60,
        maxParticipants: 20,
      })
      .then(() => {
        ensuredLivekitRooms.add(gameRoomId);
      })
      .catch((err) => {
        if (err instanceof Error && err.message.toLowerCase().includes("already")) {
          ensuredLivekitRooms.add(gameRoomId);
          return;
        }
        throw err;
      })
      .finally(() => {
        ensuringLivekitRooms.delete(gameRoomId);
      });
    ensuringLivekitRooms.set(gameRoomId, pending);
    return pending;
  }

  function appErrorResponse(error: AppError): Response {
    return new Response(
      JSON.stringify({ error: error.message, code: error.code }),
      {
        status: error.status,
        headers: { "content-type": "application/json" },
      }
    );
  }

  // Generate LiveKit access token for a player to join the voice room
  app.post("/:gameRoomId/livekit-token", async (c) => {
    try {
      const user = await authenticateRequest(c.req.raw, deps.matrix, deps.profileCache);
      const gameRoomId = c.req.param("gameRoomId");
      const room = deps.games.snapshot(gameRoomId);
      const player = room.players.find(
        (p) => p.userId === user.id && !p.leftAt
      );
      const isPlayer = Boolean(player);
      const identity = user.id;

      const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
        identity,
        name: player?.displayName ?? user.displayName,
        ttl: "24h",
      });
      at.addGrant({
        room: gameRoomId,
        roomJoin: true,
        canPublish: isPlayer,
        canSubscribe: true,
        canPublishData: isPlayer,
      });

      const token = await at.toJwt();
      console.info("[LiveKit] issued player token", {
        gameRoomId,
        userId: user.id,
        identity,
        canPublish: isPlayer,
      });

      try {
        await ensureLivekitRoom(gameRoomId);
      } catch (err) {
        console.error("[LiveKit] createRoom failed:", err);
      }

      return c.json({
        token,
        serverUrl: LIVEKIT_URL,
        room: gameRoomId,
        identity,
        canPublish: isPlayer,
      });
    } catch (error) {
      if (error instanceof AppError) return appErrorResponse(error);
      return c.json(
        { error: error instanceof Error ? error.message : String(error) },
        400
      );
    }
  });

  // Ensure a LiveKit room exists (creator endpoint, idempotent)
  app.post("/:gameRoomId/livekit-room", async (c) => {
    try {
      await authenticateRequest(c.req.raw, deps.matrix, deps.profileCache);
      const gameRoomId = c.req.param("gameRoomId");
      deps.games.snapshot(gameRoomId);
      try {
        await ensureLivekitRoom(gameRoomId);
      } catch (err) {
        throw err;
      }
      return c.json({ success: true, room: gameRoomId });
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
