# Agent Harness Prompt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a phase-aware agent prompt harness that ports `wolfcha`'s game-context and phase-prompt discipline into the API runtime.

**Architecture:** Add `apps/api/src/services/agent-harness/` as a focused prompt layer with typed inputs, context sections, strategy helpers, and phase builders. Keep orchestration in `game-service.ts`; it will ask the harness for `system`/`user` messages and pass those to `buildRunAgentTurn`, while preserving the current text prompt as a fallback.

**Tech Stack:** TypeScript, Vitest, existing `@werewolf/shared`, existing `@werewolf/engine`, existing `@werewolf/agent-client` tool declarations.

**Prompt Content Direction:** Mirror `wolfcha`'s gameplay strategy, sectioning, and table-talk tone as closely as possible while using original wording in this codebase. The harness flow is redesigned for the API runtime; the prompt semantics should feel like `wolfcha`.

---

## File Structure

- Create `apps/api/src/services/agent-harness/types.ts`
  Owns prompt message/result types and the harness input contract.
- Create `apps/api/src/services/agent-harness/context.ts`
  Builds visible tagged context sections from `StoredGameRoom`, `StoredPlayer`, and `PlayerPrivateState`.
- Create `apps/api/src/services/agent-harness/context.test.ts`
  Tests context visibility, role-private info, legal targets, speech history, and vote history.
- Create `apps/api/src/services/agent-harness/strategy.ts`
  Builds role strategy, speaking-order hints, focus angles, and phase output rules.
- Create `apps/api/src/services/agent-harness/strategy.test.ts`
  Tests strategy text and focus-angle behavior.
- Create `apps/api/src/services/agent-harness/phases/day-speech.ts`
  Builds `day_speak` and `tie_speech` prompts.
- Create `apps/api/src/services/agent-harness/phases/day-vote.ts`
  Builds `day_vote` and `tie_vote` prompts.
- Create `apps/api/src/services/agent-harness/phases/night-wolf.ts`
  Builds wolf discussion and wolf kill-vote prompts.
- Create `apps/api/src/services/agent-harness/phases/night-role.ts`
  Builds guard, witch, seer, and generic night prompts.
- Create `apps/api/src/services/agent-harness/index.ts`
  Dispatches by phase and tool set through `buildAgentPrompt`.
- Create `apps/api/src/services/agent-harness/index.test.ts`
  Tests phase dispatch and prompt separation.
- Modify `apps/api/src/services/agent-turn.ts`
  Sends `input.messages` when present.
- Create `apps/api/src/services/agent-turn.test.ts`
  Tests message handling and fallback behavior.
- Modify `apps/api/src/services/game-service.ts`
  Extends `RuntimeAgentTurnInput`, imports `buildAgentPrompt`, and sends harness messages from `runAgentToolTurn`.
- Modify `apps/api/src/services/game-service.test.ts`
  Adds a regression test that captured agent calls include multi-message prompts with phase-specific content.

Worktree note: the current `main` worktree already has unrelated user changes. During execution, stage and commit only the files listed in the task being completed.

---

### Task 1: Harness Types And Context Builder

**Files:**
- Create: `apps/api/src/services/agent-harness/types.ts`
- Create: `apps/api/src/services/agent-harness/context.ts`
- Create: `apps/api/src/services/agent-harness/context.test.ts`

- [ ] **Step 1: Write the failing context tests**

Create `apps/api/src/services/agent-harness/context.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { GameEvent } from "@werewolf/shared";
import type { PlayerPrivateState } from "@werewolf/engine";
import type { StoredGameRoom } from "../game-service";
import { buildHarnessContext } from "./context";

function makeRoom(phase: "day_speak" | "night_wolf" | "night_seer"): {
  room: StoredGameRoom;
  wolfState: PlayerPrivateState;
  seerState: PlayerPrivateState;
} {
  const wolfState: PlayerPrivateState = {
    playerId: "player_1",
    role: "werewolf",
    team: "wolf",
    alive: true,
    knownTeammatePlayerIds: ["player_2"],
  };
  const seerState: PlayerPrivateState = {
    playerId: "player_3",
    role: "seer",
    team: "good",
    alive: true,
    knownTeammatePlayerIds: [],
  };
  const events: GameEvent[] = [
    {
      id: "wolf_speech",
      gameRoomId: "room_1",
      seq: 1,
      type: "speech_submitted",
      visibility: "private:team:wolf",
      actorId: "player_1",
      payload: { day: 1, phase: "night_wolf", speech: "secret night plan" },
      createdAt: "2026-05-13T00:00:00.000Z",
    },
    {
      id: "public_speech",
      gameRoomId: "room_1",
      seq: 2,
      type: "speech_submitted",
      visibility: "public",
      actorId: "player_4",
      payload: { day: 1, speech: "我觉得 1 号视角不太自然。" },
      createdAt: "2026-05-13T00:00:01.000Z",
    },
    {
      id: "seer_result",
      gameRoomId: "room_1",
      seq: 3,
      type: "seer_result_revealed",
      visibility: "private:user:player_3",
      actorId: "runtime",
      payload: {
        seerPlayerId: "player_3",
        inspectedPlayerId: "player_1",
        alignment: "wolf",
      },
      createdAt: "2026-05-13T00:00:02.000Z",
    },
    {
      id: "vote_1",
      gameRoomId: "room_1",
      seq: 4,
      type: "vote_submitted",
      visibility: "public",
      actorId: "player_4",
      subjectId: "player_1",
      payload: { day: 1, phase: "day_vote", targetPlayerId: "player_1" },
      createdAt: "2026-05-13T00:00:03.000Z",
    },
  ];

  return {
    wolfState,
    seerState,
    room: {
      id: "room_1",
      creatorUserId: "@creator:example.com",
      title: "Harness",
      status: "active",
      targetPlayerCount: 6,
      language: "zh-CN",
      timing: {
        nightActionSeconds: 45,
        speechSeconds: 60,
        voteSeconds: 30,
        agentSpeechRate: 1.5,
      },
      createdFromMatrixRoomId: "!source:example.com",
      agentSourceMatrixRoomId: "!source:example.com",
      players: [
        { id: "player_1", kind: "agent", agentId: "@wolf:example.com", displayName: "一号狼", seatNo: 1, ready: true, onlineState: "online", leftAt: null },
        { id: "player_2", kind: "agent", agentId: "@wolf2:example.com", displayName: "二号狼", seatNo: 2, ready: true, onlineState: "online", leftAt: null },
        { id: "player_3", kind: "agent", agentId: "@seer:example.com", displayName: "三号预言家", seatNo: 3, ready: true, onlineState: "online", leftAt: null },
        { id: "player_4", kind: "user", userId: "@villager:example.com", displayName: "四号村民", seatNo: 4, ready: true, onlineState: "online", leftAt: null },
      ],
      projection: {
        gameRoomId: "room_1",
        status: "active",
        phase,
        day: 1,
        deadlineAt: "2026-05-13T00:01:00.000Z",
        currentSpeakerPlayerId: phase === "day_speak" ? "player_1" : null,
        winner: null,
        alivePlayerIds: ["player_1", "player_2", "player_3", "player_4"],
        version: 4,
      },
      privateStates: [wolfState, seerState],
      events,
      pendingNightActions: [],
      pendingVotes: [],
      speechQueue: phase === "day_speak" ? ["player_1", "player_2", "player_3", "player_4"] : [],
      tiePlayerIds: [],
    },
  };
}

describe("buildHarnessContext", () => {
  it("keeps wolf private history out of public day context", () => {
    const { room, wolfState } = makeRoom("day_speak");
    const context = buildHarnessContext({
      room,
      player: room.players[0]!,
      state: wolfState,
      maxSpeechHistory: 6,
    });

    expect(context.text).toContain("<current_status>");
    expect(context.text).toContain("<history>");
    expect(context.text).toContain("我觉得 1 号视角不太自然。");
    expect(context.text).not.toContain("secret night plan");
    expect(context.text).not.toContain("<wolf_team_history>");
  });

  it("includes wolf team history during wolf night", () => {
    const { room, wolfState } = makeRoom("night_wolf");
    const context = buildHarnessContext({
      room,
      player: room.players[0]!,
      state: wolfState,
      maxSpeechHistory: 6,
    });

    expect(context.text).toContain("<your_private_info>");
    expect(context.text).toContain("狼队友：二号狼(座位2)");
    expect(context.text).toContain("<wolf_team_history>");
    expect(context.text).toContain("secret night plan");
  });

  it("shows seer private inspections only to the seer", () => {
    const { room, seerState } = makeRoom("night_seer");
    const context = buildHarnessContext({
      room,
      player: room.players[2]!,
      state: seerState,
      maxSpeechHistory: 6,
    });

    expect(context.text).toContain("预言家查验记录");
    expect(context.text).toContain("一号狼(座位1)：狼人");
  });

  it("includes legal target ids and vote history", () => {
    const { room, wolfState } = makeRoom("day_speak");
    const context = buildHarnessContext({
      room,
      player: room.players[0]!,
      state: wolfState,
      maxSpeechHistory: 6,
    });

    expect(context.text).toContain("<action_options>");
    expect(context.text).toContain("player_2(座位2 二号狼)");
    expect(context.text).toContain("<votes>");
    expect(context.text).toContain("四号村民 -> 一号狼");
  });
});
```

