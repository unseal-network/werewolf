# Room Actor Baseline

Target gate:
- 1000 rooms
- 10 clients per room
- 1000 writes/sec
- deliveryRatio >= 0.999
- write p99 < 50ms
- commit-to-client p99 < 200ms

Worker id rule:
Every API/runtime process must have a unique `EVENT_ID_WORKER_ID` in
`[0, 1023]`. In local cluster mode, the primary process assigns worker ids from
the cluster worker index. In multi-host deployment, the process supervisor must
allocate stable unique ids or acquire them from `event_id_workers` before
serving traffic.

Commands:

```bash
EVENT_ID_WORKER_ID=1 WEB_CONCURRENCY=1 PORT=3000 pnpm --filter @werewolf/api dev
TOKENS="$(node scripts/create-load-users.mjs --count 10000)" ROOMS=1000 CLIENTS_PER_ROOM=10 WRITE_QPS=1000 DURATION_MS=30000 OUTPUT=profiles/room-actor-1000r.json pnpm load:room-actor
```
