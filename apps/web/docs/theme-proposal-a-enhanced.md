# 方案 A 增强版 — "暗金仪式 · 资产版"

> 在方案 A（暗金仪式）的色彩基础上，**全面复用** `public/assets/werewolf-ui/final/` 中的现成游戏美术资产，  
> 使 LoadingPage 和 create-iframe 与 GameRoomShell 共享同一套视觉 DNA。

---

## 一、可用资产盘点与分配

| 资产路径 | 内容描述 | 用于 |
|---------|---------|------|
| `background/night-village.avif` | 游戏内夜晚村庄全景背景图 | 两个页面底层背景 |
| `background/vignette-overlay.avif` | 全屏暗角遮罩 | 两个页面，压暗四边 |
| `hud/moon-medallion.webp` | 月亮圆章徽标，游戏 HUD 核心图标 | LoadingPage 中心图标 |
| `hud/rail-top-line.webp` | HUD 顶部装饰线 | 两个页面顶栏上边 |
| `hud/rail-bottom-line.webp` | HUD 底部装饰线 | 两个页面顶栏下边 |
| `hud/rail-fill.webp` | HUD 栏填充纹理 | 两个页面顶栏背景 |
| `hud/socket-left.webp` | HUD 左侧插槽装饰 | create-iframe 顶栏左 |
| `hud/socket-right.webp` | HUD 右侧插槽装饰 | create-iframe 顶栏右 |
| `panel-9slice/ornament-top.webp` | 面板顶部装饰花纹 | create-iframe 配置区上方 |
| `panel-9slice/ornament-bottom.webp` | 面板底部装饰花纹 | create-iframe CTA 区上方 |
| `panel-9slice/divider.webp` | 面板分割线（含金纹装饰） | 替代现有 section 分割线 |
| `panel-9slice/fill.webp` | 面板填充纹理（深暗木纹/皮革） | 配置卡片、BottomSheet 背景 |
| `panel-9slice/corner-*.webp` × 4 | 面板四角花纹 | 配置卡片四角装饰 |
| `panel-9slice/edge-top/bottom.webp` | 面板上下边花纹 | 配置卡片边框 |
| `badge/moon.webp` | 月亮徽章（游戏角色徽章） | LoadingPage 副装饰 |
| `badge/blade.webp` | 刀刃徽章 | create-iframe 卡片装饰候选 |
| `avatar/portrait-hooded.webp` | 蒙面人物剪影立绘 | LoadingPage 背景装饰层 |
| `button/art/primary-button.png` | 主按钮游戏美术图 | create-iframe CTA 按钮背景 |
| `button/art/loading-button.png` | 加载态按钮游戏美术图 | create-iframe 提交中状态 |
| `effect/avatar-selected-glow.webp` | 头像选中光晕圆环 | LoadingPage 图标外圈光晕 |

---

## 二、LoadingPage 改造方案

### 2.1 背景层（3 层叠加）

```
第 1 层（最底）：night-village.avif
  position: absolute, inset: 0
  object-fit: cover, object-position: center 30%
  opacity: 0.22            ← 极低透明度，只取氛围不抢前景
  filter: saturate(0.5) brightness(0.6)   ← 去饱和+压暗，保留轮廓

第 2 层：深色渐变压盖（确保文字可读性）
  background: linear-gradient(
    to bottom,
    rgba(6,4,15,0.82) 0%,
    rgba(6,4,15,0.65) 40%,
    rgba(6,4,15,0.88) 100%
  )

第 3 层：vignette-overlay.avif
  position: absolute, inset: 0
  object-fit: cover
  opacity: 0.75            ← 四边压暗，聚焦中心
  mix-blend-mode: multiply
```

### 2.2 顶部 HUD 栏（新增）

复用游戏内 HUD 美术，形成与 GameRoomShell 相同的顶部识别带：

