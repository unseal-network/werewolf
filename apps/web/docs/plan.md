# apps/web 重构详细计划

> 目标：将 `apps/web` 改造为基于 **iframe 嵌入**运行的狼人杀移动端游戏前端。
> 通过 `@unseal-network/game-sdk` 的 `iframeMessage` 获取用户身份和 Token，对接现有 `apps/api` server。

---

## 一、现状分析

### 当前技术栈

| 项 | 现状 | 目标 |
|----|------|------|
| 样式 | 纯 CSS（`game-room.css`） | TailwindCSS |
| 路由 | URL `?gameRoomId=` 参数切换 + tanstack/react-router（已引入但未真正使用） | React state 状态机 |
| 身份认证 | `localStorage` 存 Matrix Token，硬编码 DEMO_TOKEN | `iframeMessage.getInfo()` + `iframeMessage.getToken()` |
| 语音 | LiveKit（`VoiceRoomProvider` 已实现） | **保持现状不变**，直接复用 |
| 游戏引擎 | Phaser 场景系统（BaseScene / DayScene 等） | 移除，纯 React 实现 |
| AI 管理 | 任意用户均可添加 | 仅 admin（`powerLevel >= 100`）可操作 |
| 准备机制 | 无 | 玩家坐下后需点击准备，全员 ready 后 admin 才能开始 |
| 游戏结束 | 无返回按钮 | 返回大厅按钮（语音由 VoiceRoomProvider 自动断开） |

### 保留的现有代码

| 文件 | 保留原因 |
|------|---------|
| `src/api/client.ts` | API 类型定义和请求封装完整，直接复用 |
| `src/components/VoiceRoom.tsx` | LiveKit 封装完善，改造后继续使用 |
| `src/components/AgentPicker.tsx` | Agent 选择逻辑可复用，加权限控制 |

### 移除 / 重写的代码

| 文件/目录 | 原因 |
|----------|------|
| `src/engine/` | Phaser 场景全部删除，改用 React |
| `src/routes/create.tsx` | 创建游戏改为 lobby 配置卡片，不再是独立页面 |
| `src/routes/game.$gameRoomId.tsx` | 拆分为 GamePage + 各子组件 |
| `src/matrix/session.ts` | localStorage Token 完全替换为 iframeMessage |
| `src/styles/game-room.css` | 替换为 Tailwind |
| `src/i18n/` | 暂时保留，后续按需合并 |
| `@tanstack/react-router` | 移除 |
| `phaser` | 移除 |

---

## 二、依赖变更

### 新增

```bash
pnpm add tailwindcss @tailwindcss/vite lucide-react
pnpm add @unseal-network/game-sdk
```

### 移除

```bash
pnpm remove phaser @tanstack/react-router
```

### `vite.config.ts` 新增 Tailwind 插件

```ts
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
})
```

### `src/styles/globals.css`

```css
@import "tailwindcss";
```

---

## 三、页面状态机

用 React `useState` 实现，不引入路由库。

```
┌─────────────────────────────────────────────────────┐
│                   App (状态机根)                      │
│                                                     │
│  "init"  ──→  "lobby"  ──→  "playing"  ──→  "ended" │
│                  ↑                          │        │
│                  └──────────────────────────┘        │
│                      返回大厅（重置状态）               │
└─────────────────────────────────────────────────────┘
```

| 状态 | 触发条件 | 展示页面 |
|------|---------|---------|
| `init` | 应用启动 | `LoadingPage`：初始化 iframeMessage，获取用户信息和 Token |
| `lobby` | init 成功 | `LobbyPage`：创建/等待游戏，坐座位，准备，admin 配置 |
| `playing` | admin 点击开始，`POST /games/:id/start` 成功 | `GamePage`：游戏进行中 |
| `ended` | SSE 收到 `game_ended` 事件 | `EndedOverlay`（覆盖在 GamePage 上）：展示结果 + 返回按钮 |

---

## 四、iframeMessage 协议

### 初始化

```ts
import { useIFrameMessage } from "@unseal-network/game-sdk";

const iframeMessage = useIFrameMessage();

// 1. 获取用户/房间信息
const info = await iframeMessage.getInfo();
// 返回：
// {
//   roomId: string;          // Matrix roomId，用于查询 agent candidates
//   userId: string;          // Matrix userId，如 @kimigame1:keepsecret.io
//   displayName: string;
//   powerLevel: number;      // >= 100 为 admin
//   config: { streamURL: string }
// }

// 2. 获取 Token（每次请求前调用，不要缓存）
const token = await iframeMessage.getToken();
// 返回 Matrix Bearer Token，注入 Authorization 请求头
```