- [ ] **Step 2: Run context tests to verify they fail**

Run:

```bash
pnpm vitest run apps/api/src/services/agent-harness/context.test.ts
```

Expected: FAIL because `apps/api/src/services/agent-harness/context.ts` does not exist.

- [ ] **Step 3: Add harness types**

Create `apps/api/src/services/agent-harness/types.ts`:

```ts
import type { GamePhase, Role } from "@werewolf/shared";
import type { PlayerPrivateState } from "@werewolf/engine";
import type { StoredGameRoom, StoredPlayer } from "../game-service";

export interface AgentPromptMessage {
  role: "system" | "user";
  content: string;
}

export interface AgentPromptPart {
  text: string;
  cacheable?: boolean;
  ttl?: "5m" | "1h";
}

export type AgentTurnKind =
  | "day_speech"
  | "day_vote"
  | "wolf_discussion"
  | "wolf_vote"
  | "night_action";

export interface AgentPromptResult {
  messages: AgentPromptMessage[];
  system: string;
  user: string;
  textPrompt: string;
}

export interface BuildAgentPromptInput {
  room: StoredGameRoom;
  player: StoredPlayer;
  state: PlayerPrivateState;
  taskPrompt: string;
  tools: Record<string, unknown>;
  turnKind?: AgentTurnKind;
  languageInstruction?: string;
}

export interface HarnessContextInput {
  room: StoredGameRoom;
  player: StoredPlayer;
  state: PlayerPrivateState;
  maxSpeechHistory?: number;
}

export interface HarnessContextResult {
  text: string;
  phase: GamePhase;
  role: Role;
  alivePlayerIds: string[];
  targetPlayerIds: string[];
}
```

- [ ] **Step 4: Add the minimal context implementation**

Create `apps/api/src/services/agent-harness/context.ts`:

```ts
import type { GameEvent } from "@werewolf/shared";
import type { HarnessContextInput, HarnessContextResult } from "./types";
import type { StoredPlayer } from "../game-service";

export function buildHarnessContext(
  input: HarnessContextInput
): HarnessContextResult {
  const { room, player, state, maxSpeechHistory = 10 } = input;
  if (!room.projection) {
    return {
      text: "",
      phase: "role_assignment",
      role: state.role,
      alivePlayerIds: [],
      targetPlayerIds: [],
    };
  }

  const playersById = new Map<string, StoredPlayer>();
  for (const candidate of room.players) {
    if (!candidate.leftAt) playersById.set(candidate.id, candidate);
  }
  const aliveSet = new Set(room.projection.alivePlayerIds);
  const isWolf = state.team === "wolf";
  const includeWolfPrivate = isWolf && room.projection.phase === "night_wolf";
  const visibleEvents = room.events.filter((event) =>
    canSeeEvent(event, player.id, isWolf, includeWolfPrivate)
  );

  const targetPlayerIds = room.projection.alivePlayerIds.filter(
    (id) => id !== player.id
  );

  const sections = [
    buildPrivateInfoSection(room, player, state, playersById),
    buildCurrentStatusSection(room, player, state),
    buildGameStateSection(room, player, playersById, aliveSet),
    buildHistorySection(visibleEvents, playersById, maxSpeechHistory, includeWolfPrivate),
    buildVotesSection(visibleEvents, playersById),
    includeWolfPrivate ? buildWolfTeamHistorySection(room.events, playersById) : "",
    buildActionOptionsSection(targetPlayerIds, playersById),
  ].filter(Boolean);

  return {
    text: sections.join("\n\n"),
    phase: room.projection.phase,
    role: state.role,
    alivePlayerIds: room.projection.alivePlayerIds,
    targetPlayerIds,
  };
}

function canSeeEvent(
  event: GameEvent,
  playerId: string,
  isWolf: boolean,
  includeWolfPrivate: boolean
): boolean {
  if (event.visibility === "public") return true;
  if (event.visibility === "runtime") return false;
  if (event.visibility === `private:user:${playerId}`) return true;
  if (event.visibility === "private:team:wolf") return isWolf && includeWolfPrivate;
  return false;
}

function buildPrivateInfoSection(
  room: HarnessContextInput["room"],
  player: StoredPlayer,
  state: HarnessContextInput["state"],
  playersById: Map<string, StoredPlayer>
): string {
  const lines = ["<your_private_info>", `你是：${labelPlayer(player)}`, `角色：${roleLabel(state.role)}`];

  if (state.team === "wolf") {
    const teammates = state.knownTeammatePlayerIds
      .map((id) => playersById.get(id))
      .filter((candidate): candidate is StoredPlayer => Boolean(candidate))
      .map(labelPlayer);
    lines.push(`狼队友：${teammates.length > 0 ? teammates.join("、") : "无存活队友"}`);
  }

  if (state.role === "seer") {
    const results = room.events.filter(
      (event) =>
        event.type === "seer_result_revealed" &&
        event.payload?.seerPlayerId === player.id
    );
    if (results.length > 0) {
      lines.push("预言家查验记录：");
      for (const result of results) {
        const inspectedId = String(result.payload?.inspectedPlayerId ?? "");
        const inspected = playersById.get(inspectedId);
        const alignment = result.payload?.alignment === "wolf" ? "狼人" : "好人";
        lines.push(`- ${inspected ? labelPlayer(inspected) : inspectedId}：${alignment}`);
      }
    }
  }

  if (state.role === "witch" && state.witchItems) {
    lines.push(`女巫药水：解药${state.witchItems.healAvailable ? "可用" : "已用"}，毒药${state.witchItems.poisonAvailable ? "可用" : "已用"}`);
  }

  if (state.role === "guard") {
    const previousGuard = [...room.events]
      .reverse()
      .find(
        (event) =>
          event.type === "night_action_submitted" &&
          event.actorId === player.id &&
          event.payload?.action &&
          typeof event.payload.action === "object" &&
          (event.payload.action as { kind?: unknown }).kind === "guardProtect"
      );
    const guardedId =
      previousGuard?.subjectId ??
      (previousGuard?.payload?.action as { targetPlayerId?: string } | undefined)
        ?.targetPlayerId;
    if (guardedId) {
      const guarded = playersById.get(guardedId);
      lines.push(`上次守护：${guarded ? labelPlayer(guarded) : guardedId}`);
    }
  }

  lines.push("</your_private_info>");
  return lines.join("\n");
}

function buildCurrentStatusSection(
  room: HarnessContextInput["room"],
  player: StoredPlayer,
  state: HarnessContextInput["state"]
): string {
  const projection = room.projection!;
  return [
    "<current_status>",
    `第 ${projection.day} 天 / ${projection.phase}`,
    `当前玩家：${labelPlayer(player)}`,
    `当前角色：${roleLabel(state.role)}`,
    `当前发言者：${projection.currentSpeakerPlayerId ?? "无"}`,
    "</current_status>",
  ].join("\n");
}

function buildGameStateSection(
  room: HarnessContextInput["room"],
  player: StoredPlayer,
  playersById: Map<string, StoredPlayer>,
  aliveSet: Set<string>
): string {
  const players = Array.from(playersById.values()).sort((a, b) => a.seatNo - b.seatNo);
  return [
    "<game_state>",
    `alive_count: ${room.projection!.alivePlayerIds.length}`,
    ...players.map((candidate) => {
      const status = aliveSet.has(candidate.id) ? "存活" : "死亡";
      const self = candidate.id === player.id ? " (你)" : "";
      return `- ${labelPlayer(candidate)}${self}: ${status}`;
    }),
    "</game_state>",
  ].join("\n");
}

function buildHistorySection(
  visibleEvents: GameEvent[],
  playersById: Map<string, StoredPlayer>,
  maxSpeechHistory: number,
  includeWolfPrivate: boolean
): string {
  const speeches = visibleEvents
    .filter(
      (event) =>
        event.type === "speech_submitted" &&
        event.actorId &&
        event.actorId !== "runtime" &&
        (event.visibility === "public" ||
          (includeWolfPrivate && event.visibility === "private:team:wolf"))
    )
    .slice(-maxSpeechHistory);
  if (speeches.length === 0) return "";
  return [
    "<history>",
    ...speeches.map((event) => {
      const actor = event.actorId ? playersById.get(event.actorId) : undefined;
      return `${actor ? labelPlayer(actor) : event.actorId}: ${String(event.payload?.speech ?? "")}`;
    }),
    "</history>",
  ].join("\n");
}

function buildVotesSection(
  visibleEvents: GameEvent[],
  playersById: Map<string, StoredPlayer>
): string {
  const votes = visibleEvents.filter(
    (event) => event.type === "vote_submitted" && event.actorId
  );
  if (votes.length === 0) return "";
  return [
    "<votes>",
    ...votes.map((event) => {
      const actor = event.actorId ? playersById.get(event.actorId) : undefined;
      const target = event.subjectId ? playersById.get(event.subjectId) : undefined;
      return `${actor ? actor.displayName : event.actorId} -> ${target ? target.displayName : "弃权"}`;
    }),
    "</votes>",
  ].join("\n");
}

function buildWolfTeamHistorySection(
  events: GameEvent[],
  playersById: Map<string, StoredPlayer>
): string {
  const wolfEvents = events.filter(
    (event) =>
      event.visibility === "private:team:wolf" &&
      (event.type === "speech_submitted" || event.type === "wolf_vote_submitted")
  );
  if (wolfEvents.length === 0) return "";
  return [
    "<wolf_team_history>",
    ...wolfEvents.map((event) => {
      const actor = event.actorId ? playersById.get(event.actorId) : undefined;
      if (event.type === "wolf_vote_submitted") {
        const target = event.subjectId ? playersById.get(event.subjectId) : undefined;
        return `${actor ? labelPlayer(actor) : event.actorId} 投票击杀 ${target ? labelPlayer(target) : event.subjectId}`;
      }
      return `${actor ? labelPlayer(actor) : event.actorId}: ${String(event.payload?.speech ?? "")}`;
    }),
    "</wolf_team_history>",
  ].join("\n");
}

function buildActionOptionsSection(
  targetPlayerIds: string[],
  playersById: Map<string, StoredPlayer>
): string {
  return [
    "<action_options>",
    ...targetPlayerIds.map((id) => {
      const player = playersById.get(id);
      return player ? `${id}(座位${player.seatNo} ${player.displayName})` : id;
    }),
    "</action_options>",
  ].join("\n");
}

function labelPlayer(player: StoredPlayer): string {
  return `${player.displayName}(座位${player.seatNo})`;
}

function roleLabel(role: string): string {
  const labels: Record<string, string> = {
    werewolf: "狼人",
    villager: "村民",
    seer: "预言家",
    witch: "女巫",
    guard: "守卫",
  };
  return labels[role] ?? role;
}
```

- [ ] **Step 5: Run context tests to verify they pass**

Run:

```bash
pnpm vitest run apps/api/src/services/agent-harness/context.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 6: Commit context slice**

Run:

```bash
git add apps/api/src/services/agent-harness/types.ts apps/api/src/services/agent-harness/context.ts apps/api/src/services/agent-harness/context.test.ts
git commit -m "feat: add agent harness context"
```

---

### Task 2: Strategy Helpers

**Files:**
- Create: `apps/api/src/services/agent-harness/strategy.ts`
- Create: `apps/api/src/services/agent-harness/strategy.test.ts`

- [ ] **Step 1: Write the failing strategy tests**

Create `apps/api/src/services/agent-harness/strategy.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { GameEvent } from "@werewolf/shared";
import type { StoredGameRoom, StoredPlayer } from "../game-service";
import {
  buildFocusAngle,
  buildRoleStrategy,
  buildSpeakingOrderHint,
  buildSpeechRules,
} from "./strategy";