```
容器高度：52px，width: 100%
position: relative（文档流，非 fixed）

背景（3 层）：
  url(hud/rail-top-line.webp)    top    / 100% 14px repeat-x
  url(hud/rail-bottom-line.webp) bottom / 100% 14px repeat-x
  url(hud/rail-fill.webp)        center / 100% 100% no-repeat

内容：中心文字 "WEREWOLF" 
  color: #fff7d8，font-weight:800，letter-spacing:0.4em，font-size:11px
  text-shadow: 0 2px 8px rgba(0,0,0,0.85)
```

### 2.3 中心图标区

用 `moon-medallion.webp` 替换 `Fingerprint` 组件：

```
图标层次（由外到内）：

① glow 圆：
   width/height: 160px，rounded-full
   background: radial-gradient(circle, rgba(212,177,92,0.12) 0%, transparent 68%)

② avatar-selected-glow.webp 外圈：
   position: absolute, inset: -24px
   background-image: url(effect/avatar-selected-glow.webp)
   background-size: contain, no-repeat
   opacity: 0.45
   animation: lp-ring-pulse 3s ease-in-out infinite

③ moon-medallion.webp 主图标：
   width: 88px, height: 88px
   background-image: url(hud/moon-medallion.webp)
   background-size: contain, center, no-repeat
   filter: drop-shadow(0 0 16px rgba(212,177,92,0.55))
   animation: lp-moon-float 4s ease-in-out infinite（上下 4px 漂浮）
```

```css
@keyframes lp-ring-pulse {
  0%, 100% { opacity: 0.30; transform: scale(1.00); }
  50%       { opacity: 0.55; transform: scale(1.04); }
}
@keyframes lp-moon-float {
  0%, 100% { transform: translateY(0px);   }
  50%       { transform: translateY(-5px);  }
}
```

### 2.4 蒙面人物装饰（新增）

在中心图标后方，半透明蒙面立绘作为背景装饰：

```
position: absolute
bottom: 15%，left: 50%，transform: translateX(-50%)
width: 220px，height: auto
background-image: url(avatar/portrait-hooded.webp)
background-size: contain，no-repeat，center bottom
opacity: 0.09
filter: saturate(0) brightness(1.4)   ← 去色，只留轮廓剪影
pointer-events: none
```

### 2.5 Loading 指示器

替换 `dots` 动效，改为 3 段金色竖线（复用 speaking-badge 视觉基因）：

```
3 根竖线，各宽 3px，圆头，颜色 #d4b15c
初始高度 4px → 动画峰值 14px
与 seat-speaking-bar 相同节奏：0s / 0.18s / 0.36s 延迟

容器：flex gap-[5px] items-end h-[18px]，紧跟主文字下方
```

### 2.6 面板分割线（新增）

在图标区和文字区之间插入游戏内装饰分割线：

```
<img src="panel-9slice/divider.webp"
     style="width:120px; opacity:0.55; margin: 12px auto;" />
```

### 2.7 文字区域

```
主文字：SUMMONING PLAYERS
  color: rgba(255,247,216,0.62)
  font-size: 10px，font-weight: 800
  letter-spacing: 0.4em，text-transform: uppercase
  text-shadow: 0 2px 8px rgba(0,0,0,0.6)

副文字：传唤仪式进行中
  color: rgba(255,247,216,0.30)
  font-size: 9px，letter-spacing: 0.2em

错误态：
  容器：border rgba(239,68,68,0.30)，bg rgba(239,68,68,0.10)
        border-radius: 10px，padding: 8px 12px
  文字：#fca5a5
  重试按钮：border rgba(207,176,91,0.45)，bg rgba(212,177,92,0.10)，text #d4b15c
```

### 2.8 底部标识

```
badge/moon.webp   16px × 16px，opacity: 0.35，inline
文字：WEREWOLF · NIGHT PROTOCOL
  color: rgba(212,177,92,0.28)，letter-spacing: 0.5em，font-size: 9px
```

### 2.9 返回按钮