### 权限判断

```ts
const isAdmin = (info.powerLevel ?? 0) >= 100;
```

### 获取成员列表（用于 Lobby 展示）

```ts
const members = await iframeMessage.sendSync({ op: 'get-members' });
// 返回：Array<{ userId: string; displayName: string; powerLevel?: number }>
```

### 应用生命周期

```ts
iframeMessage.hideApp();   // 最小化（admin 管理菜单用）
iframeMessage.closeApp();  // 完全关闭（解散游戏用）
```

---

## 五、API 对接

Token 从 `iframeMessage.getToken()` 动态获取，注入请求头。现有 `api/client.ts` 的 `createApiClient` 保留，修改 `getMatrixToken` 回调：

```ts
// 修改后的初始化方式（在 useIframeAuth hook 中）
const client = createApiClient({
  baseUrl: import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000",
  getMatrixToken: () => latestTokenRef.current,   // ref 持有最新 token
});
```

### Lobby 阶段 API 调用顺序

```
1. POST /games                          创建游戏房间
        body: { sourceMatrixRoomId, title, targetPlayerCount, language, timing }
        → 返回 { gameRoomId, card }

2. POST /games/:id/join                 当前用户加入房间
        → 返回 { player }

3. POST /games/:id/seat                 玩家选座
        body: { seatNo: number }

4. GET  /games/:id/agent-candidates     [仅 admin] 拉取可用 AI 列表
        → 返回 { agents[], total, roomId }

5. POST /games/:id/agents               [仅 admin] 添加 AI 玩家
        body: { agentUserId, displayName }

6. POST /games/:id/actions              玩家提交"准备"
        body: { kind: "pass" }
        （以 pass 表示准备完成，服务端 ready 字段置 true）

7. POST /games/:id/start                [仅 admin，全员 ready 后解锁] 开始游戏
```

### 游戏阶段 API 调用

```
GET  /games/:id/subscribe               SSE 长连接，接收实时事件
POST /games/:id/actions                 提交行动（发言/投票/夜间行动）
POST /games/:id/livekit-token           获取 LiveKit JWT（游戏开始后）
GET  /games/:id                         轮询游戏快照（SSE 断线时 fallback）
```

### 行动类型对应表

| actionKind | 请求体 | 触发时机 |
|-----------|-------|---------|
| `speech` | `{ kind: "speech", speech: string }` | 发言内容（文字模式） |
| `speechComplete` | `{ kind: "speechComplete" }` | 点击"发言完毕"按钮 |
| `vote` | `{ kind: "vote", targetPlayerId: string }` | 白天投票 |
| `nightAction` | `{ kind: "nightAction", targetPlayerId: string }` | 夜间技能（杀人/查验/守护/毒杀） |
| `pass` | `{ kind: "pass" }` | 准备确认 / 跳过（女巫不使用药水） |

---

## 六、文件结构规划

```
apps/web/src/
│
├── main.tsx                        # 挂载点，保留，去除 I18nProvider/Router 层
├── App.tsx                         # 状态机根组件（init/lobby/playing/ended）
│
├── assets/                         # 从 wolf 包复制的角色图片
│   ├── civilian.jpeg               # 村民
│   ├── guard.jpeg                  # 守卫
│   ├── hunter.jpeg                 # 猎人
│   ├── prophet.jpeg                # 预言家
│   ├── werewolf.jpeg               # 狼人
│   ├── witch.jpeg                  # 女巫
│   └── logo.jpeg                   # 游戏 Logo
│
├── hooks/
│   ├── useIframeAuth.ts            # iframeMessage 初始化，返回 { info, getToken, iframeMessage }
│   ├── useGameSSE.ts               # SSE 订阅封装，自动重连，返回事件流
│   └── useGameState.ts             # 维护 room / projection / players / privateState 状态
│
├── api/
│   └── client.ts                   # 保留现有代码，仅去除 localStorage 相关常量
│
├── pages/
│   ├── LoadingPage.tsx             # 参考 LobbyLoading.tsx 风格
│   ├── LobbyPage.tsx               # 参考 GameMobileReady.tsx 风格
│   ├── GamePage.tsx                # 参考 GameMobileBody.tsx 风格
│   └── EndedOverlay.tsx            # 游戏结束覆盖层（浮在 GamePage 上）
│
├── components/
│   ├── PlayerCard.tsx              # 玩家头像卡片（含发言/死亡/选中状态）
│   ├── ActionBar.tsx               # 底部行动栏（按 actionKind 动态切换）
│   ├── TopBar.tsx                  # 顶部状态栏（阶段/天数/倒计时/admin按钮）
│   ├── CenterIsland.tsx            # 中心信息岛（我的角色/当前发言人/行动提示）
│   ├── MagicCircle.tsx             # 背景魔法圆动画
│   ├── PhaseOverlay.tsx            # 阶段切换全屏动画（如"天亮了"）
│   ├── BottomSheet.tsx             # 通用底部抽屉
│   ├── AdminModal.tsx              # 管理员弹窗（隐藏/解散游戏）
│   ├── AgentPicker.tsx             # AI 选择器（保留现有，加 isAdmin 门控）
│   ├── VoiceRoom.tsx               # LiveKit 语音（完整保留现有代码，不做任何修改）
│   └── ReadyButton.tsx             # 准备按钮组件（未准备/已准备两态）
│
└── styles/
    └── globals.css                 # @import "tailwindcss"
```

