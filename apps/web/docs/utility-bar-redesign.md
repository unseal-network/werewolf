# 底部工具栏重设计方案：身份铭牌 + 日志卷轴

**文档版本**：v1.0  
**日期**：2026-05-25  
**涉及组件**：`RoleCardLayer.tsx`、`TimelineCapsule.tsx`、`GameRoomShell.tsx`、`utility-region.css`

---

## 1. 设计目标

### 1.1 当前痛点

底部工具栏（`.utility-region`）目前存在以下问题：

| 问题 | 描述 |
|------|------|
| **身份隐藏** | 左侧 `RoleCardLayer` 只显示牌背纹理，玩家需要主动点击才能知道自己的角色，首次进入游戏体验割裂 |
| **视觉传达弱** | 牌背按钮 52×74px，没有角色色彩区分，所有角色外观相同，缺乏代入感 |
| **点击成本高** | 若要确认自己的角色身份，必须点击触发 3D 翻牌动画，中途查阅角色不方便 |
| **日志图标孤立** | 右侧书本图标样式简单，与整体游戏质感不统一，没有未读提示机制 |
| **左右两侧视觉失衡** | 左边是"卡片按钮"，右边是"图标按钮"，两者尺寸和形态差异过大，底部区域显得零散 |

### 1.2 改版目标

1. **永久可见的身份铭牌**：角色发牌后，铭牌始终展示在底部左侧，无需点击即可读取身份信息（角色符号 + 角色名）
2. **首次揭示有仪式感**：发牌瞬间触发一段约 1.2s 的入场动画（光扫 + 文字淡入），强化身份揭示的戏剧感
3. **按角色差异化配色**：每个角色有独立的主色调和光晕色，铭牌颜色即是身份暗示
4. **保留点击进入 3D 详情**：铭牌仍可点击，点击后打开 `RoleRevealEngine` 3D 翻牌弹层
5. **日志按钮风格对齐**：右侧日志按钮升级为古卷轴风格，与铭牌质感统一，增加未读徽标
6. **不改变组件外部接口**：`RoleCardLayerProps` 保持不变，不破坏上层 `GameRoomShell` 集成

---

## 2. 左侧身份铭牌重设计

### 2.1 视觉结构

铭牌整体是一个横向胶囊形容器，分为三层叠加：

```
┌─────────────────────────────────────────────┐
│  [底层] 铭牌背景板                           │  ← 深色玻璃 + 边框 + role渐变底
│  [中层] 内容区                               │
│    ┌──────┬──────────────────────┐           │
│    │ 符号 │  角色名称            │           │
│    │  大字 │  小字，角色中文名   │           │
│    └──────┴──────────────────────┘           │
│  [顶层] 光效层（动画期间激活）               │  ← 扫光 shimmer overlay
└─────────────────────────────────────────────┘
```

**尺寸规格**（基准，跟随 `--layout-ui-scale` 缩放）：

| 属性 | 值 |
|------|----|
| 宽度 | `min(128px, 42vw)` |
| 高度 | `44px` |
| 圆角 | `12px` |
| 符号区宽度 | `36px`（正方形，居中大字） |
| 名称区 | 剩余宽度，左对齐 |
| 左内边距（符号区） | `10px` |
| 右内边距（名称区） | `10px` |
| 符号字号 | `22px`，font-weight 950 |
| 名称字号 | `11px`，font-weight 700，letter-spacing 0.06em |

**背景材质**：
```css
background:
  var(--role-gradient),                          /* 角色渐变底色 */
  linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.06) 0%,
    transparent 50%
  ),                                             /* 高光折射层 */
  rgba(4, 6, 10, 0.72);                         /* 深色基底 */
backdrop-filter: blur(12px);
border: 1px solid var(--role-accent-border);
box-shadow:
  0 0 18px var(--role-glow),                    /* 外发光 */
  0 4px 16px rgba(0, 0, 0, 0.60),              /* 投影 */
  inset 0 1px 0 rgba(255, 255, 255, 0.08);     /* 顶部内光 */
```

