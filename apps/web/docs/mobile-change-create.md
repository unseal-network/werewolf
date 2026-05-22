# create-iframe.tsx 配置项调整设计文档

> 对齐 `create-test.tsx` 的参数体系，精简移动端创建页的配置条目。

---

## 一、变更概览

| 配置项 | 当前状态 | 变更后 | 原因 |
|--------|---------|--------|------|
| 玩家人数（targetPlayerCount） | ✅ 存在 | ❌ 删除 | iframe 模式人数由房主在 Unseal 侧统一管理，前端无需配置 |
| 语音模式（meetingRequired） | ✅ 存在 | ❌ 删除 | 该字段当前为 UI-only，未接入 API，无实际意义 |
| 游戏语言（language） | ✅ 存在 | ✅ 保留 | 有效配置项 |
| 语音倍速（agentSpeechRate） | ❌ 不存在 | ✅ 新增 | `useCreateGame` 已支持，`create-test.tsx` 已有相同配置 |

调整后配置行由 **3 行** 变为 **2 行**：游戏语言 + 语音倍速。

---

## 二、删除项细节

### 2.1 玩家人数

**删除内容：**
- `configRows` 中的 `players` 条目（`Users` 图标）
- `BottomSheet` — `activeSheet === "players"` 整块
- `ActiveSheet` 类型中的 `"players"` 字面量
- `setTargetPlayerCount` 不再从 `useCreateGame` 解构

**注意：** `useCreateGame` 内部仍会把 `targetPlayerCount = 12` 传给 API，前端只是不再暴露给用户修改。

---

### 2.2 语音模式

**删除内容：**
- `configRows` 中的 `voice` 条目（`Mic2` / `MicOff` 图标）
- `BottomSheet` — `activeSheet === "voice"` 整块
- `ActiveSheet` 类型中的 `"voice"` 字面量
- 组件本地状态 `meetingRequired` 及 `setMeetingRequired`
- 导入 `Mic2`、`MicOff`、`Users`

---

## 三、新增项细节：语音倍速

### 3.1 配置行

```
图标：lucide Gauge（仪表盘）
      颜色：#d4b15c，尺寸 15px
      背景：rgba(212,177,92,0.12)，border rgba(207,176,91,0.22)，rounded-[9px]

标签：语音倍速
值：  当前倍速的显示文本（见映射表）
右侧：ChevronRight
```

**倍速 → 显示文本映射：**

| agentSpeechRate | 显示值 |
|----------------|--------|
| 1              | 正常   |
| 1.25           | 1.25x  |
| 1.5            | 1.5x   |
| 1.75           | 1.75x  |
| 2              | 极速   |

---

### 3.2 BottomSheet — 语音倍速选择器

**标题：** `语音倍速`

**布局：** 5 个选项 `flex gap-2`，宽度均等 `flex-1`

**每个选项：**
```
┌──────────┐
│  1.5x    │  ← 主文字（大号）
│  快速    │  ← 描述文字（小号）
│   ✓      │  ← Check 图标，仅选中显示
└──────────┘
```

**选项数据：**

| value | 主文字 | 描述 |
|-------|--------|------|
| 1     | 1x     | 正常 |
| 1.25  | 1.25x  | 稍快 |
| 1.5   | 1.5x   | 快速 |
| 1.75  | 1.75x  | 较快 |
| 2     | 2x     | 极速 |

**选中样式：**
- background: `rgba(212,177,92,0.14)`
- border: `1px solid rgba(207,176,91,0.55)`
- 主文字: `#d4b15c`

**未选中样式：**
- background: `rgba(255,255,255,0.04)`
- border: `1px solid rgba(255,255,255,0.08)`
- 主文字: `rgba(255,247,216,0.35)`

---

## 四、代码改动清单

### 4.1 导入变更

```diff
- import {
-   ChevronLeft, ChevronRight,
-   Users, Globe, Mic2, MicOff, Check,
- } from "lucide-react";

+ import {
+   ChevronLeft, ChevronRight,
+   Globe, Gauge, Check,
+ } from "lucide-react";
```

