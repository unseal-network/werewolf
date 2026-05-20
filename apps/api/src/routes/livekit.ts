import { Hono } from "hono";
import { AccessToken, WebhookReceiver } from "livekit-server-sdk";
import { AppError } from "@werewolf/shared";
import {
  authenticateRequest,
  type MatrixAuthClient,
  type MatrixProfileCache,
} from "../context/auth";
import type { InMemoryGameService } from "../services/game-service";
import type { LivekitMeetingController } from "../services/livekit-meeting-controller";

export interface LivekitRouteDeps {
  matrix: MatrixAuthClient;
  profileCache?: MatrixProfileCache | undefined;
  games: InMemoryGameService;
  livekitMeeting: LivekitMeetingController;
}

const LIVEKIT_URL = process.env.LIVEKIT_URL || "ws://localhost:7880";
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || "devkey";
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || "secret";

export function createLivekitRoutes(deps: LivekitRouteDeps): Hono {
  const app = new Hono();
  const { livekitMeeting } = deps;
  const webhookReceiver = new WebhookReceiver(
    LIVEKIT_API_KEY,
    LIVEKIT_API_SECRET
  );

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
        await livekitMeeting.ensureRoom(gameRoomId);
      } catch (err) {
        console.error("[LiveKit] createRoom failed:", err);
      }

      return c.json({
        token,
        serverUrl: LIVEKIT_URL,
        room: gameRoomId,
        identity,
        canPublish: isPlayer,
        canSubscribe: true,
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
        await livekitMeeting.ensureRoom(gameRoomId);
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

  app.post("/livekit-webhook", async (c) => {
    try {
      const body = await c.req.text();
      const authHeader = c.req.header("authorization") ?? "";
      const event = await webhookReceiver.receive(body, authHeader);
      const roomName = event.room?.name;
      if (
        roomName &&
        (event.event === "participant_joined" ||
          event.event === "track_published" ||
          event.event === "track_unpublished")
      ) {
        void livekitMeeting.syncForLivekitEvent(roomName, event.event);
      }
      return c.json({ ok: true });
    } catch (error) {
      console.warn("[LiveKit] webhook rejected", error);
      return c.json({ error: "invalid webhook" }, 401);
    }
  });

  return app;
}