---

## 七、各页面详细需求

### 7.1 LoadingPage（`init` 状态）

**功能：**
- 调用 `iframeMessage.getInfo()` 获取用户信息
- 调用 `iframeMessage.getToken()` 获取初始 Token
- 成功后跳转 `lobby`；失败展示错误信息并提供重试按钮

**UI（参考 `LobbyLoading.tsx`）：**
- 深色背景，中心 `Fingerprint` 图标（lucide-react）+ 呼吸光晕
- 顶部扫描光束动画
- 状态文案：`Retrieving Data...`（打字机点效果）
- Admin 右上角可见 ⚙ 管理按钮（触发 AdminModal）

**关键代码逻辑：**
```ts
// useIframeAuth.ts
export function useIframeAuth() {
  const iframeMessage = useIFrameMessage();
  const [info, setInfo] = useState<GameInfo | null>(null);
  const tokenRef = useRef<string>('');

  const init = async () => {
    const gameInfo = await iframeMessage.getInfo();
    const token = await iframeMessage.getToken();
    tokenRef.current = token;
    setInfo(gameInfo);
    return gameInfo;
  };

  // Token 刷新：每次请求前调用
  const getToken = async () => {
    const fresh = await iframeMessage.getToken();
    tokenRef.current = fresh;
    return fresh;
  };

  return { info, getToken, iframeMessage, init };
}
```

---

### 7.2 LobbyPage（`lobby` 状态）

#### Admin 视角

**顶部区：**
- 左上角返回按钮（`←`）→ 调用 `iframeMessage.closeApp()`
- 中间标题 `Hero Zone` + `AUTHORITY` 标签
- 右上角 ⚙ 按钮 → AdminModal

**配置卡片（2×2 grid）：**

| 卡片 | 字段 | 选项 | 接口参数 |
|------|------|------|---------|
| 🎭 GM | `executorAgentId` | 从 `get-members` 获取成员列表，搜索选择 | `POST /games` body |
| 👥 人数 | `targetPlayerCount` | 6 / 8 / 12 | `POST /games` body |
| 🌐 语言 | `speechLanguageCode` | 中文/EN/日本語/한국어 | `POST /games` body |
| 🎙 语音 | `meetingRequired` | 开启/关闭 | `POST /games` body |

每个卡片点击弹出 BottomSheet。

**玩家列表区：**
- 显示所有已就座玩家（`room.players` 按 seatNo 排序）
- 每行：头像首字母 + 显示名 + 准备状态标签（✓ 已准备 / 等待中）
- 显示空余座位数量

**添加 AI 按钮（仅 admin 可见）：**
```
点击 → GET /games/:id/agent-candidates
     → 弹出 BottomSheet 展示 Agent 列表
     → 选择后 POST /games/:id/agents
     → 列表刷新
```
- `alreadyJoined === true` 的 Agent 显示"已加入"标签，不可重复添加

**开始游戏按钮（仅 admin 可见）：**
```
条件：所有已就座玩家 ready === true
可点击 → POST /games/:id/start → 成功跳转 playing
置灰   → 提示"等待玩家准备（X/Y）"
```

---

#### 普通玩家视角

