import { serve } from "@hono/node-server";
import { createDbClient, ensureDatabase } from "@werewolf/db";
import { createApp } from "./app";
import { InMemoryGameService } from "./services/game-service";
import { GameStore } from "./services/game-store";
import { TickWorker } from "./services/tick-worker";
import { VoiceAgentRegistry } from "./services/voice-agent";
import { buildRunAgentTurn } from "./services/agent-turn";
import { DbMatrixProfileCache } from "./services/user-profile-cache";

const matrixBaseUrl = process.env.MATRIX_BASE_URL ?? "http://localhost:8008";
const demoToken = process.env.DEMO_USER_TOKEN;
const demoUserId = process.env.DEMO_USER_ID ?? "@demo:example.com";

function matrixMediaUrl(baseUrl: string, uri: string | undefined): string | undefined {
  if (!uri) return undefined;
  if (!uri.startsWith("mxc://")) return uri;
  const path = uri.slice("mxc://".length);
  const slash = path.indexOf("/");
  if (slash <= 0 || slash === path.length - 1) return undefined;
  const serverName = path.slice(0, slash);
  const mediaId = path.slice(slash + 1);
  return `${baseUrl.replace(/\/+$/, "")}/_matrix/media/v3/download/${encodeURIComponent(
    serverName
  )}/${encodeURIComponent(mediaId)}`;
}

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
let profileCache: DbMatrixProfileCache | null = null;
if (databaseUrl) {
  // 确保数据库存在并应用所有 pending migrations，再启动业务逻辑
  void ensureDatabase(databaseUrl)
    .then(() => {
      const { db, sql } = createDbClient(databaseUrl);
      store = new GameStore(db);
      profileCache = new DbMatrixProfileCache(db);
      games.setStore(store);
      pgSql = sql;

      // Hydrate any active games from DB into the in-memory cache, then start
      // the tick worker. This is what makes "kill API, restart, game continues"
      // actually work: rooms whose `next_tick_at` has passed get picked up by
      // the very first tick after startup.
      const activeStore = store;
      return games
        .hydrateFromStore()
        .then((roomIds) => {
          if (roomIds.length > 0) {
            console.log(
              `[Startup] hydrated ${roomIds.length} rooms from store: ${roomIds.join(", ")}`
            );
          }
          tickWorker = new TickWorker(activeStore, games);
          tickWorker.start();
          for (const roomId of roomIds) {
            const room = games.snapshot(roomId);
            if (room.status === "active") {
              void games
                .scheduleAdvance(roomId)
                .catch((err) =>
                  console.error(`[Startup] scheduleAdvance(${roomId}) failed:`, err)
                );
            }
          }
        });
    })
    .catch((err) => {
      console.error("[Startup] DB init failed — running in-memory only:", err);
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
  profileCache: profileCache ?? undefined,
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
    async profile(userId, token) {
      if (demoToken && token === demoToken) {
        return {
          displayname: process.env.DEMO_USER_DISPLAY_NAME ?? "kimi game 1",
          ...(process.env.DEMO_USER_AVATAR_URL
            ? { avatarUrl: process.env.DEMO_USER_AVATAR_URL }
            : {}),
        };
      }
      const response = await fetch(
        `${matrixBaseUrl}/_matrix/client/v3/profile/${encodeURIComponent(userId)}`,
        {
          headers: { authorization: `Bearer ${token}` },
        }
      );
      if (!response.ok) {
        throw new Error(`Matrix profile failed: HTTP ${response.status}`);
      }
      const profile = (await response.json()) as {
        displayname?: string;
        avatar_url?: string;
      };
      const avatarUrl = matrixMediaUrl(matrixBaseUrl, profile.avatar_url);
      return {
        ...(profile.displayname ? { displayname: profile.displayname } : {}),
        ...(avatarUrl ? { avatarUrl } : {}),
      };
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
