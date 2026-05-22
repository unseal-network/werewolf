# 主题一致性设计文档

> 目标：分析 `create-iframe.tsx`、`GameRoomShell.tsx`、`LoadingPage.tsx` 三个页面的视觉差异，制定统一的视觉语言，使它们在同一款游戏产品内呈现连贯的氛围。

---

## 一、当前主题分析

### 1. `LoadingPage.tsx` — 登录/等待层

| 维度 | 现状 |
|------|------|
| 背景 | `linear-gradient(160deg, #07041a 0%, #0d0825 40%, #0a0618 100%)` — 深紫蓝渐变 |
| 主色调 | Violet（`violet-500/30`、`#c4b5fd`） |
| 图标 | `Fingerprint`（lucide），`strokeWidth={1}`，极低对比度 |
| 动效 | 扫描线（scanline）垂直滚动，`2s infinite` |
| 文字风格 | `tracking-[0.6em]` 大字间距，全大写，`text-slate-500` |
| 辅助文字 | 斜体副标题 "Synchronizing with the oracle" |
| 足部标识 | "Lupus Night Protocol v1.0" |
| 按钮 | 返回按钮：方形 `rounded-[10px]`，`violet-500/[0.12]` 背景，border `violet-500/30` |
| 错误态 | `text-red-400` 行内文字 + `重试` 按钮 |
| 整体感 | 科技感强，偏向"信号连接/指纹认证"隐喻，轻量神秘 |

---

### 2. `create-iframe.tsx` — 房间配置层

| 维度 | 现状 |
|------|------|
| 背景 | `linear-gradient(160deg, #07041a 0%, #0d0825 40%, #120930 70%, #0a0618 100%)` — 比 LoadingPage 多一段深蓝紫 |
| 粒子层 | 16 个静态点（紫色 `rgba(196,181,253,...)` + 金色 `rgba(255,209,102,...)`），1-2px，随机分布 |
| 光晕 | 顶部中央 `radial-gradient(circle, rgba(109,40,217,0.28) 0%, transparent 70%)` |
| 主色调 | Violet（`violet-500`、`#c4b5fd`，Tailwind `text-purple-text`） |
| 金色强调 | `#ffd166`（CTA 按钮文字）、`rgba(255,209,102,0.5)`（CTA 边框） |
| 配置卡片 | `bg-white/[0.04] border-violet-500/[0.18] rounded-[18px]` |
| Section 分割线 | 双向渐变 `violet-500/0.35` + 中心文字 `✦ GAME SETUP ✦` |
| CTA 按钮 | `linear-gradient(135deg, #5b21b6, #7c3aed)`，金色边框，`box-shadow: 0 0 24px rgba(109,40,217,0.5)` |
| 返回按钮 | 与 LoadingPage 一致：方形 `rounded-[10px]`，`violet-500/[0.12]`，`ChevronLeft` |
| 身份芯片 | `bg-white/[0.03] border-white/[0.07] rounded-[14px]` |
| 错误态 | `text-red-400`，`bg-red-500/10 border-red-500/20 rounded-[10px]` |
| 底部 Sheet | `BottomSheet` 组件，选中态 `rgba(109,40,217,0.22–0.25)` + `violet` border |
| 整体感 | 神秘星空感，金紫双色，游戏召唤仪式氛围 |

---

### 3. `GameRoomShell.tsx` — 游戏房间层

| 维度 | 现状 |
|------|------|
| 背景 | 由 `GameEngine`（Phaser）驱动的 `scene-layer`，随 `scene` 变化（lobby=蓝/night=深红/day=金/end=暗等） |
| 色彩变量 | `--accent` CSS 变量（每个 phase 不同色，如 `#3b82f6` lobby、`#ef4444` wolf、`#22c55e` end） |
| UI 层 | 纯 CSS 类（`game-room.css`、`seat-avatar.css` 等），无 Tailwind |
| 资源 | `assetBase` 指向 `werewolf-ui/final`，含角色卡、9-slice 面板、徽章等游戏美术 |
| 布局变量 | `--layout-avatar`、`--layout-seat`、`--layout-rail-width` 等响应式 CSS 变量 |
| HUD | `hud-region`：相位标签、倒计时、存活数，文字为 CSS 变量控制 |
| 危险态 | 倒计时 `danger` 时添加 `danger` class，预计触发颜色/动画变化 |
| 说话指示 | `seat-speaking-badge`：绿色（`#22c55e`）三段动态柱，绝对定位于头像左下角 |
| 叠层 | `modal-layer`：`RoleRevealEngine`、overlays 等全屏弹层 |
| 整体感 | 沉浸式游戏美术驱动，纯 CSS 体系，动态 scene 氛围切换 |