### 4.2 ActiveSheet 类型

```diff
- type ActiveSheet = "players" | "language" | "voice" | null;
+ type ActiveSheet = "language" | "speechRate" | null;
```

### 4.3 Hook 解构

```diff
  const {
    language, setLanguage,
-   targetPlayerCount, setTargetPlayerCount,
+   agentSpeechRate, setAgentSpeechRate,
    submitting, error, setError, submit,
  } = useCreateGame({ onGameCreated });
```

### 4.4 本地状态

```diff
- const [meetingRequired, setMeetingRequired] = useState(false);
  // 移除，无需替换
```

### 4.5 新增辅助常量与函数

```ts
const SPEECH_RATE_OPTIONS = [
  { value: 1,    label: "1x",    desc: "正常" },
  { value: 1.25, label: "1.25x", desc: "稍快" },
  { value: 1.5,  label: "1.5x",  desc: "快速" },
  { value: 1.75, label: "1.75x", desc: "较快" },
  { value: 2,    label: "2x",    desc: "极速" },
] as const;

function speechRateLabel(rate: number): string {
  if (rate === 1) return "正常";
  if (rate === 2) return "极速";
  return `${rate}x`;
}
```

### 4.6 configRows

```diff
  const configRows = [
-   { key: "players",    Icon: Users,  label: "玩家人数", value: `${targetPlayerCount} 人` },
    { key: "language",   Icon: Globe,  label: "游戏语言", value: selectedLang.name },
-   { key: "voice",      Icon: meetingRequired ? Mic2 : MicOff, label: "语音模式", value: meetingRequired ? "已开启" : "已关闭" },
+   { key: "speechRate", Icon: Gauge,  label: "语音倍速", value: speechRateLabel(agentSpeechRate) },
  ];
```

### 4.7 BottomSheet 变更

```diff
- <BottomSheet open={activeSheet === "players"} title="玩家人数" ...>
-   {/* 6/8/12 人选择 */}
- </BottomSheet>

- <BottomSheet open={activeSheet === "voice"} title="语音模式" ...>
-   {/* 开启/关闭语音 */}
- </BottomSheet>

+ <BottomSheet open={activeSheet === "speechRate"} title="语音倍速" ...>
+   <div className="flex gap-2">
+     {SPEECH_RATE_OPTIONS.map(({ value, label, desc }) => (
+       <button key={value} onClick={() => { setAgentSpeechRate(value); setActiveSheet(null); }}
+         className="flex-1 py-4 rounded-2xl flex flex-col items-center gap-0.5 cursor-pointer transition-all active:scale-[0.97]"
+         style={{ background: 选中 ? "rgba(212,177,92,0.14)" : "rgba(255,255,255,0.04)",
+                  border: 选中 ? "1px solid rgba(207,176,91,0.55)" : "1px solid rgba(255,255,255,0.08)" }}
+       >
+         <span className="text-base font-black" style={{ color: 选中 ? "#d4b15c" : "rgba(255,247,216,0.35)" }}>
+           {label}
+         </span>
+         <span className="text-[10px]" style={{ color: 选中 ? "rgba(212,177,92,0.65)" : "rgba(255,247,216,0.22)" }}>
+           {desc}
+         </span>
+         {选中 && <Check size={11} color="#d4b15c" strokeWidth={3} />}
+       </button>
+     ))}
+   </div>
+ </BottomSheet>
```

---

## 五、最终配置行效果

```
┌──────────────────────────────────────┐
│  游戏设置 ──────────────────────────  │
│ ┌────────────────────────────────┐   │
│ │ [🌐] 游戏语言          中文  › │   │
│ ├────────────────────────────────┤   │
│ │ [⏱] 语音倍速          1.5x  › │   │
│ └────────────────────────────────┘   │
└──────────────────────────────────────┘
```

---

*文档版本：2026-05-22*