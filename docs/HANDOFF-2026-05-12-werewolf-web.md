# Werewolf Web — Handoff (2026-05-12)

工作目录：`/Users/Ruihan/go/src/werewolf/.worktrees/implement-web-runtime`
分支：`implement-web-runtime`
前一份 handoff：[`docs/HANDOFF-2026-05-10-werewolf-web.md`](./HANDOFF-2026-05-10-werewolf-web.md)（保留作为更早阶段的设计参考）

这份文档接续 5-10 那份，聚焦在 5-10 到 5-12 之间加进来的几条主线：**实时语音、状态持久化、SSE 真流式、座位事件化、客户端体验修复**。

---

## TL;DR

- 文本游戏循环之前就跑通了。这两天加的是：**LiveKit 语音 + Unseal STT/TTS + PostgreSQL 持久化 + 重启恢复 + 真 SSE event stream**。
- 服务端杀进程重启，房间会从 DB 拉回来并继续推进，已实测一局打到 game_ended。
- 客户端：每局一条 LiveKit 长连接（不再每回合重连）、SSE 真 streaming（不再每个 event 触发整页 refetch）、动态座位 6→12、座位换位走 server-side 事件。
- "Demo" 只剩一处：`server.ts` whoami 短路 + web 前端硬编码 token，登录后所有游戏逻辑跟真实用户完全一致。

---

## 怎么跑

1. **Postgres**：本机已有 OrbStack 跑的 PG 在 `localhost:5432`，库名 `werewolf`，用户/密码都是 `pagepeek`。
   - migration 脚本：`packages/db/drizzle/0000_aberrant_ultron.sql`（已经手动 apply 过，全表都有）
   - 配置：`apps/api/.env` 里 `DATABASE_URL=postgres://pagepeek:pagepeek@localhost:5432/werewolf`

2. **后端**：`pnpm --filter @werewolf/api dev`
   - tsx watch + .env，端口 3000
   - 启动时会 `hydrateFromStore()` 把 status in (waiting, active, paused) 的房间装回内存，然后 `TickWorker` 每秒 poll `next_tick_at <= now()` 推进到期房间

3. **前端**：`pnpm --filter @werewolf/web dev`，Vite，端口 5173
   - 入口：`http://localhost:5173/?gameRoomId=<id>` 进游戏，或不带参数进 `CreateGamePage`
   - 登录：硬编码 `DEMO_TOKEN`（@kimigame1:keepsecret.io 的真实 matrix bearer）

4. **LiveKit**：用的是 Cloud 实例 `wss://werewolf-y4vro0s1.livekit.cloud`（key/secret 在 .env）

5. **Unseal**：`https://un-server.dev-excel-alt.pagepeek.org/api`，API key 在 .env

依赖里有个 `livekit.yaml` 是早期本地 LiveKit server 的配置，迁 Cloud 后已经不用了，没删纯粹历史包袱。

---

## 架构总览

```
┌────────────── Browser ──────────────┐
│  VoiceRoomProvider (livekit-client)  │←─ wss://werewolf-y4vro0s1.livekit.cloud
│  EventSource (SSE)                   │←─/ GET /games/:id/subscribe
│  fetch (REST)                        │←/ POST /games, /:id/seat, /:id/start, ...
└──────────────┬──────────────────────┘
               │
┌──────────────┴─────────────────── apps/api ──────────────────────────┐
│                                                                       │
│  routes/       games.ts, events.ts (SSE), livekit.ts                 │
│  services/     InMemoryGameService  ┐                                │
│                GameStore  ──────────┤ persist + replay                │
│                TickWorker  ─────────┘ duration-based advance          │
│                VoiceAgentService     LiveKit audio bridge             │
│                SttWebSocketClient    Unseal STT (per-player agent_id) │
│                TtsWebSocketClient    Unseal TTS (per-player agent_id) │
│                SseBroker             in-mem fan-out + history         │
│                                                                       │
└──────────────┬─────────────────────────────┬─────────────────────────┘
               │                              │
        ┌──────┴───────┐                ┌─────┴───────┐
        │ PostgreSQL   │                │ Unseal      │
        │  game_rooms  │                │  /generate  │ LLM
        │  game_events │                │  /stt/ws    │ STT
        │  game_room_… │                │  /tts/ws    │ TTS
        │  room_proj…  │                └─────────────┘
        │  player_priv │
        └──────────────┘
```

---

## 数据库 Schema（`packages/db/src/schema.ts`）