**未就座时：**
- 大 Logo + 游戏规则轮播文案（5s 切换，淡入淡出）
- 底部「选择座位」按钮 → 弹出座位选择 BottomSheet → `POST /games/:id/seat`

**已就座未准备时：**
- 显示"已就座 · 座位 #N"
- 大号「准备」按钮（紫色渐变）→ `POST /games/:id/actions { kind: "pass" }` → `ready = true`

**已准备时：**
- 准备按钮变为绿色"✓ 已准备"状态（不可点击）
- 底部显示"等待房主开始游戏" + 弹跳点动画

---

### 7.3 GamePage（`playing` 状态）

**整体布局（全屏，竖屏优先）：**
```
┌──────────────────────────────┐
│          TopBar              │  固定高度约 80px
├──────────────────────────────┤
│  左列玩家  │ 中心岛 │ 右列玩家 │  flex: 1
│  PlayerCard│        │PlayerCard│
│            │CenterIs│          │
│            │ land   │          │
│            │        │          │
├──────────────────────────────┤
│          ActionBar           │  动态高度
└──────────────────────────────┘
```

#### TopBar 组件

| 元素 | 数据来源 | 说明 |
|------|---------|------|
| 阶段图标 + 文案 | `projection.phase` | 🌙 夜晚 / ☀️ 白天 / 🗳 投票 |
| 第 N 天 | `projection.day` | |
| 存活 X/Y | `projection.alivePlayerIds.length` / `room.players.length` | |
| 倒计时圆环 | `projection.deadlineAt` | 剩余 ≤ 10s 变红并震动 |
| Admin ⚙ | `isAdmin` 时显示 | 点击打开 AdminModal |

#### PlayerCard 组件

状态映射：

| 状态 | 视觉效果 |
|------|---------|
| 正常 | 白色细边框，首字母头像 |
| 当前用户 | 金色细边框 + 左下角金点 |
| 发言中 | 金色光晕 + 头像左上角绿色麦克风圈 |
| 可选中（行动目标） | 紫色虚边框，hover 高亮 |
| 已选中 | 紫色实边框 + 头像覆盖 ✓ |
| 角色已知（游戏结束或预言家查验后） | 显示角色图片替换首字母 |
| 死亡 | 整体透明度 0.3 + 头像覆盖 💀 |
| 预言家查验结果 | 右上角红点（狼）/ 蓝点（好人） |

座位号 badge 固定在头像底部中心。

#### CenterIsland 组件

从上到下：
1. 我的角色卡：角色图片 + 角色名（颜色区分阵营）
2. 当前发言人：🎙 + 名字（非自己时展示）
3. 行动提示文案：根据 `actionKind` 动态展示
4. 存活进度点：N 个圆点，灰色/紫色区分存活/死亡

#### ActionBar 组件

根据 `actionKind` 渲染不同内容：

| actionKind | 渲染内容 |
|-----------|---------|
| `""` / 无行动 | 三个弹跳点 + "等待游戏进程" |
| `speak` | 🎙"轮到你发言" + 「发言完毕」按钮 → `{ kind: "speechComplete" }` |
| `vote` | 🗳"选择放逐目标" + 已选玩家信息 + 「投出此票」按钮 → `{ kind: "vote", targetPlayerId }` |
| `nightAction`(kill) | 🐺"选择击杀目标" + 「确认击杀」按钮 → `{ kind: "nightAction", targetPlayerId }` |
| `nightAction`(inspect) | 🔮"选择查验目标" + 「查验身份」按钮 |
| `nightAction`(guard) | 🛡"选择守护目标" + 「守护目标」按钮 |
| `nightAction`(heal) | 🧪"是否使用解药" + 「使用解药」/ 「跳过」按钮 → heal: `{ kind: "nightAction" }`, skip: `{ kind: "pass" }` |
| `nightAction`(poison) | ☠"选择毒药目标" + 「使用毒药」/ 「跳过」按钮 |
| 已提交 | ✓ "已提交，等待其他玩家" |

#### SSE 事件处理

```ts
// useGameSSE.ts
// 连接：GET /games/:id/subscribe?access_token=<token>
// Last-Event-ID 头：断线重连时携带上次收到的 seq

// 触发 projection 重新拉取的事件类型：
const REFRESH_EVENTS = new Set([
  "game_started", "phase_started", "phase_closed",
  "night_resolved", "player_eliminated", "player_seat_changed",
  "game_ended", "speech_submitted", "vote_submitted", "wolf_vote_resolved",
]);

// 阶段切换动画触发：
// 收到 phase_started → 展示 PhaseOverlay 2s
```

