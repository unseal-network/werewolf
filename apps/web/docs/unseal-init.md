# Web 端初始化与 Unseal 服务集成

> 本文档描述 Web 端与 Unseal 宿主服务（`http://localhost:12018`）的集成方案，包括鉴权、房间发现和游戏创建绑定流程。

---

## 一、相关文件

| 文件 | 说明 |
|------|------|
| `src/api/unsealClient.ts` | Unseal 服务 HTTP 客户端（enter / getRoom / linkRoom） |
| `src/App.tsx` | 核心状态机：handleInit / handleCreateAndJoin |
| `src/hooks/useIframeAuth.ts` | iframeMessage 封装，提供 getToken / getInfo |
| `src/mocks/iframeMessageMock.ts` | 本地开发 mock，isInIframe() 工具函数 |
| `.env` | 环境变量（含 VITE_UNSEAL_API_BASE_URL） |

---

## 二、环境变量

```env
VITE_API_BASE_URL=http://localhost:3000  # 游戏服务地址
```

Unseal 服务的 base URL 不再来自环境变量，而是在运行时从 `gameInfo.config.streamURL` 拼接：

```ts
createUnsealClient(gameInfo.config.streamURL + '/app-mgr/room')
// 例：https://keepsecret.io/app-mgr/room
```

客户端在 `handleInit` 的 step 3.5 创建并存入 `unsealClientRef`，之后所有 Unseal API 调用均通过该实例发起。

---

## 三、Unseal 服务接口

### 3.1 鉴权换取 JWT

```
POST /api/auth/enter
Header: unsealToken: <iframeMessage.getToken() 返回的原始 token>
```

响应：
```json
{
  "user": { "userId": "@xxx:keepsecret.io", "displayName": "...", "avatarUrl": "..." },
  "token": "eyJhbGci..."
}
```

返回的 `token` 即 JWT，存入 `unsealJwtRef`，用于后续 Unseal API 的 `Authorization: Bearer` 请求头。

> **注意**：游戏服务（`/games/...`）仍使用 Matrix token（`getToken()` 返回值），不受影响。

---

### 3.2 查询宿主房间

```
GET /api/rooms/:roomId
Header: Authorization: Bearer <jwt>
```

响应关键字段：

| 字段 | 说明 |
|------|------|
| `data.linkRoomId` | 已绑定的游戏房间 ID，`null` 表示未创建 |
| `data.isMine` | 当前用户是否为该房间管理员 |
| `data.adminId` | 房间管理员 userId |

---

### 3.3 绑定游戏房间

```
POST /api/rooms/:roomId/link
Header: Authorization: Bearer <jwt>
Body: { "linkRoomId": "<gameRoomId>" }
```

Admin 创建游戏成功后调用，将游戏房间 ID 写入宿主房间，非 Admin 玩家轮询时即可发现。

---

## 四、初始化流程（handleInit）

```
App 挂载
  │
  ├─ URL 中有 gameRoomId？（刷新场景）
  │      YES → getToken() + init() → reconnectGame(urlId) → playing
  │
  ├─ 非 iframe 环境（本地开发）
  │      → 跳过 Unseal API → setStage('lobby')
  │
  └─ iframe 环境（生产）
         │
         ├─ 1. getToken() → unsealToken（Matrix access token）
         ├─ 2. init() → gameInfo（含 gameRoomId、powerLevel 等）
         ├─ 3. POST /api/auth/enter → jwt，存入 unsealJwtRef
         ├─ 4. GET /api/rooms/:gameInfo.gameRoomId → roomData
         │
         ├─ roomData.linkRoomId 存在？
         │      YES → reconnectGame(linkRoomId) → playing
         │
         └─ NO：
                ├─ isAdmin（powerLevel >= 100）
                │      YES → setStage('lobby')（手动创建）
                │
                └─ NO → pollUntilLinked(roomId)（每 1s 轮询）
                              ↓ linkRoomId 出现
                         reconnectGame(linkRoomId) → playing
```

**轮询中止时机**：
- 用户点击「返回大厅」→ `handleBackToLobby` 设置 `pollAbortRef.current = true`
- 重试初始化 → `handleInit` 开头也会设置 abort

---

## 五、Admin 创建游戏流程（handleCreateAndJoin）

```
1. POST /games/room
       → gameRoomId

2. PUT /games/:gameRoomId/settings
       → 配置 targetPlayerCount / language / timing

3. POST /games/:gameRoomId/join
       → 加入房间

4. 仅 iframe 模式：
   POST /api/rooms/:gameInfo.gameRoomId/link { linkRoomId: gameRoomId }
       → 绑定宿主房间，非 Admin 玩家的轮询即可发现

5. setUrlGameRoomId(gameRoomId)
   refreshGame(gameRoomId)
   setStage('playing')
```

---

## 六、本地开发说明

非 iframe 环境（`isInIframe() === false`）：
- `iframeMessage` 使用 mock，从 `.env` 读取 `VITE_MOCK_*` 变量
- **跳过** Unseal 鉴权和房间查询
- Admin（`VITE_MOCK_POWER_LEVEL=100`）直接进大厅
- 非 Admin 也直接进大厅（mock 场景无需轮询）
- `handleCreateAndJoin` 跳过 `linkRoom` 调用

本地测试步骤：
1. 确保 `VITE_MOCK_TOKEN` 填入真实 Matrix token
2. 启动游戏服务：`pnpm --filter @werewolf/api dev`
3. 启动 Web：`pnpm --filter @werewolf/web dev`
4. 打开 `http://localhost:5173`，会自动以 Admin 身份进入大厅

---

## 七、Token 管理

| Token | 来源 | 用途 | 存储位置 |
|-------|------|------|----------|
| Matrix token | `iframeMessage.getToken()` | 游戏服务 Authorization | `tokenRef`（useIframeAuth） |
| Unseal JWT | `POST /api/auth/enter` 响应 | Unseal 服务 Authorization | `unsealJwtRef`（App.tsx） |

两者独立存储，互不影响。
