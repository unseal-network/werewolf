# Werewolf API 文档

## 接口一览

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| `POST` | `/games` | ✅ | 创建游戏房间，返回 `gameRoomId` 和初始牌组 `card` |
| `GET` | `/games/:gameRoomId` | ✅ | 获取游戏快照，事件按请求者角色过滤（狼人可见狼队私聊，游戏结束后全量公开） |
| `POST` | `/games/:gameRoomId/join` | ✅ | 当前用户加入游戏，游戏未开始时有效 |
| `POST` | `/games/:gameRoomId/leave` | ✅ | 当前用户离开游戏 |
| `POST` | `/games/:gameRoomId/start` | ✅ | 房主发起开始，分配角色并触发首轮 Agent 推进 |
| `POST` | `/games/:gameRoomId/actions` | ✅ + 玩家身份校验 | 提交玩家行动（speech / vote / nightAction 等），需确认请求者在房间内 |
| `POST` | `/games/:gameRoomId/seat` | ✅ | 更换座位号，`seatNo` 须为正整数 |
| `DELETE` | `/games/:gameRoomId/players/:playerId` | ✅ + 房主校验 | 房主踢出指定玩家，game-service 层校验操作者权限 |
| `GET` | `/games/:gameRoomId/agent-candidates` | ✅ | 从 Matrix 房间查询可用 Agent 列表，标注已加入状态，Synapse 不可达时直接报错 |
| `POST` | `/games/:gameRoomId/agents` | ✅ | 房主向游戏中添加 Agent 玩家，`agentUserId` 必填 |
| `GET` | `/games/:gameRoomId/subscribe` | ✅ | SSE 长连接，按角色实时推送事件；支持 `Last-Event-ID` 断线重连，进程重启后从数据库补齐缺失事件 |
| `POST` | `/games/:gameRoomId/runtime/tick` | ✅（无角色限制⚠️） | 推进一个引擎回合（Agent 决策 + 阶段切换），任意登录用户均可触发 |
| `POST` | `/games/:gameRoomId/livekit-token` | ✅ + 玩家身份校验 | 为当前玩家生成 LiveKit JWT（24h 有效），同时幂等创建语音房间 |
| `POST` | `/games/:gameRoomId/livekit-room` | ✅ | 幂等创建 LiveKit 语音房间，已存在则忽略 |

---

## 鉴权说明

所有接口均需携带 Matrix Bearer Token 鉴权：

```
Authorization: Bearer <token>
```

或 URL query param：`?access_token=<token>`

鉴权失败返回 `401`，业务错误返回 `{ error: string, code: string }`。

---

## 游戏管理

### 创建游戏

```
POST /games
```

**请求体**

| 字段 | 类型 | 说明 |
|------|------|------|
| （由引擎定义，透传） | object | 游戏初始化参数 |

**响应** `201`

```json
{
  "gameRoomId": "string",
  "card": {}
}
```

---

### 获取游戏状态

```
GET /games/:gameRoomId
```

**响应** `200`

```json
{
  "room": { "...players, events, privateStates, ..." },
  "projection": {},
  "privateStates": [],
  "events": []
}
```

> 事件按当前用户角色过滤：`runtime` 事件永不返回，狼人私聊仅狼人可见，游戏结束后全量公开。

---

### 加入游戏

```
POST /games/:gameRoomId/join
```

**响应** `200`

```json
{ "player": {} }
```

---

### 离开游戏

```
POST /games/:gameRoomId/leave
```

**响应** `200`

```json
{ "player": {} }
```

---

### 开始游戏

```
POST /games/:gameRoomId/start
```

**响应** `200`

```json
{
  "status": "started",
  "projection": {},
  "privateStates": [],
  "events": []
}
```

---

## 玩家操作

### 提交行动

```
POST /games/:gameRoomId/actions
```

**请求体**

| kind | 额外字段 | 说明 |
|------|----------|------|
| `speech` | `speech: string` | 发言 |
| `speechComplete` | — | 发言结束 |
| `vote` | `targetPlayerId: string` | 投票 |
| `nightAction` | `targetPlayerId: string` | 夜间行动 |
| `pass` | — | 跳过 |

**响应** `200`

```json
{ "success": true, "event": {} }
```

---

### 换座位

```
POST /games/:gameRoomId/seat
```

**请求体**

```json
{ "seatNo": 1 }
```

**响应** `200`

```json
{ "seatNo": 1, "..." }
```

---

### 移除玩家

```
DELETE /games/:gameRoomId/players/:playerId
```

> 仅房主可操作（由 game-service 层校验）。

**响应** `200`

```json
{ "player": {} }
```

---

## Agent 管理

### 获取可用 Agent 列表

```
GET /games/:gameRoomId/agent-candidates
```

从 Matrix 房间查询可用 Agent，过滤掉已加入的。

**响应** `200`

```json
{
  "agents": [
    {
      "userId": "@agent:server",
      "displayName": "string",
      "avatarUrl": "string",
      "userType": "string",
      "membership": "string",
      "alreadyJoined": false
    }
  ],
  "total": 10,
  "roomId": "!xxx:server"
}
```

---

### 添加 Agent 玩家

```
POST /games/:gameRoomId/agents
```

**请求体**

```json
{
  "agentUserId": "@agent:server",
  "displayName": "Agent Name"
}
```

**响应** `201`

```json
{ "player": {} }
```

---

## 事件订阅（SSE）

### 订阅游戏事件流

```
GET /games/:gameRoomId/subscribe
```

**Headers**

| Header | 说明 |
|--------|------|
| `Last-Event-ID` | 上次收到的事件序号，用于断线重连补齐事件 |

**响应** `text/event-stream`

```
id: 42
data: {"seq":42,"kind":"speech","visibility":"public",...}

```

> 服务端会按用户角色过滤事件，狼人可收到 `private:team:wolf` 事件，其他玩家不可见。进程重启后通过数据库补齐断连期间的事件。

---

## 运行时

### 推进回合（Runtime Tick）

```
POST /games/:gameRoomId/runtime/tick
```

触发引擎推进当前回合（Agent 行动 + 阶段切换）。

**响应** `200`

```json
{
  "status": "started",
  "done": false,
  "projection": {},
  "events": []
}
```

> ⚠️ 当前任意已认证用户均可调用，无角色限制。

---

## LiveKit 语音

### 获取 LiveKit Token

```
POST /games/:gameRoomId/livekit-token
```

为当前玩家生成加入语音房间的 JWT Token（有效期 24h），同时确保 LiveKit 房间已创建。

**响应** `200`

```json
{
  "token": "eyJ...",
  "serverUrl": "ws://localhost:7880",
  "room": "gameRoomId",
  "identity": "playerId"
}
```

---

### 创建 LiveKit 房间（幂等）

```
POST /games/:gameRoomId/livekit-room
```

确保对应的 LiveKit 房间存在，已存在则忽略。

**响应** `200`

```json
{ "success": true, "room": "gameRoomId" }
```

---

## 错误格式

所有错误响应格式统一为：

```json
{
  "error": "错误描述",
  "code": "error_code"
}
```

| HTTP 状态码 | 说明 |
|-------------|------|
| `400` | 参数错误 / 业务规则冲突 |
| `401` | 未提供或无效 Token |
| `404` | 资源不存在 |
| `409` | 状态冲突（如 runtime 未配置） |