const players: StoredPlayer[] = [
  { id: "p1", kind: "agent", agentId: "@p1:example.com", displayName: "一号", seatNo: 1, ready: true, onlineState: "online", leftAt: null },
  { id: "p2", kind: "agent", agentId: "@p2:example.com", displayName: "二号", seatNo: 2, ready: true, onlineState: "online", leftAt: null },
  { id: "p3", kind: "agent", agentId: "@p3:example.com", displayName: "三号", seatNo: 3, ready: true, onlineState: "online", leftAt: null },
];

function room(events: GameEvent[] = [], speechQueue: string[] = ["p1", "p2", "p3"]): StoredGameRoom {
  return {
    id: "room_strategy",
    creatorUserId: "@creator:example.com",
    title: "Strategy",
    status: "active",
    targetPlayerCount: 3,
    language: "zh-CN",
    timing: { nightActionSeconds: 45, speechSeconds: 60, voteSeconds: 30, agentSpeechRate: 1.5 },
    createdFromMatrixRoomId: "!source:example.com",
    agentSourceMatrixRoomId: "!source:example.com",
    players,
    projection: {
      gameRoomId: "room_strategy",
      status: "active",
      phase: "day_speak",
      day: 1,
      deadlineAt: "2026-05-13T00:01:00.000Z",
      currentSpeakerPlayerId: speechQueue[0] ?? null,
      winner: null,
      alivePlayerIds: players.map((player) => player.id),
      version: 1,
    },
    privateStates: [],
    events,
    pendingNightActions: [],
    pendingVotes: [],
    speechQueue,
    tiePlayerIds: [],
  };
}

describe("agent harness strategy", () => {
  it("builds wolf strategy with anti-leak self-check", () => {
    const strategy = buildRoleStrategy("werewolf");
    expect(strategy).toContain("<role_strategy>");
    expect(strategy).toContain("伪装成好人");
    expect(strategy).toContain("不要暴露狼队友");
  });

  it("builds speaking-order hint for first and late speakers", () => {
    expect(buildSpeakingOrderHint(room([], ["p1", "p2", "p3"]), "p1")).toContain("第1个发言");
    expect(buildSpeakingOrderHint(room([], ["p1", "p2", "p3"]), "p3")).toContain("第3/3个发言");
  });

  it("builds focus angle when current player was mentioned", () => {
    const focus = buildFocusAngle(
      room([
        {
          id: "mention",
          gameRoomId: "room_strategy",
          seq: 1,
          type: "speech_submitted",
          visibility: "public",
          actorId: "p2",
          payload: { day: 1, speech: "我觉得 1 号需要解释一下。" },
          createdAt: "2026-05-13T00:00:00.000Z",
        },
      ]),
      "p1"
    );
    expect(focus).toContain("<focus_angle>");
    expect(focus).toContain("你被二号点名");
  });

  it("builds speech rules for tool-call public speech", () => {
    const rules = buildSpeechRules("zh-CN");
    expect(rules).toContain("必须调用 saySpeech");
    expect(rules).toContain("2-5");
    expect(rules).toContain("不要说自己是 AI");
  });
});
```

- [ ] **Step 2: Run strategy tests to verify they fail**

Run:

```bash
pnpm vitest run apps/api/src/services/agent-harness/strategy.test.ts
```

Expected: FAIL because `strategy.ts` does not exist.

- [ ] **Step 3: Add the strategy implementation**

Create `apps/api/src/services/agent-harness/strategy.ts`:

```ts
import type { CreateGameRequest, Role } from "@werewolf/shared";
import type { StoredGameRoom, StoredPlayer } from "../game-service";

export function buildRoleStrategy(role: Role): string {
  const strategies: Record<Role, string> = {
    werewolf: [
      "<role_strategy>",
      "【狼人策略库】",
      "- 白天要伪装成好人，用公开信息推理，不要暴露狼队友。",
      "- 可以质疑发言摇摆、信息来源不清、投票理由薄弱的玩家。",
      "- 避免狼视角：不要说只有狼人阵营才知道的信息。",
      "- 如果队友被怀疑，可以轻微转移焦点，但不要无条件硬保。",
      "</role_strategy>",
    ].join("\n"),
    villager: [
      "<role_strategy>",
      "【村民策略库】",
      "- 你没有夜间信息，要依靠发言矛盾、票型和行为判断。",
      "- 给出明确怀疑对象，不要长期只说观察。",
      "</role_strategy>",
    ].join("\n"),
    seer: [
      "<role_strategy>",
      "【预言家策略库】",
      "- 查验结果是强信息，但是否公开身份取决于局势。",
      "- 如果公开查验，要给出清晰查验链和今日归票建议。",
      "</role_strategy>",
    ].join("\n"),
    witch: [
      "<role_strategy>",
      "【女巫策略库】",
      "- 药水信息是强私有信息，公开时要考虑是否会暴露身份。",
      "- 毒药优先用于你高度确认的狼人。",
      "</role_strategy>",
    ].join("\n"),
    guard: [
      "<role_strategy>",
      "【守卫策略库】",
      "- 守护目标要结合神职可信度、狼刀倾向和不能连续守护限制。",
      "- 白天发言不要轻易暴露守护身份。",
      "</role_strategy>",
    ].join("\n"),
  };
  return strategies[role];
}

export function buildSpeakingOrderHint(room: StoredGameRoom, playerId: string): string {
  const projection = room.projection;
  if (!projection || (projection.phase !== "day_speak" && projection.phase !== "tie_speech")) {
    return "";
  }
  const order = room.speechQueue.length > 0 ? room.speechQueue : projection.alivePlayerIds;
  const index = order.indexOf(playerId);
  if (index < 0) return "<speaking_order>当前发言顺序未知。</speaking_order>";
  const total = order.length;
  const spoken = order.slice(0, index).map((id) => labelById(room.players, id)).join("、") || "无";
  const unspoken = order.slice(index + 1).map((id) => labelById(room.players, id)).join("、") || "无";
  const position =
    index === 0
      ? "你是第1个发言，不要引用前面不存在的发言。"
      : index === total - 1
        ? `你是第${index + 1}/${total}个发言，前面大多数信息已经出现，请总结矛盾并给出方向。`
        : `你是第${index + 1}/${total}个发言。`;
  return [
    "<speaking_order>",
    position,
    `已发言：${spoken}`,
    `未发言：${unspoken}`,
    "</speaking_order>",
  ].join("\n");
}