6 张表。`(game_room_id, seq)` 在 events 表是 UNIQUE，`(game_room_id, seat_no)` 在 players 表是 UNIQUE。

| 表 | 关键字段 | 用途 |
|---|---|---|
| `game_users` | id, matrix_user_id, display_name | 玩家身份 |
| `game_rooms` | id, status, target_player_count, **next_tick_at**, **runtime_lease_until**, started_at, ended_at | 房间 + tick 调度 |
| `game_room_players` | id (`<roomId>:<player.id>`), game_room_id, seat_no, kind, user_id, agent_id, display_name | 座位（UNIQUE on room+seat） |
| `game_events` | id, game_room_id, **seq**, type, visibility, payload | append-only 事件流（UNIQUE on room+seq） |
| `room_projection` | game_room_id, version, **public_state**(jsonb) | 公开投影 + runtime state (speechQueue 等) |
| `player_private_state` | game_room_id, player_id, private_state(jsonb) | 私密身份（role/team/witchItems） |

**重要不变式：**
- `player.id` 永远等于 `player_<seatNo>`（`player_3` 永远在 3 号位，反之亦然）
- 一个房间内 `(room_id, seat_no)` 唯一，老 left 记录会占据 slot，新加 agent / join 用 `nextAvailableSeatNo` 找第一个未占用的座位
- 事件不可变。projection 和 private_state 是从事件折叠出来的派生缓存。重启时直接读 snapshot 而不重 fold（详见"已知 gap"）

---

## 关键文件

### Server (`apps/api/src/`)

| 文件 | 作用 |
|---|---|
| `server.ts` | 启动入口。createDbClient → GameStore → hydrateFromStore → TickWorker.start。同时挂 SIGTERM/SIGINT 收尾 sql.end + server.close |
| `app.ts` | 路由组装，把 store 也透传给 events route 用于 SSE replay |
| `services/game-service.ts` | **核心状态机**。InMemoryGameService 持有 rooms Map + advanceTimers + advancing lock。所有 mutation 都调 `persistRoom(room)` 落 DB（best-effort fire-and-forget） |
| `services/game-store.ts` | DB CRUD。`saveRoomState / saveProjection / savePrivateStates / appendEvents / updateNextTickAt / loadActiveRooms / claimDueRooms / loadEventsSince` |
| `services/tick-worker.ts` | 每 1s `claimDueRooms(now)` 调 `scheduleAdvance(roomId)`。重启后由这个 worker 把"残留 deadline 已过"的房间继续推 |
| `services/agent-turn.ts` | 共享的 LLM closure。`buildRunAgentTurn()` 无参，从 `input.agentId` 等里拿信息，**进程启动时 setRunAgentTurn 一次**，tick worker 才能在没有 client 调用的情况下推进 agent |
| `services/voice-agent.ts` | LiveKit 桥接。Voice agent 以 identity `voice-agent:<roomId>` 加入房间，订阅人类玩家麦克风 → STT；TTS 通过 AudioSource 喂回共享 audio track。`speak()` 是 speakQueue + 120s hard timeout 保护，避免单次失败把整局拖死 |
| `services/stt-client.ts` | Unseal STT WS。严格按 ElevenLabs realtime 协议：JSON only、`audio_base_64` 必须非空、`commit:true` 只在最后一个 chunk |
| `services/tts-client.ts` | Unseal TTS WS。默认 `output_format: pcm_16000`，直接喂 LiveKit AudioSource（不经过 mp3 decoder） |
| `services/sse-broker.ts` | 内存 fan-out。订阅者会带 `last-event-id`，broker 没有的事件由 `GameStore.loadEventsSince` 从 DB 补 |
| `routes/games.ts` | REST：create / join / leave / start / actions / seat / agents / agent-candidates。`agent-candidates` 直接拉 Matrix room，不再有 fallback demo 列表 |
| `routes/events.ts` | GET `/:roomId/subscribe`：SSE，先用 DB 补齐缺失事件，再切到 broker 的 live channel |
| `routes/livekit.ts` | POST `/:roomId/livekit-token`：签一个 LiveKit access token。identity = player.id，TTL 24h |

### Web (`apps/web/src/`)

