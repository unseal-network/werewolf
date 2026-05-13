# API 变更文档

> 原有所有接口**保持不变**，本文档仅描述新增接口及现有接口的行为扩展。

---

## 一、新增接口

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
| 房间 `status` | `ended` → `active`（直接开始） |
| 玩家列表 / 座位 | **保留**（未退出的玩家继续参与） |
| 创建者 | 不变 |

**权限**：仅房间创建者可调用（与原逻辑一致）

---

## 三、接口汇总

| 接口 | 类型 | 说明 |
|------|------|------|
| `POST /games` | 原有，不变 | 创建房间并配置（一步完成） |
| `POST /games/room` | **新增** | 仅创建空房间，无参数 |
| `PUT /games/:id/settings` | **新增** | 单独配置房间参数 |
| `POST /games/:id/start` | 原有，**扩展** | 新增支持 `ended` 状态重开 |

---

## 四、Web 端适配说明

### 4.1 创建/进入房间（`linkRoomId` 判断）

`iframeMessage.getInfo()` 返回的 `gameInfo` 包含 `linkRoomId` 字段，表示宿主 App 预绑定的房间 ID。

```
gameInfo.linkRoomId 存在？
  │
  ├─ YES → 跳过 POST /games/room
  │         直接 PUT /games/:linkRoomId/settings
  │         → joinGame(linkRoomId)
  │
  └─ NO  → POST /games/room（得到 gameRoomId）
            → PUT /games/:gameRoomId/settings
            → joinGame(gameRoomId)
```

两条路径均需调用 `PUT settings` + `joinGame`，保持统一。

---

### 4.2 游戏结束后重开流程

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

### 4.3 `handleCreateAndJoin` 伪代码

```ts
async function handleCreateAndJoin(config) {
  const linkRoomId = info?.linkRoomId ?? info?.gameRoomId

  let gameRoomId: string
  if (linkRoomId) {
    gameRoomId = linkRoomId           // 宿主指定，直接用
  } else {
    const res = await client.createRoom()   // POST /games/room
    gameRoomId = res.gameRoomId
  }

  await client.updateRoomSettings(gameRoomId, {   // PUT /games/:id/settings
    sourceMatrixRoomId: info.roomId,
    title: '狼人杀',
    targetPlayerCount: config.targetPlayerCount,
    language: config.language,
    timing: config.timing,
  })

  await client.joinGame(gameRoomId)
  setGameRoomId(gameRoomId)
  setUrlGameRoomId(gameRoomId)
  await refreshGame(gameRoomId)
  setStage('playing')
}
```