export function buildFocusAngle(room: StoredGameRoom, playerId: string): string {
  const projection = room.projection;
  if (!projection) return "";
  const self = room.players.find((player) => player.id === playerId);
  if (!self) return "";
  const hints: string[] = [];
  const seatToken = `${self.seatNo}号`;
  const mentionedBy = room.events
    .filter(
      (event) =>
        event.type === "speech_submitted" &&
        event.visibility === "public" &&
        event.actorId &&
        event.actorId !== playerId &&
        String(event.payload?.speech ?? "").includes(seatToken)
    )
    .map((event) => labelById(room.players, event.actorId!));
  if (mentionedBy.length > 0) {
    hints.push(`你被${[...new Set(mentionedBy)].join("、")}点名，优先回应或重新框定这个质疑。`);
  }
  const order = room.speechQueue.length > 0 ? room.speechQueue : projection.alivePlayerIds;
  const index = order.indexOf(playerId);
  if (index === 0) hints.push("你是首个发言者，直接给出一个初步判断，不要假装听过前置发言。");
  if (index >= 0 && index >= Math.max(1, Math.floor(order.length * 0.7))) {
    hints.push("你发言靠后，可以对比前面玩家的矛盾、站边和投票意向。");
  }
  if (room.events.some((event) => event.type === "vote_submitted")) {
    hints.push("结合已有票型，说明哪些玩家的投票关系值得关注。");
  }
  if (hints.length === 0) return "";
  return ["<focus_angle>", ...hints.slice(0, 2).map((hint) => `- ${hint}`), "</focus_angle>"].join("\n");
}

export function buildSpeechRules(language: CreateGameRequest["language"]): string {
  const languageLine = language === "zh-CN" ? "使用简体中文自然口语。" : "Use natural English table talk.";
  return [
    "<speech_rules>",
    languageLine,
    "必须调用 saySpeech 工具提交发言。",
    "发言控制在 2-5 句，给出至少一个具体怀疑、信任判断或归票方向。",
    "只基于当前局势发言，不要编造没有发生的发言、查验、投票或死亡。",
    "不要说自己是 AI，不要输出舞台动作。",
    "</speech_rules>",
  ].join("\n");
}

export function buildToolOnlyRules(toolNames: string[]): string {
  return [
    "<tool_rules>",
    `必须调用且只调用一个工具：${toolNames.join("、") || "无可用工具"}`,
    "行动阶段不要输出解释性文本作为结果。",
    "targetPlayerId 必须来自 <action_options>。",
    "</tool_rules>",
  ].join("\n");
}

function labelById(players: StoredPlayer[], playerId: string): string {
  const player = players.find((candidate) => candidate.id === playerId);
  return player ? `${player.displayName}` : playerId;
}
```

- [ ] **Step 4: Run strategy tests to verify they pass**

Run:

```bash
pnpm vitest run apps/api/src/services/agent-harness/strategy.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit strategy slice**

Run:

```bash
git add apps/api/src/services/agent-harness/strategy.ts apps/api/src/services/agent-harness/strategy.test.ts
git commit -m "feat: add agent harness strategy helpers"
```

---

### Task 3: Phase Builders And Dispatch

**Files:**
- Create: `apps/api/src/services/agent-harness/phases/day-speech.ts`
- Create: `apps/api/src/services/agent-harness/phases/day-vote.ts`
- Create: `apps/api/src/services/agent-harness/phases/night-wolf.ts`
- Create: `apps/api/src/services/agent-harness/phases/night-role.ts`
- Create: `apps/api/src/services/agent-harness/index.ts`
- Create: `apps/api/src/services/agent-harness/index.test.ts`

- [ ] **Step 1: Write the failing dispatch tests**

Create `apps/api/src/services/agent-harness/index.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { PlayerPrivateState } from "@werewolf/engine";
import type { StoredGameRoom } from "../game-service";
import { buildAgentPrompt } from "./index";

function roomForPhase(phase: NonNullable<StoredGameRoom["projection"]>["phase"]): {
  room: StoredGameRoom;
  playerState: PlayerPrivateState;
} {
  const playerState: PlayerPrivateState = {
    playerId: "p1",
    role: phase === "night_seer" ? "seer" : phase === "night_wolf" ? "werewolf" : "villager",
    team: phase === "night_wolf" ? "wolf" : "good",
    alive: true,
    knownTeammatePlayerIds: phase === "night_wolf" ? ["p2"] : [],
  };
  return {
    playerState,
    room: {
      id: "room_prompt",
      creatorUserId: "@creator:example.com",
      title: "Prompt",
      status: "active",
      targetPlayerCount: 3,
      language: "zh-CN",
      timing: { nightActionSeconds: 45, speechSeconds: 60, voteSeconds: 30, agentSpeechRate: 1.5 },
      createdFromMatrixRoomId: "!source:example.com",
      agentSourceMatrixRoomId: "!source:example.com",
      players: [
        { id: "p1", kind: "agent", agentId: "@p1:example.com", displayName: "一号", seatNo: 1, ready: true, onlineState: "online", leftAt: null },
        { id: "p2", kind: "agent", agentId: "@p2:example.com", displayName: "二号", seatNo: 2, ready: true, onlineState: "online", leftAt: null },
        { id: "p3", kind: "agent", agentId: "@p3:example.com", displayName: "三号", seatNo: 3, ready: true, onlineState: "online", leftAt: null },
      ],
      projection: {
        gameRoomId: "room_prompt",
        status: "active",
        phase,
        day: 1,
        deadlineAt: "2026-05-13T00:01:00.000Z",
        currentSpeakerPlayerId: phase === "day_speak" ? "p1" : null,
        winner: null,
        alivePlayerIds: ["p1", "p2", "p3"],
        version: 1,
      },
      privateStates: [playerState],
      events: [],
      pendingNightActions: [],
      pendingVotes: [],
      speechQueue: phase === "day_speak" ? ["p1", "p2", "p3"] : [],
      tiePlayerIds: phase === "tie_vote" ? ["p2", "p3"] : [],
    },
  };
}

describe("buildAgentPrompt", () => {
  it("builds separated day speech messages", () => {
    const { room, playerState } = roomForPhase("day_speak");
    const prompt = buildAgentPrompt({
      room,
      player: room.players[0]!,
      state: playerState,
      taskPrompt: "Speak now.",
      tools: { saySpeech: {} },
    });

    expect(prompt.messages).toEqual([
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user },
    ]);
    expect(prompt.system).toContain("白天发言");
    expect(prompt.system).toContain("必须调用 saySpeech");
    expect(prompt.user).toContain("<speaking_order>");
    expect(prompt.user).toContain("<focus_angle>");
  });

  it("builds tool-only day vote messages", () => {
    const { room, playerState } = roomForPhase("day_vote");
    const prompt = buildAgentPrompt({
      room,
      player: room.players[0]!,
      state: playerState,
      taskPrompt: "Vote now.",
      tools: { submitVote: {}, abstain: {} },
    });

    expect(prompt.system).toContain("白天投票");
    expect(prompt.system).toContain("必须调用且只调用一个工具");
    expect(prompt.user).toContain("<action_options>");
  });

  it("builds wolf night prompt with wolf strategy", () => {
    const { room, playerState } = roomForPhase("night_wolf");
    const prompt = buildAgentPrompt({
      room,
      player: room.players[0]!,
      state: playerState,
      taskPrompt: "Wolf team voting phase.",
      tools: { wolfKill: {}, passAction: {} },
    });

    expect(prompt.system).toContain("狼人夜间");
    expect(prompt.system).toContain("不要暴露狼队友");
    expect(prompt.user).toContain("<your_private_info>");
  });

  it("builds role night prompt for seer", () => {
    const { room, playerState } = roomForPhase("night_seer");
    const prompt = buildAgentPrompt({
      room,
      player: room.players[0]!,
      state: playerState,
      taskPrompt: "Inspect one player.",
      tools: { seerInspect: {}, passAction: {} },
    });

    expect(prompt.system).toContain("夜间角色行动");
    expect(prompt.system).toContain("预言家策略库");
    expect(prompt.user).toContain("<action_options>");
  });
});
```

