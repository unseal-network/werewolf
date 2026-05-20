import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { performance } from "node:perf_hooks";

const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const ROOMS = Number(process.env.ROOMS ?? 1000);
const CLIENTS_PER_ROOM = Number(process.env.CLIENTS_PER_ROOM ?? 10);
const WRITE_QPS = Number(process.env.WRITE_QPS ?? 1000);
const DURATION_MS = Number(process.env.DURATION_MS ?? 30000);
const OUTPUT = process.env.OUTPUT ?? "profiles/room-actor-load.json";
const TOKENS = (process.env.TOKENS ?? "").split(",").filter(Boolean);

if (TOKENS.length < ROOMS * CLIENTS_PER_ROOM) {
  throw new Error(
    `Need ${ROOMS * CLIENTS_PER_ROOM} distinct TOKENS, got ${TOKENS.length}`
  );
}

const receivedByEvent = new Map();
const writeStartedAt = new Map();
const writeLatencyMs = [];
const commitToClientMs = [];
let writesOk = 0;
let writesFailed = 0;
let sseDisconnects = 0;

function summarize(values) {
  if (values.length === 0) {
    return { count: 0, p50: null, p95: null, p99: null, max: null };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const pick = (p) =>
    Number(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))].toFixed(2));
  return {
    count: sorted.length,
    p50: pick(0.5),
    p95: pick(0.95),
    p99: pick(0.99),
    max: Number(sorted.at(-1).toFixed(2)),
  };
}

async function request(path, token, init = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw new Error(`${init.method ?? "GET"} ${path} failed: ${response.status} ${await response.text()}`);
  }
  return response;
}

async function createRoom(token, index) {
  const response = await request("/games", token, {
    method: "POST",
    body: JSON.stringify({
      sourceMatrixRoomId: `!load-${index}:example.com`,
      title: `Load Room ${index}`,
      targetPlayerCount: CLIENTS_PER_ROOM,
      timing: { nightActionSeconds: 45, speechSeconds: 60, voteSeconds: 30 },
    }),
  });
  return (await response.json()).gameRoomId;
}

async function joinRoom(roomId, token, seatNo) {
  await request(`/games/${roomId}/join`, token, {
    method: "POST",
    headers: { "x-command-id": `load-join-${roomId}-${seatNo}` },
    body: JSON.stringify({ seatNo }),
  });
}

async function openSse(roomId, token, abortSignal) {
  const response = await request(`/games/${roomId}/subscribe`, token, {
    headers: { accept: "text/event-stream" },
    signal: abortSignal,
  });
  const reader = response.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (!abortSignal.aborted) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) recordFrame(frame);
    }
  } catch {
    if (!abortSignal.aborted) sseDisconnects += 1;
  } finally {
    reader.releaseLock();
  }
}

function recordFrame(frame) {
  const dataLine = frame.split("\n").find((line) => line.startsWith("data:"));
  if (!dataLine) return;
  try {
    const event = JSON.parse(dataLine.slice(5).trim());
    if (!event?.id) return;
    const count = (receivedByEvent.get(event.id) ?? 0) + 1;
    receivedByEvent.set(event.id, count);
    const started = writeStartedAt.get(event.id);
    if (started !== undefined) {
      commitToClientMs.push(performance.now() - started);
    }
  } catch {
    // snapshot/control frames are ignored for delivery metrics.
  }
}

async function writeAction(roomId, token, index) {
  const commandId = `load-write-${roomId}-${index}`;
  const started = performance.now();
  try {
    const response = await request(`/games/${roomId}/actions`, token, {
      method: "POST",
      headers: { "x-command-id": commandId },
      body: JSON.stringify({ kind: "pass" }),
    });
    const elapsed = performance.now() - started;
    writeLatencyMs.push(elapsed);
    writesOk += 1;
    const body = await response.json().catch(() => ({}));
    const eventId = body.event?.id ?? body.id ?? commandId;
    writeStartedAt.set(eventId, started);
  } catch {
    writesFailed += 1;
  }
}

async function main() {
  const abort = new AbortController();
  const rooms = [];
  for (let roomIndex = 0; roomIndex < ROOMS; roomIndex += 1) {
    const base = roomIndex * CLIENTS_PER_ROOM;
    const roomId = await createRoom(TOKENS[base], roomIndex);
    rooms.push({ roomId, tokens: TOKENS.slice(base, base + CLIENTS_PER_ROOM) });
    for (let seatNo = 1; seatNo <= CLIENTS_PER_ROOM; seatNo += 1) {
      await joinRoom(roomId, TOKENS[base + seatNo - 1], seatNo);
    }
  }

  const sseTasks = rooms.flatMap((room) =>
    room.tokens.map((token) => openSse(room.roomId, token, abort.signal))
  );

  const intervalMs = 1000 / WRITE_QPS;
  const endAt = performance.now() + DURATION_MS;
  let writeIndex = 0;
  while (performance.now() < endAt) {
    const room = rooms[writeIndex % rooms.length];
    void writeAction(room.roomId, room.tokens[0], writeIndex);
    writeIndex += 1;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  await new Promise((resolve) => setTimeout(resolve, 1000));
  abort.abort();
  await Promise.allSettled(sseTasks);

  const expectedDeliveries = writesOk * CLIENTS_PER_ROOM;
  const actualDeliveries = [...receivedByEvent.values()].reduce((a, b) => a + b, 0);
  const result = {
    rooms: ROOMS,
    clientsPerRoom: CLIENTS_PER_ROOM,
    requestedWriteQps: WRITE_QPS,
    achievedWriteQps: Number((writesOk / (DURATION_MS / 1000)).toFixed(2)),
    writesOk,
    writesFailed,
    deliveryRatio:
      expectedDeliveries === 0
        ? 0
        : Number((actualDeliveries / expectedDeliveries).toFixed(6)),
    writeLatencyMs: summarize(writeLatencyMs),
    commitToClientMs: summarize(commitToClientMs),
    sseDisconnects,
  };
  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}

await main();