```
position: fixed，top: calc(safe-area-top + 20px)，left: 20px
width: 42px，height: 42px，border-radius: 10px
background: rgba(212,177,92,0.10)
border: 1px solid rgba(207,176,91,0.28)
color: rgba(255,247,216,0.80)
box-shadow: 0 0 12px rgba(212,177,92,0.18)，0 4px 12px rgba(0,0,0,0.50)
icon: ChevronLeft size=18
```

---

### 完整页面层次图

```
┌─────────────────────────────────────┐
│ [背景层1] night-village @22% 去饱和  │
│ [背景层2] 深色渐变压盖               │
│ [背景层3] vignette-overlay @75%     │
├─────────────────────────────────────┤
│ ║ HUD RAIL（rail-fill + 上下线）  ║ │  ← 游戏内同款顶栏
│ ║       W E R E W O L F          ║ │
├─────────────────────────────────────┤
│ [←] fixed 金色返回按钮              │
│                                     │
│         [glow 圆光晕]               │
│      [selected-glow 外圈]           │
│        [moon-medallion]             │  ← 月亮圆章，漂浮动效
│                                     │
│     ═══════════════════════         │  ← divider.webp
│                                     │
│      ┃  ┃  ┃  (金色竖线loading)    │
│    SUMMONING PLAYERS···             │
│    传唤仪式进行中                    │
│                                     │
│  [蒙面人物剪影 opacity:0.09]        │
│                                     │
│  ☽ WEREWOLF · NIGHT PROTOCOL       │  ← 底部金色标识
└─────────────────────────────────────┘
```

---

## 三、create-iframe 改造方案

### 3.1 背景层（同 LoadingPage，3 层）

```
night-village.avif @ opacity: 0.18（比 LoadingPage 更淡，为内容留空间）
深色渐变压盖：rgba(6,4,15,0.85) 顶部 → rgba(6,4,15,0.75) 中部 → rgba(6,4,15,0.90) 底部
vignette-overlay.avif @ opacity: 0.70
```

### 3.2 顶部 HUD 栏（身份区）

用 HUD 美术替换现有 flex header：

```
HUD 容器：width: calc(100% + 40px)，margin-inline: -20px（撑满出血）
高度：56px
背景（同 LoadingPage HUD，3 层 rail 图）：
  url(hud/rail-top-line.webp)    top    / 100% 14px repeat-x
  url(hud/rail-bottom-line.webp) bottom / 100% 14px repeat-x
  url(hud/rail-fill.webp)        center / 100% 100% no-repeat

左侧：socket-left.webp（32px，左对齐，垂直居中）
右侧：socket-right.webp（32px，右对齐，垂直居中）

HUD 内部 flex（padding-inline: 40px 盖住 socket）：
  左：[←] 返回按钮（金色，尺寸缩小到 36px）
  中：身份芯片（无背景/边框，融入 HUD，只显示名字 + userId）
      名字：#fff7d8，font-weight:800，font-size:13px
      userId：rgba(255,247,216,0.40)，font-size:10px
  右：（空）
```

### 3.3 Section 分割线

用游戏内美术替换 CSS 渐变线：

```
<img src="panel-9slice/ornament-top.webp"
     style="width:100%; max-width:360px; opacity:0.65; margin:12px auto; display:block;" />
```
> 原来的 "✦ GAME SETUP ✦" 文字叠加在装饰图上方，absolute 居中，color rgba(212,177,92,0.75)。

### 3.4 配置卡片（panel-9slice 9宫格面板）

用 9 宫格面板美术替换纯 CSS border：

```css
/* CSS border-image 方式（推荐，无需额外 DOM）*/
.config-card {
  background-image:
    url(panel-9slice/fill.webp);        /* 面板填充纹理 */
  background-size: cover;
  border-image-source: url(panel-9slice/corner-tl.webp)
                       url(panel-9slice/edge-top.webp)
                       url(panel-9slice/corner-tr.webp) ...;
  border-image-slice: 12 12 12 12 fill;
  border-image-width: 12px;
  border-image-repeat: stretch;
  border-radius: 0;   /* border-image 不支持 radius，改用圆角替代图 */
}
```

