import { serve } from "@hono/node-server";
import { createDbClient } from "@werewolf/db";
import { createApp } from "./app";
import { InMemoryGameService } from "./services/game-service";
import { GameStore } from "./services/game-store";
import { TickWorker } from "./services/tick-worker";
import { VoiceAgentRegistry } from "./services/voice-agent";
import { buildRunAgentTurn } from "./services/agent-turn";

const matrixBaseUrl = process.env.MATRIX_BASE_URL ?? "http://localhost:8008";
const demoToken = process.env.DEMO_USER_TOKEN;
const demoUserId = process.env.DEMO_USER_ID ?? "@demo:example.com";

const games = new InMemoryGameService();

// Wire the agent-turn LLM closure once at startup so the tick worker can
// advance rooms even after a server restart, without needing a client API
// call to set it. The closure is game-agnostic — it reads everything it
// needs from the `input` arg the service passes in.
games.setRunAgentTurn(buildRunAgentTurn());

// Persistent store — best-effort. If DATABASE_URL is unset or the DB is
// unreachable we still run in-memory; restarts just lose state.
const databaseUrl = process.env.DATABASE_URL;
let pgSql: ReturnType<typeof createDbClient>["sql"] | null = null;
let tickWorker: TickWorker | null = null;
let store: GameStore | null = null;
if (databaseUrl) {
  const { db, sql } = createDbClient(databaseUrl);
  store = new GameStore(db);
  games.setStore(store);
  pgSql = sql;

  // Hydrate any active games from DB into the in-memory cache, then start
  // the tick worker. This is what makes "kill API, restart, game continues"
  // actually work: rooms whose `next_tick_at` has passed get picked up by
  // the very first tick after startup.
  const activeStore = store;
  void games
    .hydrateFromStore()
    .then((roomIds) => {
      if (roomIds.length > 0) {
        console.log(
          `[Startup] hydrated ${roomIds.length} rooms from store: ${roomIds.join(", ")}`
        );
      }
      tickWorker = new TickWorker(activeStore, games);
      tickWorker.start();
    })
    .catch((err) => {
      console.error("[Startup] hydrateFromStore failed — running in-memory only:", err);
    });
} else {
  console.warn("[Startup] DATABASE_URL not set — running in-memory only, state will be lost on restart");
}

// Initialize voice agent registry; LiveKit connections are established lazily
// per game room. If LiveKit is not configured, registry can still be created
// but speak() / flushPlayerTranscript() will silently no-op when not connected.
const voiceAgents = new VoiceAgentRegistry({
  livekitUrl: process.env.LIVEKIT_URL ?? "ws://localhost:7880",
  livekitApiKey: process.env.LIVEKIT_API_KEY ?? "devkey",
  livekitApiSecret: process.env.LIVEKIT_API_SECRET ?? "secret",
  unsealApiBaseUrl:
    process.env.UNSEAL_AGENT_API_BASE_URL ??
    "https://un-server.dev-excel-alt.pagepeek.org/api",
  unsealApiKey: process.env.UNSEAL_AGENT_API_KEY ?? "",
  unsealAgentId: process.env.UNSEAL_DEFAULT_AGENT_ID ?? "default",
});
games.setVoiceAgents(voiceAgents);

const app = createApp({
  games,
  store,
  matrixHomeserverUrl: matrixBaseUrl,
  matrix: {
    async whoami(token) {
      if (demoToken && token === demoToken) {
        return { user_id: demoUserId };
      }
      const response = await fetch(
        `${matrixBaseUrl}/_matrix/client/v3/account/whoami`,
        {
          headers: { authorization: `Bearer ${token}` },
        }
      );
      if (!response.ok) {
        throw new Error(`Matrix whoami failed: HTTP ${response.status}`);
      }
      return (await response.json()) as { user_id: string; device_id?: string };
    },
  },
});

const server = serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 3000) });

// Graceful shutdown — stop the tick worker and close the pg pool so a tsx
// watch reload doesn't leak connections.
const shutdown = async (signal: string) => {
  console.log(`[Shutdown] received ${signal}, cleaning up...`);
  if (tickWorker) tickWorker.stop();
  if (pgSql) {
    try {
      await pgSql.end({ timeout: 2 });
    } catch (err) {
      console.error("[Shutdown] sql.end failed:", err);
    }
  }
  server.close(() => process.exit(0));
  // Force-exit after 5s if server.close hangs (LiveKit etc.).
  setTimeout(() => process.exit(0), 5000).unref();
};
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
