# 改动方案文档 v2

## 一、目标

1. **Loading 界面**：host runtime 初始化期间（checking / waiting / error）展示全屏加载页
2. **创建页完全拆分**：`create.tsx` 拆成两个独立组件 + 共享逻辑 hook，iframe 和测试模式零耦合
3. **数据来源清晰**：iframe 数据全部来自 `iframeMessage`（已由 `main.tsx` bootstrap 写入 localStorage），测试模式来自 `test-users` 手动选择

---

## 二、文件结构

```
src/
├── components/
│   ├── LoadingPage.tsx          [新建] 全屏加载/错误页
│   ├── BottomSheet.tsx          [新建] 底部弹出面板（从 temp 移植）
│   └── FormSelect.tsx           [新建] 提取自 create.tsx 的下拉选择组件
│
├── hooks/
│   └── useCreateGame.ts         [新建] 创建游戏共享逻辑 hook
│
├── routes/
│   ├── create.tsx               [修改] 仅保留入口：根据 isHostRuntime() 分发
│   ├── create-test.tsx          [新建] 测试模式独立组件（当前 CreateGamePage 迁移）
│   └── create-iframe.tsx        [新建] iframe 模式独立组件（LobbyPage 风格）
│
└── main.tsx                     [修改] checking/waiting/error 状态改用 LoadingPage
```

---

## 三、各文件说明

### 3.1 `src/hooks/useCreateGame.ts`

两个模式共享的**纯逻辑层**，不含任何 UI。

```typescript
interface UseCreateGameOptions {
  onGameCreated?: (gameRoomId: string, sourceMatrixRoomId: string) => Promise<void> | void
}

interface UseCreateGameReturn {
  // 表单状态
  title: string
  setTitle: (v: string) => void
  language: "zh-CN" | "en"
  setLanguage: (v: "zh-CN" | "en") => void
  agentSpeechRate: number
  setAgentSpeechRate: (v: number) => void
  targetPlayerCount: number
  setTargetPlayerCount: (v: number) => void

  // 提交
  submitting: boolean
  error: string
  setError: (v: string) => void
  submit: (params: { sourceMatrixRoomId: string; matrixToken: string }) => Promise<void>
}
```

**职责**：
- 管理 `title` / `language` / `agentSpeechRate` / `targetPlayerCount` state
- 调用 `createApiClient().createGame(...)` 提交
- 提交成功后回调 `onGameCreated`，然后跳转 `?gameRoomId=…`
- 暴露 `error` 和 `submitting` 状态给 UI 层使用

**不负责**：
- Matrix token 的读取/写入（由调用方传入）
- sourceMatrixRoomId 的读取/写入（由调用方传入）
- 任何 UI 渲染

---

### 3.2 `src/components/FormSelect.tsx`

从 `create.tsx` 提取的可复用下拉组件，与业务解耦。

```typescript
interface FormSelectOption { value: string; label: string }

interface FormSelectProps {
  value: string
  options: FormSelectOption[]
  onChange: (value: string) => void
}

export function FormSelect({ value, options, onChange }: FormSelectProps) { … }
```

样式保持现有风格（白色触发器 + 金色边框 + 深色下拉菜单）。

---

### 3.3 `src/routes/create.tsx`（修改为入口）

```typescript
import { isHostRuntime } from "../runtime/hostBridge"
import { IframeCreatePage } from "./create-iframe"
import { TestCreatePage } from "./create-test"

export interface CreateGamePageProps {
  initialError?: string
  onGameCreated?: (gameRoomId: string, sourceMatrixRoomId: string) => Promise<void> | void
}

export function CreateGamePage(props: CreateGamePageProps) {
  if (isHostRuntime()) {
    return <IframeCreatePage {...props} />
  }
  return <TestCreatePage {...props} />
}
```

**只做路由分发，不含任何 state 和 UI。**

---

### 3.4 `src/routes/create-test.tsx`（测试模式）

当前 `CreateGamePage` 的**完整迁移**，改名为 `TestCreatePage`，无任何变更。

**数据来源**：
| 字段 | 来源 |
|------|------|
| `matrixToken` | `readMatrixToken()`（localStorage / cookie，DEMO_TOKEN 兜底） |
| `userId` / `displayName` | `readStoredMatrixUserId()` / `readStoredMatrixDisplayName()` |
| `sourceMatrixRoomId` | `localStorage.getItem(SOURCE_ROOM_STORAGE_KEY)` |
| `joinedRooms` | `client.joinedRooms(matrixBase)` 手动刷新 |

