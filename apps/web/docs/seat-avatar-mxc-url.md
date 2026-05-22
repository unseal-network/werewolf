# SeatAvatar mxc:// URL 修复设计文档

> 分析 Matrix `mxc://` 头像 URL 的解析方案，确保 `<img>` 能正常加载头像。

---

## 一、问题描述

`SeatAvatar.tsx` 直接使用 `seat.avatarUrl` 作为 `<img src>` 的值。当 Matrix 服务端返回的头像 URL 格式为 `mxc://server/mediaId` 时，浏览器无法识别该协议，图片不会加载，组件静默降级为字母头像。

### 当前数据流

```
Matrix API → RoomPlayer.avatarUrl (可能是 mxc://)
    ↓ game.$gameRoomId.tsx  buildSeatStates / candidateSeats
avatarUrl: player?.avatarUrl   ← 原样透传
    ↓ SeatData.avatarUrl
    ↓ SeatAvatar.tsx
<img src={seat.avatarUrl} />   ← mxc:// 无法渲染
```

---

## 二、可用工具函数

### 2.1 `mxcToHttp` — 转换 mxc:// → HTTP 下载地址

```ts
function mxcToHttp(mxcUrl: string, homeserver: string, token: string): string {
  const match = mxcUrl.match(/^mxc:\/\/([^/]+)\/(.+)$/);
  if (!match) return mxcUrl;
  const [, server, mediaId] = match;
  const url = `${homeserver}/_matrix/media/v3/download/${server}/${mediaId}`;
  const sep = url.includes("?") ? "&" : "?";
  return token ? `${url}${sep}access_token=${encodeURIComponent(token)}` : url;
}
```

- 解析 `mxc://serverName/mediaId`
- 拼接为 `homeserver/_matrix/media/v3/download/serverName/mediaId?access_token=...`
- 若输入不是合法 mxc URL 则原样返回（安全降级）

### 2.2 `getAuthedAvatarUrl` — 为 HTTP 头像 URL 附加鉴权

```ts
function getAuthedAvatarUrl(avatarUrl: string, token: string): string {
  if (!avatarUrl || !token) return avatarUrl;
  const sep = avatarUrl.includes("?") ? "&" : "?";
  return `${avatarUrl}${sep}access_token=${encodeURIComponent(token)}`;
}
```

- 用于已是 HTTP/HTTPS 但需要鉴权的情况

### 2.3 组合使用

```ts
const src = avatarUrl.startsWith("mxc://")
  ? mxcToHttp(avatarUrl, homeserver, token)
  : getAuthedAvatarUrl(avatarUrl, token);
```

### 2.4 已有的 homeserver 推导

`session.ts` 中已有：
```ts
export function matrixServerBaseFromToken(token: string): string { ... }
// 示例输出: "https://keepsecret.io"
```

---

## 三、方案对比

### 方案 A — 在 `game.$gameRoomId.tsx` 上游解析（推荐）

在组装 `SeatData` 时，统一将 `mxc://` URL 转换为可用的 HTTP URL，`SeatAvatar` 继续使用 `seat.avatarUrl` 不需要感知 Matrix 协议。

**改动范围：**

| 位置 | 改动 |
|------|------|
| `matrix/session.ts` 或新建 `matrix/media.ts` | 新增 `mxcToHttp` + `getAuthedAvatarUrl` + `resolveAvatarUrl` |
| `game.$gameRoomId.tsx` `buildSeatStates` | `avatarUrl: resolveAvatarUrl(player?.avatarUrl, token, homeserver)` |
| `game.$gameRoomId.tsx` `candidateSeats` | 同上 |
| `SeatAvatar.tsx` | **无需改动** |

**优点：**
- `SeatAvatar` 保持纯展示组件，无需关心 Matrix 协议
- 解析逻辑集中，便于测试和维护
- 未来其他组件用到 `avatarUrl` 时自动受益

**缺点：**
- `buildSeatStates` 需要能拿到 `token` 和 `homeserver`（两者均可从 `session.ts` 读取，成本低）

---

### 方案 B — 在 `SeatAvatar.tsx` 内部解析

给 `SeatAvatar` 增加 `token` 和 `homeserver` props，在渲染时按需转换。

