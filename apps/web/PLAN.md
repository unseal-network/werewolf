# apps/web 重构计划

## 目标概览

将 `apps/web` 改造为一个基于 **iframe 嵌入**运行的狼人杀游戏前端，通过 `iframeMessage` 与宿主应用通信获取用户身份和 Token，对接现有 `apps/api` server。

技术栈：`React 19 + Vite + TailwindCSS + lucide-react`

---

## 一、技术栈变更

### 新增依赖

```bash
# 样式
pnpm add tailwindcss @tailwindcss/vite lucide-react

# iframe 通信 SDK（参考 wolf 包）
pnpm add @unseal-network/game-sdk
```

### 移除 / 不使用

- `phaser`（当前已引入，本次不使用）
- `@tanstack/react-router`（页面简单，用状态机替代路由）

---

## 二、页面状态机（替代路由）

```
loading          → 通过 iframeMessage 获取用户信息和 Token
    ↓ 成功
lobby            → 创建/等待游戏（GameMobileReady 风格）
    ↓ 游戏创建成功，所有玩家准备完毕，admin 点击开始
playing          → 游戏进行中（GameMobileBody 风格）
    ↓ 游戏结束
ended            → 展示胜负结果 + 返回按钮 → 回到 lobby
```

---

## 三、iframeMessage 通信协议

所有用户信息和 Token **只能通过 iframeMessage 获取**，不走本地存储或 URL 参数。

### 获取用户信息

```ts
import { useIFrameMessage } from "@unseal-network/game-sdk";

const iframeMessage = useIFrameMessage();

// 获取房间/用户信息
const info = await iframeMessage.getInfo();
// 返回：{ roomId, userId, displayName, powerLevel, config: { streamURL } }

// 获取 Token（每次请求前刷新）
const token = await iframeMessage.getToken();
```

### 权限判断

```ts
const isAdmin = (info.powerLevel ?? 0) >= 100;
```

### 语音通话控制

```ts
// 加入语音
iframeMessage.sendSync({ op: "call-join" });

// 离开语音（游戏结束时必须调用）
iframeMessage.sendSync({ op: "call-leave" });

// 静音 / 解除静音
iframeMessage.sendSync({ op: "call-mute" });
iframeMessage.sendSync({ op: "call-unmute" });
```

### 应用生命周期

```ts
iframeMessage.hideApp();   // 最小化
iframeMessage.closeApp();  // 完全关闭
```

---

## 四、API 对接（apps/api）

Token 通过 `iframeMessage.getToken()` 获取，放入 `Authorization: Bearer <token>` 请求头。

### Lobby 阶段

| 操作 | 接口 |
|------|------|
| 创建游戏房间 | `POST /games` |
| 加入房间 | `POST /games/:id/join` |
| 坐下就座 | `POST /games/:id/seat` |
| 获取 Agent 候选列表（仅 admin） | `GET /games/:id/agent-candidates` |
| 添加 AI 玩家（仅 admin） | `POST /games/:id/agents` |
| 开始游戏（仅 admin，全员准备后） | `POST /games/:id/start` |

### 游戏阶段

| 操作 | 接口 |
|------|------|
| 订阅实时事件 | `GET /games/:id/subscribe`（SSE） |
| 提交行动（发言/投票/夜间行动） | `POST /games/:id/actions` |
| 获取 LiveKit 语音 Token | `POST /games/:id/livekit-token` |

---

## 五、各页面详细需求

### 1. Loading 页（参考 LobbyLoading.tsx）

- 调用 `iframeMessage.getInfo()` + `iframeMessage.getToken()` 初始化
- 展示指纹扫描动效 + "Retrieving Data..." 打字机效果
- Admin 可见右上角 ⚙ 管理按钮（AdminModal：隐藏/解散）
- 成功后跳转 → lobby；失败留在当前页展示错误

### 2. Lobby 页（参考 GameMobileReady.tsx）

**Admin 视角：**
- 顶部 Logo + 游戏规则轮播文案
- 配置卡片（2×2 grid）：
  - 👥 人数：6 / 8 / 12 人局（BottomSheet 选择）
  - 🌐 语言：中文 / EN / 日本語 / 한국어（BottomSheet 选择）
  - 🎙 语音：开启 / 关闭（BottomSheet 选择）
- 玩家列表：显示已就座玩家 + 准备状态
- **添加 AI 按钮**（仅 admin）：调用 `GET /games/:id/agent-candidates` 拉取列表，选择后 `POST /games/:id/agents` 添加
- **开始游戏按钮**（仅 admin）：所有已就座玩家均已准备（`ready === true`）才可点击；否则置灰并提示"等待玩家准备"
- 离开按钮：`POST /games/:id/leave` + `iframeMessage.closeApp()`

