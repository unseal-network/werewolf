# 消灭 /profile 接口调用 & iframeMessage 成员缓存

## 背景

服务端 `authenticateRequest` 每次内存缓存（原 60s）过期后会依次调用：

```
whoami → GET /_matrix/client/v3/profile/{userId}
```

`/profile` 接口在以下场景被高频触发：
- SSE 断线重连（每次重连都走 `authenticateRequest`）
- 多玩家同时操作（每人 token 独立缓存）
- `profileSyncedAt` 在 DB 里为 NULL 时每次缓存过期都会调用

本次改动完全消灭 `/profile` 调用，同时用 `iframeMessage` 替代 `whoAmIAgainstApi` 作为用户身份来源。

---

## 改动一览

### 前端 `game.$gameRoomId.tsx`

#### 1. memberCache：初始化时拉取一次成员列表

```ts
const [memberCache, setMemberCache] = useState<Map<string, MemberInfo>>(() => new Map());

useEffect(() => {
  if (!isHostRuntime()) return;
  void iframeMessage.getMembers().then(members => {
    setMemberCache(new Map(members.map(m => [m.userId, m])));
  }).catch(() => {});
}, [iframeMessage]);
```

- 只在挂载时调用一次，结果缓存在 React state
- `MemberInfo.avatarUrl` 已经是宿主 App 解析好的 HTTPS URL，无需 mxc:// 转换

#### 2. 用户身份：`iframeMessage.getInfo()` 替代 `whoAmIAgainstApi`

```ts
useEffect(() => {
  if (isHostRuntime()) {
    void iframeMessage.getInfo().then(info => {
      writeMatrixIdentity(info.userId, info.displayName);
      setMatrixUserId(info.userId);
      setMatrixDisplayName(info.displayName);
    }).catch(() => {});
    return;
  }
  // 非 host 模式保留原有 whoAmIAgainstApi 路径
  ...
}, [client, matrixToken, iframeMessage]);
```

host 模式下不再调用 `GET /games/me`，从而不触发后端 `authenticateRequest → /profile`。

#### 3. seatView：用 memberCache 补充 displayName/avatarUrl

```ts
const seatView = useMemo(() => {
  if (!isHostRuntime() || memberCache.size === 0) return rawSeatView;
  return rawSeatView.map(seat => {
    if (!seat.userId) return seat;
    const cached = memberCache.get(seat.userId);
    if (!cached) return seat;
    return {
      ...seat,
      displayName: cached.displayName || seat.displayName,
      avatarUrl: cached.avatarUrl ?? seat.avatarUrl,
    };
  });
}, [rawSeatView, memberCache]);
```

#### 4. candidateSeats：同样走 memberCache

```ts
const cached = player.userId ? memberCache.get(player.userId) : undefined;
return {
  displayName: cached?.displayName || player.displayName,
  avatarUrl: cached?.avatarUrl ?? resolveAvatarUrl(player.avatarUrl, matrixHomeserver, matrixToken),
  ...
};
```

#### 5. joinGame：随请求传 displayName/avatarUrl

```ts
const selfCached = isHostRuntime() ? memberCache.get(matrixUserId) : undefined;
const joinDisplayName = selfCached?.displayName ?? matrixDisplayName;
const joinAvatarUrl = selfCached?.avatarUrl;
await client.joinGame(gameRoomId, seatNo, joinDisplayName, joinAvatarUrl);
```

#### 6. refreshAgentCandidates：host 模式走 iframeMessage.getMembers()

```ts
if (isHostRuntime()) {
  const members = await iframeMessage.getMembers();
  const candidates: AgentCandidate[] = members.map(m => ({
    userId: m.userId,
    displayName: m.displayName,
    ...(m.avatarUrl ? { avatarUrl: m.avatarUrl } : {}),
    userType: m.isAgent ? "agent" : "user",
    membership: "join",
    alreadyJoined: false,
  }));
  setAgentCandidates(candidates);
  const info = await iframeMessage.getInfo();
  setAgentSourceRoomId(info.roomId ?? info.linkRoomId ?? undefined);
} else {
  const result = await client.listAgentCandidates(gameRoomId);
  ...
}
```

