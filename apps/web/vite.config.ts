import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

function normalizeBasePath(value: string | undefined): string {
  const raw = value?.trim() || "/";
  const leading = raw.startsWith("/") ? raw : `/${raw}`;
  return leading.endsWith("/") ? leading : `${leading}/`;
}

const appDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(appDir, "../..");

function loadMergedEnv(mode: string): Record<string, string> {
  const rootEnv = loadEnv(mode, repoRoot, "");
  const appEnv = loadEnv(mode, appDir, "");
  return { ...rootEnv, ...appEnv };
}

function clientEnvDefines(env: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env)
      .filter(([key]) => key.startsWith("VITE_"))
      .map(([key, value]) => [`import.meta.env.${key}`, JSON.stringify(value)])
  );
}

export default defineConfig(({ mode }) => {
  const env = loadMergedEnv(mode);

  return {
    base: normalizeBasePath(env.VITE_APP_BASE_PATH ?? env.BASE_PATH),
    define: clientEnvDefines(env),
    plugins: [tailwindcss(), react()],
    server: {
      host: "0.0.0.0",
      allowedHosts: ["keepsecret.io"],
      hmr: env.VITE_HMR_HOST
        ? {
            host: env.VITE_HMR_HOST,
            protocol: env.VITE_HMR_PROTOCOL === "ws" ? "ws" : "wss",
            clientPort: Number(env.VITE_HMR_CLIENT_PORT ?? 443),
          }
        : undefined,
    },
    preview: {
      allowedHosts: ["keepsecret.io"],
    },
  };
});