| 文件 | 作用 |
|---|---|
| `main.tsx` | 入口。`?gameRoomId=` 决定渲染 CreateGamePage 还是 GameRoomPage |
| `routes/create.tsx` | 创建房间表单。POST /games 然后 `window.location.href = ${path}?gameRoomId=...` |
| `routes/game.$gameRoomId.tsx` | **主页面，~1500 行**。组合 GameRoomShell + CenterStage + TimelineCapsule + VoiceRoomProvider。事件处理：SSE 直接 append，对 `PROJECTION_REFRESH_EVENT_TYPES` 触发一次 refreshGame |
| `components/VoiceRoom.tsx` | LiveKit Room 生命周期。`useEffect([serverUrl, token])` 一次性 connect，token 只在 player.id 变时才换 |
| `components/VoicePanel.tsx` | 麦克风开关 UI |
| `components/TimelineCapsule.tsx` | 时间线渲染。新增 `player_seat_changed` / `seer_result_revealed` / `witch_kill_revealed` 等 event 的本地化渲染 |
| `components/AgentPicker.tsx` | 加 agent。`remainingSeats` 用 `room.targetPlayerCount`(12) 而不是动态 targetCount |
| `components/CenterStage.tsx` | 中央交互区。Lobby 多了一个 `+ 添加 AI` 按钮（仅 creator + activeCount < 12 时显示） |
| `components/SeatTracks.tsx` / `SeatAvatar.tsx` | 座位渲染。`onClick → onSeatClick` 触发 |
| `api/client.ts` | 全部 REST + SSE wrapper |
| `i18n/dictionary.ts` | zh-CN / en，前面加的 `timeline.evt.seatMoved` / `seatSwapped` / `seerResult` / `guardProtect` etc. 都在这 |

---

## 几个核心机制

### 1. 持久化 + 重启恢复

每个 mutation 都同步写 DB（fire-and-forget）：
```ts
// game-service.ts
private persistRoom(room: StoredGameRoom): void {
  if (!this.store) return;
  void this.store.saveRoomState(room).catch(log);
  if (room.projection) void this.store.saveProjection(room).catch(log);
  if (room.privateStates.length) void this.store.savePrivateStates(...).catch(log);
  const deadline = room.projection?.deadlineAt ? new Date(room.projection.deadlineAt) : null;
  void this.store.updateNextTickAt(room.id, deadline).catch(log);
}
```

`assignAndAppendEvents` 单独走 `store.appendEvents`（events 表 (room,seq) UNIQUE，重复幂等）。

启动恢复（`server.ts`）：
```ts
games.setRunAgentTurn(buildRunAgentTurn());       // 1) LLM closure 全局一份
const { db, sql } = createDbClient(DATABASE_URL);
const store = new GameStore(db);
games.setStore(store);
await games.hydrateFromStore();                    // 2) 把 status !== ended 的房间装回内存
new TickWorker(store, games).start();              // 3) 每秒 poll next_tick_at
```

实测：start 一局 → 让它跑到 night_seer → `kill <pid>` → 重启 → "[Startup] hydrated 1 rooms"，几秒后游戏继续推进到 day_speak 一直跑到 game_ended。

### 2. SSE 真 stream

服务端（`routes/events.ts`）：
```
GET /:roomId/subscribe (Last-Event-ID: <lastSeq>)
  ↓
  broker.subscribe(roomId, lastSeq, push) → 拿到 in-mem replay 和 live channel
  if (lastSeq + 1 < broker_min_seq):              // 断档（比如刚重启）
    store.loadEventsSince(roomId, lastSeq) → 把缺失的从 DB 补
  push replay → push live
```

客户端（`game.$gameRoomId.tsx`）：
```ts
source.onmessage = (event) => {
  const parsed = parseSseEvent(event.data);
  if (sseEventVisibleToMe(parsed, myPrivateStateRef.current)) {
    setEvents(prev => [...prev, parsed]);          // 直接 append
  }
  if (PROJECTION_REFRESH_EVENT_TYPES.has(parsed.type)) {
    void refreshGame();                            // 只在改 projection 形状的事件 refresh
  }
};
```

`PROJECTION_REFRESH_EVENT_TYPES = { game_started, phase_started, phase_closed, night_resolved, player_eliminated, player_seat_changed, game_ended, speech_submitted, vote_submitted, wolf_vote_resolved }`。其他事件（agent_turn_*、night_action_submitted、seer_result_revealed 等）纯 append，不再 trigger 整页 refetch。

`sseEventVisibleToMe` 镜像服务端 `filterEventsForUser`：public → 收，runtime → 丢，`private:user:<id>` → 匹配自己，`private:team:wolf` → 看 myPrivateState.team === wolf。