### 2.2 各角色配色方案

每个角色定义以下 CSS 变量：
- `--role-accent`：主色调（符号颜色、名称高亮色）
- `--role-accent-border`：边框颜色
- `--role-glow`：外发光颜色（rgba，alpha 约 0.30–0.45）
- `--role-gradient`：铭牌背景渐变（从左到右）
- `--role-shimmer`：扫光颜色（首次揭示动画用）

#### 狼人（werewolf）— 红黑・血月
```css
.role-badge--werewolf {
  --role-accent:        #ff6b6b;
  --role-accent-border: rgba(200, 60, 60, 0.55);
  --role-glow:          rgba(220, 50, 50, 0.35);
  --role-gradient:      linear-gradient(
                          105deg,
                          rgba(80, 8, 8, 0.82) 0%,
                          rgba(40, 4, 4, 0.60) 100%
                        );
  --role-shimmer:       rgba(255, 120, 100, 0.70);
}
```
**视觉意向**：深红色铭牌、赤焰外晕，暗示危险与猎杀

#### 平民（villager）— 蓝灰・中立
```css
.role-badge--villager {
  --role-accent:        #8ab4d8;
  --role-accent-border: rgba(100, 160, 210, 0.40);
  --role-glow:          rgba(90, 140, 200, 0.25);
  --role-gradient:      linear-gradient(
                          105deg,
                          rgba(14, 28, 48, 0.80) 0%,
                          rgba(8, 18, 32, 0.60) 100%
                        );
  --role-shimmer:       rgba(140, 190, 240, 0.65);
}
```
**视觉意向**：沉稳蓝灰，无特殊光效，代表朴素的村民

#### 预言家（seer）— 紫色・神秘
```css
.role-badge--seer {
  --role-accent:        #c084fc;
  --role-accent-border: rgba(160, 80, 220, 0.50);
  --role-glow:          rgba(150, 60, 220, 0.40);
  --role-gradient:      linear-gradient(
                          105deg,
                          rgba(44, 10, 72, 0.84) 0%,
                          rgba(22, 6, 40, 0.62) 100%
                        );
  --role-shimmer:       rgba(200, 140, 255, 0.72);
}
```
**视觉意向**：幽紫星光，神秘感强，对应预言家的洞察力

#### 女巫（witch）— 绿色・魔药
```css
.role-badge--witch {
  --role-accent:        #4ade80;
  --role-accent-border: rgba(40, 180, 90, 0.48);
  --role-glow:          rgba(30, 160, 80, 0.38);
  --role-gradient:      linear-gradient(
                          105deg,
                          rgba(6, 38, 18, 0.84) 0%,
                          rgba(4, 22, 10, 0.62) 100%
                        );
  --role-shimmer:       rgba(80, 220, 120, 0.68);
}
```
**视觉意向**：森林幽绿，毒药与解药的双重隐喻

#### 守卫（guard）— 金色・盾牌
```css
.role-badge--guard {
  --role-accent:        #fbbf24;
  --role-accent-border: rgba(200, 160, 30, 0.52);
  --role-glow:          rgba(210, 160, 20, 0.38);
  --role-gradient:      linear-gradient(
                          105deg,
                          rgba(48, 34, 4, 0.84) 0%,
                          rgba(28, 20, 2, 0.62) 100%
                        );
  --role-shimmer:       rgba(255, 210, 80, 0.72);
}
```
**视觉意向**：古铜金色，神圣守护感，盾牌与铠甲的联想

#### 猎人（hunter）— 橙色・烈火
```css
.role-badge--hunter {
  --role-accent:        #fb923c;
  --role-accent-border: rgba(200, 110, 30, 0.50);
  --role-glow:          rgba(210, 100, 20, 0.36);
  --role-gradient:      linear-gradient(
                          105deg,
                          rgba(56, 22, 4, 0.84) 0%,
                          rgba(32, 12, 2, 0.62) 100%
                        );
  --role-shimmer:       rgba(255, 160, 70, 0.70);
}
```
**视觉意向**：燃烧橙焰，猎人的激烈与决断