- [ ] **Step 2: Run dispatch tests to verify they fail**

Run:

```bash
pnpm vitest run apps/api/src/services/agent-harness/index.test.ts
```

Expected: FAIL because phase builders and `index.ts` do not exist.

- [ ] **Step 3: Add day speech builder**

Create `apps/api/src/services/agent-harness/phases/day-speech.ts`:

```ts
import { buildHarnessContext } from "../context";
import {
  buildFocusAngle,
  buildRoleStrategy,
  buildSpeakingOrderHint,
  buildSpeechRules,
} from "../strategy";
import type { AgentPromptResult, BuildAgentPromptInput } from "../types";

export function buildDaySpeechPrompt(input: BuildAgentPromptInput): AgentPromptResult {
  const context = buildHarnessContext({
    room: input.room,
    player: input.player,
    state: input.state,
    maxSpeechHistory: 10,
  });
  const system = [
    "【白天发言】你正在参与一局狼人杀。",
    input.languageInstruction ?? "",
    buildRoleStrategy(input.state.role),
    buildSpeechRules(input.room.language),
  ].filter(Boolean).join("\n\n");
  const focusAngle =
    buildFocusAngle(input.room, input.player.id) ||
    "<focus_angle>\n- 给出你基于当前公开信息的独立判断。\n</focus_angle>";
  const user = [
    context.text,
    buildSpeakingOrderHint(input.room, input.player.id),
    focusAngle,
    "<current_task>",
    input.taskPrompt,
    "轮到你发言。调用 saySpeech，发言要有明确判断。",
    "</current_task>",
  ].filter(Boolean).join("\n\n");
  return finishPrompt(system, user);
}

function finishPrompt(system: string, user: string): AgentPromptResult {
  return {
    system,
    user,
    textPrompt: `${system}\n---\n${user}`,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  };
}
```

- [ ] **Step 4: Add day vote builder**

Create `apps/api/src/services/agent-harness/phases/day-vote.ts`:

```ts
import { buildHarnessContext } from "../context";
import { buildRoleStrategy, buildToolOnlyRules } from "../strategy";
import type { AgentPromptResult, BuildAgentPromptInput } from "../types";

export function buildDayVotePrompt(input: BuildAgentPromptInput): AgentPromptResult {
  const context = buildHarnessContext({
    room: input.room,
    player: input.player,
    state: input.state,
    maxSpeechHistory: 16,
  });
  const system = [
    "【白天投票】你需要基于公开发言和票型做出处决投票。",
    input.languageInstruction ?? "",
    buildRoleStrategy(input.state.role),
    buildToolOnlyRules(Object.keys(input.tools)),
    "投票要尽量与你白天发言一致；如果是平票重投，只能在允许目标中选择。",
  ].filter(Boolean).join("\n\n");
  const user = [
    context.text,
    "<current_task>",
    input.taskPrompt,
    "综合本日发言、历史票型和你的角色目标，调用 submitVote 或 abstain。",
    "</current_task>",
  ].filter(Boolean).join("\n\n");
  return finishPrompt(system, user);
}

function finishPrompt(system: string, user: string): AgentPromptResult {
  return {
    system,
    user,
    textPrompt: `${system}\n---\n${user}`,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  };
}
```

- [ ] **Step 5: Add wolf night builder**

Create `apps/api/src/services/agent-harness/phases/night-wolf.ts`:

```ts
import { buildHarnessContext } from "../context";
import { buildRoleStrategy, buildSpeechRules, buildToolOnlyRules } from "../strategy";
import type { AgentPromptResult, BuildAgentPromptInput } from "../types";

export function buildNightWolfPrompt(input: BuildAgentPromptInput): AgentPromptResult {
  const context = buildHarnessContext({
    room: input.room,
    player: input.player,
    state: input.state,
    maxSpeechHistory: 12,
  });
  const toolNames = Object.keys(input.tools);
  const isDiscussion = toolNames.includes("saySpeech");
  const system = [
    "【狼人夜间】你在狼人团队的私密阶段行动。",
    input.languageInstruction ?? "",
    buildRoleStrategy("werewolf"),
    isDiscussion ? buildSpeechRules(input.room.language) : buildToolOnlyRules(toolNames),
    "优先结合公开发言推断神职和强好人；协调队友，但不要机械跟随建议目标。",
  ].filter(Boolean).join("\n\n");
  const user = [
    context.text,
    "<current_task>",
    input.taskPrompt,
    isDiscussion
      ? "这是狼队私聊发言。调用 saySpeech，简短说明你建议的击杀方向和理由。"
      : "这是狼队击杀投票。调用 wolfKill 或 passAction。",
    "</current_task>",
  ].filter(Boolean).join("\n\n");
  return finishPrompt(system, user);
}

function finishPrompt(system: string, user: string): AgentPromptResult {
  return {
    system,
    user,
    textPrompt: `${system}\n---\n${user}`,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  };
}
```

- [ ] **Step 6: Add night role builder**

Create `apps/api/src/services/agent-harness/phases/night-role.ts`:

```ts
import { buildHarnessContext } from "../context";
import { buildRoleStrategy, buildToolOnlyRules } from "../strategy";
import type { AgentPromptResult, BuildAgentPromptInput } from "../types";

export function buildNightRolePrompt(input: BuildAgentPromptInput): AgentPromptResult {
  const context = buildHarnessContext({
    room: input.room,
    player: input.player,
    state: input.state,
    maxSpeechHistory: 12,
  });
  const system = [
    "【夜间角色行动】你需要根据角色信息选择夜间行动。",
    input.languageInstruction ?? "",
    buildRoleStrategy(input.state.role),
    buildToolOnlyRules(Object.keys(input.tools)),
    "优先使用 <action_options> 中的合法 targetPlayerId；无法形成有效行动时调用 passAction。",
  ].filter(Boolean).join("\n\n");
  const user = [
    context.text,
    "<current_task>",
    input.taskPrompt,
    "只通过工具完成行动。",
    "</current_task>",
  ].filter(Boolean).join("\n\n");
  return finishPrompt(system, user);
}

function finishPrompt(system: string, user: string): AgentPromptResult {
  return {
    system,
    user,
    textPrompt: `${system}\n---\n${user}`,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  };
}
```