### 3. 座位换位（事件驱动）

客户端只发 `{ seatNo }`，服务端定结果：
- 同座位：no-op
- 空目标：从 `room.players` 删 caller 旧记录 + 删 target 座位的任何 stale 记录（避免 (room,seat) UNIQUE 冲突）+ 推一个新 `player_<targetSeatNo>`
- 占据目标：identity-data 互换（player.id 不变，userId/agentId/displayName/kind 互换）
- 越界（>targetPlayerCount）：400

**两种情况都 emit `player_seat_changed`（public）事件**，客户端通过 SSE 收到，触发 refresh 同步座位 layout。

### 4. LiveKit 长连接

之前每个 SSE event 都 refresh → setRoom → useMemo myPlayer 新引用 → useEffect 重新拉 token（每次签 token 字符串值都不同）→ VoiceRoomProvider 看到 token 变化 → disconnect/connect。

修复：token effect 依赖改成 `myPlayerId`（稳定字符串），全局一条 LiveKit 长连接。只有用户换座位（id 真的变）才会重连。

### 5. 不变式

- **`player_N.seatNo == N`**：永远成立。换座位时 swap identity 数据而不是 id。
- **`game_rooms.id` 唯一**：`game_<base36 timestamp>_<4 chars random>`，跨重启不复用。
- **`game_events.seq` 单调递增**：由 `room.events.length + 1` 分配，UNIQUE 索引兜底防并发。
- **`runAgentTurnImpl` 是单例**：进程启动时设一次，所有 room / tick worker 共用，不依赖任何具体 gameRoomId 闭包。

---

## "Demo" 入口（不是 demo 模式）

整个系统**只在两处**留了 demo 痕迹，目的是省登录步骤，**不影响游戏逻辑**：

1. `apps/api/src/server.ts:74-78` — `whoami` 短路：
   ```ts
   async whoami(token) {
     if (demoToken && token === demoToken) {
       return { user_id: demoUserId };  // 跳过 Matrix /whoami
     }
     const response = await fetch(`${matrixBaseUrl}/_matrix/client/v3/account/whoami`, ...);
   }
   ```
2. `apps/web/src/routes/{create,game.$gameRoomId}.tsx` 硬编码 `DEMO_TOKEN` 作为 bearer。

`.env` 里的 `DEMO_USER_TOKEN` 实际上是 `@kimigame1:keepsecret.io` 的真实 Matrix bearer，所以即使删了短路，那个 token 也能走真 Matrix 验证。删 demo 短路 = 接登录页 = 一个未做项。

**Agent list 已经完全走 Matrix**（之前还有 `getDemoAgents` 兜底，已删）。`GET /games/:id/agent-candidates` 直接 `listRoomAgents` 查 `agentSourceMatrixRoomId`，Matrix 抖一下就返错给前端。

---

## 已知 gap / 还没做的

按优先级排序：

1. **Voice agent 重启后不会自动重连 LiveKit**。`VoiceAgentService.connect()` 是 lazy，第一次 `voiceAgent.speak()` 或 `flushPlayerTranscript()` 时才会触发 `getOrCreate`。期间几秒内 agent 没法发声。要彻底解决得在 `hydrateFromStore` 之后对每个 active room 主动 `voiceAgents.getOrCreate()` 一次。

2. **真 event sourcing 没接通**。当前 hydrate 直接读 `room_projection.public_state` snapshot 而不是 replay events。如果某次 snapshot 写丢了（fire-and-forget 失败），重启会读到旧 projection。要严格 event-sourcing 还得加 `replayEventsAfterSnapshot` 路径：读 snapshot.version → fold events with seq > version。

3. **多 worker 抢占**。schema 里有 `runtime_lease_until` 字段，但 TickWorker 没用。多机部署需要：
   ```sql
   UPDATE game_rooms
   SET runtime_lease_until = now() + interval '30s'
   WHERE id = (
     SELECT id FROM game_rooms
     WHERE status='active' AND next_tick_at <= now()
       AND (runtime_lease_until IS NULL OR runtime_lease_until < now())
     ORDER BY next_tick_at LIMIT 1
     FOR UPDATE SKIP LOCKED
   ) RETURNING *;
   ```

4. **登录页**。前端硬编码 DEMO_TOKEN。要真实使用需要：
   - 做 Matrix 密码登录页或者复用 keepsecret SSO
   - `apps/web/src/routes/{create,game.$gameRoomId}.tsx` 改成从 localStorage 读 token
   - `apps/api/src/server.ts` 去掉 demo 短路