#### 白痴（idiot）— 灰色・黯淡
```css
.role-badge--idiot {
  --role-accent:        #94a3b8;
  --role-accent-border: rgba(130, 148, 170, 0.35);
  --role-glow:          rgba(100, 120, 145, 0.22);
  --role-gradient:      linear-gradient(
                          105deg,
                          rgba(18, 22, 28, 0.80) 0%,
                          rgba(10, 14, 18, 0.60) 100%
                        );
  --role-shimmer:       rgba(160, 180, 200, 0.58);
}
```
**视觉意向**：灰白冷淡，命运的嘲讽

### 2.3 首次揭示动画设计

**触发条件**：`enabled` 从 `false` 变为 `true`（即发牌）  
**总时长**：约 1.2s  
**状态转换**：`hidden` → `revealing`（动画执行）→ `visible`（稳定展示）

#### 关键帧序列

```
时间轴（ms）:
  0ms ─────── 200ms ──── 480ms ──── 820ms ──── 1200ms
  │初始遮盖   │符号浮现  │扫光扫过  │文字淡入  │稳定停留
  │           │(scale+   │shimmer   │name      │glow
  │           │ fade-in) │overlay   │fade-in   │breathing
  │           │          │          │          │starts
```

**阶段一：初始遮盖（0ms 开始）**
- 铭牌整体 `opacity: 0`，`transform: scale(0.88) translateY(6px)`
- 符号区域 `opacity: 0`
- 名称区域 `opacity: 0`

**阶段二：符号浮现（0 → 320ms，`ease-out`）**
- 铭牌整体 `opacity: 0 → 1`，`transform: scale(0.88) → scale(1.04)`
- 外发光 box-shadow 同步扩散
- 符号字符 `opacity: 0 → 1`，`transform: scale(0.7) → scale(1.08)`

**阶段三：扫光（280ms → 680ms）**
- `::after` 伪元素扫光覆盖层：`translateX(-100%) → translateX(200%)`
- 扫光颜色使用 `var(--role-shimmer)`，渐变宽度约 40% 铭牌宽度
- `transform: scale(1.04) → scale(1.0)`（轻微回弹）

**阶段四：名称淡入（580ms → 900ms，`ease-out`）**
- `.role-badge-name` 元素：`opacity: 0 → 1`，`transform: translateX(-4px) → translateX(0)`

**阶段五：稳定停留（900ms → 1200ms）**
- 整体 scale 回到 1.0
- 进入 `--visible` 状态，开始常驻呼吸光晕

#### 完整 keyframe CSS

```css
/* 铭牌整体入场 */
@keyframes roleBadgeReveal {
  0% {
    opacity: 0;
    transform: scale(0.88) translateY(6px);
    box-shadow:
      0 0 0px transparent,
      0 4px 16px rgba(0, 0, 0, 0.60);
  }
  18% {
    opacity: 0.6;
    transform: scale(0.96) translateY(2px);
  }
  38% {
    opacity: 1;
    transform: scale(1.05) translateY(0);
    box-shadow:
      0 0 28px var(--role-glow),
      0 4px 16px rgba(0, 0, 0, 0.60),
      inset 0 1px 0 rgba(255, 255, 255, 0.10);
  }
  72% {
    transform: scale(1.02) translateY(0);
    box-shadow:
      0 0 22px var(--role-glow),
      0 4px 16px rgba(0, 0, 0, 0.60),
      inset 0 1px 0 rgba(255, 255, 255, 0.08);
  }
  100% {
    opacity: 1;
    transform: scale(1.0) translateY(0);
    box-shadow:
      0 0 18px var(--role-glow),
      0 4px 16px rgba(0, 0, 0, 0.60),
      inset 0 1px 0 rgba(255, 255, 255, 0.08);
  }
}

/* 符号字符入场 */
@keyframes roleBadgeSymbolReveal {
  0% {
    opacity: 0;
    transform: scale(0.65);
    filter: blur(4px);
  }
  50% {
    opacity: 1;
    transform: scale(1.15);
    filter: blur(0);
  }
  75% {
    transform: scale(0.96);
  }
  100% {
    opacity: 1;
    transform: scale(1.0);
    filter: blur(0);
  }
}

/* 扫光横扫 */
@keyframes roleBadgeShimmer {
  0% {
    transform: translateX(-110%);
    opacity: 0;
  }
  10% {
    opacity: 1;
  }
  85% {
    opacity: 0.8;
  }
  100% {
    transform: translateX(210%);
    opacity: 0;
  }
}

/* 角色名称淡入 */
@keyframes roleBadgeNameReveal {
  0% {
    opacity: 0;
    transform: translateX(-5px);
  }
  100% {
    opacity: 1;
    transform: translateX(0);
  }
}
```