---

## 二、差距分析

### 2.1 背景渐变

| 比较 | 问题 |
|------|------|
| LoadingPage vs create-iframe | 两者极为接近，但 create-iframe 多一段 `#120930` 节点（70%），整体更深更紫；可统一为同一渐变值 |
| create-iframe vs GameRoomShell | GameRoomShell 背景由游戏引擎接管，与前者完全脱离；过渡时无法做渐变衔接，但可保证进入游戏前的页面背景一致 |

### 2.2 粒子/环境层

| 比较 | 问题 |
|------|------|
| create-iframe | 有粒子层（16 个点 + 顶部光晕） |
| LoadingPage | 无粒子层，仅有 `bg-white/[0.03] blur-[48px]` 内圈光晕 |
| 建议 | LoadingPage 加入相同的粒子层和顶部光晕，氛围更统一 |

### 2.3 主色调一致性

三页面均使用 `violet` 系，基本一致，但细节值有散乱：

| 属性 | LoadingPage | create-iframe | 差异 |
|------|-------------|---------------|------|
| 图标/强调色 | `violet-500/30`（极低） | `violet-500/70`（中等） | LoadingPage 的 Fingerprint 图标过暗 |
| 按钮背景 | `violet-500/[0.12]` | `violet-500/[0.12]` | ✅ 一致 |
| 扫描/装饰线 | `violet-500/40` | `violet-500/35`（分割线） | 接近，可统一 |
| CTA 按钮 | 无 CTA | `#5b21b6 → #7c3aed` + 金色边框 | LoadingPage 没有主操作按钮，无需对齐 |

### 2.4 金色强调色

| 页面 | 金色使用 |
|------|---------|
| create-iframe | `#ffd166`（CTA 文字）、`rgba(255,209,102,...)` 粒子和 CTA 边框 |
| LoadingPage | ❌ 无金色 |
| GameRoomShell | 视 scene 而定（由游戏美术决定） |

**建议**：LoadingPage 在足部标识、或图标区域引入少量金色，与 create-iframe 产生视觉关联。

### 2.5 Typography（字体风格）

| 属性 | LoadingPage | create-iframe |
|------|-------------|---------------|
| 标签/小字 | `font-black`, `tracking-[0.6em]`, 全大写 | `font-extrabold`, `tracking-[0.22em]`, 混合大小写 |
| 正文 | `text-slate-500/400` | `text-slate-200`（较亮） |
| 数值/强调 | 无大数字 | `text-2xl font-extrabold text-center`（BottomSheet 选项） |

**建议**：正文颜色统一为 `text-slate-300–400`，LoadingPage 减小 `tracking`（`0.6em` → `0.4em`），减少割裂感。

### 2.6 卡片/容器风格

| 页面 | 容器样式 |
|------|---------|
| create-iframe | `bg-white/[0.04] border-violet-500/[0.18] rounded-[18px]`（配置卡） |
| create-iframe identity | `bg-white/[0.03] border-white/[0.07] rounded-[14px]` |
| LoadingPage | 无卡片容器（中心内容直接在背景上） |
| GameRoomShell | CSS `game-panel`、`hud-region` 等（9-slice 背景，游戏美术风格） |

**建议**：若 LoadingPage 将错误信息或等待状态包裹在类似卡片容器中，可与 create-iframe 产生一致性。

### 2.7 返回按钮

两页面已高度一致（`w-[42px] h-[42px] rounded-[10px]`，`violet-500/[0.12]`，`ChevronLeft 18px`），但：

- LoadingPage 使用 `position: fixed`，`top: calc(var(--web-safe-area-top, 0px) + 20px)`，`left: 20px`
- create-iframe 使用普通文档流 `flex` 布局中的 `shrink-0`