- [ ] **Step 7: Add phase dispatch**

Create `apps/api/src/services/agent-harness/index.ts`:

```ts
import { buildDaySpeechPrompt } from "./phases/day-speech";
import { buildDayVotePrompt } from "./phases/day-vote";
import { buildNightWolfPrompt } from "./phases/night-wolf";
import { buildNightRolePrompt } from "./phases/night-role";
import type { AgentPromptResult, BuildAgentPromptInput } from "./types";

export type {
  AgentPromptMessage,
  AgentPromptPart,
  AgentPromptResult,
  AgentTurnKind,
  BuildAgentPromptInput,
} from "./types";

export function buildAgentPrompt(input: BuildAgentPromptInput): AgentPromptResult {
  const phase = input.room.projection?.phase;
  if (phase === "day_speak" || phase === "tie_speech") {
    return buildDaySpeechPrompt(input);
  }
  if (phase === "day_vote" || phase === "tie_vote") {
    return buildDayVotePrompt(input);
  }
  if (phase === "night_wolf") {
    return buildNightWolfPrompt(input);
  }
  return buildNightRolePrompt(input);
}
```

- [ ] **Step 8: Run dispatch tests to verify they pass**

Run:

```bash
pnpm vitest run apps/api/src/services/agent-harness/index.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 9: Run all harness tests**

Run:

```bash
pnpm vitest run apps/api/src/services/agent-harness/context.test.ts apps/api/src/services/agent-harness/strategy.test.ts apps/api/src/services/agent-harness/index.test.ts
```

Expected: PASS, 12 tests.

- [ ] **Step 10: Commit phase builder slice**

Run:

```bash
git add apps/api/src/services/agent-harness
git commit -m "feat: add phase-aware agent prompt builders"
```

---

### Task 4: Agent Turn Multi-Message Support

**Files:**
- Modify: `apps/api/src/services/game-service.ts`
- Modify: `apps/api/src/services/agent-turn.ts`
- Create: `apps/api/src/services/agent-turn.test.ts`

- [ ] **Step 1: Write the failing agent-turn tests**

Create `apps/api/src/services/agent-turn.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RuntimeAgentTurnInput } from "./game-service";

const generateWithAgent = vi.fn();

vi.mock("@werewolf/agent-client", () => ({
  generateWithAgent,
  buildAgentTurnTools: vi.fn(() => ({})),
}));

describe("buildRunAgentTurn", () => {
  beforeEach(() => {
    vi.resetModules();
    generateWithAgent.mockReset();
    process.env.UNSEAL_AGENT_API_KEY = "test-key";
  });

  it("passes multi-message prompts when present", async () => {
    generateWithAgent.mockResolvedValue({
      text: "ok",
      toolCalls: [{ toolName: "saySpeech", input: { speech: "hello" } }],
    });
    const { buildRunAgentTurn } = await import("./agent-turn");
    const run = buildRunAgentTurn();
    const input: RuntimeAgentTurnInput = {
      agentId: "@agent:example.com",
      playerId: "p1",
      displayName: "一号",
      role: "villager",
      phase: "day_speak",
      prompt: "fallback prompt",
      messages: [
        { role: "system", content: "system prompt" },
        { role: "user", content: "user prompt" },
      ],
      tools: { saySpeech: {} },
    };

    await run(input);

    expect(generateWithAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          messages: input.messages,
        }),
      })
    );
  });

  it("keeps the single-user-message fallback", async () => {
    generateWithAgent.mockResolvedValue({ text: "ok", toolCalls: [] });
    const { buildRunAgentTurn } = await import("./agent-turn");
    const run = buildRunAgentTurn();

    await run({
      agentId: "@agent:example.com",
      playerId: "p1",
      displayName: "一号",
      role: "villager",
      phase: "day_speak",
      prompt: "fallback prompt",
      tools: { saySpeech: {} },
    });

    expect(generateWithAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          messages: [{ role: "user", content: "fallback prompt" }],
        }),
      })
    );
  });
});
```

- [ ] **Step 2: Run agent-turn tests to verify they fail**

Run:

```bash
pnpm vitest run apps/api/src/services/agent-turn.test.ts
```

Expected: FAIL with a TypeScript or assertion failure because `RuntimeAgentTurnInput` does not have `messages` and `agent-turn.ts` ignores it.

- [ ] **Step 3: Extend RuntimeAgentTurnInput**

Modify `apps/api/src/services/game-service.ts` near `RuntimeAgentTurnInput`:

```ts
export interface RuntimeAgentTurnInput {
  agentId: string;
  playerId: string;
  displayName: string;
  role: Role;
  phase: GamePhase;
  prompt: string;
  messages?: Array<{ role: "system" | "user"; content: string }>;
  tools: Record<string, unknown>;
}
```

- [ ] **Step 4: Prefer messages in agent-turn**

Modify `apps/api/src/services/agent-turn.ts` inside the request body:

```ts
body: {
  messages: input.messages ?? [{ role: "user", content: input.prompt }],
  temperature: 0.2,
  maxOutputTokens: 256,
  tools:
    Object.keys(input.tools).length > 0
      ? input.tools
      : buildAgentTurnTools({
          phase: input.phase,
          role: input.role,
          alivePlayerIds: [],
          selfPlayerId: input.playerId,
        }),
},
```

- [ ] **Step 5: Run agent-turn tests to verify they pass**

Run:

```bash
pnpm vitest run apps/api/src/services/agent-turn.test.ts
```

Expected: PASS, 2 tests.

- [ ] **Step 6: Commit multi-message support**

Run:

```bash
git add apps/api/src/services/game-service.ts apps/api/src/services/agent-turn.ts apps/api/src/services/agent-turn.test.ts
git commit -m "feat: support multi-message agent prompts"
```

---

### Task 5: Integrate Harness In Game Service

**Files:**
- Modify: `apps/api/src/services/game-service.ts`
- Modify: `apps/api/src/services/game-service.test.ts`

- [ ] **Step 1: Write the failing game-service integration test**

Append this test inside the existing `describe("InMemoryGameService rules", () => { ... })` block in `apps/api/src/services/game-service.test.ts` near the other agent speech tests:

```ts
  it("sends phase-aware harness messages to agent turns", async () => {
    const { games, gameRoomId } = createStartedServiceGame();
    const room = games.snapshot(gameRoomId);
    const agentSpeaker = room.players[0]!;
    const humanSpeaker = room.players[1]!;
    const capturedInputs: RuntimeAgentTurnInput[] = [];

    agentSpeaker.kind = "agent";
    agentSpeaker.agentId = "@agent-speaker:example.com";
    room.projection = {
      ...room.projection!,
      phase: "day_speak",
      currentSpeakerPlayerId: agentSpeaker.id,
      deadlineAt: new Date(Date.now() + 60_000).toISOString(),
    };
    room.speechQueue = [agentSpeaker.id, humanSpeaker.id];

    await games.advanceGame(gameRoomId, async (input) => {
      capturedInputs.push(input);
      return {
        text: "我先给一个明确判断，2号目前偏好。",
        toolName: "saySpeech",
        input: { speech: "我先给一个明确判断，2号目前偏好。" },
      };
    });

    expect(capturedInputs).toHaveLength(1);
    expect(capturedInputs[0]!.messages).toEqual([
      { role: "system", content: expect.stringContaining("白天发言") },
      { role: "user", content: expect.stringContaining("<speaking_order>") },
    ]);
    expect(capturedInputs[0]!.messages![0]!.content).toContain("必须调用 saySpeech");
    expect(capturedInputs[0]!.messages![1]!.content).toContain("<focus_angle>");
    expect(capturedInputs[0]!.prompt).toContain("白天发言");
  });