#### 常驻呼吸光晕（visible 状态）

```css
/* 轻微脉动，循环 3s，不喧宾夺主 */
@keyframes roleBadgeGlow {
  0%, 100% {
    box-shadow:
      0 0 14px var(--role-glow),
      0 4px 16px rgba(0, 0, 0, 0.60),
      inset 0 1px 0 rgba(255, 255, 255, 0.08);
  }
  50% {
    box-shadow:
      0 0 24px var(--role-glow),
      0 0 8px var(--role-glow),
      0 4px 16px rgba(0, 0, 0, 0.60),
      inset 0 1px 0 rgba(255, 255, 255, 0.10);
  }
}
```

### 2.4 点击行为

铭牌保留 `onClick` 绑定，点击效果：

1. **视觉反馈**：铭牌瞬间 `scale(0.95)`，150ms 后恢复 `scale(1.0)`（点击 pulse 动画）
2. **触发逻辑**：调用原有 `onReveal()` 回调，打开 `RoleRevealEngine` 3D 翻牌弹层

```css
@keyframes roleBadgeClickPulse {
  0%   { transform: scale(1.0); }
  30%  { transform: scale(0.94); }
  100% { transform: scale(1.0); }
}

.role-badge:active {
  animation: roleBadgeClickPulse 150ms ease-out forwards;
}
```

### 2.5 状态机

```
                     enabled=false
                          │
                          ▼
              ┌─────────────────────┐
              │      hidden         │  ← 组件 return null
              │  (enabled=false)    │
              └─────────────────────┘
                          │
                    enabled=true
                  (首次发牌)
                          │
                          ▼
              ┌─────────────────────┐
              │     revealing       │  ← CSS class: role-badge--revealing
              │  动画执行中 1.2s    │  ← revealedThisDeal=true 设置
              └─────────────────────┘
                          │
                   1200ms 后
                          │
                          ▼
              ┌─────────────────────┐
              │      visible        │  ← CSS class: role-badge--visible
              │  稳定显示+呼吸光晕  │  ← 用户可随时点击
              └─────────────────────┘
                          │
                    enabled=false
                  (游戏结束/重置)
                          │
                          ▼
                       hidden
                   (revealedThisDeal=false)
```

**状态转换实现**：在 `RoleCardLayer.tsx` 中新增 `badgeState: 'hidden' | 'revealing' | 'visible'` state。通过 `setTimeout(1200)` 在 `revealing` 开始 1.2s 后切换到 `visible`。

### 2.6 CSS 变量方案总览

```css
/* 铭牌根节点 .role-badge 上设置，由角色修饰符 class 覆盖 */

.role-badge {
  /* 角色主色调 */
  --role-accent:        #8ab4d8;      /* 符号颜色、名称颜色 */
  --role-accent-border: rgba(100, 160, 210, 0.40);
  --role-glow:          rgba(90, 140, 200, 0.25);  /* 外发光 */
  --role-gradient:      linear-gradient(...);       /* 背景渐变 */
  --role-shimmer:       rgba(140, 190, 240, 0.65); /* 扫光颜色 */
}
```

---

## 3. 右侧日志按钮优化

### 3.1 视觉风格对齐

**目标**：日志按钮与左侧铭牌在质感上统一，都属于"底部工具栏"区域的同族元素。

