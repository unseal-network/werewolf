import { Hono } from "hono";
import { cors } from "hono/cors";
import { createEventsRoutes } from "./routes/events";
import { createGamesRoutes, type GamesRouteDeps } from "./routes/games";
import { createLivekitRoutes } from "./routes/livekit";
import { createWebhookRoutes } from "./routes/webhook";
import { SseBroker } from "./services/sse-broker";
import type { GameStore } from "./services/game-store";
import type { MatrixProfileCache } from "./context/auth";
import {
  GameServiceRoomActors,
  type RoomActorDispatcher,
} from "./services/game-service-room-actors";
import {
  createLivekitMeetingControllerFromEnv,
  type LivekitMeetingController,
} from "./services/livekit-meeting-controller";

export type AppDeps = Omit<GamesRouteDeps, "roomActors"> & {
  roomActors?: RoomActorDispatcher;
  broker?: SseBroker;
  /** Optional DB-backed store so the SSE route can replay events even
   *  after a process restart (when the broker's in-memory history is empty). */
  store?: GameStore | null;
  profileCache?: MatrixProfileCache | undefined;
  livekitMeeting?: LivekitMeetingController | undefined;
};

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();
  const broker = deps.broker ?? new SseBroker();
  deps.games.setBroker(broker);
  const livekitMeeting =
    deps.livekitMeeting ?? createLivekitMeetingControllerFromEnv();
  deps.games.setLivekitMeetingController(livekitMeeting);
  if (deps.runAgentTurn) {
    deps.games.setRunAgentTurn(deps.runAgentTurn);
  }
  const roomActors = deps.roomActors ?? new GameServiceRoomActors(deps.games);
  app.use("*", cors());
  app.route("/games", createGamesRoutes({ ...deps, roomActors }));
  app.route("/", createWebhookRoutes());
  app.route(
    "/games",
    createEventsRoutes({
      broker,
      store: deps.store ?? null,
      games: deps.games,
      matrix: deps.matrix,
      profileCache: deps.profileCache,
    })
  );
  app.route("/games", createLivekitRoutes({ ...deps, livekitMeeting }));
  return app;
}