**缺点：**
- 每个使用 `SeatAvatar` 的地方都需要额外传参（`PlayerRail` → `SeatAvatar`）
- 展示组件依赖 Matrix 协议细节，耦合度高
- 不推荐

---

## 四、推荐方案 A 详细改动

### 4.1 新建工具文件 `src/matrix/media.ts`

```ts
/**
 * Resolve a Matrix avatar URL (mxc:// or https://) to a browser-loadable URL.
 */
export function mxcToHttp(
  mxcUrl: string,
  homeserver: string,
  token: string
): string {
  const match = mxcUrl.match(/^mxc:\/\/([^/]+)\/(.+)$/);
  if (!match) return mxcUrl;
  const [, server, mediaId] = match;
  const url = `${homeserver}/_matrix/media/v3/download/${server}/${mediaId}`;
  const sep = url.includes("?") ? "&" : "?";
  return token ? `${url}${sep}access_token=${encodeURIComponent(token)}` : url;
}

export function getAuthedAvatarUrl(avatarUrl: string, token: string): string {
  if (!avatarUrl || !token) return avatarUrl;
  const sep = avatarUrl.includes("?") ? "&" : "?";
  return `${avatarUrl}${sep}access_token=${encodeURIComponent(token)}`;
}

/**
 * Unified entry point: handles both mxc:// and https:// avatar URLs.
 */
export function resolveAvatarUrl(
  avatarUrl: string | undefined,
  token: string,
  homeserver: string
): string | undefined {
  if (!avatarUrl) return undefined;
  if (avatarUrl.startsWith("mxc://")) {
    return mxcToHttp(avatarUrl, homeserver, token);
  }
  return getAuthedAvatarUrl(avatarUrl, token);
}
```

---

### 4.2 `game.$gameRoomId.tsx` — `buildSeatStates` 改动

```diff
+ import { resolveAvatarUrl } from "../matrix/media";
+ import { readMatrixToken, matrixServerBaseFromToken } from "../matrix/session";

  function buildSeatStates(...) {
+   const token      = readMatrixToken();
+   const homeserver = matrixServerBaseFromToken(token);

    // 在 seat 组装时：
-   avatarUrl: player?.avatarUrl,
+   avatarUrl: resolveAvatarUrl(player?.avatarUrl, token, homeserver),
  }
```

---

### 4.3 `game.$gameRoomId.tsx` — `candidateSeats` memo 改动

```diff
  const candidateSeats = useMemo(() => {
+   const token      = readMatrixToken();
+   const homeserver = matrixServerBaseFromToken(token);
    return players.map((player) => ({
      ...player,
-     avatarUrl: player.avatarUrl,
+     avatarUrl: resolveAvatarUrl(player.avatarUrl, token, homeserver),
    }));
  }, [players]);
```

> **注意：** `token` 和 `homeserver` 在会话期间不变，可提升到组件顶层用 `useMemo` 或直接模块级常量，避免每次 render 重复计算。

---

### 4.4 `SeatAvatar.tsx` — 无需改动

`seat.avatarUrl` 到达 `SeatAvatar` 时已经是合法的 HTTP URL（或 `undefined`），现有 `<img src={seat.avatarUrl}>` 逻辑保持不变。

---

## 五、边界情况处理

| 情况 | 处理结果 |
|------|---------|
| `avatarUrl` 为 `undefined` / `""` | `resolveAvatarUrl` 返回 `undefined`，显示字母头像 |
| 合法 `mxc://` URL | 转换为 HTTP 下载地址，携带 token |
| 已是 `https://` URL | 附加 `access_token` 参数 |
| 格式错误的 `mxc://` | `mxcToHttp` 原样返回，`<img>` 加载失败 → 字母头像兜底 |
| `token` 为空 | `mxcToHttp` 不附加 token，URL 仍有效（若服务器允许匿名） |
| `matrixServerBaseFromToken` 解析失败 | 降级到 `"https://keepsecret.io"` |

---

## 六、改动文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/matrix/media.ts` | **新建** | `mxcToHttp` / `getAuthedAvatarUrl` / `resolveAvatarUrl` |
| `src/routes/game.$gameRoomId.tsx` | **修改** | `buildSeatStates` + `candidateSeats` 调用 `resolveAvatarUrl` |
| `src/components/SeatAvatar.tsx` | **无需改动** | 保持现有逻辑 |

---

*文档版本：2026-05-22*
