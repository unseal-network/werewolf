#!/usr/bin/env node
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import process from "node:process";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const profileDir = path.resolve(
  root,
  process.env.PROFILE_DIR ?? `profiles/load-${timestamp}`
);
const apiCwd = path.resolve(root, process.env.SERVER_CWD ?? "apps/api");
const serverEntry = process.env.SERVER_ENTRY ?? "dist/server.js";
const serverPort = process.env.PORT ?? "3000";
const token = process.env.TOKEN ?? process.env.DEMO_USER_TOKEN ?? "load-test-token";
const baseUrl = process.env.BASE_URL ?? `http://127.0.0.1:${serverPort}`;
const startupTimeoutMs = numberEnv("STARTUP_TIMEOUT_MS", 30_000);
const heapSnapshotDelayMs = numberEnv("HEAP_SNAPSHOT_DELAY_MS", 1500);

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  printHelp();
  process.exit(0);
}

await mkdir(profileDir, { recursive: true });

const envFile = process.env.API_ENV_FILE ?? "../../.env";
const envFilePath = path.resolve(apiCwd, envFile);
const nodeArgs = [
  ...(existsSync(envFilePath) ? [`--env-file=${envFile}`] : []),
  "--cpu-prof",
  `--cpu-prof-dir=${profileDir}`,
  "--heap-prof",
  `--heap-prof-dir=${profileDir}`,
  "--heapsnapshot-signal=SIGUSR2",
  serverEntry,
];

const serverEnv = {
  ...process.env,
  PORT: serverPort,
  DEMO_USER_TOKEN: process.env.DEMO_USER_TOKEN ?? token,
  DEMO_USER_ID: process.env.DEMO_USER_ID ?? "@load-test:example.com",
};

console.log("[profile-load] profileDir", profileDir);
console.log("[profile-load] starting API", {
  cwd: apiCwd,
  command: [process.execPath, ...nodeArgs].join(" "),
  baseUrl,
});

const server = spawn(process.execPath, nodeArgs, {
  cwd: apiCwd,
  env: serverEnv,
  stdio: ["ignore", "pipe", "pipe"],
});

server.stdout.on("data", (chunk) => process.stdout.write(prefix(chunk, "[api] ")));
server.stderr.on("data", (chunk) => process.stderr.write(prefix(chunk, "[api] ")));

let serverExit = null;
const serverExited = new Promise((resolve) => {
  server.on("exit", (code, signal) => {
    serverExit = { code, signal };
    resolve(serverExit);
  });
});

try {
  await waitForServer();
  await writeMetadata("started");
  await captureHeapSnapshot("before");

  const loadEnv = {
    ...process.env,
    BASE_URL: baseUrl,
    TOKEN: token,
    OUTPUT: process.env.OUTPUT ?? path.join(profileDir, "load-results.json"),
  };
  const load = spawn(process.execPath, ["scripts/load-server.mjs"], {
    cwd: root,
    env: loadEnv,
    stdio: "inherit",
  });
  const loadExit = await waitForChild(load);
  if (loadExit.code !== 0) {
    throw new Error(`load runner failed: ${JSON.stringify(loadExit)}`);
  }

  await captureHeapSnapshot("after");
  await writeMetadata("completed");
} finally {
  await stopServer();
}

console.log("[profile-load] artifacts written to", profileDir);
console.log("[profile-load] open .cpuprofile in Chrome DevTools Performance tab");
console.log("[profile-load] open .heapsnapshot in Chrome DevTools Memory tab");

async function waitForServer() {
  const deadline = Date.now() + startupTimeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    if (serverExit) {
      throw new Error(`server exited before ready: ${JSON.stringify(serverExit)}`);
    }
    try {
      const response = await fetch(`${baseUrl}/games/me`, {
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(1000),
      });
      await response.arrayBuffer();
      console.log("[profile-load] API ready", { status: response.status });
      return;
    } catch (err) {
      lastError = err;
      await sleep(500);
    }
  }
  throw new Error(
    `API did not become ready within ${startupTimeoutMs}ms: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`
  );
}

async function captureHeapSnapshot(label) {
  if (!server.pid) return;
  console.log(`[profile-load] heap snapshot ${label}`);
  process.kill(server.pid, "SIGUSR2");
  await sleep(heapSnapshotDelayMs);
}

async function stopServer() {
  if (serverExit) return;
  console.log("[profile-load] stopping API");
  server.kill("SIGTERM");
  const exit = await Promise.race([
    serverExited,
    sleep(5000).then(() => null),
  ]);
  if (!exit && !serverExit) {
    server.kill("SIGKILL");
    await serverExited;
  }
}

async function waitForChild(child) {
  return new Promise((resolve) => {
    child.on("exit", (code, signal) => resolve({ code, signal }));
  });
}

async function writeMetadata(status) {
  await writeFile(
    path.join(profileDir, "metadata.json"),
    JSON.stringify(
      {
        status,
        createdAt: new Date().toISOString(),
        baseUrl,
        tokenUser: serverEnv.DEMO_USER_ID,
        qpsSteps: process.env.QPS_STEPS ?? "100,250,500,1000,2500,5000,7500,10000",
        durationMs: process.env.DURATION_MS ?? "30000",
        server: {
          cwd: apiCwd,
          entry: serverEntry,
          port: serverPort,
          pid: server.pid,
          nodeArgs,
        },
      },
      null,
      2
    )
  );
}

function prefix(chunk, marker) {
  return chunk
    .toString()
    .split(/(?<=\n)/)
    .map((line) => (line ? `${marker}${line}` : line))
    .join("");
}

function numberEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive number`);
  }
  return parsed;
}

function printHelp() {
  console.log(`Usage:
  pnpm build
  PROFILE_DIR=profiles/load-local \\
  TOKEN=load-test-token \\
  QPS_STEPS=100,250,500,1000,2500,5000,7500,10000 \\
  pnpm load:api:profile

This wrapper starts apps/api/dist/server.js with:
  --cpu-prof
  --heap-prof
  --heapsnapshot-signal=SIGUSR2

Artifacts:
  *.cpuprofile     CPU profile for Chrome DevTools / speedscope
  *.heapprofile    sampled allocation heap profile
  *.heapsnapshot   heap snapshots before and after load
  load-results.json
  metadata.json

Environment:
  PROFILE_DIR=profiles/load-<timestamp>
  SERVER_CWD=apps/api
  SERVER_ENTRY=dist/server.js
  API_ENV_FILE=../../.env
  PORT=3000
  BASE_URL=http://127.0.0.1:3000
  TOKEN=load-test-token
  STARTUP_TIMEOUT_MS=30000
  HEAP_SNAPSHOT_DELAY_MS=1500

All variables supported by scripts/load-server.mjs also apply.
`);
}
