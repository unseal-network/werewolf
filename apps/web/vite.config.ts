import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function normalizeBasePath(value: string | undefined): string {
  const raw = value?.trim() || "/";
  const leading = raw.startsWith("/") ? raw : `/${raw}`;
  return leading.endsWith("/") ? leading : `${leading}/`;
}

export default defineConfig({
  base: normalizeBasePath(process.env.VITE_APP_BASE_PATH ?? process.env.BASE_PATH),
  plugins: [react()],
  preview: {
    allowedHosts: ["keepsecret.io"],
  },
});
