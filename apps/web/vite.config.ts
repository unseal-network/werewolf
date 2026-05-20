import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

function normalizeBasePath(value: string | undefined): string {
  const raw = value?.trim() || "/";
  const leading = raw.startsWith("/") ? raw : `/${raw}`;
  return leading.endsWith("/") ? leading : `${leading}/`;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const base = normalizeBasePath(
    env.VITE_APP_BASE_PATH ?? env.BASE_PATH ?? process.env.VITE_APP_BASE_PATH ?? process.env.BASE_PATH
  );
  return {
  base,
  plugins: [tailwindcss(), react()],
  server: {
    host: '0.0.0.0',
    allowedHosts: ["keepsecret.io"],
    hmr: process.env.VITE_HMR_HOST
      ? {
          host: process.env.VITE_HMR_HOST,
          protocol: process.env.VITE_HMR_PROTOCOL === "ws" ? "ws" : "wss",
          clientPort: Number(process.env.VITE_HMR_CLIENT_PORT ?? 443),
        }
      : undefined,
  },
  preview: {
    allowedHosts: ["keepsecret.io"],
  },
  };
});