**建议**：提取为共享 `BackButton` 组件，统一 aria-label、过渡动画、尺寸。

### 2.8 错误状态

| 页面 | 错误展示 |
|------|---------|
| create-iframe | `text-xs text-red-400` + `bg-red-500/10 border-red-500/20 rounded-[10px]` pill |
| LoadingPage | `text-xs text-red-400` 纯文字（无背景） + `重试` 按钮 |

**建议**：LoadingPage 错误区域也加上 `bg-red-500/10 border-red-500/20 rounded-[10px]` 背景，与 create-iframe 一致。

---

## 三、统一视觉语言提案

### 3.1 设计令牌（Design Tokens）

建议在 `@theme` 中追加以下令牌，供两个 Tailwind 页面共享：

```css
/* apps/web/src/styles/tokens.css 或合并至 index.css @theme 块 */
@theme {
  /* 游戏背景渐变 */
  --color-game-bg-from:  #07041a;
  --color-game-bg-mid1:  #0d0825;
  --color-game-bg-mid2:  #120930;
  --color-game-bg-to:    #0a0618;

  /* 主色调 */
  --color-game-violet:        #7c3aed;    /* violet-600 */
  --color-game-violet-glow:   rgba(109, 40, 217, 0.28);
  --color-game-violet-border: rgba(139, 92, 246, 0.35);
  --color-game-violet-muted:  rgba(196, 181, 253, 0.7);

  /* 金色强调 */
  --color-game-gold:          #ffd166;
  --color-game-gold-border:   rgba(255, 209, 102, 0.5);
  --color-game-gold-glow:     rgba(255, 209, 102, 0.15);

  /* 容器 */
  --color-game-card-bg:       rgba(255, 255, 255, 0.04);
  --color-game-card-border:   rgba(139, 92, 246, 0.18);

  /* 文字 */
  --color-game-text-primary:  #e2e8f0;   /* slate-200 */
  --color-game-text-muted:    #64748b;   /* slate-500 */
  --color-game-text-faint:    #475569;   /* slate-600 */
}
```

### 3.2 共享背景渐变

将以下背景样式抽为 CSS 类或内联常量，供所有非游戏引擎页面使用：

```css
.game-ambient-bg {
  background: linear-gradient(160deg, #07041a 0%, #0d0825 40%, #120930 70%, #0a0618 100%);
}
```

`LoadingPage` 的 `#0a0618 100%` 去掉 `#120930` 中间节点，与 create-iframe 统一。

### 3.3 粒子环境层

提取为独立组件 `<AmbientParticles />`，供 LoadingPage 和 create-iframe 共用：

```tsx
// src/components/AmbientParticles.tsx
export function AmbientParticles() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {/* 顶部光晕 */}
      <div
        className="absolute top-[10%] left-1/2 -translate-x-1/2 w-80 h-80 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(109,40,217,0.28) 0%, transparent 70%)" }}
      />
      {/* 粒子点 */}
      {[...Array(16)].map((_, i) => (
        <div
          key={i}
          className="absolute rounded-full"
          style={{
            width: i % 3 === 0 ? 2 : 1,
            height: i % 3 === 0 ? 2 : 1,
            background: `rgba(${i % 2 === 0 ? "196,181,253" : "255,209,102"},${0.2 + (i % 4) * 0.1})`,
            left: `${((i * 37 + 13) % 90) + 5}%`,
            top: `${((i * 23 + 7) % 60) + 5}%`,
          }}
        />
      ))}
    </div>
  );
}
```

### 3.4 共享返回按钮

```tsx
// src/components/BackButton.tsx
import { ChevronLeft } from "lucide-react";

interface BackButtonProps {
  onClick?: () => void;
  fixed?: boolean; // true = fixed top-left，false = inline flow
}

export function BackButton({ onClick, fixed = false }: BackButtonProps) {
  const base =
    "w-[42px] h-[42px] rounded-[10px] flex items-center justify-center " +
    "bg-violet-500/[0.12] border border-violet-500/30 text-[#c4b5fd] " +
    "shadow-[0_0_12px_rgba(139,92,246,0.25),0_4px_12px_rgba(0,0,0,0.40)] " +
    "active:scale-90 hover:bg-violet-500/20 hover:border-violet-500/50 " +
    "transition-all duration-150 cursor-pointer";

  const positionClass = fixed
    ? "fixed z-10"
    : "shrink-0";

  const style = fixed
    ? { top: "calc(var(--web-safe-area-top, 0px) + 20px)", left: "20px" }
    : undefined;

  return (
    <button
      onClick={onClick}
      aria-label="返回"
      className={`${positionClass} ${base}`}
      style={style}
    >
      <ChevronLeft size={18} strokeWidth={2} />
    </button>
  );
}
```