---

### 前端 `api/client.ts`

`joinGame` 新增可选参数，displayName/avatarUrl 序列化进 body：

```ts
joinGame(gameRoomId, seatNo?, displayName?, avatarUrl?) {
  body: JSON.stringify({
    ...(seatNo     ? { seatNo }     : {}),
    ...(displayName ? { displayName } : {}),
    ...(avatarUrl   ? { avatarUrl }   : {}),
  })
}
```

---

### 后端 `context/auth.ts`

#### 完全删除 `/profile` 调用

```
改前流程：whoami → DB 检查（profileSyncedAt）→ /profile（缓存未命中时）
改后流程：whoami → DB 检查（有行就用）→ whoami 兜底（无行时）
```

- **删除** `profileRefreshMs` 和 `_matrix.profile()` 调用
- DB 有行（无论 `profileSyncedAt` 是否为 NULL）→ 直接返回，不再判断新鲜度
- DB 无行 → 用 `whoami.display_name ?? user_id` 兜底，不发 `/profile`
- **内存缓存 TTL：60s → 5 分钟**，减少 whoami 调用频率

```ts
const whoami = await _matrix.whoami(token);
const cached = profileCache ? await profileCache.get(whoami.user_id).catch(() => null) : null;

if (cached) {
  void profileCache?.touch?.(whoami.user_id);
  return cacheAndReturn({ displayName: cached.displayName, avatarUrl: cached.avatarUrl, ... });
}

// 无 DB 行：whoami 兜底，不调 /profile
return cacheAndReturn({
  displayName: whoami.displayname ?? whoami.display_name ?? whoami.user_id,
  avatarUrl: whoami.avatarUrl ?? whoami.avatar_url,
  ...
});
```

---

### 后端 `routes/games.ts` — join 路由

join 成功后**同步 upsert** `game_users`，写入前端传来的 displayName/avatarUrl：

```ts
const result = await dispatchActorCommand(...);

// 同步写入，确保后续 authenticateRequest 走 DB 路径
if (deps.profileCache && bodyDisplayName) {
  await deps.profileCache.upsert({
    matrixUserId: user.id,
    displayName: resolvedDisplayName,
    ...(resolvedAvatarUrl ? { avatarUrl: resolvedAvatarUrl } : {}),
    profileSyncedAt: new Date(),
  }).catch(() => undefined);
}

return c.json(result);
```

---

## 数据流（改后）

```
用户打开游戏页面
  ├─ iframeMessage.getInfo()   → userId, displayName（本地，0 次 API）
  ├─ iframeMessage.getMembers() → 成员列表缓存（1 次，后不再调）
  └─ SSE subscribe / actions
       → authenticateRequest
           → 内存缓存命中（5 分钟内）→ 直接返回
           → 内存缓存过期 → whoami → DB 命中 → 直接返回
                                    → DB 无行 → whoami 兜底（无 /profile）

用户 join 游戏
  → POST /join body: { displayName, avatarUrl }（来自 memberCache）
  → 后端写入 game_users（profileSyncedAt = now）
  → 之后永远走 DB 命中路径
```

---

## 效果对比

| 场景 | 改前 | 改后 |
|---|---|---|
| 首次请求（DB 无行） | whoami + **/profile** | whoami，无 /profile ✅ |
| join 后缓存过期 | whoami + **/profile** | whoami + DB 命中 ✅ |
| 此后每次缓存过期 | whoami + **/profile** | whoami + DB 命中 ✅ |
| SSE 重连（5 分钟内） | 内存缓存命中 | 内存缓存命中（不变） |
| 座位头像/名字 | mxc:// 需转换 | memberCache 直出 HTTPS ✅ |
| Agent 候选列表 | `listAgentCandidates` API | `getMembers()` 本地 ✅ |