#### 语音（保持现状）

语音完全由现有 `VoiceRoomProvider` + `useVoiceRoom` 管理，**不做任何修改**。

接入方式：

```tsx
// GamePage.tsx 中
const { data: livekitData } = useLivekitToken(gameRoomId); // 游戏开始后调用
// livekitData: { token, serverUrl }

<VoiceRoomProvider serverUrl={livekitData?.serverUrl ?? null} token={livekitData?.token ?? null}>
  {/* 游戏内容 */}
</VoiceRoomProvider>
```

- **连接**：游戏开始后调用 `POST /games/:id/livekit-token` 获取 JWT，传入 `VoiceRoomProvider`，自动连接
- **断开**：游戏结束后将 `serverUrl` / `token` 置为 `null`，`VoiceRoomProvider` 自动断开连接
- **麦克风控制**：通过 `useVoiceRoom()` 返回的 `enableMicrophone` / `disableMicrophone` 控制
- **音频播放**：`VoiceRoomProvider` 内部自动挂载 `<audio>` 元素，无需额外处理

---

### 7.4 EndedOverlay（`ended` 状态，覆盖在 GamePage 上）

**触发条件：** SSE 收到 `game_ended` 事件，或 `projection.status === 'ended'`

**自动执行：**
1. 将传给 `VoiceRoomProvider` 的 `serverUrl` / `token` 置为 `null` → 自动断开 LiveKit 连接
2. 拉取最终 `GET /games/:id` — 获取全量事件（revealAll = true）

**UI 内容：**
- 全屏半透明遮罩（`backdrop-blur`）
- 胜负大字：🐺 **狼人阵营胜利** / 🎉 **好人阵营胜利**（颜色区分）
- 所有玩家角色揭示列表（网格，角色图片 + 名字 + 阵营）
- 「返回大厅」按钮 → 重置 App 状态为 `lobby`（不刷新页面）
  - 重置内容：清除 gameRoomId、清除 projection、清除 events、重新拉取 iframeMessage 信息

---

## 八、准备机制详细设计

### 状态存储

`ready` 字段在 `room.players[].ready` 中，由服务端维护。

### 客户端逻辑

```
玩家坐下（POST /seat）成功
    ↓
显示「准备」按钮
    ↓
玩家点击准备
    ↓ POST /games/:id/actions { kind: "pass" }
    ↓ 成功后本地标记该玩家 ready = true
    ↓ 轮询或 SSE 同步其他玩家 ready 状态
    ↓
Admin 视角：检查 room.players.filter(p => !p.leftAt).every(p => p.ready)
    → true  → 开始按钮高亮可点击
    → false → 开始按钮置灰，显示"等待玩家准备（X/N）"
```

### 关键判断

```ts
const seatedPlayers = room.players.filter(p => p.seatNo > 0 && !p.leftAt);
const allReady = seatedPlayers.length > 0 && seatedPlayers.every(p => p.ready);
const canStart = isAdmin && allReady;
```

---

## 九、Admin 权限门控汇总

| 功能 | 判断条件 | 非 admin 时行为 |
|------|---------|---------------|
| 顶部 AUTHORITY 标签 | `isAdmin` | 不显示 |
| 游戏配置卡片 | `isAdmin` | 不显示，改为等待中展示 |
| 添加 AI 按钮 | `isAdmin` | 不显示 |
| 开始游戏按钮 | `isAdmin` | 不显示 |
| TopBar ⚙ 按钮 | `isAdmin` | 不显示 |
| AdminModal（隐藏/解散） | `isAdmin` | 不可触发 |

---

## 十、图片资源

从以下路径复制到 `apps/web/src/assets/`：

```
源路径：/games/packages/wolf/src/assets/
目标路径：apps/web/src/assets/

civilian.jpeg  →  村民
guard.jpeg     →  守卫
hunter.jpeg    →  猎人
prophet.jpeg   →  预言家
werewolf.jpeg  →  狼人
witch.jpeg     →  女巫
logo.jpeg      →  游戏 Logo（用于 Lobby 大图 + MagicCircle 中心）
```

角色与图片的映射：