**普通玩家视角：**
- 大 Logo + 游戏规则轮播
- 已就座则显示"等待房主开始游戏"
- 未就座则显示"选择座位"按钮 → 调用 `POST /games/:id/seat`
- 就座后显示**准备按钮**，点击后标记 `ready = true`（调用 `POST /games/:id/actions` kind: `pass` 或专用准备接口）

### 3. 游戏中页（参考 GameMobileBody.tsx）

**布局：**
- 顶部 TopBar：阶段标识（🌙/☀️）+ 第几天 + 存活人数 + 倒计时圆环 + Admin ⚙ 按钮
- 中间：左右两列 PlayerCard + 中心 CenterIsland（我的身份 + 当前发言人 + 行动提示 + 存活点）
- 底部 ActionBar：根据当前 `actionKind` 动态渲染

**语音控制（游戏状态驱动）：**
```
游戏开始         → call-join
游戏结束         → call-leave（⚠️ 必须执行）
轮到自己发言     → call-unmute
非自己发言       → call-mute
```

**行动类型与底部栏：**

| actionKind | 底部栏内容 |
|------------|-----------|
| `speak` | "轮到你发言" + 发言完毕按钮 |
| `vote` | 选择放逐目标 + 确认投票按钮 |
| `nightAction` | 选择夜间目标（击杀/查验/守护）+ 确认按钮 |
| 无行动 | 等待动效 + 当前发言人姓名 |
| 游戏结束 | 胜负结果（🐺/🎉）+ **返回大厅按钮** |

**PlayerCard 状态：**
- 发言中：金色光晕 + 麦克风绿圈
- 已死亡：头像置灰 + 💀 覆盖
- 被选中：紫色边框 + ✓ 覆盖
- 预言家查验结果：右上角红点（狼）/ 蓝点（好人）

### 4. 游戏结束

- ActionBar 展示胜负阵营（狼人阵营 / 好人阵营）
- 展示所有玩家角色揭示
- **调用 `iframeMessage.sendSync({ op: "call-leave" })` 关闭语音**
- 显示「返回大厅」按钮 → 重置状态回到 lobby（可继续开新局）

---

## 六、文件结构规划

```
apps/web/src/
├── main.tsx                    # 挂载 App
├── App.tsx                     # 状态机根组件（loading/lobby/playing/ended）
├── assets/                     # 从 wolf 包复制过来的图片
│   ├── civilian.jpeg
│   ├── guard.jpeg
│   ├── hunter.jpeg
│   ├── prophet.jpeg
│   ├── werewolf.jpeg
│   ├── witch.jpeg
│   └── logo.jpeg
├── hooks/
│   ├── useIframeAuth.ts        # 封装 iframeMessage.getInfo/getToken
│   ├── useGameSSE.ts           # 封装 SSE 订阅 + 断线重连
│   └── useVoice.ts             # 封装 LiveKit + call-join/leave/mute
├── api/
│   └── client.ts               # fetch 封装，自动注入 Bearer Token
├── pages/
│   ├── LoadingPage.tsx         # 初始化加载页
│   ├── LobbyPage.tsx           # 等待大厅
│   ├── GamePage.tsx            # 游戏进行中
│   └── EndedPage.tsx           # 游戏结束（内嵌在 GamePage）
├── components/
│   ├── PlayerCard.tsx
│   ├── ActionBar.tsx
│   ├── TopBar.tsx
│   ├── CenterIsland.tsx
│   ├── BottomSheet.tsx
│   └── AdminModal.tsx
└── styles/
    └── globals.css             # Tailwind 入口
```

---

## 七、关键约束

| 约束 | 说明 |
|------|------|
| **只有 admin 能添加 AI** | `isAdmin = powerLevel >= 100`，普通玩家不展示添加 AI 入口 |
| **只有 admin 能开始游戏** | 开始按钮仅 admin 可见，且需全员 ready |
| **玩家坐下后需点击准备** | `ready` 状态需客户端维护，全员 ready 才解锁开始按钮 |
| **游戏结束必须关语音** | `call-leave` 在 ended 状态触发，不可遗漏 |
| **Token 不缓存** | 每次请求前调用 `iframeMessage.getToken()` 动态获取 |
| **不用路由库** | 页面切换通过 React state 状态机控制 |

---

## 八、图片资源

从以下路径直接复制到 `apps/web/src/assets/`：

```
/Users/ranjun/.../games/packages/wolf/src/assets/
├── civilian.jpeg   → 村民
├── guard.jpeg      → 守卫
├── hunter.jpeg     → 猎人
├── prophet.jpeg    → 预言家
├── werewolf.jpeg   → 狼人
├── witch.jpeg      → 女巫
└── logo.jpeg       → 游戏 Logo
```