**简化方案**（CSS 背景模拟，无需 border-image）：

```css
.config-card {
  position: relative;
  background-image: url(panel-9slice/fill.webp);
  background-size: 64px 64px;   /* tile 小图 */
  border-radius: 14px;
  overflow: hidden;
}
/* 顶部装饰线（edge-top）*/
.config-card::before {
  content: "";
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 10px;
  background: url(panel-9slice/edge-top.webp) top / 100% 10px repeat-x;
  opacity: 0.70;
}
/* 底部装饰线（edge-bottom）*/
.config-card::after {
  content: "";
  position: absolute;
  bottom: 0; left: 0; right: 0;
  height: 10px;
  background: url(panel-9slice/edge-bottom.webp) bottom / 100% 10px repeat-x;
  opacity: 0.70;
}
```

卡片内容：
```
icon + label：rgba(255,247,216,0.45)，10px，font-weight:600
value：#d4b15c，font-weight:900，15px
  + drop-shadow(0 2px 6px rgba(0,0,0,0.6))
"›" 箭头：rgba(212,177,92,0.50)
```

### 3.5 分割线（配置区与 CTA 区之间）

```
<img src="panel-9slice/ornament-bottom.webp"
     style="width:100%; max-width:340px; opacity:0.55; margin: 8px auto; display:block;" />
```

### 3.6 CTA 创建按钮（游戏美术按钮）

用 `button/art/primary-button.png` 作为按钮背景图：

```css
.cta-button {
  background-image: url(button/art/primary-button.png);
  background-size: 100% 100%;   /* 拉伸铺满按钮 */
  background-color: transparent;
  border: none;
  height: 64px;
  color: #d4b15c;               /* 金色文字，叠在按钮图上 */
  font-weight: 900;
  font-size: 17px;
  text-shadow: 0 2px 8px rgba(0,0,0,0.70);
  /* 去掉 box-shadow，美术图自带阴影 */
}

/* 加载态 */
.cta-button[disabled] {
  background-image: url(button/art/loading-button.png);
  color: rgba(255,247,216,0.40);
}

/* 点击态 */
.cta-button:active {
  background-image: url(button/art/pressed-button.png);
  transform: scale(0.98);
}
```

### 3.7 BottomSheet 选中态

```
选中背景：面板 fill.webp tile + border rgba(207,176,91,0.50)
选中文字：#fff7d8，font-weight:700
未选中：rgba(2,8,10,0.50) + border rgba(255,255,255,0.08)
未选中文字：rgba(255,247,216,0.38)
勾号 ✓：color #d4b15c
```

---

### 完整页面层次图

```
┌─────────────────────────────────────┐
│ [背景层1] night-village @18%        │
│ [背景层2] 深色渐变压盖              │
│ [背景层3] vignette-overlay @70%     │
├─────────────────────────────────────┤
│ ║  socket-l  HUD栏(rail)  socket-r ║│  ← 完整 HUD 美术带
│ ║  [←]   Ranjun / @ranjun:m.org   ║│
├─────────────────────────────────────┤
│                                     │
│  ═══════ [ornament-top] ══════════  │  ← 游戏面板顶部花纹
│          ✦ GAME SETUP ✦            │
│                                     │
│  ╔══[panel-9slice]══╗ ╔══════════╗ │
│  ║ fill纹理 + 上下线║ ║          ║ │  ← 游戏面板卡片
│  ║  👥  人数        ║ ║ 🌐 语言  ║ │
│  ║  8P [#d4b15c]   ║ ║ 中文[金] ║ │
│  ╚══════════════════╝ ╚══════════╝ │
│                                     │
│  ══════ [ornament-bottom] ═════════ │  ← 面板底部花纹
│                                     │
│  ┌──[primary-button.png 背景]─────┐ │
│  │       🐺  创建游戏   [金色字]  │ │  ← 游戏美术主按钮
│  └────────────────────────────────┘ │
└─────────────────────────────────────┘
```

---

## 四、资产路径常量（建议）