5. **Unseal LLM 部分 agent_id 没配置**。Matrix room 里能查到的 `@kimigame7..13` / `@game-9, @game-11` 等在 Unseal 后端返回 HTTP 404。`runAgentToolTurn` 现在能 fallback 到 "did not act before deadline" 而且 **`runCurrentSpeaker` 检查 `result.fallback` 后跳过 TTS**，不会再卡 120s/位。但 UX 上用户加这种 agent 还是会看到 "did not act" 速速 rotate，要么 server 端硬过滤、要么 Unseal 把缺的 agent 配齐。

6. **`/games/:id` 的 GET 端口暂时还在做 visibility filter**，SSE 流的 visibility filter 是客户端做的（`sseEventVisibleToMe`）。理论上两个过滤器要保持一致，目前是手动同步。

7. **TimelineCapsule 不渲染 `wolf_vote_submitted` 之外的狼队私密事件**（比如狼人发言）—— private:team:wolf 走 SSE 直接 append，但 timeline format 没有专门 case。

8. **客户端缓存增长无上限**：`events` state 截到最近 260 条，但 `room.players` 可能有大量 leftAt 记录（每次有人 leave 都留个壳）。lobby 很折腾的话内存会涨。

9. **从未真正测过同房间多用户**。多浏览器开同一个 gameRoomId 在理论上应该 work（SSE 各自连、座位换位走 server 广播），但没专门测。

---

## 测试 / 验证脚本

- 工作流测试：手动跑 `pnpm typecheck` 全过；`packages/werewolf-engine` 的 21 个 vitest 全过
- 端到端：之前几次 curl 一气呵成把一局打到 `game_ended`，每个阶段事件都对得上（详见 5-11 conversation log）
- 持久化：实测过 night_seer 杀进程 → restart → 自动继续到 post_game
- 没接 E2E framework（Playwright 之类）—— 这条 backlog 留给后续

---

## 常见操作

```bash
# 跑迁移（首次或表丢了）
cat > /tmp/migrate.mjs <<'EOF'
import postgres from "postgres";
import { readFileSync } from "node:fs";
const sql = postgres("postgres://pagepeek:pagepeek@localhost:5432/werewolf");
const migration = readFileSync("./packages/db/drizzle/0000_aberrant_ultron.sql", "utf8");
for (const stmt of migration.split("--> statement-breakpoint")) {
  const t = stmt.trim();
  if (t) await sql.unsafe(t);
}
await sql.end();
EOF
cd /Users/Ruihan/go/src/werewolf/.worktrees/implement-web-runtime/packages/db && node /tmp/migrate.mjs

# 清空所有 game 数据（保留 game_users）
cat > /tmp/clear.mjs <<'EOF'
import postgres from "postgres";
const sql = postgres("postgres://pagepeek:pagepeek@localhost:5432/werewolf");
await sql`DELETE FROM player_private_state`;
await sql`DELETE FROM room_projection`;
await sql`DELETE FROM game_events`;
await sql`DELETE FROM game_room_players`;
await sql`DELETE FROM game_rooms`;
await sql.end();
EOF
cd packages/db && node /tmp/clear.mjs

# 看持久化的房间
cat > /tmp/inspect.mjs <<'EOF'
import postgres from "postgres";
const sql = postgres("postgres://pagepeek:pagepeek@localhost:5432/werewolf");
const rooms = await sql`SELECT id, status, started_at, next_tick_at FROM game_rooms ORDER BY created_at DESC LIMIT 10`;
console.log(rooms);
await sql.end();
EOF
node /tmp/inspect.mjs

# 杀掉 + 重启 API（tsx watch 占着 3000）
ps aux | grep -E "werewolf.*tsx" | grep -v grep | awk '{print $2}' | xargs kill
cd /Users/Ruihan/go/src/werewolf/.worktrees/implement-web-runtime
nohup pnpm --filter @werewolf/api dev > /tmp/werewolf-api.log 2>&1 &
disown
```

---

## 提交规范

跟仓库原有风格一致：`<type>: <description>`，type 可以是 feat / fix / refactor / docs / test / chore。每个 PR 一组逻辑上 cohesive 的改动，长 description 解释 why。

---

## 联系

这份 handoff 关键改动的 commit 在 `implement-web-runtime` 分支上。看 git log 比看这份文档更准确。
