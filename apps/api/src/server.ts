import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { InMemoryGameService } from "./services/game-service";

const matrixBaseUrl = process.env.MATRIX_BASE_URL ?? "http://localhost:8008";
const app = createApp({
  games: new InMemoryGameService(),
  matrix: {
    async whoami(token) {
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

serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 3000) });