**UI 包含**：
- Matrix Token 文本域 + 刷新房间按钮
- 游戏标题输入框
- Source Room 下拉（含自定义输入）
- 语言 / 语速 下拉（2 列网格）
- 金色渐变提交按钮
- 退出登录 + 语言切换器（header 右上角）

```typescript
export interface TestCreatePageProps {
  initialError?: string
  onGameCreated?: (gameRoomId: string, sourceMatrixRoomId: string) => Promise<void> | void
}
export function TestCreatePage(props: TestCreatePageProps) { … }
```

---

### 3.5 `src/routes/create-iframe.tsx`（iframe 模式）

**全新组件**，LobbyPage 风格，不含任何测试模式的字段。

**数据来源**：
| 字段 | 来源 | 说明 |
|------|------|------|
| `matrixToken` | `readMatrixToken()` | 由 `main.tsx` bootstrap 通过 `writeMatrixToken(bridgeToken)` 写入 |
| `userId` / `displayName` | `readStoredMatrixUserId()` / `readStoredMatrixDisplayName()` | 同上，`writeMatrixIdentity()` 写入 |
| `sourceMatrixRoomId` | `localStorage.getItem(SOURCE_ROOM_STORAGE_KEY)` | bootstrap 写入 `hostRoomId` |
| `isAdmin` | `props.isAdmin`（由 `main.tsx` 传入，来自 `powerLevel >= 100`） |

> **注意**：`main.tsx` 的 host bootstrap 已保证所有数据在组件渲染前写入，`create-iframe.tsx` 只需读取，不需要任何 bridge 调用。

**Props**：
```typescript
export interface IframeCreatePageProps {
  initialError?: string
  onGameCreated?: (gameRoomId: string, sourceMatrixRoomId: string) => Promise<void> | void
  onLeave?: () => void   // 默认: createHostBridge().hideApp?.()
}
export function IframeCreatePage(props: IframeCreatePageProps) { … }
```

**State（本组件独有）**：
```typescript
const [activeSheet, setActiveSheet] = useState<'players' | 'language' | 'voice' | null>(null)
const [meetingRequired, setMeetingRequired] = useState(false)  // 预留字段，暂不传给 API
```

**共享逻辑**：
```typescript
const { title, setTitle, language, setLanguage, agentSpeechRate,
        targetPlayerCount, setTargetPlayerCount,
        submitting, error, submit } = useCreateGame({ onGameCreated })
```

**UI 结构**：
```
┌─────────────────────────────────────┐
│ [MobileHeader]  仅 co.isMobile 显示  │   固定右上角
├─────────────────────────────────────┤
│ flex-1 overflow-y-auto  zIndex:10   │
│                                     │
│ ── ✦ GAME SETUP ✦ ──               │   分割线
│                                     │
│ ┌───────────┐ ┌───────────┐         │
│ │ 👥 人数   │ │ 🌐 语言   │         │   2 列配置卡片
│ │  12P     │ │  中文     │         │   点击 → BottomSheet
│ └───────────┘ └───────────┘         │
│                                     │
│ 游戏名称输入框（小字，默认折叠）       │   可选展开
│                                     │
├─────────────────────────────────────┤
│ 底部 CTA（safe-area padding）        │
│ [ 🐺 创建游戏 ]  紫色大按钮          │
│ [ ← Abandon  ]  透明小按钮          │
│ 错误文案（红色小字）                 │
└─────────────────────────────────────┘
```

**BottomSheet 内容**：
- `players`：`[6, 8, 12]` 三个按钮 → `setTargetPlayerCount`
- `language`：`zh-CN / en` → `setLanguage`
- `voice`：开启/关闭（`setMeetingRequired`，API 暂不支持，仅 UI 预留）

**背景**：
```css
background: linear-gradient(160deg, #07041a 0%, #0d0825 40%, #120930 70%, #0a0618 100%)
```
Ambient glow 粒子（参照 LobbyPage）。

**提交逻辑**：
```typescript
async function handleCreate() {
  const token = readMatrixToken()
  const roomId = localStorage.getItem(SOURCE_ROOM_STORAGE_KEY) ?? ""
  if (!roomId) { setError("未获取到来源房间 ID"); return }
  await submit({ sourceMatrixRoomId: roomId, matrixToken: token })
}
```

**离开逻辑**：
```typescript
function handleLeave() {
  props.onLeave?.() ?? createHostBridge().hideApp?.()
}
```

---

