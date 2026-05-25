# GameRoomShell UI 与动画系统全面分析

> 分析范围：`apps/web/src/components/GameRoomShell.tsx` 及相关组件、CSS 文件、Phaser 场景文件。

---

## 目录

1. [组件层次结构](#1-组件层次结构)
2. [CSS 变量系统](#2-css-变量系统)
3. [响应式断点](#3-响应式断点)
4. [场景系统](#4-场景系统)
5. [动画系统](#5-动画系统)
6. [RoleRevealEngine — 3D 翻牌机制](#6-rolerevealengine--3d-翻牌机制)
7. [PlayerRail 布局](#7-playerrail-布局)
8. [HUD 区域](#8-hud-区域)
9. [数据流](#9-数据流)

---

## 1. 组件层次结构

### 1.1 完整组件树

```
GameRoomShell（主壳层，输出 <main class="game-room-root game-layout-root">）
│
├── [scene-layer]                    // aria-hidden，Phaser 渲染层
│   └── GameEngine                   // Phaser.Game 封装
│       ├── BootScene
│       ├── LobbyScene               // scene = "lobby" | "waiting"
│       ├── NightScene               // scene = "deal" | "night"
│       ├── DayScene                 // scene = "day"
│       ├── VoteScene                // scene = "vote" | "tie"
│       └── EndScene                 // scene = "end"
│
├── [game-ui-layout]                 // CSS Grid 四行布局
│   ├── [runtime-loading-bar]        // isLoading=true 时显示，顶部进度条
│   │
│   ├── <header class="hud-region">  // 顶部 HUD 信息条
│   │   ├── GameIconButton           // 返回按钮 "←"（hud-back-button）
│   │   ├── [hud-phase-line]         // 阶段主标题 + 天数
│   │   ├── [hud-room-title]         // 副标题（hudSubtitle ?? roomCode ?? title）
│   │   └── [hud-stats-panel]        // 存活人数 / 倒计时面板
│   │       ├── [hud-alive-count]    // 存活/总人数
│   │       ├── [hud-stats-divider]  // 金色分割线
│   │       └── [hud-countdown]      // 倒计时秒数
│   │
│   ├── [layout-error-toast]         // errorMessage 非空时显示
│   │
│   ├── <main class="table-region">  // 中央桌面区域（三列 Grid）
│   │   ├── PlayerRail（左轨）       // player-rail-left
│   │   │   └── SeatAvatar × N      // 偶数索引座位
│   │   ├── [center-info-region]     // centerInfo 插槽（投票/发言面板）
│   │   └── PlayerRail（右轨）       // player-rail-right
│   │       └── SeatAvatar × N      // 奇数索引座位
│   │
│   ├── <section class="action-region">  // 操作区（scene!="end" 时显示 center）
│   │   └── {center}                 // 外部传入的操作控件插槽
│   │
│   └── <footer class="utility-region">  // 底部工具栏
│       ├── [utility-role-card]      // 角色牌入口（roleCardEntry 插槽）
│       └── [utility-timeline]       // 时间线/日志入口（timeline 插槽）
│
└── <section class="modal-layer">   // 固定全屏浮层（z-index: 150）
    ├── {center}                     // scene="end" 时 center 移入此处
    ├── RoleRevealEngine             // 3D 角色牌翻转组件
    └── {overlays}                   // 外部传入的额外浮层插槽
```

### 1.2 各组件职责说明

| 组件 | 文件 | 职责 |
|------|------|------|
| `GameRoomShell` | `GameRoomShell.tsx` | 最外层游戏房间壳，持有所有布局区域、响应式布局变量计算、倒计时逻辑 |
| `GameEngine` | `engine/GameEngine.tsx` | 封装 Phaser.Game 实例，根据 `SceneId` 切换 Phaser 场景，桥接 Phaser 事件到 React 回调 |
| `PlayerRail` | `GameRoomShell.tsx`（内部） | 将座位列表渲染为左/右竖向轨道，不足的槽位用透明占位符填充 |
| `SeatAvatar` | `components/SeatAvatar.tsx` | 单个座位按钮，渲染头像（图片/字母/兜帽三模式）、角色徽章、座位编号、发言动画 |
| `RoleRevealEngine` | `components/RoleRevealEngine.tsx` | 3D 翻牌浮层，支持陀螺仪倾斜和鼠标移动光泽效果 |
| `GameIconButton` | `components/GameIconButton.tsx` | 统一图标按钮原语，支持 sm/md/lg 三种尺寸，输出 `art-icon-button` 类 |
| `MobileHeader` | `components/MobileHeader.tsx` | 移动端悬浮工具条（关闭/更多按钮），使用 `--web-safe-area-top` CSS 变量定位 |

---

## 2. CSS 变量系统

### 2.1 布局变量总览（`useResponsiveGameLayoutVars`）

所有 `--layout-*` 变量由 `useResponsiveGameLayoutVars(railSlotCount)` 在 JavaScript 中计算，并通过 `style` prop 注入到根元素，实时响应 `window.visualViewport` 的 resize/scroll 事件。

#### 断点定义（JS 中）

| 断点名 | 触发条件 |
|--------|---------|
| `compact` | `width <= 560px` |
| `narrow` | `width <= 760px`（且 > 560px） |
| `desktop` | `width > 760px` |

#### 变量详细说明

| CSS 变量 | 公式概述 | 用途 |
|----------|---------|------|
| `--layout-ui-scale` | `min(seat/maxSeat, actionWidth/maxActionWidth, railHeight/maxRailHeight)`，clamp 到 [0.72~1, 0.82~1, 0.78~1] | 全局 UI 元素缩放基准（unitless） |
| `--layout-hud-scale` | `uiScale × (compact?1.34:1.1)`，clamp 到 [0.96~1, 0.9~1] | HUD 区域专用缩放，compact 下放大比例使 HUD 更易读 |
| `--layout-action-scale` | `uiScale × 1.2`，clamp 到 [0.88~1, 0.86~1] | 操作区按钮/控件缩放 |
| `--layout-seat` | 由 `seatFromHeight` 和 `seatFromWidth` 取小值后 clamp | 座位整体尺寸（单位：px），compact:[48,64]，narrow:[58,78]，desktop:[64,90] |
| `--layout-avatar` | `seat × (compact?0.72:0.70)` | 头像圆形直径，比座位略小留出边框空间 |
| `--layout-rail-width` | `avatar × (compact?1.72:1.66)` | 左/右轨道宽度（容纳头像+徽章的溢出区） |
| `--layout-seat-slot` | `min(avatar×1.45+16, railHeight/railRows)` | 每个座位占用的垂直槽高，保证槽不超过均分高度 |
| `--layout-rail-height` | `clamp(railHeightMin, compact?h×0.56:narrow?h×0.60:h×0.62, availableRailHeight)` | 两侧轨道总高度 |
| `--layout-table-top-gap` | `clamp(compact?16:20, h×(compact?0.024:0.028), compact?28:38)` | 桌面区域顶部留白（轨道距 HUD 的距离） |
| `--layout-action-width` | `clamp(min, w - railWidth×2 - w×factor, max)` | 操作区最大宽度 |
| `--layout-action-bottom` | `clamp(min, h×factor, max)` | 操作区底边距 |
| `--layout-rail-action-gap` | `clamp(compact?12:16, h×factor, compact?24:narrow?30:36)` | 轨道底部到操作区的间距 |

#### 中间计算变量（JS 内部，不注入 CSS）

| 变量 | 说明 |
|------|------|
| `hudSafeHeight` | HUD 区域占高比例：compact=14.5%h，narrow=13%h，desktop=14%h |
| `actionReservedHeight` | 操作区保留高度：compact clamp(168,h×24%,240)，narrow clamp(180,h×22%,250)，desktop clamp(190,h×20%,270) |
| `utilityReservedHeight` | 底部工具区保留高度：compact clamp(64,h×9%,92)，其他 clamp(70,h×8~8.5%,96~104) |
| `availableRailHeight` | 可用于轨道的净高 = `h - hudSafe - actionReserved - utilityReserved - tableTopGap - railActionGap`，最小 220px |

### 2.2 艺术资产 CSS 变量（layout.css 中固定声明）

```css
/* 头像边框环 */
--art-ring-normal:    url(".../avatar/frame-default.webp")
--art-ring-selected:  url(".../avatar/frame-selected.webp")
--art-ring-speaking:  url(".../avatar/frame-speaking.webp")
--art-ring-dead:      url(".../avatar/frame-dead.webp")

/* 特效 */
--art-avatar-glow-selected:           url(".../effect/avatar-selected-glow.webp")
--art-avatar-selected-glow-effect:    url(".../effect/avatar-selected-glow.webp")
--art-avatar-portrait-hooded:         url(".../avatar/portrait-hooded.webp")
--art-avatar-speaking-pulse:          url(".../effect/avatar-speaking-pulse.webp")
--art-avatar-vote-target:             url(".../effect/vote-target-ring.webp")
--art-avatar-dead-overlay:            url(".../avatar/dead-overlay.webp")

/* 角色徽章 */
--art-badge-blade:   blade.webp     /* 狼人/行动目标 */
--art-badge-eye:     eye.webp       /* 预言家 */
--art-badge-moon:    moon.webp      /* 女巫/狼队友 */
--art-badge-people:  people.webp    /* 村民/Agent */
--art-badge-shield:  shield.webp    /* 守卫 */
--art-badge-star:    star.webp      /* 猎人/当前用户 */
```

### 2.3 背景与叠加层 CSS 变量（layout.css，按场景覆写）

| 变量 | 说明 |
|------|------|
| `--layout-bg-image` | 背景图片 URL，默认为夜村庄，按场景切换 |
| `--layout-bg-position` | 背景定位，默认 `center top`，移动端 `center center` |
| `--layout-bg-overlay` | 三层渐变叠加（顶部暗化 + 顶部光晕 + 底部暗化） |
| `--layout-bg-atmosphere` | 大气侧面光（两个椭圆渐变），模拟环境色 |
| `--layout-vignette-image` | 暗角图层 URL |
| `--layout-safe-top` | `max(10px, env(safe-area-inset-top))`（iOS 刘海适配） |
| `--layout-safe-bottom` | `max(10px, env(safe-area-inset-bottom))`（iOS 底部适配） |
| `--layout-edge` | 水平边距 `clamp(10px, 3vw, 28px)` |

### 2.4 组件级 CSS 变量

| 变量 | 所在组件 | 说明 |
|------|---------|------|
| `--accent` | 根元素 | 主题强调色（由外部传入） |
| `--role-card-back-url` | 根元素 | 角色牌背面图片 URL |
| `--seat-role-color` | SeatAvatar | 角色颜色（从 ROLE_COLOR 常量取） |
| `--seat-avatar-bg` | SeatAvatar | 头像背景色（由 stableHash 算法分配） |
| `--seat-avatar-fg` | SeatAvatar | 头像前景/文字色 |
| `--seat-role-badge-image` | seat-avatar.css | 徽章图片（由 `seat-role-badge-*` 类设置） |
| `--card-tilt-x` | RoleRevealEngine | 卡片 X 轴倾斜角度（陀螺仪/鼠标） |
| `--card-tilt-y` | RoleRevealEngine | 卡片 Y 轴倾斜角度 |
| `--card-glare-x` | RoleRevealEngine | 光泽中心点 X（%），`50 + tiltY×1.8` |
| `--card-glare-y` | RoleRevealEngine | 光泽中心点 Y（%），`46 - tiltX×1.4` |
| `--ui-panel-scale` | ui-panel.css | 9 宫格面板缩放比例 |
| `--ww-panel-scale` | ui-primitives.css | 新版 9 宫格面板缩放 |
| `--action-button-width` | action-region.css | 操作按钮宽度 |
| `--art-button-width` | ui-primitives.css | 艺术风格按钮宽度 |
| `--art-icon-button-size` | ui-primitives.css | 图标按钮尺寸 |

---

## 3. 响应式断点

### 3.1 三档断点布局对比

| 特性 | compact（≤560px） | narrow（≤760px） | desktop（>760px） |
|------|-----------------|-----------------|-----------------|
| `--layout-edge` | `clamp(8px,2.8vw,14px)` | 默认 `clamp(10px,3vw,28px)` | 默认值 |
| HUD 最小高度 | `66px × hud-scale` | — | `72px × hud-scale` |
| HUD 返回按钮 | 40px | — | 42px |
| 阶段文字大小 | `17px × hud-scale` | — | `clamp(16px, 21px×hud-scale, 21px)` |
| 统计面板最小宽 | `46px × hud-scale` | — | `52px × hud-scale` |
| 倒计时字号 | `14px × hud-scale` | — | `16px × hud-scale` |
| 桌面列间距 | 6px | 默认 | `clamp(10px,4vw,48px)` |
| 座位编号徽章 | 16px × 16px，8px字 | — | 18px × 18px，10px字 |
| 中心信息区宽度 | `min(340px,100%)` | — | `min(430px,100%)` |
| utility-region 最小高 | 64px | — | 70px |
| 角色牌入口 | 48px × 68px | — | 52px × 74px |
| body 处理 | `position:fixed;inset:0`（防弹跳） | — | 正常流 |
| 背景图片 | 夜村（mobile） | 夜村（mobile） | 月夜村庄（desktop avif） |
| `grid-template-rows` gap | 7px | — | `clamp(8px,1.4vh,14px)` |

### 3.2 CSS 媒体查询关键规则（responsive.css）

`@media (max-width: 560px)` 下对 `html/body/#root` 施加 `overflow:hidden; overscroll-behavior:none`，并将 `body` 设为 `position:fixed; inset:0`，完全阻止页面在游戏中滚动。

`@media (min-width: 760px)` 在 `layout.css` 中切换到桌面背景图片。

`@media (max-width: 520px)` 在角色牌样式中将卡片宽度从 `min(74vw,42dvh,390px)` 调整为 `min(80vw,48dvh,340px)`。

### 3.3 compact 模式操作区特殊规则

- `.action-region .phase-card` 背景设为 `transparent`（移除卡片底色）
- 所有操作按钮（`.action-start`、`.action-confirm` 等）`max-width: 100%`
- `.center-info-panel.ww-ui-panel` 的 `max-height` 限制更严格

---

## 4. 场景系统

### 4.1 SceneId 全部枚举值

```typescript
export type SceneId = "lobby" | "deal" | "night" | "day" | "vote" | "tie" | "end" | "waiting";
```

### 4.2 场景映射到 Phaser 场景

| SceneId | Phaser 场景 Key | 说明 |
|---------|----------------|------|
| `"lobby"` | `LobbyScene` | 等待玩家加入大厅 |
| `"deal"` | `NightScene` | 发牌阶段（与夜晚共用场景） |
| `"night"` | `NightScene` | 夜晚阶段，狼人/预言家等行动 |
| `"day"` | `DayScene` | 白天讨论阶段 |
| `"vote"` | `VoteScene` | 投票阶段 |
| `"tie"` | `VoteScene` | 平票重新投票（共用投票场景） |
| `"end"` | `EndScene` | 游戏结束，胜负揭晓 |
| `"waiting"` | `LobbyScene` | 等待状态（共用大厅场景） |

### 4.3 各场景 CSS 背景变化

| 场景 | 背景图片 | 叠加层特色 |
|------|---------|----------|
| `lobby`/`night`/`deal` | `night-village.avif`（mobile），`moonlit-village-desktop.avif`（desktop） | 蓝黑渐变 + 顶部冷色光晕 + 底部暗角 |
| `day` | `moonlit-village-day.avif` | 较浅暗化 + 顶部金黄色光晕（日光感） |
| `vote`/`tie` | `moonlit-village-vote.avif` | 顶部红色光晕（crimson rgba(201,67,82)）营造紧张感 |
| `end` | `moonlit-village-good-victory.avif` | 顶部金色光晕（rgba(245,201,90)）庆典感 |

### 4.4 场景对 React 渲染的影响

| 属性 | lobby | deal/night/day/vote/tie | end | waiting |
|------|-------|------------------------|-----|---------|
| `avatarMode` | `"identity"`（显示真实头像） | `"hooded"`（兜帽遮挡） | `"hooded"` | `"identity"` |
| `centerBelongsToModal` | false | false | **true**（center 移入 modal-layer） | false |
| `data-scene` 属性 | `"lobby"` | 对应值 | `"end"` | `"waiting"` |

### 4.5 场景切换机制（GameEngine）

`GameEngine` 在 `useEffect([gameState])` 中对比当前激活的 Phaser 场景与目标场景：
1. 若目标场景未激活 → 停止所有当前场景 → `game.scene.start(targetSceneKey, { gameState })`
2. 若已激活 → 调用 `scene.updateGameState(gameState)` 更新数据（不切换场景）

`scene-layer` div 的 `opacity: 0` 意味着 Phaser 渲染层在正常状态下不可见，背景效果完全由 CSS 层提供。Phaser 层目前作为未来扩展预留（场景文件已实现动画但被 CSS 背景覆盖）。

---

## 5. 动画系统

### 5.1 CSS @keyframes 动画

#### 5.1.1 发言指示条动画（seat-avatar.css）

```css
@keyframes seat-speaking-bar {
  0%, 100% { height: calc(var(--layout-avatar) * 0.045); }
  50%       { height: calc(var(--layout-avatar) * 0.15); }
}
```

- **触发**：`.seat-state-speaking` 状态
- **元素**：发言徽章内的三个 `<span>` 竖条
- **延迟**：依次 0s、0.18s、0.36s（模拟波形）
- **周期**：0.75s，`ease-in-out`，无限循环

#### 5.1.2 加载进度条动画（legacy.css）

```css
@keyframes loading-slide {
  0%   { transform: translateX(-100%); }
  100% { transform: translateX(250%); }
}
```

- **触发**：`isLoading=true` 时显示 `.runtime-loading-bar`
- **元素**：宽度 40% 的拇指块，用 `linear-gradient(90deg, var(--accent), #7c8cff)` 着色
- **周期**：1.2s，`ease-in-out`，无限循环（往复滑过）

#### 5.1.3 角色牌入场动画（legacy.css）

```css
@keyframes roleCard3dDealIn {
  0%  { opacity:0; transform: translate3d(-50%, 22dvh, -260px) rotateX(64deg) rotateY(-16deg) scale(0.46); }
  62% { opacity:1; transform: translate3d(-50%, -54%, 80px) rotateX(-10deg) rotateY(6deg) scale(1.04); }
  100%{ opacity:1; transform: translate3d(-50%,-50%,0) rotateX(tiltX) rotateY(tiltY) scale(1); }
}
```

- **时长**：820ms，`cubic-bezier(0.16, 0.84, 0.22, 1)`（快速减速）
- **效果**：卡牌从屏幕下方深处以 64° 倾斜飞入，经过一个弹跳后落定中央

#### 5.1.4 角色牌翻转动画（legacy.css）

```css
@keyframes roleCard3dFlipSide {
  0%, 34% { transform: rotateY(0deg); }
  68%     { transform: rotateY(196deg) scale(1.035); }
  100%    { transform: rotateY(180deg) scale(1); }
}
```

- **延迟**：620ms（等入场动画到 62% 时开始）
- **时长**：1180ms，`cubic-bezier(0.18, 0.82, 0.24, 1)`
- **效果**：先停顿（0~34%），然后快速翻转超过 180° 到 196°，最后回弹到 180° 显示正面

#### 5.1.5 其他 legacy.css 中定义的 keyframes

| 动画名 | 用途 |
|--------|------|
| `starsTwinkle` | 星光闪烁（夜晚场景，opacity 0.45↔1） |
| `floatDust` | 灰尘漂浮（translateY 0↔-8px，opacity 0.7↔1） |
| `sunGlow` | 太阳光晕脉动（box-shadow 大小变化） |
| `fogDrift` | 雾气漂移（translateX -30px↔30px） |
| `selectablePulse` | 可选择目标脉冲 |
| `roleCardEnter` | 角色牌入场（旧版，2D） |
| `loading-slide` | 加载条滑动 |
| `voice-bubble-pulse` | 语音气泡脉冲 |
| `player-picker-hub-open` | 玩家选择器中心开启 |
| `player-picker-avatar-selected-pulse` | 玩家选择器头像选中脉冲 |
| `player-picker-slice-selected-pulse` | 玩家选择器扇形选中脉冲 |
| `selectedAvatarPop` | 选中头像弹出效果 |

### 5.2 CSS 过渡（Transitions）

| 元素 | 过渡属性 | 时长 |
|------|---------|------|
| `.hud-back-button` | `border-color`, `background` | 120ms |
| `.hud-stats-panel` | `border-color`, `box-shadow` | 200ms |
| `.hud-countdown` | `color` | 200ms |
| `.voice-bubble` | `transform`, `color`, `opacity` | 90ms / 120ms |
| `.log-sheet`（日志面板） | `opacity`, `visibility`, `transform` | 通过 `.open` 类切换 |
| `.role-reveal-card3d` | `transform` | 120ms ease-out（倾斜实时跟随） |
| `.art-button:active` | `transform` | 内置（translateY(1px) scale(0.99)） |

### 5.3 Phaser JS Tween 动画

#### NightScene（夜晚场景）

| 对象 | 动画 | 参数 |
|------|------|------|
| 星星（N 个） | alpha 闪烁 | 2500~6000ms，Sine.easeInOut，yoyo，无限 |
| 月亮光晕（3层） | scale X/Y + alpha | 5000~7600ms，Sine.easeInOut，yoyo，无限 |
| 月亮本体+阴影 | Y 轴浮动 ±6px | 7000ms，Sine.easeInOut，yoyo，无限 |
| 浓雾 | X 轴漂移 ±40px | 18000ms，Sine.easeInOut，yoyo，无限 |
| 蝙蝠（6只） | 横向飞行 +150~+400px，Y 随机 | 6000~12000ms，Linear，无限（onRepeat 重置位置） |
| 蝙蝠翅膀 | scaleY 0.6 振翅 | 200ms，Sine.easeInOut，yoyo，无限 |

#### DayScene（白天场景）

| 对象 | 动画 | 参数 |
|------|------|------|
| 太阳光晕（2层） | scaleX/Y 1.04 | 4000~4800ms，Sine.easeInOut，yoyo，无限 |
| 太阳本体 | Y 轴浮动 ±4px | 6000ms，Sine.easeInOut，yoyo，无限 |
| 暗云（N 朵） | 横向漂移 +80~+250px | 25000~50000ms，Linear，yoyo，无限 |
| 乌鸦（4只，V 形） | 横向飞行 +200~+500px | 8000~15000ms，Linear，无限（onRepeat 重置） |

#### VoteScene（投票场景）

| 对象 | 动画 | 参数 |
|------|------|------|
| 乌鸦（5只） | 横向飞行 +200~+500px，Y ±30px | 8000~15000ms，Linear，无限 |
| 落叶（15片） | Y 轴下落到底部，X ±50px，旋转 | 6000~12000ms，Linear，无限 |

#### EndScene（结局场景）

| 对象 | 动画 | 参数 |
|------|------|------|
| 彩纸（30片） | 下落 +100~+300px，X ±80px，旋转，alpha 0.6→0 | 4000~8000ms，Sine.easeOut，无限（onRepeat 重置） |
| 光线 | 静态放射状三角形（8条，0.03 opacity） | 无动画 |

### 5.4 可访问性降级（prefers-reduced-motion）

```css
@media (prefers-reduced-motion: reduce) {
  .role-reveal-card3d,
  .role-reveal-card3d-inner,
  .role-reveal-card3d-glare {
    animation-duration: 1ms !important;
    animation-iteration-count: 1 !important;
  }
}
```

当用户系统开启"减少动态效果"时，角色牌翻转动画立即完成（1ms），不播放飞入和翻转过程。

---

## 6. RoleRevealEngine — 3D 翻牌机制

### 6.1 组件结构

```
.role-reveal-engine                // fixed 全屏遮罩，perspective: 1200px，z-index: 1600
└── .role-reveal-card3d            // 3D 卡片容器，transform-style: preserve-3d
    ├── .role-reveal-card3d-glow   // 紫色椭圆光晕（translateZ(-80px)，blur(10px)）
    ├── .role-reveal-card3d-inner  // 翻转容器，transform-style: preserve-3d
    │   ├── .role-reveal-card3d-face.role-reveal-card3d-back   // 牌背面（初始可见）
    │   │   └── <img>              // cardBackUrl
    │   └── .role-reveal-card3d-face.role-reveal-card3d-front  // 牌正面（rotateY:180deg）
    │       └── <img>              // cardFrontUrl
    └── .role-reveal-card3d-glare  // 光泽层（translateZ(28px)，mix-blend-mode:screen）
```

### 6.2 显示条件

```typescript
if (!roleCard?.visible || roleCard.nonce <= 0) return null;
```

`nonce > 0` 确保每次发牌都是新的实例（通过 nonce 变化触发动画重播）。

### 6.3 3D 翻牌原理

1. **CSS 3D 透视**：根容器 `perspective: 1200px`，卡片启用 `transform-style: preserve-3d`
2. **双面结构**：inner 容器内有前后两面，两面均设 `backface-visibility: hidden`
3. **正面预旋转**：`.role-reveal-card3d-front { transform: rotateY(180deg) }` — 正面初始被翻转到背面不可见
4. **翻转动画**：`roleCard3dFlipSide` 将 `.role-reveal-card3d-inner` 从 0° 旋转到 180°，完成后背面隐藏、正面出现

### 6.4 倾斜交互（陀螺仪 + 鼠标）

#### 陀螺仪模式（移动设备）

```typescript
// 采集初始基准值（首次事件时记录）
originBeta ??= event.beta;
originGamma ??= event.gamma;

// roleRevealTilt.ts 中的转换公式
tiltX = clamp(deltaBeta  * 0.42, -18, 18)   // beta 变化 → X 轴俯仰
tiltY = clamp(deltaGamma * -0.58, -18, 18)   // gamma 变化 → Y 轴翻滚（取反）
```

最大倾斜角度：`ROLE_REVEAL_MAX_TILT_DEG = 18°`

#### 鼠标/触控板模式（桌面）

```typescript
// 计算鼠标相对卡片中心的归一化坐标 [-0.5, 0.5]
relX = (clientX - cardCenterX) / cardWidth
relY = (clientY - cardCenterY) / cardHeight

// 转换公式（tiltX 控制上下，tiltY 控制左右）
tiltX = clamp(relY * -22, -18, 18)
tiltY = clamp(relX * 22, -18, 18)
```

触摸事件（`pointerType === "touch"`）被过滤，不触发鼠标倾斜。

#### 光泽效果计算

```typescript
// 光泽中心随倾斜移动
glareX = 50 + tiltY * 1.8    // 水平，tiltY 正值时右移
glareY = 46 - tiltX * 1.4    // 垂直，tiltX 正值时上移（略偏上）
```

光泽通过 `radial-gradient(circle at var(--card-glare-x) var(--card-glare-y), ...)` 实时更新，白色到透明，`mix-blend-mode: screen` 叠加。

#### iOS 陀螺仪权限处理

```typescript
async function requestGyroPermissionIfNeeded() {
  // iOS 13+ 需要用户手势触发才能请求权限
  if (typeof DeviceOrientationEvent.requestPermission !== "function") return false;
  closeBlockedRef.current = true;  // 暂时阻止 click 关闭卡片
  await DeviceOrientationEvent.requestPermission();
  setTimeout(() => { closeBlockedRef.current = false; }, 0);
}
```

在 `onPointerDown` 时触发，避免关闭事件与权限弹窗冲突。

### 6.5 卡片尺寸

```css
width: min(74vw, 42dvh, 390px);     /* 默认 */
width: min(80vw, 48dvh, 340px);     /* ≤520px */
aspect-ratio: 2 / 3;                /* 标准扑克牌比例 */
```

---

## 7. PlayerRail 布局

### 7.1 座位分配算法（seatLayout.ts）

```typescript
export function splitSeatsIntoRails<T>(seats: readonly T[]): { left: T[]; right: T[] } {
  return seats.reduce((rails, seat, index) => {
    if (index % 2 === 0) { rails.left.push(seat); }
    else                 { rails.right.push(seat); }
    return rails;
  }, { left: [], right: [] });
}
```

**规则**：按索引奇偶分配，偶数（0,2,4...）到左轨，奇数（1,3,5...）到右轨。

示例（9人局，座位号 1-9）：
- 左轨：座位 1, 3, 5, 7, 9（索引 0,2,4,6,8）
- 右轨：座位 2, 4, 6, 8（索引 1,3,5,7）

### 7.2 可见座位过滤

```typescript
// 只显示 seatNo <= seatCount 的座位
const activeSeats = useMemo(
  () => seats.filter((seat) => seat.seatNo <= seatCount),
  [seatCount, seats]
);
```

`seatCount` 由外部逻辑（`computeVisibleSeatCount`）决定显示槽位数。

### 7.3 槽位占位符

```typescript
// 轨道长度取左右轨中最大值，不足的用透明占位符填充
const railSlotCount = Math.max(rails.left.length, rails.right.length);

// PlayerRail 内部
const slots = Array.from({ length: slotCount }, (_, index) => seats[index]);
// seats[index] 为 undefined 时渲染 .rail-seat-spacer（visibility:hidden）
```

### 7.4 CSS Grid 轨道布局

```css
/* 外层三列布局 */
.table-region {
  grid-template-columns: var(--layout-rail-width) minmax(0, 1fr) var(--layout-rail-width);
  grid-template-areas: "left center right";
  column-gap: clamp(10px, 4vw, 48px);  /* compact 下为 6px */
}

/* 轨道内部等分布局 */
.player-rail {
  display: grid;
  grid-auto-rows: var(--layout-seat-slot);    /* 每个槽等高 */
  align-content: space-between;               /* 槽间均匀分布 */
  height: var(--layout-rail-height);
}
```

### 7.5 座位自适应尺寸计算（JS）

```
seatFromHeight = (railHeight / railRows - (compact?10:14)) / (compact?1.04:0.98)
seatFromWidth  = compact ? width*0.164 : narrow ? width*0.115 : width*0.058
seat = clamp(min(seatFromHeight, seatFromWidth), minSeat, maxSeat)
```

取高度推导值和宽度推导值的较小值，保证既不超出轨道高度也不超出轨道宽度。

---

## 8. HUD 区域

### 8.1 布局结构

HUD 使用三列 CSS Grid：

```css
grid-template-columns:
  calc(42px * var(--layout-hud-scale, 1))   /* 返回按钮固定宽 */
  minmax(0, 1fr)                             /* 阶段/标题弹性区 */
  auto;                                      /* 统计面板自适应宽 */
```

### 8.2 各子区域说明

#### 返回按钮（hud-back-button）

- 尺寸：`42px × 42px`（compact 下 40px），缩放受 `--layout-hud-scale`
- 外观：深色毛玻璃背景（`backdrop-filter: blur(10px)`），金色边框（rgba(207,176,91,0.42)），圆角 11px
- 激活态：背景变金色（rgba(212,177,92,0.10)），边框加深

#### 阶段标题区（hud-phase-line + hud-room-title）

- **主标题**（hud-phase-line）：`phaseLabel` + `· 第 N 天`（有 day 时）
  - 字号：`clamp(16px, 21px×hud-scale, 21px)`，字重 950
  - 颜色：`#fff7d8`（米白），文字阴影金色+黑色
- **副标题**（hud-room-title）：`hudSubtitle ?? roomCode ?? title`
  - 字号：`10px × hud-scale`，字重 700，字间距 0.1em，金色低透明度

#### 统计面板（hud-stats-panel）

竖向两行布局，毛玻璃效果：
- 存活人数行：`living/targetPlayerCount`，前置小人图标（`icon-people.webp`）
- 分割线：`hud-stats-divider`，金色渐变分割线（透明→金→透明）
- 倒计时行：`hud-countdown`
  - 正常状态：`#fff7d8`，字号 `16px × hud-scale`，字重 950
  - **危险状态**（`danger` = 倒计时 > 0 且 ≤ 10 秒）：
    - 面板：红色边框 + 红色外发光 `box-shadow: 0 0 12px rgba(255,80,50,0.20)`
    - 数字：变为 `#ffbdad`（粉红），增加红色文字阴影

#### HUD 背景装饰

HUD 使用 `::before`/`::after` 伪元素：
- `::before`：复合背景层
  - 顶部线条：`rail-top-line.webp`（repeat-x，高 12px）
  - 底部线条：`rail-bottom-line.webp`（repeat-x，高 12px）
  - 填充纹理：`rail-fill2.png`（cover，opacity 0.90）
- `::after`：顶部金色椭圆光晕（radial-gradient，opacity 0.04，装饰性）

### 8.3 倒计时逻辑（useCountdown hook）

```typescript
function useCountdown(deadlineAt: string | null | undefined) {
  // 每 1000ms 计算剩余秒数
  const tick = () => setSeconds(Math.max(0, Math.floor((deadlineMs - Date.now()) / 1000)));
  // 超时后显示 "✓"
  // 无截止时间显示 "—"
}
```

---

## 9. 数据流

### 9.1 Props 流向图

```
外部（游戏逻辑层）
│
├── title, roomCode, sourceMatrixRoomId   → HUD 副标题备选
├── playerCount, targetPlayerCount        → HUD 存活分母
├── phaseLabel, hudSubtitle, day          → HUD 标题显示
├── rawPhase, deadlineAt                  → 倒计时计算
├── aliveCount                            → HUD 存活分子
│
├── scene: SceneId                        → GameEngine 场景切换
│                                            → avatarMode 计算
│                                            → centerBelongsToModal 计算
│                                            → data-scene CSS 属性
│
├── accent: string                        → --accent CSS 变量
│
├── seats: SeatData[]                     → splitSeatsIntoRails → PlayerRail → SeatAvatar
├── seatCount: number                     → activeSeats 过滤
├── onSeatClick                           → PlayerRail → SeatAvatar onClick
│
├── center: ReactNode                     → action-region（非 end 场景）
│                                            或 modal-layer（end 场景）
├── timeline: ReactNode                   → utility-region .utility-timeline
├── roleCardEntry: ReactNode              → utility-region .utility-role-card
├── overlays?: ReactNode                  → modal-layer（追加到 RoleRevealEngine 之后）
├── centerInfo?: ReactNode                → center-info-region（桌面中央）
│
├── engineGameState: EngineGameState      → GameEngine（Phaser 状态同步）
│                                            → RoleRevealEngine（roleCard 字段）
├── onRoleCardClose                       → RoleRevealEngine onClose
│
├── isLoading                             → runtime-loading-bar 显示/隐藏
├── errorMessage                          → layout-error-toast 显示/隐藏
├── onHomeClick                           → hud-back-button onClick
└── onMobileClose                         → MobileHeader（未在 JSX 中使用，预留）
```

### 9.2 SeatData 字段与 SeatAvatar 渲染映射

| SeatData 字段 | 影响渲染 |
|--------------|---------|
| `seatNo` | `data-seat-no` 属性，座位编号徽章 |
| `playerId/userId/agentId` | avatarPalette 颜色种子，initial 计算种子 |
| `displayName` | title 属性，aria-label，首字母显示 |
| `avatarUrl` | 有 URL 且 identity 模式时显示图片头像 |
| `kind` | `"agent"` 时默认 people 徽章 |
| `isEmpty` | `seat-state-ready` 类，显示 `+` 号 |
| `isDead` | `seat-state-dead` 类，灰度滤镜 + 死亡遮罩 |
| `isCurrentUser` | 默认 star 徽章 |
| `isActionTarget` | `seat-state-target` 类，blade 徽章，vote-target-ring 特效 |
| `isSelected` | `seat-state-selected` 类，selected 边框环 + 发光特效 |
| `isCurrentSpeaker` | `seat-state-speaking` 类，金色 outline + 发言波形徽章 |
| `isWolfTeammate` | 默认 moon 徽章 |
| `visibleRole` | 解析为 DisplayRole → 角色颜色 + 对应角色徽章图标 |

### 9.3 EngineGameState 与 GameEngine 交互

```typescript
interface EngineGameState {
  scene: SceneId;          // 触发 Phaser 场景切换
  phase: string | null;    // 传递给 Phaser 场景（updateGameState）
  seats: EngineSeat[];     // 传递给 Phaser 场景
  selectedTargetId: string | null;
  roleCard?: EngineRoleCardState;  // 传给 RoleRevealEngine（通过 GameRoomShell 转发）
}
```

`GameEngine` 通过 Phaser 全局事件桥（`game.events.on("seat-click")`）将 Phaser 内部点击事件回调到 React 层，避免直接引用。

### 9.4 上下文菜单/拖拽抑制

```typescript
// 对游戏元素（按钮、座位、头像、选择器等）阻止原生上下文菜单和拖拽
function shouldSuppressGameContextMenu(target: EventTarget | null): boolean {
  return Boolean(target.closest(
    "button, [role='button'], .seat, .avatar, .player-picker, ..."
  ));
}
```

通过 `onContextMenuCapture` 和 `onDragStartCapture` 在捕获阶段拦截，防止长按出现原生菜单干扰游戏操作。

---

## 附录：CSS 文件组织结构

```
apps/web/src/styles/
└── game-room.css                    # 总入口，@import 以下所有文件
    ├── game-room/legacy.css         # 旧版样式（大量 keyframes 和场景状态颜色）
    ├── game-room/layout.css         # 布局骨架：根容器、场景层、桌面区、轨道
    ├── game-room/responsive.css     # 响应式覆写（≤560px compact 断点）
    └── game-room/components/
        ├── hud.css                  # 顶部 HUD 信息条
        ├── seat-avatar.css          # 座位头像、徽章、状态
        ├── action-region.css        # 操作区（按钮、语音控件、玩家选择器）
        ├── utility-region.css       # 底部工具栏（角色牌入口、日志）
        ├── center-info.css          # 中心信息面板（投票、发言展示）
        ├── modal-layer.css          # 模态浮层（结局卡片）
        ├── ui-panel.css             # 旧版 9 宫格面板原语
        └── ui-primitives.css        # 新版面板（ww-ui-panel）+ 艺术按钮原语
```

---

*文档生成时间：2026-05-25。基于源码分析，覆盖 GameRoomShell.tsx 及所有直接相关的 CSS 和 TypeScript 文件。*