**改动方向**：
- 当前图标按钮是 46×46px 的纯透明背景图标按钮
- 升级为带边框的玻璃容器，背景材质与铭牌相同（深色玻璃 + 金色边框）
- 尺寸调整为与铭牌高度对齐：44px × 44px
- 圆角统一：`12px`

```css
/* 升级后的日志按钮 */
.log-peek-upgraded {
  position: relative;
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  border: 1px solid rgba(207, 176, 91, 0.36);
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0%, transparent 50%),
    rgba(4, 6, 10, 0.68);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  box-shadow:
    0 0 14px rgba(180, 140, 40, 0.18),
    0 4px 14px rgba(0, 0, 0, 0.56),
    inset 0 1px 0 rgba(255, 247, 216, 0.06);
  cursor: pointer;
  transition: border-color 150ms, box-shadow 150ms;
}

.log-peek-upgraded:hover {
  border-color: rgba(207, 176, 91, 0.55);
  box-shadow:
    0 0 20px rgba(180, 140, 40, 0.28),
    0 4px 14px rgba(0, 0, 0, 0.56),
    inset 0 1px 0 rgba(255, 247, 216, 0.08);
}

.log-peek-upgraded:active {
  transform: translateY(1px) scale(0.96);
}
```

**古书/卷轴图标处理**：
- 现有 `book.webp` 图标继续使用，但包装在升级后的按钮容器中
- 图标 `width: 26px; height: 26px`，居中显示
- `filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.70)) brightness(1.05) sepia(0.15)`（轻微暖化处理，使其更接近古旧卷轴感）

### 3.2 新增"未读事件"状态

当有新的游戏事件尚未被玩家查看（日志面板未打开过，或有新事件加入后）时，显示未读角标。

**角标样式**：

```css
/* 红点角标，右上角定位 */
.log-peek-badge {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ff5252;
  border: 1.5px solid rgba(4, 6, 10, 0.80);
  box-shadow: 0 0 6px rgba(255, 60, 60, 0.60);
  pointer-events: none;
  transition: opacity 200ms, transform 200ms;
}

/* 有未读时显示，无未读时隐藏 */
.log-peek-upgraded:not(.has-unread) .log-peek-badge {
  opacity: 0;
  transform: scale(0.6);
}

.log-peek-upgraded.has-unread .log-peek-badge {
  opacity: 1;
  transform: scale(1.0);
}
```

**未读计数逻辑（`TimelineCapsule.tsx` 内部）**：

```typescript
// 新增 state
const [lastSeenEventCount, setLastSeenEventCount] = useState(0);
const hasUnread = visibleEvents.length > lastSeenEventCount;

// 日志面板打开时，标记为已读
const handleOpen = () => {
  setOpen(true);
  setLastSeenEventCount(visibleEvents.length);
};
```

**角标显示条件**：`hasUnread && !open`

---

## 4. 组件改动方案

### 4.1 `RoleCardLayer.tsx` 改动点

**新增内部 state**：
```typescript
type BadgeState = 'hidden' | 'revealing' | 'visible';
const [badgeState, setBadgeState] = useState<BadgeState>('hidden');
```

**改动 useEffect 逻辑**：
```typescript
useEffect(() => {
  if (enabled && !revealedThisDeal) {
    // 进入 revealing 状态
    setBadgeState('revealing');
    setRevealedThisDeal(true);
    onReveal?.();  // 保留：通知上层（触发 RoleRevealEngine）

    // 1.2s 后切换到 visible
    const timer = setTimeout(() => {
      setBadgeState('visible');
    }, 1200);
    return () => clearTimeout(timer);
  }
  if (!enabled) {
    setRevealedThisDeal(false);
    setBadgeState('hidden');
  }
}, [enabled, onReveal, revealedThisDeal]);
```

**改动 JSX 结构**：