### 3.5 统一错误提示块

```tsx
// src/components/GameErrorBanner.tsx
interface GameErrorBannerProps {
  message: string;
  onRetry?: () => void;
}

export function GameErrorBanner({ message, onRetry }: GameErrorBannerProps) {
  return (
    <div className="text-center text-xs text-red-400 px-3 py-1.5 rounded-[10px] bg-red-500/10 border border-red-500/20">
      {message}
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-2 block mx-auto px-5 py-2 rounded-[10px] bg-violet-500/20 border border-violet-500/40 text-violet-300 text-xs cursor-pointer"
        >
          重试
        </button>
      )}
    </div>
  );
}
```

---

## 四、各文件具体改动清单

### `LoadingPage.tsx`

1. **背景渐变**：统一为 `linear-gradient(160deg, #07041a 0%, #0d0825 40%, #120930 70%, #0a0618 100%)`（补充 `#120930 70%` 节点）
2. **粒子层**：引入 `<AmbientParticles />`，置于背景层
3. **Fingerprint 图标**：透明度从 `/30` 提高至 `/50`，与整体亮度协调
4. **扫描线颜色**：从 `violet-500/40` 统一为 `rgba(139, 92, 246, 0.35)`
5. **追加金色元素**：足部标识 "Lupus Night Protocol v1.0" 改为 `text-[#ffd166]/50`，与 create-iframe 的金色主题形成视觉连接
6. **字间距**：`tracking-[0.6em]` → `tracking-[0.4em]`，减少割裂感，与 create-iframe 的 `tracking-[0.22em]–[0.5em]` 区间对齐
7. **返回按钮**：替换为共享 `<BackButton fixed />` 组件
8. **错误状态**：纯文字改为 `<GameErrorBanner>` 组件（加 bg + border）

### `create-iframe.tsx`

1. **返回按钮**：替换为共享 `<BackButton />` 组件（非 fixed，保持文档流）
2. **粒子层**：替换为共享 `<AmbientParticles />`（逻辑不变，减少重复代码）
3. **错误状态**：已有样式良好，可替换为 `<GameErrorBanner>` 统一维护

### `GameRoomShell.tsx`

> GameRoomShell 使用游戏引擎驱动的背景，不需要对齐前两个页面的渐变背景。但可在以下方面与系统设计令牌接轨：

1. **HUD 色彩**：若 `hud-region` 存在硬编码颜色，可引用 `--color-game-violet-border` 等 CSS 变量
2. **错误 Toast（`layout-error-toast`）**：样式与 `GameErrorBanner` 对齐（`bg-red-500/10 border-red-500/20 rounded-[10px]`）
3. **返回按钮（`hud-back-button`）**：尺寸、圆角、阴影与 `BackButton` 组件规范对齐

---

## 五、优先级建议

| 优先级 | 改动 | 影响页面 |
|--------|------|---------|
| 🔴 高 | 统一背景渐变（补 `#120930` 节点） | LoadingPage |
| 🔴 高 | 提取 `<AmbientParticles />` | LoadingPage |
| 🟡 中 | 足部标识引入金色 `#ffd166/50` | LoadingPage |
| 🟡 中 | 错误提示统一为带背景的 pill | LoadingPage |
| 🟡 中 | 提取 `<BackButton />` 共享组件 | LoadingPage + create-iframe |
| 🟡 中 | 字间距调整 `0.6em → 0.4em` | LoadingPage |
| 🟢 低 | 追加设计令牌至 `@theme` | 全局 |
| 🟢 低 | GameRoomShell `layout-error-toast` 样式对齐 | GameRoomShell |

---

*文档版本：2026-05-22 · 仅分析与设计，不含代码变更*
