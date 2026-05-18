#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import process from "node:process";

const DEFAULT_STEPS = [100, 250, 500, 1000, 2500, 5000, 7500, 10000];
const BASE_URL = env("BASE_URL", "http://localhost:3000").replace(/\/+$/, "");
const TOKEN = env("TOKEN", process.env.DEMO_USER_TOKEN ?? "demo-token");
const DURATION_MS = numberEnv("DURATION_MS", 30_000);
const WARMUP_MS = nonNegativeNumberEnv("WARMUP_MS", 5_000);
const REQUEST_TIMEOUT_MS = numberEnv("REQUEST_TIMEOUT_MS", 5_000);
const MAX_IN_FLIGHT = numberEnv("MAX_IN_FLIGHT", 20_000);
const TICK_MS = numberEnv("TICK_MS", 100);
const STEPS = listEnv("QPS_STEPS", DEFAULT_STEPS);
const OUTPUT = process.env.OUTPUT ?? "";
const PLAN = process.env.PLAN ?? "me";

const endpoints = buildEndpoints();
const allResults = [];

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  printHelp();
  process.exit(0);
}

console.log("[load] target", {
  baseUrl: BASE_URL,
  plan: PLAN,
  endpoints: endpoints.map((endpoint) => ({
    method: endpoint.method,
    path: endpoint.path,
    weight: endpoint.weight,
  })),
  durationMs: DURATION_MS,
  warmupMs: WARMUP_MS,
  qpsSteps: STEPS,
  requestTimeoutMs: REQUEST_TIMEOUT_MS,
  maxInFlight: MAX_IN_FLIGHT,
});

if (WARMUP_MS > 0) {
  console.log(`[load] warmup ${WARMUP_MS}ms @ ${Math.min(100, STEPS[0] ?? 100)} qps`);
  await runStep(Math.min(100, STEPS[0] ?? 100), WARMUP_MS, { warmup: true });
}

for (const qps of STEPS) {
  const result = await runStep(qps, DURATION_MS);
  allResults.push(result);
  printResult(result);
  await sleep(1000);
}

if (OUTPUT) {
  await writeFile(
    OUTPUT,
    JSON.stringify(
      {
        target: BASE_URL,
        plan: PLAN,
        durationMs: DURATION_MS,
        warmupMs: WARMUP_MS,
        requestTimeoutMs: REQUEST_TIMEOUT_MS,
        maxInFlight: MAX_IN_FLIGHT,
        endpoints,
        results: allResults,
      },
      null,
      2
    )
  );
  console.log(`[load] wrote ${OUTPUT}`);
}

function buildEndpoints() {
  if (process.env.LOAD_ENDPOINTS) {
    const parsed = JSON.parse(process.env.LOAD_ENDPOINTS);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error("LOAD_ENDPOINTS must be a non-empty JSON array");
    }
    return normalizeEndpoints(parsed);
  }

  if (PLAN === "room") {
    const roomId = requiredEnv("ROOM_ID");
    return normalizeEndpoints([
      { method: "GET", path: `/games/${encodeURIComponent(roomId)}`, weight: 1 },
    ]);
  }

  if (PLAN === "mixed-read") {
    const roomId = requiredEnv("ROOM_ID");
    return normalizeEndpoints([
      { method: "GET", path: "/games/me", weight: 1 },
      { method: "GET", path: `/games/${encodeURIComponent(roomId)}`, weight: 4 },
      { method: "POST", path: `/games/${encodeURIComponent(roomId)}/livekit-token`, weight: 1 },
    ]);
  }

  return normalizeEndpoints([{ method: "GET", path: "/games/me", weight: 1 }]);
}

function normalizeEndpoints(input) {
  return input.map((entry) => ({
    method: String(entry.method ?? "GET").toUpperCase(),
    path: String(entry.path),
    weight: Math.max(1, Number(entry.weight ?? 1)),
    body: entry.body,
    headers: entry.headers && typeof entry.headers === "object" ? entry.headers : {},
  }));
}

async function runStep(qps, durationMs, opts = {}) {
  const startedAt = performance.now();
  const endAt = startedAt + durationMs;
  const latencies = [];
  const statusCounts = new Map();
  const errors = new Map();
  let launched = 0;
  let completed = 0;
  let timedOut = 0;
  let inFlight = 0;
  let dropped = 0;
  let nextEndpointIndex = 0;
  let fractionalCarry = 0;
  const pending = new Set();

  while (performance.now() < endAt) {
    const tickStartedAt = performance.now();
    const exactLaunches = (qps * TICK_MS) / 1000 + fractionalCarry;
    const launches = Math.floor(exactLaunches);
    fractionalCarry = exactLaunches - launches;

    for (let i = 0; i < launches; i += 1) {
      if (inFlight >= MAX_IN_FLIGHT) {
        dropped += 1;
        continue;
      }
      const endpoint = pickEndpoint(nextEndpointIndex++);
      launched += 1;
      inFlight += 1;
      const request = sendRequest(endpoint)
        .then((sample) => {
          completed += 1;
          latencies.push(sample.latencyMs);
          statusCounts.set(sample.status, (statusCounts.get(sample.status) ?? 0) + 1);
          if (sample.timedOut) timedOut += 1;
        })
        .catch((err) => {
          completed += 1;
          const key = err instanceof Error ? err.message : String(err);
          errors.set(key, (errors.get(key) ?? 0) + 1);
        })
        .finally(() => {
          inFlight -= 1;
          pending.delete(request);
        });
      pending.add(request);
    }

    const elapsed = performance.now() - tickStartedAt;
    if (elapsed < TICK_MS) await sleep(TICK_MS - elapsed);
  }

  await Promise.allSettled([...pending]);
  const elapsedMs = performance.now() - startedAt;
  const result = summarize({
    qps,
    warmup: Boolean(opts.warmup),
    launched,
    completed,
    dropped,
    timedOut,
    elapsedMs,
    latencies,
    statusCounts,
    errors,
  });
  return result;
}

