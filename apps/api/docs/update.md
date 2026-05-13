# API 变更文档

> 原有所有接口**保持不变**，本文档仅描述新增接口及现有接口的行为扩展，以及 Web 端适配方案。

---

## 一、新增接口（游戏服务 `/games`）

### 1.1 创建空房间

```
POST /games/room
```

无需请求体，服务端自动生成 `gameRoomId`，记录调用者为创建者。  
与原 `POST /games`（创建+配置一步完成）并存，适用于需要先拿到房间 ID、再配置参数的场景。

**请求体**：无

**响应** `201`

```json
{
  "gameRoomId": "room_xxxxxxxx"
}
```

---

### 1.2 设置房间参数

```
PUT /games/:gameRoomId/settings
```

仅房间创建者可调用，游戏开始前可多次覆盖更新。

**请求体**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `sourceMatrixRoomId` | string | ✅ | 关联的 Matrix 房间 ID |
| `title` | string | ✅ | 游戏标题，最长 80 字 |
| `targetPlayerCount` | number | ❌ | 6 / 8 / 12，默认 8 |
| `language` | string | ❌ | `zh-CN` / `en`，默认 `zh-CN` |
| `timing.nightActionSeconds` | number | ❌ | 默认 45 |
| `timing.speechSeconds` | number | ❌ | 默认 60 |
| `timing.voteSeconds` | number | ❌ | 默认 30 |
| `allowedSourceMatrixRoomIds` | string[] | ❌ | 加入白名单 |

**响应** `200`

```json
{
  "gameRoomId": "room_xxxxxxxx",
  "targetPlayerCount": 8,
  "language": "zh-CN"
}
```

**错误**
- `403` 非创建者调用
- `409` 游戏已开始，不可修改

---

## 二、现有接口行为扩展

### 2.1 `POST /games/:gameRoomId/start` — 支持 `ended` 状态重新开局

**原行为**：仅接受 `status === 'waiting'` 的房间，否则返回 `409`。

**新行为**：同时接受 `status === 'ended'` 的房间，内部执行以下重置后开始新局：

| 重置项 | 处理 |
|--------|------|
| 所有玩家 `ready` | → `false` |
| 所有玩家 `alive` | → `true` |
| `projection` / `events` | 清空（可归档） |
| 房间 `status` | `ended` → `waiting` → `active`（直接开始） |
| 玩家列表 / 座位 | **保留**（未退出的玩家继续参与） |
| 创建者 | 不变 |

**权限**：仅房间创建者可调用（与原逻辑一致）

---

## 三、外部 API（Unseal 服务 `http://localhost:12018`）

Web 端初始化及创建游戏时需调用宿主 App 提供的 Unseal 服务接口。

### 3.1 进入游戏鉴权

```
POST http://localhost:12018/api/auth/enter
```

**请求 Headers**

| Header | 说明 |
|--------|------|
| `unsealToken` | 从 iframeMessage 获取的原始 token |

**响应** `200`

```json
{
  "user": {
    "userId": "@jams2026:keepsecret.io",
    "displayName": "Jams2026",
    "avatarUrl": "mxc://keepsecret.io/RZWRjWiKUfQuemYUUaxRxsZX"
  },
  "token": "eyJhbGci..."
}
```

返回的 `token` 即为 JWT，**存入本地**，之后调用游戏服务所有接口时作为 `Authorization: Bearer <token>` 使用。

---

### 3.2 查询宿主房间信息

```
GET http://localhost:12018/api/rooms/{gameInfo.roomId}
```

**请求 Headers**

| Header | 说明 |
|--------|------|
| `Authorization` | `Bearer <token>`（3.1 返回的 JWT） |

**响应** `200`

```json
{
  "success": true,
  "data": {
    "roomId": "8530edac-3ea9-4e56-bb64-f06a892765c7",
    "meetId": "!HhCuYUBxUadqXojuTY:keepsecret.io",
    "status": "waiting",
    "playerCount": null,
    "currentPlayers": 0,
    "mode": "standard",
    "lang": "zh",
    "adminId": "@jams2026:keepsecret.io",
    "creatorId": "@jams2026:keepsecret.io",
    "refereeId": null,
    "gameAppId": 11,
    "linkRoomId": "661e8400-e29b-41d4-a716-446655440002",
    "isMine": true,
    "players": []
  }
}
```

关键字段：

| 字段 | 说明 |
|------|------|
| `data.linkRoomId` | 宿主已绑定的游戏房间 ID，存在时直接使用，无需创建 |
| `data.adminId` | 房间管理员的 userId，与当前用户对比可判断是否为 admin |

---

### 3.3 绑定游戏房间到宿主房间

```
POST http://localhost:12018/api/rooms/:roomId/link
```

`roomId` 为宿主房间 ID（`gameInfo.roomId`）。  
**仅 admin 创建游戏成功后调用**，将新建的 `gameRoomId` 绑定到宿主房间，供其他客户端通过 3.2 接口发现。

**请求 Headers**

| Header | 说明 |
|--------|------|
| `Authorization` | `Bearer <token>` |
| `Content-Type` | `application/json` |

**请求体**

```json
{
  "linkRoomId": "661e8400-e29b-41d4-a716-446655440002"
}
```

**响应** `200`

```json
{
  "success": true,
  "data": {
    "roomId": "8530edac-3ea9-4e56-bb64-f06a892765c7",
    "linkRoomId": "661e8400-e29b-41d4-a716-446655440002"
  }
}
```

绑定成功后，其他玩家通过 3.2 接口查询时即可看到 `linkRoomId`，可直接进入游戏无需再创建。

