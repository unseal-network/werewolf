# Server Load Test Flow

This flow stress tests the API server from 100 QPS up to 10,000 QPS and records
latency, throughput, timeout, and status-code behavior.

## Preconditions

Use a non-production database and server. The default scenario is a read-only
auth endpoint, but higher-load mixed scenarios can still put pressure on Matrix,
LiveKit, and Postgres.

For stable numbers, prefer a demo token path so auth does not call Matrix on
every request:

```bash
export DEMO_USER_TOKEN=load-test-token
export DEMO_USER_ID=@load-test:example.com
```

Start the API server in a separate terminal:

```bash
DATABASE_URL=postgres://... \
DEMO_USER_TOKEN=load-test-token \
DEMO_USER_ID=@load-test:example.com \
pnpm --filter @werewolf/api dev
```

## Read-Only Ramp: 100 to 10,000 QPS

```bash
BASE_URL=http://localhost:3000 \
TOKEN=load-test-token \
QPS_STEPS=100,250,500,1000,2500,5000,7500,10000 \
DURATION_MS=30000 \
WARMUP_MS=5000 \
OUTPUT=load-me-results.json \
node scripts/load-server.mjs
```

This exercises:

- Hono routing
- request parsing
- auth path
- JSON serialization
- Node fetch/HTTP concurrency handling

## Room Snapshot Ramp

Create a room first, then load the snapshot endpoint:

```bash
ROOM_ID=game_xxx \
PLAN=room \
BASE_URL=http://localhost:3000 \
TOKEN=load-test-token \
QPS_STEPS=100,250,500,1000,2500,5000,7500,10000 \
OUTPUT=load-room-results.json \
node scripts/load-server.mjs
```

This adds:

- in-memory room lookup
- event/private-state filtering
- full room JSON serialization

## Mixed Read Ramp

```bash
ROOM_ID=game_xxx \
PLAN=mixed-read \
BASE_URL=http://localhost:3000 \
TOKEN=load-test-token \
QPS_STEPS=100,250,500,1000,2500,5000,7500,10000 \
OUTPUT=load-mixed-read-results.json \
node scripts/load-server.mjs
```

The mixed plan currently weights:

- `GET /games/me`: 1
- `GET /games/:ROOM_ID`: 4
- `POST /games/:ROOM_ID/livekit-token`: 1

Use this to expose duplicate auth, LiveKit room creation, and room serialization
costs.

## Profiled Ramp: CPU Flame Graph + Heap

For bottleneck analysis, run the profiled wrapper. It starts the built API with
Node profiling flags, captures heap snapshots before and after the load, runs the
same QPS ramp, then stops the server so CPU/heap profiles flush to disk.

Build first:

```bash
pnpm build
```

Run a profiled 100 to 10,000 QPS ramp:

```bash
PROFILE_DIR=profiles/load-local-$(date +%Y%m%d-%H%M%S) \
DATABASE_URL=postgres://... \
TOKEN=load-test-token \
DEMO_USER_TOKEN=load-test-token \
DEMO_USER_ID=@load-test:example.com \
QPS_STEPS=100,250,500,1000,2500,5000,7500,10000 \
DURATION_MS=30000 \
WARMUP_MS=5000 \
pnpm load:api:profile
```

The wrapper writes:

- `*.cpuprofile`: CPU profile. Open in Chrome DevTools Performance, or
  <https://www.speedscope.app/> for a flame graph.
- `*.heapprofile`: sampled allocation profile.
- `*.heapsnapshot`: before/after heap snapshots. Open in Chrome DevTools Memory.
- `load-results.json`: QPS, latency, timeout, and status-code metrics.
- `metadata.json`: command and environment metadata.

To profile a room-heavy endpoint mix:

```bash
PROFILE_DIR=profiles/load-room-$(date +%Y%m%d-%H%M%S) \
ROOM_ID=game_xxx \
PLAN=mixed-read \
TOKEN=load-test-token \
DEMO_USER_TOKEN=load-test-token \
QPS_STEPS=100,250,500,1000,2500,5000,7500,10000 \
pnpm load:api:profile
```

Notes:

- `pnpm load:api:profile` launches `apps/api/dist/server.js`, so `pnpm build`
  must be current.
- The wrapper uses `--cpu-prof`, `--heap-prof`, and
  `--heapsnapshot-signal=SIGUSR2`.
- Heap snapshots pause the Node process briefly. The wrapper captures them
  outside the measured request loop: once before load and once after load.
- For production-like tests, run the load generator from a separate machine so
  the generator CPU does not hide server CPU saturation.

## Custom Endpoint Mix

```bash
LOAD_ENDPOINTS='[
  {"method":"GET","path":"/games/me","weight":2},
  {"method":"GET","path":"/games/game_xxx","weight":8}
]' \
BASE_URL=http://localhost:3000 \
TOKEN=load-test-token \
node scripts/load-server.mjs
```

Avoid mutating endpoints at high QPS unless the target database is disposable.

## Reading Results

Watch for the first step where any of these happen:

- achieved QPS falls materially below target
- p95 exceeds 250 ms for read-only endpoints
- p99 exceeds 1 s
- non-2xx or timeout rate exceeds 0.1%
- process RSS grows steadily after the step ends
- Postgres CPU, lock wait, or connection count spikes

At that step, capture:

- API CPU/RSS/event-loop delay
- Postgres `pg_stat_activity`
- Postgres slow query log
- LiveKit room API latency, if testing `mixed-read`

## Current Review Hotspots

The current code has a few likely bottlenecks to watch during load tests:

1. `authenticateRequest()` calls Matrix `whoami` for every non-demo request.
   For API load tests, use demo token or add a short token-auth cache.
2. `saveSnapshot()` writes full room/player/projection/private-state snapshots.
   Live STT stream updates can therefore amplify DB writes.
3. `livekit-token` calls `RoomServiceClient.createRoom()` per token request.
   In mixed-read tests this can become external REST churn.
4. `registerPlayerVoiceIdentity()` can rescan existing audio tracks when called
   repeatedly. Avoid GM narration loops while measuring pure HTTP throughput.