```tsx
// 原来的 <button> 替换为新的铭牌结构
// 接口不变：仍调用 onReveal onClick，仍有 data-role={role}

return (
  <button
    type="button"
    className={`role-badge role-badge--${role} role-badge--${badgeState}`}
    onClick={onReveal}
    aria-label={`${t("roleCard.entry")} · ${owner} · ${roleLabel}`}
    title={`${owner} · ${roleLabel}`}
    data-role={role}
  >
    {/* 扫光层（动画期间激活） */}
    <span className="role-badge-shimmer" aria-hidden />

    {/* 符号区域 */}
    <span className="role-badge-symbol" aria-hidden>{symbol}</span>

    {/* 文字区域 */}
    <span className="role-badge-name">{roleLabel}</span>
  </button>
);
```

**保留的行为**：
- `onReveal` 回调：发牌时自动触发（与现在相同，打开 3D 弹层）
- `data-role={role}` 属性：CSS 角色主题化的钩子
- `enabled=false` 时返回 null（与现在相同）

**不改动的接口**：`RoleCardLayerProps` 类型定义完全不变

### 4.2 CSS 新增 Class 列表

#### 核心结构类

| Class | 描述 |
|-------|------|
| `.role-badge` | 铭牌根容器，替换原 `.role-card-entry` |
| `.role-badge-symbol` | 角色符号区域（大字） |
| `.role-badge-name` | 角色名称文字区域 |
| `.role-badge-shimmer` | 扫光动画伪元素容器 |

#### 状态修饰类

| Class | 描述 |
|-------|------|
| `.role-badge--hidden` | 初始隐藏（实际上组件不渲染，但可作为过渡起点） |
| `.role-badge--revealing` | 动画进行中（1.2s 总时长）|
| `.role-badge--visible` | 稳定显示（常驻光晕动画开始） |

#### 角色修饰类（设置角色 CSS 变量）

| Class | 对应角色 |
|-------|---------|
| `.role-badge--werewolf` | 狼人 |
| `.role-badge--villager` | 平民 |
| `.role-badge--seer` | 预言家 |
| `.role-badge--witch` | 女巫 |
| `.role-badge--guard` | 守卫 |
| `.role-badge--hunter` | 猎人 |
| `.role-badge--idiot` | 白痴 |

#### 日志按钮新增类

| Class | 描述 |
|-------|------|
| `.log-peek-upgraded` | 升级后的日志按钮容器（包含边框+背景） |
| `.log-peek-badge` | 未读红点角标 |
| `.has-unread` | 铭牌有未读事件时的状态类 |

### 4.3 `GameRoomShell.tsx` 布局调整

**utility-region 调整**：当前左右两侧使用 `justify-self: start/end`，需确保高度固定以防铭牌尺寸变化影响布局。

```tsx
// utility-region footer 内部不需要改动 JSX 结构：
<footer className="utility-region" aria-label="room-tools">
  <div className="utility-slot utility-role-card">{roleCardEntry}</div>
  <div className="utility-slot utility-timeline">{timeline}</div>
</footer>
```

**CSS 层面的 utility-region 调整**：

```css
/* 原 utility-region.css 补充/修改 */

.game-layout-root .utility-region {
  /* 高度固定，确保铭牌切换时不引起布局抖动 */
  min-height: 52px;
  height: 52px;
  align-items: center;   /* 从 end 改为 center，铭牌与日志按钮垂直居中对齐 */
}

/* 新的铭牌基础样式（覆盖原 role-card-entry 的样式） */
.game-layout-root .utility-region .role-badge {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0;
  width: min(128px, 42vw);
  height: 44px;
  border-radius: 12px;
  padding: 0;
  overflow: hidden;
  cursor: pointer;
  border: 1px solid var(--role-accent-border);
  background: var(--role-gradient), rgba(4, 6, 10, 0.72);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  box-shadow:
    0 0 18px var(--role-glow),
    0 4px 16px rgba(0, 0, 0, 0.60),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

/* 符号区域：左侧固定宽度 */
.game-layout-root .utility-region .role-badge-symbol {
  flex: 0 0 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  font-size: 22px;
  font-weight: 950;
  color: var(--role-accent);
  text-shadow:
    0 0 12px var(--role-glow),
    0 1px 4px rgba(0, 0, 0, 0.90);
  border-right: 1px solid var(--role-accent-border);
}

/* 名称文字区域：右侧 */
.game-layout-root .utility-region .role-badge-name {
  flex: 1;
  padding-inline: 8px 10px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: rgba(255, 247, 216, 0.85);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 扫光层 */
.game-layout-root .utility-region .role-badge-shimmer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 2;
  overflow: hidden;
}

.game-layout-root .utility-region .role-badge-shimmer::after {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  width: 40%;
  height: 100%;
  background: linear-gradient(
    90deg,
    transparent 0%,
    var(--role-shimmer) 50%,
    transparent 100%
  );
  opacity: 0;
}
```