```

- [ ] **Step 2: Run the integration test to verify it fails**

Run:

```bash
pnpm vitest run apps/api/src/services/game-service.test.ts -t "sends phase-aware harness messages"
```

Expected: FAIL because `messages` is `undefined`.

- [ ] **Step 3: Import the harness and remove direct context import**

Modify the top of `apps/api/src/services/game-service.ts`:

```ts
import { buildAgentTurnTools } from "@werewolf/agent-client";
import { buildAgentPrompt } from "./agent-harness";
```

Remove:

```ts
import { buildAgentContext } from "./agent-context";
```

- [ ] **Step 4: Build harness messages inside runAgentToolTurn**

Replace this block in `runAgentToolTurn`:

```ts
const context = buildAgentContext(room, player.id, state, {
  maxSpeechHistory: 10,
  includeVotes: true,
});
const fullPrompt = `${context}\n---\n${input.prompt}`;
```

with:

```ts
const tools =
  "tools" in input && input.tools
    ? input.tools
    : buildAgentTurnTools({
        phase: room.projection.phase,
        role: state.role,
        alivePlayerIds: room.projection.alivePlayerIds,
        selfPlayerId: player.id,
      });
const prompt = buildAgentPrompt({
  room,
  player,
  state,
  taskPrompt: input.prompt,
  tools,
  languageInstruction: this.languageInstruction(room),
});
```

Then replace the `runAgentTurn` call fields:

```ts
prompt: fullPrompt,
tools:
  "tools" in input && input.tools
    ? input.tools
    : buildAgentTurnTools({
        phase: room.projection.phase,
        role: state.role,
        alivePlayerIds: room.projection.alivePlayerIds,
        selfPlayerId: player.id,
      }),
```

with:

```ts
prompt: prompt.textPrompt,
messages: prompt.messages,
tools,
```

- [ ] **Step 5: Run the integration test to verify it passes**

Run:

```bash
pnpm vitest run apps/api/src/services/game-service.test.ts -t "sends phase-aware harness messages"
```

Expected: PASS, 1 test.

- [ ] **Step 6: Run related existing tests**

Run:

```bash
pnpm vitest run apps/api/src/services/agent-context.test.ts apps/api/src/services/game-service.test.ts -t "agent|speech|vote|context|harness"
```

Expected: PASS for selected agent, speech, vote, context, and harness-related tests. If the `-t` pattern matches more tests than expected, read failures and fix only regressions caused by the harness integration.

- [ ] **Step 7: Commit integration slice**

Run:

```bash
git add apps/api/src/services/game-service.ts apps/api/src/services/game-service.test.ts
git commit -m "feat: use agent prompt harness in game service"
```

---

### Task 6: Full Verification And Cleanup

**Files:**
- Verify: all files from Tasks 1-5

- [ ] **Step 1: Run harness tests**

Run:

```bash
pnpm vitest run apps/api/src/services/agent-harness/context.test.ts apps/api/src/services/agent-harness/strategy.test.ts apps/api/src/services/agent-harness/index.test.ts
```

Expected: PASS, 12 tests.

- [ ] **Step 2: Run agent-turn tests**

Run:

```bash
pnpm vitest run apps/api/src/services/agent-turn.test.ts
```

Expected: PASS, 2 tests.

- [ ] **Step 3: Run API service tests touched by the harness**

Run:

```bash
pnpm vitest run apps/api/src/services/agent-context.test.ts apps/api/src/services/game-service.test.ts
```

Expected: PASS for both files.

- [ ] **Step 4: Run API typecheck**

Run:

```bash
pnpm --filter @werewolf/api typecheck
```

Expected: exit 0.

- [ ] **Step 5: Run full test suite if time allows**

Run:

```bash
pnpm test
```

Expected: exit 0. If unrelated pre-existing failures appear from dirty files outside this plan, capture the failing file names and do not modify unrelated files.

- [ ] **Step 6: Inspect staged and unstaged work**

Run:

```bash
git status --short
git diff -- apps/api/src/services/agent-harness apps/api/src/services/agent-turn.ts apps/api/src/services/agent-turn.test.ts apps/api/src/services/game-service.ts apps/api/src/services/game-service.test.ts
```

Expected: only planned harness and agent-call files changed by this implementation. Existing unrelated dirty files may still be present.

- [ ] **Step 7: Final commit if earlier task commits were skipped**

Run this only if Tasks 1-5 were intentionally batched without commits:

```bash
git add apps/api/src/services/agent-harness apps/api/src/services/agent-turn.ts apps/api/src/services/agent-turn.test.ts apps/api/src/services/game-service.ts apps/api/src/services/game-service.test.ts
git commit -m "feat: add phase-aware agent prompt harness"
```

Expected: commit succeeds with only planned files.

---

## Self-Review

Spec coverage:

- Phase-aware generation: Tasks 3 and 5.
- Structured context sections: Task 1.
- Role-private info and wolf visibility: Task 1.
- Speaking order, focus angle, and speech rules: Task 2 and Task 3.
- Multi-message LLM calls: Task 4.
- Game-service integration: Task 5.
- Verification: Task 6.

Placeholder scan:

- This plan contains concrete file paths, commands, expected results, and code blocks for every code-changing step.
- The implementation deliberately excludes long-term summary generation because the spec names it as a non-goal.

Type consistency:

- `AgentPromptMessage`, `AgentPromptResult`, `BuildAgentPromptInput`, and `RuntimeAgentTurnInput.messages` are introduced before use.
- `buildAgentPrompt` returns `messages`, `system`, `user`, and `textPrompt`, matching the spec.
- `game-service.ts` passes `prompt.textPrompt`, `prompt.messages`, and `tools`, matching the updated runtime input contract.