---

## 四、接口汇总

### 游戏服务接口

| 接口 | 类型 | 说明 |
|------|------|------|
| `POST /games` | 原有，不变 | 创建房间并配置（一步完成） |
| `POST /games/room` | **新增** | 仅创建空房间，无参数 |
| `PUT /games/:id/settings` | **新增** | 单独配置房间参数 |
| `POST /games/:id/start` | 原有，**扩展** | 新增支持 `ended` 状态重开 |

### Unseal 服务接口

| 接口 | 说明 |
|------|------|
| `POST /api/auth/enter` | 鉴权，返回 JWT |
| `GET /api/rooms/:roomId` | 查询宿主房间，含 `linkRoomId` |
| `POST /api/rooms/:roomId/link` | 将游戏房间绑定到宿主房间 |

---

## 五、Web 端适配说明

### 5.1 应用初始化流程（`handleInit`）

```
1. iframeMessage.getToken()         → 拿到 unsealToken
2. POST /api/auth/enter             → 换取 JWT，存本地（Authorization 后续使用）
3. iframeMessage.getInfo()          → 拿到 gameInfo（含 roomId、userId 等）
4. GET /api/rooms/:gameInfo.roomId  → 查询宿主房间，得到 roomData
   │
   ├─ roomData.linkRoomId 存在？
   │      ↓ YES
   │   reconnectGame(linkRoomId)    → joinGame + getGame → setStage('playing')
   │
   └─ NO，判断当前用户是否为 admin
          │
          ├─ isAdmin = true
          │      ↓
          │   setStage('lobby')     → 进入大厅，等待 admin 手动创建房间
          │
          └─ isAdmin = false
                 ↓
             轮询 GET /api/rooms/:roomId（间隔 1s）
             直到 linkRoomId 出现
                 ↓
             reconnectGame(linkRoomId)
```

---

### 5.2 Admin 创建游戏流程（`handleCreateAndJoin`）

```
1. POST /games/room                       → 创建空房间，得到 gameRoomId
2. PUT /games/:gameRoomId/settings        → 配置房间参数
3. POST /games/:gameRoomId/join           → 加入房间
   │
   ├─ gameInfo 存在？
   │      ↓ YES
   │   POST /api/rooms/:gameInfo.roomId/link  → 绑定 gameRoomId 到宿主房间
   │   （绑定成功后非 admin 玩家的轮询才能发现该房间）
   │
   └─ NO → 跳过绑定
   │
4. refreshGame(gameRoomId)
5. setStage('playing')
```

---

### 5.3 游戏结束后重开流程

游戏结束时玩家**未退出房间**，无需任何重置接口，直接复用现有 `start` 接口即可。

```
projection.status === 'ended'
        ↓
ActionBar 显示：
  ├─ [🏠 返回大厅]   → 所有人可见，clearUrlGameRoomId，回 lobby
  └─ [🔄 再来一局]   → 仅 admin 可见
          ↓ admin 点击
    POST /games/:id/start   ← 服务端识别 ended 状态，重置后开新局
          ↓ 成功
    refreshGame(gameRoomId)
          ↓
    projection 更新 / status = 'active'
    → GamePage 自动进入游戏中界面
    URL 中 gameRoomId 保持不变
```

**不需要额外接口**：玩家未退出房间，状态由服务端在 `start` 调用时统一重置。

---

### 5.4 关键伪代码

#### `handleInit`

```ts
async function handleInit() {
  const unsealToken = await iframeMessage.getToken()

  // 鉴权：换取 JWT
  const { token } = await unsealApi.enter(unsealToken)
  saveToken(token)   // 存本地，后续 Authorization 使用

  const gameInfo = await iframeMessage.getInfo()
  saveGameInfo(gameInfo)

  // 查询宿主房间
  const roomData = await unsealApi.getRoom(gameInfo.roomId)

  if (roomData.linkRoomId) {
    // 宿主已绑定游戏房间，直接进入
    await reconnectGame(roomData.linkRoomId)
  } else if (isAdmin) {
    // Admin 进入大厅，手动配置并创建
    setStage('lobby')
  } else {
    // 非 admin：轮询等待 admin 创建并绑定
    const linkRoomId = await pollUntilLinked(gameInfo.roomId, { intervalMs: 1000 })
    await reconnectGame(linkRoomId)
  }
}
```

#### `handleCreateAndJoin`

```ts
async function handleCreateAndJoin(config) {
  // 创建空房间
  const { gameRoomId } = await gameClient.createRoom()          // POST /games/room

  // 配置参数
  await gameClient.updateRoomSettings(gameRoomId, {             // PUT /games/:id/settings
    sourceMatrixRoomId: gameInfo.roomId,
    title: '狼人杀',
    targetPlayerCount: config.targetPlayerCount,
    language: config.language,
    timing: config.timing,
  })

  // 加入房间
  await gameClient.joinGame(gameRoomId)                         // POST /games/:id/join

  // 绑定到宿主房间（供非 admin 玩家发现）
  if (gameInfo) {
    await unsealApi.linkRoom(gameInfo.roomId, gameRoomId)       // POST /api/rooms/:id/link
  }

  setUrlGameRoomId(gameRoomId)
  await refreshGame(gameRoomId)
  setStage('playing')
}
```

#### `pollUntilLinked`

```ts
async function pollUntilLinked(roomId: string, { intervalMs = 1000 } = {}): Promise<string> {
  while (true) {
    const roomData = await unsealApi.getRoom(roomId)
    if (roomData.linkRoomId) return roomData.linkRoomId
    await sleep(intervalMs)
  }
}
```