**compact 模式（≤560px）调整**：

```css
@media (max-width: 560px) {
  .game-layout-root .utility-region {
    min-height: 48px;
    height: 48px;
  }

  .game-layout-root .utility-region .role-badge {
    width: min(116px, 40vw);
    height: 40px;
    border-radius: 10px;
  }

  .game-layout-root .utility-region .role-badge-symbol {
    flex: 0 0 34px;
    font-size: 20px;
  }

  .game-layout-root .utility-region .role-badge-name {
    font-size: 10px;
    padding-inline: 6px 8px;
  }
}
```

---

## 5. 动画细节

### 5.1 首次揭示动画完整时序

```
动画名称              开始    结束    缓动函数         说明
─────────────────────────────────────────────────────────────
roleBadgeReveal       0ms     1200ms  cubic-bezier     整体铭牌入场
                                      (0.22,1,0.36,1)  spring-like easing
roleBadgeSymbolReveal 0ms     480ms   cubic-bezier     符号大字弹出
                                      (0.34,1.56,0.64,1) slight overshoot
roleBadgeShimmer      280ms   700ms   ease-in-out      扫光横扫
roleBadgeNameReveal   580ms   900ms   ease-out         角色名淡入滑动
```

### 5.2 各状态 CSS 动画绑定

```css
/* revealing 状态：触发入场动画 */
.role-badge--revealing {
  animation: roleBadgeReveal 1200ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
}

.role-badge--revealing .role-badge-symbol {
  animation: roleBadgeSymbolReveal 480ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}

.role-badge--revealing .role-badge-shimmer::after {
  animation: roleBadgeShimmer 420ms 280ms ease-in-out forwards;
}

.role-badge--revealing .role-badge-name {
  opacity: 0;   /* 初始隐藏 */
  animation: roleBadgeNameReveal 320ms 580ms ease-out forwards;
}

/* visible 状态：常驻呼吸光晕 */
.role-badge--visible {
  animation: roleBadgeGlow 3000ms ease-in-out infinite;
}

/* revealing → visible 过渡时需要避免动画重置：
   visible 状态在 JS 中 1200ms 后设置，
   此时 roleBadgeReveal 已完成，safely 切换到 roleBadgeGlow */
```

### 5.3 常驻呼吸光晕参数

```css
@keyframes roleBadgeGlow {
  0%, 100% {
    box-shadow:
      0 0 14px var(--role-glow),
      0 4px 16px rgba(0, 0, 0, 0.60),
      inset 0 1px 0 rgba(255, 255, 255, 0.08);
  }
  50% {
    box-shadow:
      0 0 26px var(--role-glow),
      0 0 10px var(--role-glow),
      0 4px 16px rgba(0, 0, 0, 0.60),
      inset 0 1px 0 rgba(255, 255, 255, 0.10);
  }
}
/* 呼吸周期 3s，不产生闪烁感，用于提示"此处可点击" */
/* prefer-reduced-motion 媒体查询下关闭 */
@media (prefers-reduced-motion: reduce) {
  .role-badge--visible {
    animation: none;
  }
}
```

### 5.4 点击反馈动画

```css
@keyframes roleBadgeClickPulse {
  0%   { transform: scale(1.0); }
  35%  { transform: scale(0.93); }
  75%  { transform: scale(1.02); }
  100% { transform: scale(1.0); }
}

.role-badge:active {
  animation: roleBadgeClickPulse 180ms ease-out forwards;
}
```