### 3.6 `src/components/LoadingPage.tsx`（新建）

```typescript
interface LoadingPageProps {
  isAdmin?: boolean
  onAdminAction?: () => void   // 右上角管理员按钮回调
  error?: string | null
  onRetry?: () => void
}
export function LoadingPage(props: LoadingPageProps) { … }
```

UI（参照 temp `LoadingPage.tsx`）：
- 全屏深色背景
- 左上角 `CONNECTING...` + Globe 图标（opacity 0.2）
- 右上角管理员齿轮按钮（仅 `isAdmin && onAdminAction` 显示）
- 中央 `<Fingerprint>` + CSS `@keyframes scan` 扫描线
- 正常态：`Retrieving Data...`（打点动画） + 副文案
- 错误态：红色错误文本 + 「重试」按钮
- 底部 `Lupus Night Protocol v1.0`（opacity 0.1）

---

### 3.7 `src/components/BottomSheet.tsx`（新建）

直接从 `temp/…/components/BottomSheet.tsx` 移植，无依赖，无修改。

```typescript
interface BottomSheetProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}
export function BottomSheet(props: BottomSheetProps) { … }
```

---

### 3.8 `src/main.tsx`（修改）

**当前状态处理** → **改为**：

| `hostBootstrap.status` | 当前 | 改为 |
|------------------------|------|------|
| `checking` | 顶部紫色 pulse 横条 | `<LoadingPage />` |
| `waiting` | 自定义等待卡片 | `<LoadingPage error="等待房主绑定游戏房间..." />` |
| `error` | `<CreateGamePage initialError=…>` | `<LoadingPage error={msg} onRetry={() => location.reload()} />` |

需要在 `run()` 函数中将 `isAdmin` 存入 state，以便传给 `LoadingPage`：
```typescript
const [isAdmin, setIsAdmin] = useState(false)
// 在 run() 中：
setIsAdmin((info.powerLevel ?? 0) >= 100)
```

---

## 四、数据流图

```
非 iframe 模式
──────────────
UserSelectPage → writeMatrixSession() → localStorage
                                              │
                                    TestCreatePage
                                    ├── readMatrixToken()
                                    ├── readStoredMatrixUserId()
                                    ├── localStorage(SOURCE_ROOM_KEY)
                                    └── client.joinedRooms()  [手动刷新]


iframe 模式
──────────────
iframeMessage.getToken()     ─→ writeMatrixToken()     ─┐
iframeMessage.getInfo()      ─→ writeMatrixIdentity()   ├─→ localStorage
  └─ .roomId / .gameRoomId   ─→ localStorage(SOURCE_ROOM_KEY) ─┘
  └─ .powerLevel                                        │
  └─ .config.streamURL                                  │
       │                                                │
  [main.tsx bootstrap]                         IframeCreatePage
                                               ├── readMatrixToken()
                                               ├── readStoredMatrixUserId()
                                               └── localStorage(SOURCE_ROOM_KEY)
```

**关键原则**：`IframeCreatePage` **不直接调用 bridge**，只读 localStorage，数据已由 `main.tsx` 保证写入。

---

## 五、不变的部分

- `src/matrix/session.ts` — 无需修改
- `src/runtime/hostBridge.ts` — 无需修改
- `src/runtime/unsealClient.ts` — 无需修改
- `src/routes/game.$gameRoomId.tsx` — 无需修改
- `src/routes/user-select.tsx` — 无需修改
- `main.tsx` bootstrap 流程（`run()` 函数内部逻辑）— 无需修改，仅改渲染 JSX

---

## 六、完整变更清单

| 操作 | 文件 | 关键点 |
|------|------|--------|
| 修改 | `src/routes/create.tsx` | 改为薄路由入口，`isHostRuntime()` 分发 |
| 新建 | `src/routes/create-test.tsx` | 当前 `CreateGamePage` 完整迁移，改名 `TestCreatePage` |
| 新建 | `src/routes/create-iframe.tsx` | LobbyPage 风格，无 token/room 输入，使用 hook |
| 新建 | `src/hooks/useCreateGame.ts` | 共享 submit 逻辑 |
| 新建 | `src/components/FormSelect.tsx` | 从 create.tsx 提取 |
| 新建 | `src/components/LoadingPage.tsx` | 全屏加载/错误页 |
| 新建 | `src/components/BottomSheet.tsx` | 从 temp 移植 |
| 修改 | `src/main.tsx` | checking/waiting/error 用 LoadingPage，增加 isAdmin state |
