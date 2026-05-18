# iframe 数据获取方式分析与修复方案

## 一、现状分析

### 1.1 当前实现（`hostBridge.ts` + `main.tsx`）

```
window.iframeMessage
  └─ createHostBridge()  ← 直接读取 window 对象，非 React 生命周期
       └─ main.tsx run() → bridge.getInfo() + bridge.getToken()
            └─ 写入 localStorage
                 └─ React 组件从 localStorage 读取
```

**关键代码**：
```typescript
// hostBridge.ts
export function createHostBridge(): HostBridge {
  const realBridge = window.__WEREWOLF_HOST_BRIDGE__ ?? window.iframeMessage;
  if (realBridge) return realBridge;
  if (co.isMobile) return createMobileHostBridge();
  return createMockHostBridge();
}
```

### 1.2 temp 项目实现（`useIFrameMessage` + `useIframeAuth.ts`）

```
@unseal-network/game-sdk → useIFrameMessage() React Hook
  └─ useIframeAuth()  ← React Hook，统一管理真实/mock 切换
       └─ App.tsx init() → iframeMessage.getInfo() + iframeMessage.getToken()
            └─ 写入 React state + tokenRef
                 └─ iframeMessage 对象直接传给子组件使用（hideApp 等）
```

**关键代码**：
```typescript
// useIframeAuth.ts
const realMessage = useIFrameMessage()           // SDK hook，绑定 window.iframeMessage
const mockMessage = useMemo(() => createIframeMessageMock(), [])
const iframeMessage = isInIframe() || co.isMobile ? realMessage : mockMessage
```

---

## 二、问题对比

### 问题 1：类型错误 — `window.iframeMessage` 的真实类型

| | 当前项目 | temp 项目 / SDK |
|---|---|---|
| `window.iframeMessage` 类型 | 自定义 `HostBridge`（仅 getInfo/getToken/hideApp/closeApp） | `IFrameMessageType`（完整 SDK 接口）|
| `getToken()` 返回值 | `Promise<string>` | `Promise<string \| undefined>` |
| 额外方法 | ❌ 无 send/on/off/getMembers 等 | ✅ 完整接口 |

**当前项目在 `hostBridge.ts` 中声明**：
```typescript
declare global {
  interface Window {
    iframeMessage?: HostBridge | undefined;  // ⚠️ 类型不匹配实际注入的 SDK 对象
  }
}
```
实际 App 注入的是 `IFrameMessageType`，强制转为 `HostBridge` 会丢失所有额外方法。

### 问题 2：Mock 机制缺失

当前项目的 mock（`createMockHostBridge()`）在 `hostBridge.ts` 中自己实现，与 `@unseal-network/game-sdk` 的 `IFrameMessageType` 接口不兼容。temp 项目的 `createIframeMessageMock()` 实现了完整的 `IFrameMessageType`（含 `send`/`on`/`call.*`/`getMembers` 等），可以直接替换真实 SDK。

### 问题 3：React Hook 生命周期问题

`createHostBridge()` 是普通函数，在 `main.tsx` 的 `useEffect` 中调用时直接读取 `window.iframeMessage`。如果 App 注入 `window.iframeMessage` 的时机晚于 React 渲染，会拿到 `undefined`。

`useIFrameMessage()` 是 React Hook，在渲染时绑定，SDK 内部处理了注入时机问题。

### 问题 4：`iframeMessage` 对象无法传递给组件

当前方案所有数据写 localStorage，`hideApp`/`closeApp` 等操作通过 `createHostBridge().hideApp?.()` 在各组件内临时调用，每次都重新获取 `window.iframeMessage`。

temp 方案将 `iframeMessage` 对象从根组件传递给子组件，统一管理。

### 问题 5：`useIframeAuth.ts` 文件缺失引用

当前项目 `hooks/useIframeAuth.ts` 不存在（tsc 报 `Cannot find module '../mocks/iframeMessageMock'`），但 `main.tsx` 引用了其他文件中涉及到的 mock 逻辑，逻辑分散。

---

## 三、SDK `GameInfo` vs 当前 `HostGameInfo` 字段对比

| 字段 | SDK `GameInfo` | 当前 `HostGameInfo` | 说明 |
|------|---------------|---------------------|------|
| `roomId` | `string`（必填） | `string \| undefined` | SDK 保证非空 |
| `userId` | `string`（必填） | `string \| undefined` | SDK 保证非空 |
| `displayName` | `string`（必填） | `string \| undefined` | SDK 保证非空 |
| `powerLevel` | `number`（必填） | `number \| undefined` | SDK 保证非空 |
| `config.streamURL` | `string`（必填） | `string \| undefined` | SDK 保证非空 |
| `gameRoomId` | `string`（必填） | `string \| undefined` | 已创建游戏时非空 |
| `linkRoomId` | `string`（必填） | `string \| undefined` | 已绑定时非空 |

---