### 5.5 符号颜色动画（revealing 期间）

```css
@keyframes roleBadgeSymbolGlow {
  0% {
    text-shadow: none;
    color: rgba(255, 247, 216, 0.5);
  }
  40% {
    text-shadow:
      0 0 20px var(--role-glow),
      0 0 8px var(--role-glow);
    color: var(--role-accent);
  }
  100% {
    text-shadow:
      0 0 12px var(--role-glow),
      0 1px 4px rgba(0, 0, 0, 0.90);
    color: var(--role-accent);
  }
}

.role-badge--revealing .role-badge-symbol {
  animation:
    roleBadgeSymbolReveal 480ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards,
    roleBadgeSymbolGlow   600ms ease-out forwards;
}
```

---

## 6. 效果对比

### 改前 vs 改后体验差异

| 维度 | 改前 | 改后 |
|------|------|------|
| **身份可见性** | 需点击才能看到角色 | 发牌后铭牌常驻显示，一眼即知身份 |
| **视觉区分度** | 所有角色外观相同（牌背纹理） | 每个角色独立配色，颜色即身份提示 |
| **首次揭示体验** | 自动触发 3D 翻牌动画（弹层） | 铭牌本身有 1.2s 光效揭示动画，强化仪式感 |
| **中途查阅** | 需要点击才能重确认身份 | 随时低头即可看铭牌 |
| **深度查阅** | 点击打开 3D 详情弹层（保留） | 点击打开 3D 详情弹层（保留，完整角色卡片说明） |
| **日志按钮** | 孤立的图标按钮，无状态提示 | 与铭牌同质感的玻璃容器，有未读红点提示 |
| **底部区域整体感** | 左卡片+右图标，形态割裂 | 左铭牌（横向）+右胶囊（方形），尺寸对称，质感统一 |
| **无障碍** | `aria-label` 完整（保留） | `aria-label` 完整，并保留原有 `title` 属性（保留） |
| **性能开销** | 无动画 | 动画均为 CSS 动画（GPU 合成层），`opacity` + `transform` 不触发 layout |

### 典型用户旅程对比

**改前**：
```
玩家进入 deal 阶段
  → 看到底部有一张牌背图案
  → 自动弹出 3D 翻牌弹层（被动触发，可能打断操作）
  → 关闭弹层后，底部仍是牌背，无法快速确认身份
  → 后续想确认身份 → 需要再次点击 → 弹层再次出现
```

**改后**：
```
玩家进入 deal 阶段
  → 底部左侧铭牌浮现：光扫动画 + 符号大字弹出 + 角色名淡入（1.2s）
  → 3D 翻牌弹层仍自动触发（详细角色说明），可关闭
  → 关闭弹层后，铭牌常驻显示（符号 + 角色名 + 角色色调）
  → 游戏中随时可低头查看铭牌确认身份，无需额外操作
  → 需要查看完整角色说明 → 点击铭牌 → 3D 弹层
  → 右侧有新事件 → 日志按钮出现红点提示
```

---

## 附录：受影响文件清单

| 文件路径 | 改动类型 |
|---------|---------|
| `src/components/RoleCardLayer.tsx` | 修改：新增 `badgeState` state，改动 JSX 结构（保留接口） |
| `src/components/TimelineCapsule.tsx` | 修改：新增 `lastSeenEventCount` state，`has-unread` class，升级按钮容器 |
| `src/styles/game-room/components/utility-region.css` | 修改：新增 `.role-badge` 系列样式，升级 `.log-peek` 样式 |
| `src/styles/game-room/responsive.css` | 修改：compact 断点下的铭牌尺寸覆盖 |

**无需改动的文件**：
- `GameRoomShell.tsx`：JSX 结构不变（`roleCardEntry` prop 仍以 slot 方式注入）
- `RoleRevealEngine.tsx`：3D 弹层逻辑不变
- `RoleCardLayerProps` 接口：完全不变，上层调用方无需修改