async function sendRequest(endpoint) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const startedAt = performance.now();
  try {
    const response = await fetch(`${BASE_URL}${endpoint.path}`, {
      method: endpoint.method,
      headers: {
        authorization: `Bearer ${TOKEN}`,
        ...(endpoint.body === undefined ? {} : { "content-type": "application/json" }),
        ...endpoint.headers,
      },
      body: endpoint.body === undefined ? undefined : JSON.stringify(endpoint.body),
      signal: controller.signal,
    });
    await response.arrayBuffer();
    return {
      status: response.status,
      latencyMs: performance.now() - startedAt,
      timedOut: false,
    };
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "AbortError";
    if (timedOut) {
      return {
        status: "timeout",
        latencyMs: performance.now() - startedAt,
        timedOut: true,
      };
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

function pickEndpoint(index) {
  const totalWeight = endpoints.reduce((sum, endpoint) => sum + endpoint.weight, 0);
  let slot = index % totalWeight;
  for (const endpoint of endpoints) {
    if (slot < endpoint.weight) return endpoint;
    slot -= endpoint.weight;
  }
  return endpoints[0];
}

function summarize(input) {
  const sorted = input.latencies.toSorted((a, b) => a - b);
  const ok2xx = [...input.statusCounts.entries()]
    .filter(([status]) => typeof status === "number" && status >= 200 && status < 300)
    .reduce((sum, [, count]) => sum + count, 0);
  const non2xx = input.completed - ok2xx;
  return {
    qps: input.qps,
    warmup: input.warmup,
    elapsedMs: Math.round(input.elapsedMs),
    launched: input.launched,
    completed: input.completed,
    achievedQps: round((input.completed / input.elapsedMs) * 1000, 2),
    dropped: input.dropped,
    ok2xx,
    non2xx,
    errorRate: round(non2xx / Math.max(1, input.completed), 4),
    timedOut: input.timedOut,
    latencyMs: {
      min: round(sorted[0] ?? 0, 2),
      p50: round(percentile(sorted, 0.5), 2),
      p90: round(percentile(sorted, 0.9), 2),
      p95: round(percentile(sorted, 0.95), 2),
      p99: round(percentile(sorted, 0.99), 2),
      max: round(sorted.at(-1) ?? 0, 2),
    },
    statusCounts: Object.fromEntries(input.statusCounts),
    errors: Object.fromEntries(input.errors),
  };
}

function printResult(result) {
  console.log(
    [
      `[load] ${result.qps} qps`,
      `achieved=${result.achievedQps}`,
      `completed=${result.completed}`,
      `ok=${result.ok2xx}`,
      `non2xx=${result.non2xx}`,
      `dropped=${result.dropped}`,
      `p50=${result.latencyMs.p50}ms`,
      `p95=${result.latencyMs.p95}ms`,
      `p99=${result.latencyMs.p99}ms`,
      `max=${result.latencyMs.max}ms`,
    ].join(" ")
  );
  if (Object.keys(result.errors).length > 0) {
    console.log("[load] errors", result.errors);
  }
  if (Object.keys(result.statusCounts).length > 0) {
    console.log("[load] status", result.statusCounts);
  }
}

function percentile(sorted, pct) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * pct) - 1);
  return sorted[index];
}

function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function env(name, fallback) {
  return process.env[name] ?? fallback;
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
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

function nonNegativeNumberEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative number`);
  }
  return parsed;
}

function listEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  return raw
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((value) => Number.isFinite(value) && value > 0);
}

function printHelp() {
  console.log(`Usage:
  BASE_URL=http://localhost:3000 TOKEN=... node scripts/load-server.mjs

Plans:
  PLAN=me          GET /games/me (default, safest)
  PLAN=room        GET /games/:ROOM_ID
  PLAN=mixed-read  /games/me, /games/:ROOM_ID, /livekit-token

Environment:
  QPS_STEPS=100,250,500,1000,2500,5000,7500,10000
  DURATION_MS=30000
  WARMUP_MS=5000
  REQUEST_TIMEOUT_MS=5000
  MAX_IN_FLIGHT=20000
  OUTPUT=load-results.json
  LOAD_ENDPOINTS='[{"method":"GET","path":"/games/me","weight":1}]'
`);
}
