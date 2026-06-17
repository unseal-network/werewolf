#!/usr/bin/env node
/**
 * Packages the API server bundle into a deployable tar.gz.
 *
 * Output: dist/werewolf-api-<timestamp>.tar.gz
 * Contents:
 *   server.bundle.js     — bundled server (all workspace deps inlined)
 *   node_modules/        — only native addon packages that can't be bundled
 *   package.json         — minimal, for `node --input-type` compatibility
 *   start.sh             — convenience start script
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiDir = path.resolve(__dirname, "..");
const distDir = path.join(apiDir, "dist");
const stageDir = path.join(distDir, "stage");

const DB_PACKAGE_DIR = path.resolve(apiDir, "../../packages/db");

// Read versions from the API package.json
const apiPkg = JSON.parse(fs.readFileSync(path.join(apiDir, "package.json"), "utf8"));
function pkgVersion(name) {
  return (
    apiPkg.dependencies?.[name] ??
    apiPkg.optionalDependencies?.[name] ??
    "latest"
  );
}

// Clean and recreate stage dir
fs.rmSync(stageDir, { recursive: true, force: true });
fs.mkdirSync(stageDir, { recursive: true });
fs.mkdirSync(path.join(stageDir, "node_modules"), { recursive: true });

// Copy bundle
fs.copyFileSync(
  path.join(distDir, "server.bundle.js"),
  path.join(stageDir, "server.bundle.js")
);

// Copy .env.production as .env
const envSrc = path.join(apiDir, ".env.production");
if (fs.existsSync(envSrc)) {
  fs.copyFileSync(envSrc, path.join(stageDir, ".env"));
  console.log("Copied .env.production → .env");
} else {
  console.warn("Warning: no .env.production file found at apps/api/.env.production — skipping");
}

// Copy drizzle migrations folder
const drizzleSrc = path.join(DB_PACKAGE_DIR, "drizzle");
const drizzleDest = path.join(stageDir, "drizzle");
if (fs.existsSync(drizzleSrc)) {
  execSync(`cp -r "${drizzleSrc}" "${drizzleDest}"`);
} else {
  console.warn("Warning: drizzle migrations folder not found at", drizzleSrc);
}

// package.json — server runs `npm install` to get native deps for its platform
const deployPkg = {
  name: "werewolf-api",
  version: "1.0.0",
  type: "module",
  private: true,
  scripts: {
    start: "node server.bundle.js",
  },
  dependencies: {
    "@livekit/rtc-node": pkgVersion("@livekit/rtc-node"),
    "mpg123-decoder": pkgVersion("mpg123-decoder"),
  },
  optionalDependencies: {
    "@livekit/rtc-node-darwin-arm64": pkgVersion("@livekit/rtc-node-darwin-arm64"),
    "@livekit/rtc-node-darwin-x64": pkgVersion("@livekit/rtc-node-darwin-x64"),
    "@livekit/rtc-node-linux-x64-gnu": pkgVersion("@livekit/rtc-node-linux-x64-gnu"),
  },
};
fs.writeFileSync(
  path.join(stageDir, "package.json"),
  JSON.stringify(deployPkg, null, 2)
);

// start.sh
const startScript = `#!/bin/sh
# Default port: 12003. Override with PORT=xxxx ./start.sh
# DATABASE_URL is read from .env in the same directory if present.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "\${SCRIPT_DIR}"

export MIGRATIONS_FOLDER="\${SCRIPT_DIR}/drizzle"
export PORT="\${PORT:-12003}"

ENV_FILE="\${SCRIPT_DIR}/.env"
if [ -f "\${ENV_FILE}" ]; then
  set -a && . "\${ENV_FILE}" && set +a
fi

if [ ! -d "\${SCRIPT_DIR}/node_modules/@livekit" ]; then
  echo "[start] Installing native dependencies..."
  npm install --omit=dev
fi

exec node "\${SCRIPT_DIR}/server.bundle.js"
`;
fs.writeFileSync(path.join(stageDir, "start.sh"), startScript, { mode: 0o755 });

// Create tar.gz
const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const tarName = `werewolf-api-${timestamp}.tar.gz`;
const tarPath = path.join(distDir, tarName);
execSync(`tar -czf "${tarPath}" -C "${stageDir}" .`);

// Cleanup stage dir
fs.rmSync(stageDir, { recursive: true, force: true });

const sizeMb = (fs.statSync(tarPath).size / 1024 / 1024).toFixed(2);
console.log(`\nPackage ready: dist/${tarName} (${sizeMb} MB)`);
console.log(`\nDeploy steps:`);
console.log(`  scp dist/${tarName} user@server:/opt/werewolf-api/`);
console.log(`  ssh user@server`);
console.log(`  cd /opt/werewolf-api && tar -xzf ${tarName}`);
console.log(`  DATABASE_URL=... PORT=3000 node server.bundle.js`);