在代码中定义 `assetBase`，与 `GameRoomShell.tsx` 保持一致的引用方式：

```ts
// 与 GameRoomShell.tsx 同款
const assetBase = `${(import.meta.env.BASE_URL ?? "/").replace(/\/?$/, "/")}assets/werewolf-ui/final`;

// 各资产路径
const ASSETS = {
  bgNightVillage:    `${assetBase}/background/night-village.avif`,
  bgVignette:        `${assetBase}/background/vignette-overlay.avif`,
  hudRailFill:       `${assetBase}/hud/rail-fill.webp`,
  hudRailTop:        `${assetBase}/hud/rail-top-line.webp`,
  hudRailBottom:     `${assetBase}/hud/rail-bottom-line.webp`,
  hudSocketLeft:     `${assetBase}/hud/socket-left.webp`,
  hudSocketRight:    `${assetBase}/hud/socket-right.webp`,
  hudMoonMedallion:  `${assetBase}/hud/moon-medallion.webp`,
  panelFill:         `${assetBase}/panel-9slice/fill.webp`,
  panelEdgeTop:      `${assetBase}/panel-9slice/edge-top.webp`,
  panelEdgeBottom:   `${assetBase}/panel-9slice/edge-bottom.webp`,
  panelOrnamentTop:  `${assetBase}/panel-9slice/ornament-top.webp`,
  panelOrnamentBot:  `${assetBase}/panel-9slice/ornament-bottom.webp`,
  panelDivider:      `${assetBase}/panel-9slice/divider.webp`,
  btnPrimary:        `${assetBase}/button/art/primary-button.png`,
  btnLoading:        `${assetBase}/button/art/loading-button.png`,
  btnPressed:        `${assetBase}/button/art/pressed-button.png`,
  avatarGlow:        `${assetBase}/effect/avatar-selected-glow.webp`,
  portraitHooded:    `${assetBase}/avatar/portrait-hooded.webp`,
  badgeMoon:         `${assetBase}/badge/moon.webp`,
} as const;
```

---

## 五、与原方案 A 的增量改动对比

| 模块 | 原方案 A | 增强版新增 |
|------|---------|----------|
| 背景 | 纯渐变 | + `night-village.avif` + `vignette-overlay.avif` |
| LoadingPage 图标 | lucide Moon SVG | → `moon-medallion.webp` + `avatar-selected-glow.webp` 外圈 |
| LoadingPage 装饰 | 无 | + `portrait-hooded.webp` 底部剪影 |
| 顶部栏 | 无装饰 | → HUD `rail-fill + top/bottom-line` 美术带 |
| 分割线 | CSS 渐变线 | → `panel-9slice/divider.webp` |
| Section 装饰 | 纯文字 | + `panel-9slice/ornament-top/bottom.webp` |
| 配置卡片 | CSS border | → `panel-9slice/fill.webp` + edge 装饰线 |
| CTA 按钮 | CSS 渐变 | → `button/art/primary-button.png` 背景图 |
| HUD socket | 无 | + `socket-left/right.webp` 两侧装饰 |
| 页脚 | 纯文字 | + `badge/moon.webp` 小图标 |

---

## 六、注意事项

1. **`night-village.avif` 透明度**：必须控制在 `0.15~0.22`，超过 0.3 会抢夺前景内容注意力
2. **`button/art/primary-button.png`**：原图为固定尺寸，需测试 `background-size: 100% 100%` 拉伸效果；若比例失真，改用 `contain` + 纯色填充底色兜底
3. **`panel-9slice/fill.webp`**：建议 tile（`background-size: 64px`）而非 stretch，避免纹理模糊
4. **avif 兼容性**：`night-village` 和 `vignette-overlay` 提供了 `.png` 备份，可用 `<picture>` 标签兼容旧浏览器
5. **性能**：LoadingPage 是连接期展示页，背景图建议 `loading="eager"` 预加载，避免进场时图片闪烁

---

*文档版本：2026-05-22 · 仅设计提案，不含代码变更*