```ts
// constants/roles.ts
export const ROLE_IMG: Record<string, string> = {
  villager: civilianImg,
  guard: guardImg,
  hunter: hunterImg,
  seer: prophetImg,
  werewolf: werewolfImg,
  witch: witchImg,
};

export const ROLE_LABEL: Record<string, string> = {
  villager: '村民', guard: '守卫', hunter: '猎人',
  seer: '预言家', werewolf: '狼人', witch: '女巫',
};

export const ROLE_COLOR: Record<string, string> = {
  villager: '#60a5fa', guard: '#34d399', hunter: '#f59e0b',
  seer: '#c084fc', werewolf: '#f87171', witch: '#a78bfa',
};
```

---

## 十一、实施步骤（建议顺序）

### Step 1：基础设施（约 0.5 天）
- [ ] 安装 TailwindCSS + lucide-react + `@unseal-network/game-sdk`
- [ ] 移除 phaser、@tanstack/react-router
- [ ] 配置 `vite.config.ts`，添加 Tailwind 插件
- [ ] 替换 `styles/globals.css`
- [ ] 复制 `assets/` 图片
- [ ] 清理 `matrix/session.ts` 中 localStorage 逻辑

### Step 2：iframeMessage 封装（约 0.5 天）
- [ ] 实现 `hooks/useIframeAuth.ts`
- [ ] 改造 `api/client.ts`：`getMatrixToken` 改为动态获取

### Step 3：LoadingPage（约 0.5 天）
- [ ] 实现 `pages/LoadingPage.tsx`
- [ ] 实现 `components/AdminModal.tsx`
- [ ] App 状态机搭架（init → lobby）

### Step 4：LobbyPage（约 1.5 天）
- [ ] 实现 `components/BottomSheet.tsx`
- [ ] 实现 LobbyPage Admin 视角（配置卡片 + 玩家列表 + 添加 AI + 开始按钮）
- [ ] 实现 LobbyPage 普通玩家视角（座位选择 + 准备按钮）
- [ ] 改造 `AgentPicker.tsx`，加 `isAdmin` 门控
- [ ] 实现 `components/ReadyButton.tsx`

### Step 5：GamePage（约 2 天）
- [ ] 实现 `hooks/useGameSSE.ts`（SSE 订阅 + 断线重连）
- [ ] 实现 `hooks/useGameState.ts`（projection / players / privateState）
- [ ] 实现 `components/TopBar.tsx`（含倒计时圆环）
- [ ] 实现 `components/PlayerCard.tsx`（所有状态）
- [ ] 实现 `components/CenterIsland.tsx`
- [ ] 实现 `components/MagicCircle.tsx`（背景动画）
- [ ] 实现 `components/PhaseOverlay.tsx`（阶段切换动画）
- [ ] 实现 `components/ActionBar.tsx`（全部 actionKind 分支）
- [ ] 组装 `pages/GamePage.tsx`

### Step 6：游戏结束（约 0.5 天）
- [ ] 实现 `pages/EndedOverlay.tsx`（结果展示 + 返回按钮）
- [ ] App 状态机：ended → lobby 重置逻辑（置 null token/serverUrl 断开 LiveKit）

### Step 7：收尾（约 0.5 天）
- [ ] 删除旧 `engine/`、`routes/`、`i18n/`（或保留 i18n 合并）
- [ ] 删除 `PLAN.md`（根目录的临时文件）
- [ ] 端到端测试：loading → lobby → playing → ended → 返回 lobby

---

## 十二、关键约束备忘

| 约束 | 具体说明 |
|------|---------|
| Token 不缓存 | 每次 API 请求前调用 `iframeMessage.getToken()` 动态获取，不存 localStorage |
| 语音保持现状 | `VoiceRoom.tsx` 不做任何修改；游戏结束后将 `serverUrl`/`token` 置 `null`，Provider 自动断开 |
| 只有 admin 能添加 AI | `powerLevel >= 100` 判断，前端不展示入口，后端也会校验 |
| 全员 ready 才能开始 | 包含 AI 玩家（agent）也需要 `ready === true`，AI 玩家由服务端自动标记 ready |
| 返回大厅不刷新页面 | 重置 React state 而非 `window.location.reload()`，保持 iframeMessage 连接 |
| SSE 断线重连 | 携带 `Last-Event-ID`，服务端会从 DB 补齐缺失事件 |
| 夜间事件过滤 | 客户端按 `visibility` 过滤（`runtime` 永不展示；`private:team:wolf` 仅狼人可见） |