## 四、修复方案

### 4.1 新建 `src/mocks/iframeMessageMock.ts`

直接从 temp 项目移植，实现完整的 `IFrameMessageType` mock，读取 `.env` 配置。

### 4.2 新建 `src/hooks/useIframeAuth.ts`

直接从 temp 项目移植：
```typescript
import { useIFrameMessage } from '@unseal-network/game-sdk'
import { createIframeMessageMock, isInIframe } from '../mocks/iframeMessageMock'
import { co } from '@unseal-network/mobile-sdk'

export function useIframeAuth() {
  const realMessage = useIFrameMessage()
  const mockMessage = useMemo(() => createIframeMessageMock(), [])
  // 在 iframe 内 或 移动端 → 用真实 SDK；否则 → 用 mock
  const iframeMessage = isInIframe() || co.isMobile ? realMessage : mockMessage

  const [info, setInfo] = useState<GameInfo | null>(null)
  const tokenRef = useRef<string>('')

  const init = useCallback(async (): Promise<GameInfo> => {
    const gameInfo = await iframeMessage.getInfo()
    const token = (await iframeMessage.getToken()) ?? ''
    tokenRef.current = token
    setInfo(gameInfo)
    return gameInfo
  }, [iframeMessage])

  const getToken = useCallback(async () => {
    const fresh = (await iframeMessage.getToken()) ?? ''
    tokenRef.current = fresh
    return fresh
  }, [iframeMessage])

  const getTokenSync = useCallback(() => tokenRef.current, [])

  return { info, setInfo, getToken, getTokenSync, iframeMessage, init }
}
```

### 4.3 修改 `main.tsx` 中的 bootstrap 流程

将 `run()` 中的 `createHostBridge()` 调用替换为 `useIframeAuth()` 的 `init()`：

```typescript
// Before（当前）
const bridge = createHostBridge()
const [info, matrixToken] = await Promise.all([bridge.getInfo(), bridge.getToken()])

// After（修复后）
const gameInfo = await iframeAuth.init()   // gameInfo = iframeAuth.info
const matrixToken = iframeAuth.getTokenSync()
```

`iframeAuth.iframeMessage` 对象传递给需要它的组件（CreateGamePage 的 onLeave 等）。

### 4.4 修改 `hostBridge.ts`

- 移除 `createHostBridge()` 和 `createMockHostBridge()` 方法（由 `useIframeAuth` 统一处理）
- 保留 `isHostRuntime()` 和 `isInIframe()` 工具函数
- 移除 `window.iframeMessage?: HostBridge` 声明（交由 SDK 管理）

### 4.5 修改 `create-iframe.tsx`

将 `createHostBridge().hideApp?.()` 替换为通过 props 传入的 `iframeMessage.hideApp()`:

```typescript
// main.tsx 传入
<CreateGamePage onLeave={() => iframeAuth.iframeMessage.hideApp()} />
```

---

## 五、数据流修复后

```
@unseal-network/game-sdk
  └─ useIFrameMessage()  ← React Hook，SDK 内部处理 window.iframeMessage 绑定时机
       │
  useIframeAuth() Hook（main.tsx 内）
  ├─ isInIframe() || co.isMobile → realMessage（真实 SDK）
  └─ 否则 → mockMessage（完整 IFrameMessageType mock）
       │
  init() → getInfo() + getToken()
  ├─ 写 localStorage（供 create-iframe.tsx 读取）
  ├─ tokenRef.current（供 getTokenSync() 同步读取）
  └─ iframeMessage 对象通过 props 传给子组件
       ├─ onLeave → iframeMessage.hideApp()
       └─ onClose → iframeMessage.closeApp()
```

---

## 六、变更文件清单

| 操作 | 文件 | 说明 |
|------|------|------|
| 新建 | `src/mocks/iframeMessageMock.ts` | 从 temp 移植，完整 IFrameMessageType mock |
| 新建 | `src/hooks/useIframeAuth.ts` | 从 temp 移植，统一真实/mock 切换 |
| 修改 | `src/main.tsx` | 用 `useIframeAuth().init()` 替换 `createHostBridge()` |
| 修改 | `src/runtime/hostBridge.ts` | 移除 `createHostBridge`/mock，保留 `isHostRuntime`/`isInIframe` |
| 修改 | `src/routes/create-iframe.tsx` | `onLeave` 不再调 `createHostBridge()`，改用 props 传入 |

---

## 七、不变部分

- `src/hooks/useCreateGame.ts` — 无需修改
- `src/routes/create-test.tsx` — 无需修改
- `src/routes/create.tsx` — 无需修改
- `src/components/LoadingPage.tsx` — 无需修改
- `src/matrix/session.ts` — 无需修改（仍通过 localStorage 读写，供 create-iframe 使用）
- `src/runtime/unsealClient.ts` — 无需修改
- `src/runtime/bootstrap.ts` — 无需修改
