# Werewolf Web Game Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first playable independent Werewolf Web game runtime with Matrix-token API auth, relational room/player state, append-only game events, deterministic runtime progression, precise agent tools, and a Web client MVP.

**Architecture:** The repo is a TypeScript pnpm monorepo with separated API, Web, runtime worker, shared contracts, DB, agent client, and pure Werewolf engine packages. The API owns Matrix auth, room setup, player commands, and read models; the runtime worker is the only GM and advances games from events and projections. AI players run through a lightweight tool harness whose LLM calls are forwarded to Unseal agent `llm/generate`.

**Tech Stack:** TypeScript, pnpm workspaces, Hono, React, TanStack Router, Vite, Vitest, Zod, Drizzle ORM, PostgreSQL, SSE.

---

## Scope

This plan builds a vertical MVP, not every advanced product polish item. The target is one complete smoke-test game with humans and mockable AI players:

- Matrix bearer auth path and identity upsert.
- Create/edit/join/leave/start/pause/resume/end APIs.
- 6-12 player dynamic role assignment.
- Event store and projection primitives.
- Runtime tick for start, night action windows, day speech, day vote, resolution, and game end.
- Precise tool exposure for AI turns with Unseal generate routing.
- Web screens for create, waiting room, game table, private panel, and post-game.

The plan intentionally excludes sheriff, last words, voice rooms, Matrix-hosted gameplay, and advanced replay analytics.

## File Structure

Create this structure:

```text
apps/
  api/
    src/app.ts
    src/server.ts
    src/context/auth.ts
    src/routes/games.ts
    src/routes/events.ts
    src/services/game-service.ts
    src/services/perspective-service.ts
    src/services/sse-broker.ts
    src/test-utils.ts
  runtime-worker/
    src/index.ts
    src/runtime/tick.ts
    src/runtime/ai-turn.ts
  web/
    index.html
    src/main.tsx
    src/api/client.ts
    src/routes/__root.tsx
    src/routes/create.tsx
    src/routes/game.$gameRoomId.tsx
    src/components/WaitingRoom.tsx
    src/components/GameTable.tsx
    src/components/PrivatePanel.tsx
packages/
  shared/
    src/domain.ts
    src/events.ts
    src/dto.ts
    src/errors.ts
    src/index.ts
  werewolf-engine/
    src/roles.ts
    src/state.ts
    src/events.ts
    src/commands.ts
    src/projection.ts
    src/start.ts
    src/actions.ts
    src/night.ts
    src/day.ts
    src/tick.ts
    src/index.ts
  db/
    src/schema.ts
    src/client.ts
    src/repositories/users.ts
    src/repositories/rooms.ts
    src/repositories/events.ts
    src/repositories/projections.ts
    src/test-db.ts
  agent-client/
    src/synapse-agents.ts
    src/unseal-llm.ts
    src/harness.ts
    src/index.ts
```

Keep files focused. Engine files must not import from DB, Hono, React, Synapse, or Unseal clients.

---

### Task 1: Monorepo Scaffold

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `apps/api/package.json`
- Create: `apps/runtime-worker/package.json`
- Create: `apps/web/package.json`
- Create: `packages/shared/package.json`
- Create: `packages/werewolf-engine/package.json`
- Create: `packages/db/package.json`
- Create: `packages/agent-client/package.json`
- Create: `packages/shared/src/index.ts`
- Create: `packages/werewolf-engine/src/index.ts`
- Create: `packages/db/src/client.ts`
- Create: `packages/agent-client/src/index.ts`

- [ ] **Step 1: Create the root workspace files**

Write `package.json`:

```json
{
  "name": "@werewolf/root",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@10.11.0",
  "scripts": {
    "build": "pnpm -r build",
    "dev": "pnpm --parallel --filter @werewolf/api --filter @werewolf/runtime-worker --filter @werewolf/web dev",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "pnpm -r typecheck"
  },
  "devDependencies": {
    "@types/node": "^22.15.0",
    "@vitejs/plugin-react": "^5.0.0",
    "typescript": "^5.9.0",
    "vite": "^7.0.0",
    "vitest": "^4.0.0"
  }
}
```

Write `pnpm-workspace.yaml`:

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

Write `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

Write `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["apps/**/*.test.ts", "packages/**/*.test.ts"],
  },
});
```

Write `.gitignore`:

```gitignore
node_modules
dist
.turbo
.vite
.env
.env.*
coverage
```

- [ ] **Step 2: Create package manifests**

Write `packages/shared/package.json`:

```json
{
  "name": "@werewolf/shared",
  "type": "module",
  "private": true,
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "zod": "^4.1.0"
  },
  "devDependencies": {
    "typescript": "^5.9.0"
  }
}
```

Write `packages/werewolf-engine/package.json`:

```json
{
  "name": "@werewolf/engine",
  "type": "module",
  "private": true,
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@werewolf/shared": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.9.0",
    "vitest": "^4.0.0"
  }
}
```

Write `packages/db/package.json`:

```json
{
  "name": "@werewolf/db",
  "type": "module",
  "private": true,
  "exports": { ".": "./src/client.ts" },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@werewolf/shared": "workspace:*",
    "drizzle-orm": "^0.45.0",
    "postgres": "^3.4.7",
    "zod": "^4.1.0"
  },
  "devDependencies": {
    "typescript": "^5.9.0",
    "vitest": "^4.0.0"
  }
}
```

Write `packages/agent-client/package.json`:

```json
{
  "name": "@werewolf/agent-client",
  "type": "module",
  "private": true,
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@werewolf/shared": "workspace:*",
    "zod": "^4.1.0"
  },
  "devDependencies": {
    "typescript": "^5.9.0",
    "vitest": "^4.0.0"
  }
}
```

Write `apps/api/package.json`:

```json
{
  "name": "@werewolf/api",
  "type": "module",
  "private": true,
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "start": "node dist/server.js",
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@hono/node-server": "^1.19.0",
    "@werewolf/agent-client": "workspace:*",
    "@werewolf/db": "workspace:*",
    "@werewolf/engine": "workspace:*",
    "@werewolf/shared": "workspace:*",
    "hono": "^4.10.0",
    "zod": "^4.1.0"
  },
  "devDependencies": {
    "tsx": "^4.21.0",
    "typescript": "^5.9.0",
    "vitest": "^4.0.0"
  }
}
```

Write `apps/runtime-worker/package.json`:

```json
{
  "name": "@werewolf/runtime-worker",
  "type": "module",
  "private": true,
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js",
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@werewolf/agent-client": "workspace:*",
    "@werewolf/db": "workspace:*",
    "@werewolf/engine": "workspace:*",
    "@werewolf/shared": "workspace:*"
  },
  "devDependencies": {
    "tsx": "^4.21.0",
    "typescript": "^5.9.0",
    "vitest": "^4.0.0"
  }
}
```

Write `apps/web/package.json`:

```json
{
  "name": "@werewolf/web",
  "type": "module",
  "private": true,
  "scripts": {
    "dev": "vite --host 0.0.0.0",
    "build": "vite build",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@tanstack/react-router": "^1.140.0",
    "@vitejs/plugin-react": "^5.0.0",
    "@werewolf/shared": "workspace:*",
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    "vite": "^7.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.2.0",
    "@types/react-dom": "^19.2.0",
    "typescript": "^5.9.0"
  }
}
```

- [ ] **Step 3: Create package TypeScript configs and smoke exports**

For each package and app, create a `tsconfig.json` like this, changing only `include` if needed:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "declarationMap": true
  },
  "include": ["src"]
}
```

For `apps/web/tsconfig.json`, use:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "noEmit": true
  },
  "include": ["src"]
}
```

Write `packages/shared/src/index.ts`:

```ts
export const sharedPackageReady = true;
```

Write `packages/werewolf-engine/src/index.ts`:

```ts
export const enginePackageReady = true;
```

Write `packages/db/src/client.ts`:

```ts
export const dbPackageReady = true;
```

Write `packages/agent-client/src/index.ts`:

```ts
export const agentClientPackageReady = true;
```

- [ ] **Step 4: Install dependencies**

Run:

```bash
pnpm install
```

Expected: command exits 0 and creates `pnpm-lock.yaml`.

- [ ] **Step 5: Verify scaffold**

Run:

```bash
pnpm typecheck
pnpm test
```

Expected: both commands exit 0. `pnpm test` may report no tests found only if Vitest exits 0; if it exits non-zero because no tests exist, add this file.

Create `packages/shared/src/smoke.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { sharedPackageReady } from ".";

describe("shared package", () => {
  it("loads", () => {
    expect(sharedPackageReady).toBe(true);
  });
});
```

Run `pnpm test` again. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "chore: scaffold werewolf monorepo"
```

---

### Task 2: Shared Domain Contracts

**Files:**
- Create: `packages/shared/src/domain.ts`
- Create: `packages/shared/src/events.ts`
- Create: `packages/shared/src/dto.ts`
- Create: `packages/shared/src/errors.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/domain.test.ts`
- Test: `packages/shared/src/events.test.ts`

- [ ] **Step 1: Write failing domain tests**

Create `packages/shared/src/domain.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  gamePhaseSchema,
  playerKindSchema,
  roleSchema,
  roomStatusSchema,
  teamForRole,
} from "./domain";

describe("domain contracts", () => {
  it("accepts first-version roles and maps teams", () => {
    expect(roleSchema.parse("werewolf")).toBe("werewolf");
    expect(roleSchema.parse("seer")).toBe("seer");
    expect(roleSchema.parse("witch")).toBe("witch");
    expect(roleSchema.parse("guard")).toBe("guard");
    expect(roleSchema.parse("villager")).toBe("villager");
    expect(teamForRole("werewolf")).toBe("wolf");
    expect(teamForRole("seer")).toBe("good");
  });

  it("accepts room status, player kind, and runtime phases", () => {
    expect(roomStatusSchema.parse("waiting")).toBe("waiting");
    expect(playerKindSchema.parse("agent")).toBe("agent");
    expect(gamePhaseSchema.parse("night_guard")).toBe("night_guard");
    expect(gamePhaseSchema.parse("day_vote")).toBe("day_vote");
  });
});
```

Create `packages/shared/src/events.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { gameEventSchema, visibilitySchema } from "./events";

describe("game event contracts", () => {
  it("validates public events", () => {
    const event = gameEventSchema.parse({
      id: "evt_1",
      gameRoomId: "game_1",
      seq: 1,
      type: "phase_started",
      visibility: "public",
      actorId: "runtime",
      payload: { phase: "night_guard", day: 1 },
      createdAt: "2026-05-09T10:00:00.000Z",
    });
    expect(event.seq).toBe(1);
    expect(visibilitySchema.parse("private:team:wolf")).toBe("private:team:wolf");
  });

  it("rejects user lifecycle events from the game timeline", () => {
    expect(() =>
      gameEventSchema.parse({
        id: "evt_2",
        gameRoomId: "game_1",
        seq: 2,
        type: "player_joined",
        visibility: "public",
        payload: {},
        createdAt: "2026-05-09T10:00:01.000Z",
      })
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
pnpm test packages/shared/src/domain.test.ts packages/shared/src/events.test.ts
```

Expected: FAIL because `domain.ts` and `events.ts` do not exist.

- [ ] **Step 3: Implement domain contracts**

Create `packages/shared/src/domain.ts`:

```ts
import { z } from "zod";

export const roleSchema = z.enum([
  "werewolf",
  "seer",
  "witch",
  "guard",
  "villager",
]);
export type Role = z.infer<typeof roleSchema>;

export const teamSchema = z.enum(["wolf", "good"]);
export type Team = z.infer<typeof teamSchema>;

export const roomStatusSchema = z.enum([
  "created",
  "waiting",
  "active",
  "paused",
  "ended",
]);
export type RoomStatus = z.infer<typeof roomStatusSchema>;

export const playerKindSchema = z.enum(["user", "agent"]);
export type PlayerKind = z.infer<typeof playerKindSchema>;

export const gamePhaseSchema = z.enum([
  "role_assignment",
  "night_guard",
  "night_wolf",
  "night_witch_heal",
  "night_witch_poison",
  "night_seer",
  "night_resolution",
  "day_speak",
  "day_vote",
  "day_resolution",
  "post_game",
]);
export type GamePhase = z.infer<typeof gamePhaseSchema>;

export function teamForRole(role: Role): Team {
  return role === "werewolf" ? "wolf" : "good";
}
```

Create `packages/shared/src/events.ts`:

```ts
import { z } from "zod";

export const eventTypeSchema = z.enum([
  "game_started",
  "roles_assigned",
  "phase_started",
  "turn_started",
  "speech_submitted",
  "night_action_submitted",
  "vote_submitted",
  "phase_closed",
  "night_resolved",
  "player_eliminated",
  "game_ended",
  "agent_turn_started",
  "agent_llm_requested",
  "agent_llm_completed",
  "agent_turn_failed",
  "post_game_summary_created",
]);
export type GameEventType = z.infer<typeof eventTypeSchema>;

export const visibilitySchema = z.union([
  z.literal("public"),
  z.literal("runtime"),
  z.string().regex(/^private:user:[A-Za-z0-9_.:-]+$/),
  z.literal("private:team:wolf"),
]);
export type EventVisibility = z.infer<typeof visibilitySchema>;

export const gameEventSchema = z.object({
  id: z.string().min(1),
  gameRoomId: z.string().min(1),
  seq: z.number().int().positive(),
  type: eventTypeSchema,
  visibility: visibilitySchema,
  actorId: z.string().min(1).optional(),
  subjectId: z.string().min(1).optional(),
  payload: z.record(z.string(), z.unknown()),
  createdAt: z.string().datetime(),
});
export type GameEvent = z.infer<typeof gameEventSchema>;
```

Create `packages/shared/src/errors.ts`:

```ts
export const errorCodes = {
  Unauthorized: "unauthorized",
  Forbidden: "forbidden",
  NotFound: "not_found",
  Conflict: "conflict",
  InvalidPhase: "invalid_phase",
  InvalidAction: "invalid_action",
  MatrixUnavailable: "matrix_unavailable",
  AgentUnavailable: "agent_unavailable",
} as const;

export type ErrorCode = (typeof errorCodes)[keyof typeof errorCodes];

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly status: number
  ) {
    super(message);
  }
}
```

Create `packages/shared/src/dto.ts`:

```ts
import { z } from "zod";
import { playerKindSchema, roomStatusSchema } from "./domain";

export const createGameRequestSchema = z.object({
  sourceMatrixRoomId: z.string().min(1),
  title: z.string().min(1).max(80),
  targetPlayerCount: z.number().int().min(6).max(12),
  timing: z.object({
    nightActionSeconds: z.number().int().min(10).max(300).default(45),
    speechSeconds: z.number().int().min(10).max(300).default(60),
    voteSeconds: z.number().int().min(10).max(300).default(30),
  }),
  allowedSourceMatrixRoomIds: z.array(z.string().min(1)).default([]),
  agentSourceMatrixRoomId: z.string().min(1).optional(),
});
export type CreateGameRequest = z.infer<typeof createGameRequestSchema>;

export const gameRoomSnapshotSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  status: roomStatusSchema,
  targetPlayerCount: z.number().int().min(6).max(12),
  sourceMatrixRoomId: z.string().optional(),
  agentSourceMatrixRoomId: z.string(),
  currentUserId: z.string(),
  creatorUserId: z.string(),
  players: z.array(
    z.object({
      id: z.string(),
      kind: playerKindSchema,
      displayName: z.string(),
      seatNo: z.number().int().positive(),
      onlineState: z.enum(["online", "offline"]),
      ready: z.boolean(),
      alive: z.boolean().optional(),
    })
  ),
  projection: z.record(z.string(), z.unknown()),
});
export type GameRoomSnapshot = z.infer<typeof gameRoomSnapshotSchema>;
```

Modify `packages/shared/src/index.ts`:

```ts
export * from "./domain";
export * from "./dto";
export * from "./errors";
export * from "./events";
```

- [ ] **Step 4: Run tests**

Run:

```bash
pnpm test packages/shared/src/domain.test.ts packages/shared/src/events.test.ts
pnpm --filter @werewolf/shared typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared
git commit -m "feat: add shared game contracts"
```

---

### Task 3: Role Distribution And Game Start Engine

**Files:**
- Create: `packages/werewolf-engine/src/roles.ts`
- Create: `packages/werewolf-engine/src/state.ts`
- Create: `packages/werewolf-engine/src/start.ts`
- Modify: `packages/werewolf-engine/src/index.ts`
- Test: `packages/werewolf-engine/src/roles.test.ts`
- Test: `packages/werewolf-engine/src/start.test.ts`

- [ ] **Step 1: Write failing role distribution tests**

Create `packages/werewolf-engine/src/roles.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildRolePlan } from "./roles";

describe("role distribution", () => {
  it.each([
    [6, { werewolf: 1, seer: 1, witch: 1, guard: 1, villager: 2 }],
    [7, { werewolf: 2, seer: 1, witch: 1, guard: 1, villager: 2 }],
    [9, { werewolf: 2, seer: 1, witch: 1, guard: 1, villager: 4 }],
    [10, { werewolf: 3, seer: 1, witch: 1, guard: 1, villager: 4 }],
    [12, { werewolf: 3, seer: 1, witch: 1, guard: 1, villager: 6 }],
  ])("creates the existing v2 distribution for %s players", (count, expected) => {
    const roles = buildRolePlan(count);
    const actual = Object.fromEntries(
      ["werewolf", "seer", "witch", "guard", "villager"].map((role) => [
        role,
        roles.filter((item) => item === role).length,
      ])
    );
    expect(actual).toEqual(expected);
  });

  it("rejects unsupported player counts", () => {
    expect(() => buildRolePlan(5)).toThrow("Werewolf supports 6 to 12 players");
    expect(() => buildRolePlan(13)).toThrow("Werewolf supports 6 to 12 players");
  });
});
```

Create `packages/werewolf-engine/src/start.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { startGame } from "./start";

const seats = Array.from({ length: 6 }, (_, index) => ({
  playerId: `p${index + 1}`,
  displayName: `Player ${index + 1}`,
  seatNo: index + 1,
  kind: index === 5 ? "agent" as const : "user" as const,
}));

describe("startGame", () => {
  it("snapshots seats, assigns private roles, and starts night guard", () => {
    const result = startGame({
      gameRoomId: "game_1",
      targetPlayerCount: 6,
      seats,
      now: new Date("2026-05-09T10:00:00.000Z"),
      shuffleSeed: "fixed",
      timing: { nightActionSeconds: 45, speechSeconds: 60, voteSeconds: 30 },
    });

    expect(result.projection.phase).toBe("night_guard");
    expect(result.projection.day).toBe(1);
    expect(result.privateStates).toHaveLength(6);
    expect(result.events.map((event) => event.type)).toEqual([
      "game_started",
      "roles_assigned",
      "phase_started",
    ]);
    expect(result.events[1]?.visibility).toBe("runtime");
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
pnpm test packages/werewolf-engine/src/roles.test.ts packages/werewolf-engine/src/start.test.ts
```

Expected: FAIL because engine files are missing.

- [ ] **Step 3: Implement role plan and state types**

Create `packages/werewolf-engine/src/state.ts`:

```ts
import type { GamePhase, PlayerKind, Role, Team } from "@werewolf/shared";

export interface SeatSnapshot {
  playerId: string;
  displayName: string;
  seatNo: number;
  kind: PlayerKind;
}

export interface AssignedPlayer extends SeatSnapshot {
  role: Role;
  team: Team;
  alive: boolean;
  eliminated: boolean;
}

export interface TimingConfig {
  nightActionSeconds: number;
  speechSeconds: number;
  voteSeconds: number;
}

export interface RoomProjection {
  gameRoomId: string;
  status: "active" | "paused" | "ended";
  phase: GamePhase;
  day: number;
  deadlineAt: string | null;
  currentSpeakerPlayerId: string | null;
  winner: "wolf" | "good" | null;
  alivePlayerIds: string[];
  version: number;
}

export interface PlayerPrivateState {
  playerId: string;
  role: Role;
  team: Team;
  alive: boolean;
  knownTeammatePlayerIds: string[];
  witchItems?: {
    healAvailable: boolean;
    poisonAvailable: boolean;
  };
}
```

Create `packages/werewolf-engine/src/roles.ts`:

```ts
import { type Role, teamForRole } from "@werewolf/shared";
import type { AssignedPlayer, SeatSnapshot } from "./state";

export function buildRolePlan(playerCount: number): Role[] {
  if (playerCount < 6 || playerCount > 12) {
    throw new Error("Werewolf supports 6 to 12 players");
  }
  const wolfCount = playerCount >= 10 ? 3 : playerCount >= 7 ? 2 : 1;
  const roles: Role[] = [];
  for (let index = 0; index < wolfCount; index += 1) {
    roles.push("werewolf");
  }
  roles.push("seer", "witch", "guard");
  while (roles.length < playerCount) {
    roles.push("villager");
  }
  return roles;
}

function seededSortKey(seed: string, value: string): string {
  return `${seed}:${value}`;
}

export function assignRoles(
  seats: SeatSnapshot[],
  shuffleSeed: string
): AssignedPlayer[] {
  const roles = buildRolePlan(seats.length);
  const orderedSeats = [...seats].sort((a, b) =>
    seededSortKey(shuffleSeed, a.playerId).localeCompare(
      seededSortKey(shuffleSeed, b.playerId)
    )
  );
  const roleByPlayerId = new Map<string, Role>();
  for (const [index, seat] of orderedSeats.entries()) {
    const role = roles[index];
    if (!role) {
      throw new Error("role plan missing role");
    }
    roleByPlayerId.set(seat.playerId, role);
  }
  return seats.map((seat) => {
    const role = roleByPlayerId.get(seat.playerId);
    if (!role) {
      throw new Error(`missing role for ${seat.playerId}`);
    }
    return {
      ...seat,
      role,
      team: teamForRole(role),
      alive: true,
      eliminated: false,
    };
  });
}
```

- [ ] **Step 4: Implement `startGame`**

Create `packages/werewolf-engine/src/start.ts`:

```ts
import type { GameEvent } from "@werewolf/shared";
import { assignRoles } from "./roles";
import type {
  PlayerPrivateState,
  RoomProjection,
  SeatSnapshot,
  TimingConfig,
} from "./state";

export interface StartGameInput {
  gameRoomId: string;
  targetPlayerCount: number;
  seats: SeatSnapshot[];
  now: Date;
  shuffleSeed: string;
  timing: TimingConfig;
}

export interface StartGameResult {
  projection: RoomProjection;
  privateStates: PlayerPrivateState[];
  events: GameEvent[];
}

export function startGame(input: StartGameInput): StartGameResult {
  if (input.seats.length !== input.targetPlayerCount) {
    throw new Error(
      `Cannot start game: expected ${input.targetPlayerCount} players, got ${input.seats.length}`
    );
  }

  const assigned = assignRoles(input.seats, input.shuffleSeed);
  const nowIso = input.now.toISOString();
  const deadlineAt = new Date(
    input.now.getTime() + input.timing.nightActionSeconds * 1000
  ).toISOString();
  const wolves = assigned
    .filter((player) => player.role === "werewolf")
    .map((player) => player.playerId);

  const privateStates = assigned.map((player) => ({
    playerId: player.playerId,
    role: player.role,
    team: player.team,
    alive: true,
    knownTeammatePlayerIds:
      player.role === "werewolf"
        ? wolves.filter((playerId) => playerId !== player.playerId)
        : [],
    ...(player.role === "witch"
      ? { witchItems: { healAvailable: true, poisonAvailable: true } }
      : {}),
  }));

  const projection: RoomProjection = {
    gameRoomId: input.gameRoomId,
    status: "active",
    phase: "night_guard",
    day: 1,
    deadlineAt,
    currentSpeakerPlayerId: null,
    winner: null,
    alivePlayerIds: assigned.map((player) => player.playerId),
    version: 1,
  };

  const events: GameEvent[] = [
    {
      id: "pending",
      gameRoomId: input.gameRoomId,
      seq: 1,
      type: "game_started",
      visibility: "public",
      actorId: "runtime",
      payload: {
        targetPlayerCount: input.targetPlayerCount,
        playerIds: assigned.map((player) => player.playerId),
      },
      createdAt: nowIso,
    },
    {
      id: "pending",
      gameRoomId: input.gameRoomId,
      seq: 2,
      type: "roles_assigned",
      visibility: "runtime",
      actorId: "runtime",
      payload: {
        players: assigned.map((player) => ({
          playerId: player.playerId,
          role: player.role,
          team: player.team,
        })),
      },
      createdAt: nowIso,
    },
    {
      id: "pending",
      gameRoomId: input.gameRoomId,
      seq: 3,
      type: "phase_started",
      visibility: "public",
      actorId: "runtime",
      payload: { phase: "night_guard", day: 1, deadlineAt },
      createdAt: nowIso,
    },
  ];

  return { projection, privateStates, events };
}
```

Modify `packages/werewolf-engine/src/index.ts`:

```ts
export * from "./roles";
export * from "./start";
export * from "./state";
```

- [ ] **Step 5: Run tests**

Run:

```bash
pnpm test packages/werewolf-engine/src/roles.test.ts packages/werewolf-engine/src/start.test.ts
pnpm --filter @werewolf/engine typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/werewolf-engine packages/shared
git commit -m "feat: add werewolf start engine"
```

---

### Task 4: Event Store And Projection Contracts

**Files:**
- Create: `packages/werewolf-engine/src/projection.ts`
- Create: `packages/werewolf-engine/src/events.ts`
- Modify: `packages/werewolf-engine/src/index.ts`
- Test: `packages/werewolf-engine/src/projection.test.ts`

- [ ] **Step 1: Write failing projection tests**

Create `packages/werewolf-engine/src/projection.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { applyEventToProjection, createInitialProjection } from "./projection";

describe("projection", () => {
  it("applies public phase and elimination events", () => {
    let projection = createInitialProjection("game_1");
    projection = applyEventToProjection(projection, {
      id: "evt_1",
      gameRoomId: "game_1",
      seq: 1,
      type: "phase_started",
      visibility: "public",
      actorId: "runtime",
      payload: { phase: "day_vote", day: 2, deadlineAt: "2026-05-09T10:10:00.000Z" },
      createdAt: "2026-05-09T10:09:00.000Z",
    });
    projection = applyEventToProjection(projection, {
      id: "evt_2",
      gameRoomId: "game_1",
      seq: 2,
      type: "player_eliminated",
      visibility: "public",
      actorId: "runtime",
      subjectId: "p3",
      payload: { playerId: "p3", reason: "vote" },
      createdAt: "2026-05-09T10:10:00.000Z",
    });
    expect(projection.phase).toBe("day_vote");
    expect(projection.day).toBe(2);
    expect(projection.eliminatedPlayerIds).toEqual(["p3"]);
    expect(projection.version).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
pnpm test packages/werewolf-engine/src/projection.test.ts
```

Expected: FAIL because `projection.ts` is missing.

- [ ] **Step 3: Implement projection reducer**

Create `packages/werewolf-engine/src/projection.ts`:

```ts
import { gamePhaseSchema, type GameEvent, type GamePhase } from "@werewolf/shared";

export interface PublicProjection {
  gameRoomId: string;
  phase: GamePhase | null;
  day: number;
  deadlineAt: string | null;
  currentSpeakerPlayerId: string | null;
  eliminatedPlayerIds: string[];
  winner: "wolf" | "good" | null;
  version: number;
}

export function createInitialProjection(gameRoomId: string): PublicProjection {
  return {
    gameRoomId,
    phase: null,
    day: 0,
    deadlineAt: null,
    currentSpeakerPlayerId: null,
    eliminatedPlayerIds: [],
    winner: null,
    version: 0,
  };
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${name} is required`);
  }
  return value;
}

export function applyEventToProjection(
  projection: PublicProjection,
  event: GameEvent
): PublicProjection {
  if (event.visibility !== "public") {
    return projection;
  }

  const next = { ...projection, version: event.seq };
  if (event.type === "phase_started") {
    next.phase = gamePhaseSchema.parse(event.payload.phase);
    next.day = Number(event.payload.day ?? next.day);
    next.deadlineAt =
      typeof event.payload.deadlineAt === "string" ? event.payload.deadlineAt : null;
    next.currentSpeakerPlayerId =
      typeof event.payload.currentSpeakerPlayerId === "string"
        ? event.payload.currentSpeakerPlayerId
        : null;
  }
  if (event.type === "turn_started") {
    next.currentSpeakerPlayerId = requireString(
      event.payload.playerId,
      "turn_started.payload.playerId"
    );
  }
  if (event.type === "player_eliminated") {
    const playerId = requireString(event.payload.playerId, "player_eliminated.payload.playerId");
    next.eliminatedPlayerIds = [...new Set([...next.eliminatedPlayerIds, playerId])];
  }
  if (event.type === "game_ended") {
    next.phase = "post_game";
    next.winner =
      event.payload.winner === "wolf" || event.payload.winner === "good"
        ? event.payload.winner
        : null;
    next.deadlineAt = null;
  }
  return next;
}
```

Create `packages/werewolf-engine/src/events.ts`:

```ts
import type { GameEvent } from "@werewolf/shared";

export function withAssignedEventIds(
  events: GameEvent[],
  startSeq: number,
  idPrefix: string
): GameEvent[] {
  return events.map((event, index) => ({
    ...event,
    id: `${idPrefix}_${startSeq + index}`,
    seq: startSeq + index,
  }));
}
```

Modify `packages/werewolf-engine/src/index.ts`:

```ts
export * from "./events";
export * from "./projection";
export * from "./roles";
export * from "./start";
export * from "./state";
```

- [ ] **Step 4: Run tests**

Run:

```bash
pnpm test packages/werewolf-engine/src/projection.test.ts
pnpm --filter @werewolf/engine typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/werewolf-engine
git commit -m "feat: add game projection reducer"
```

---

### Task 5: Player Action Validation

**Files:**
- Create: `packages/werewolf-engine/src/commands.ts`
- Create: `packages/werewolf-engine/src/actions.ts`
- Modify: `packages/werewolf-engine/src/index.ts`
- Test: `packages/werewolf-engine/src/actions.test.ts`

- [ ] **Step 1: Write failing action validation tests**

Create `packages/werewolf-engine/src/actions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { validatePlayerAction } from "./actions";

const base = {
  gameRoomId: "game_1",
  day: 1,
  alivePlayerIds: ["p1", "p2", "p3"],
  eliminatedPlayerIds: [],
};

describe("validatePlayerAction", () => {
  it("allows current speaker to submit speech", () => {
    const event = validatePlayerAction({
      ...base,
      phase: "day_speak",
      actorPlayerId: "p1",
      currentSpeakerPlayerId: "p1",
      action: { kind: "saySpeech", speech: "I suspect p2." },
      now: new Date("2026-05-09T10:00:00.000Z"),
    });
    expect(event.type).toBe("speech_submitted");
    expect(event.payload.speech).toBe("I suspect p2.");
  });

  it("rejects speech from non-speaker", () => {
    expect(() =>
      validatePlayerAction({
        ...base,
        phase: "day_speak",
        actorPlayerId: "p2",
        currentSpeakerPlayerId: "p1",
        action: { kind: "saySpeech", speech: "hello" },
        now: new Date("2026-05-09T10:00:00.000Z"),
      })
    ).toThrow("Only the current speaker can speak");
  });

  it("allows living players to vote for another living player", () => {
    const event = validatePlayerAction({
      ...base,
      phase: "day_vote",
      actorPlayerId: "p1",
      currentSpeakerPlayerId: null,
      action: { kind: "submitVote", targetPlayerId: "p2" },
      now: new Date("2026-05-09T10:00:00.000Z"),
    });
    expect(event.type).toBe("vote_submitted");
    expect(event.payload.targetPlayerId).toBe("p2");
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
pnpm test packages/werewolf-engine/src/actions.test.ts
```

Expected: FAIL because `actions.ts` is missing.

- [ ] **Step 3: Implement command types**

Create `packages/werewolf-engine/src/commands.ts`:

```ts
export type PlayerAction =
  | { kind: "saySpeech"; speech: string }
  | { kind: "submitVote"; targetPlayerId: string }
  | { kind: "abstain" }
  | { kind: "wolfKill"; targetPlayerId: string }
  | { kind: "seerInspect"; targetPlayerId: string }
  | { kind: "witchHeal"; targetPlayerId: string }
  | { kind: "witchPoison"; targetPlayerId: string }
  | { kind: "guardProtect"; targetPlayerId: string }
  | { kind: "passAction" };
```

- [ ] **Step 4: Implement action validation**

Create `packages/werewolf-engine/src/actions.ts`:

```ts
import type { GameEvent, GamePhase } from "@werewolf/shared";
import type { PlayerAction } from "./commands";

export interface ValidatePlayerActionInput {
  gameRoomId: string;
  day: number;
  phase: GamePhase;
  actorPlayerId: string;
  currentSpeakerPlayerId: string | null;
  alivePlayerIds: string[];
  eliminatedPlayerIds: string[];
  action: PlayerAction;
  now: Date;
}

function assertAlive(input: ValidatePlayerActionInput, playerId: string): void {
  if (!input.alivePlayerIds.includes(playerId) || input.eliminatedPlayerIds.includes(playerId)) {
    throw new Error(`${playerId} is not alive`);
  }
}

function baseEvent(input: ValidatePlayerActionInput): Omit<GameEvent, "type" | "payload"> {
  return {
    id: "pending",
    gameRoomId: input.gameRoomId,
    seq: 1,
    visibility: "public",
    actorId: input.actorPlayerId,
    createdAt: input.now.toISOString(),
  };
}

export function validatePlayerAction(input: ValidatePlayerActionInput): GameEvent {
  assertAlive(input, input.actorPlayerId);

  if (input.action.kind === "saySpeech") {
    if (input.phase !== "day_speak") {
      throw new Error("Speech is only allowed during day_speak");
    }
    if (input.currentSpeakerPlayerId !== input.actorPlayerId) {
      throw new Error("Only the current speaker can speak");
    }
    if (input.action.speech.trim().length === 0) {
      throw new Error("Speech cannot be empty");
    }
    return {
      ...baseEvent(input),
      type: "speech_submitted",
      payload: { day: input.day, speech: input.action.speech.trim() },
    };
  }

  if (input.action.kind === "submitVote") {
    if (input.phase !== "day_vote") {
      throw new Error("Vote is only allowed during day_vote");
    }
    if (input.action.targetPlayerId === input.actorPlayerId) {
      throw new Error("Self vote is not allowed");
    }
    assertAlive(input, input.action.targetPlayerId);
    return {
      ...baseEvent(input),
      type: "vote_submitted",
      payload: {
        day: input.day,
        targetPlayerId: input.action.targetPlayerId,
      },
    };
  }

  return {
    ...baseEvent(input),
    visibility: "runtime",
    type: "night_action_submitted",
    payload: { day: input.day, phase: input.phase, action: input.action },
  };
}
```

Modify `packages/werewolf-engine/src/index.ts`:

```ts
export * from "./actions";
export * from "./commands";
export * from "./events";
export * from "./projection";
export * from "./roles";
export * from "./start";
export * from "./state";
```

- [ ] **Step 5: Run tests**

Run:

```bash
pnpm test packages/werewolf-engine/src/actions.test.ts
pnpm --filter @werewolf/engine typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/werewolf-engine
git commit -m "feat: validate player actions"
```

---

### Task 6: Database Schema And Repositories

**Files:**
- Create: `packages/db/src/schema.ts`
- Create: `packages/db/src/repositories/users.ts`
- Create: `packages/db/src/repositories/rooms.ts`
- Create: `packages/db/src/repositories/events.ts`
- Create: `packages/db/src/repositories/projections.ts`
- Create: `packages/db/src/test-db.ts`
- Modify: `packages/db/src/client.ts`
- Test: `packages/db/src/repositories/events.test.ts`

- [ ] **Step 1: Write failing event repository test**

Create `packages/db/src/repositories/events.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createInMemoryRepositories } from "../test-db";

describe("event repository", () => {
  it("assigns monotonic seq values per game room", async () => {
    const repos = createInMemoryRepositories();
    const first = await repos.events.append("game_1", [
      {
        id: "pending",
        gameRoomId: "game_1",
        seq: 1,
        type: "phase_started",
        visibility: "public",
        actorId: "runtime",
        payload: { phase: "night_guard", day: 1 },
        createdAt: "2026-05-09T10:00:00.000Z",
      },
    ]);
    const second = await repos.events.append("game_1", [
      {
        id: "pending",
        gameRoomId: "game_1",
        seq: 1,
        type: "phase_closed",
        visibility: "public",
        actorId: "runtime",
        payload: { phase: "night_guard", day: 1 },
        createdAt: "2026-05-09T10:00:45.000Z",
      },
    ]);

    expect(first[0]?.seq).toBe(1);
    expect(second[0]?.seq).toBe(2);
    expect(await repos.events.listAfter("game_1", 0)).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
pnpm test packages/db/src/repositories/events.test.ts
```

Expected: FAIL because `test-db.ts` is missing.

- [ ] **Step 3: Implement schema definitions**

Create `packages/db/src/schema.ts`:

```ts
import { jsonb, pgTable, text, integer, timestamp, boolean, uniqueIndex } from "drizzle-orm/pg-core";

export const gameUsers = pgTable("game_users", {
  id: text("id").primaryKey(),
  matrixUserId: text("matrix_user_id").notNull().unique(),
  displayName: text("display_name").notNull(),
  avatarUrl: text("avatar_url"),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
});

export const gameRooms = pgTable("game_rooms", {
  id: text("id").primaryKey(),
  creatorUserId: text("creator_user_id").notNull(),
  status: text("status").notNull(),
  title: text("title").notNull(),
  targetPlayerCount: integer("target_player_count").notNull(),
  timing: jsonb("timing").notNull(),
  createdFromMatrixRoomId: text("created_from_matrix_room_id").notNull(),
  allowedSourceMatrixRoomIds: jsonb("allowed_source_matrix_room_ids").notNull(),
  agentSourceMatrixRoomId: text("agent_source_matrix_room_id").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  pausedAt: timestamp("paused_at", { withTimezone: true }),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  nextTickAt: timestamp("next_tick_at", { withTimezone: true }),
  runtimeLeaseUntil: timestamp("runtime_lease_until", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const gameRoomPlayers = pgTable("game_room_players", {
  id: text("id").primaryKey(),
  gameRoomId: text("game_room_id").notNull(),
  kind: text("kind").notNull(),
  userId: text("user_id"),
  agentId: text("agent_id"),
  displayName: text("display_name").notNull(),
  seatNo: integer("seat_no").notNull(),
  ready: boolean("ready").notNull(),
  onlineState: text("online_state").notNull(),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull(),
  leftAt: timestamp("left_at", { withTimezone: true }),
}, (table) => ({
  roomSeat: uniqueIndex("game_room_players_room_seat_idx").on(table.gameRoomId, table.seatNo),
}));

export const gameEvents = pgTable("game_events", {
  id: text("id").primaryKey(),
  gameRoomId: text("game_room_id").notNull(),
  seq: integer("seq").notNull(),
  type: text("type").notNull(),
  visibility: text("visibility").notNull(),
  actorId: text("actor_id"),
  subjectId: text("subject_id"),
  payload: jsonb("payload").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
}, (table) => ({
  roomSeq: uniqueIndex("game_events_room_seq_idx").on(table.gameRoomId, table.seq),
}));

export const roomProjection = pgTable("room_projection", {
  gameRoomId: text("game_room_id").primaryKey(),
  version: integer("version").notNull(),
  publicState: jsonb("public_state").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const playerPrivateState = pgTable("player_private_state", {
  gameRoomId: text("game_room_id").notNull(),
  playerId: text("player_id").notNull(),
  privateState: jsonb("private_state").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
}, (table) => ({
  playerRoom: uniqueIndex("player_private_state_room_player_idx").on(table.gameRoomId, table.playerId),
}));
```

- [ ] **Step 4: Implement in-memory repositories for tests**

Create `packages/db/src/test-db.ts`:

```ts
import type { GameEvent } from "@werewolf/shared";

export interface EventRepository {
  append(gameRoomId: string, events: GameEvent[]): Promise<GameEvent[]>;
  listAfter(gameRoomId: string, afterSeq: number): Promise<GameEvent[]>;
}

export function createInMemoryRepositories(): { events: EventRepository } {
  const eventsByRoom = new Map<string, GameEvent[]>();
  return {
    events: {
      async append(gameRoomId, events) {
        const existing = eventsByRoom.get(gameRoomId) ?? [];
        const nextEvents = events.map((event, index) => ({
          ...event,
          id: event.id === "pending" ? `evt_${gameRoomId}_${existing.length + index + 1}` : event.id,
          seq: existing.length + index + 1,
        }));
        eventsByRoom.set(gameRoomId, [...existing, ...nextEvents]);
        return nextEvents;
      },
      async listAfter(gameRoomId, afterSeq) {
        return (eventsByRoom.get(gameRoomId) ?? []).filter((event) => event.seq > afterSeq);
      },
    },
  };
}
```

Create `packages/db/src/repositories/events.ts`:

```ts
export type { EventRepository } from "../test-db";
```

Create `packages/db/src/repositories/users.ts`:

```ts
export interface MatrixIdentity {
  matrixUserId: string;
  displayName: string;
  avatarUrl?: string;
}
```

Create `packages/db/src/repositories/rooms.ts`:

```ts
export interface RoomRepository {
  getById(gameRoomId: string): Promise<unknown | null>;
}
```

Create `packages/db/src/repositories/projections.ts`:

```ts
export interface ProjectionRepository {
  getPublicProjection(gameRoomId: string): Promise<unknown | null>;
}
```

Modify `packages/db/src/client.ts`:

```ts
export * from "./schema";
export * from "./repositories/events";
export * from "./repositories/projections";
export * from "./repositories/rooms";
export * from "./repositories/users";
```

- [ ] **Step 5: Run tests**

Run:

```bash
pnpm test packages/db/src/repositories/events.test.ts
pnpm --filter @werewolf/db typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/db
git commit -m "feat: add database schema and event repository"
```

---

### Task 7: API Auth And Game Room Management

**Files:**
- Create: `apps/api/src/app.ts`
- Create: `apps/api/src/server.ts`
- Create: `apps/api/src/context/auth.ts`
- Create: `apps/api/src/services/game-service.ts`
- Create: `apps/api/src/routes/games.ts`
- Create: `apps/api/src/test-utils.ts`
- Test: `apps/api/src/routes/games.test.ts`

- [ ] **Step 1: Write failing API tests**

Create `apps/api/src/routes/games.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createApp } from "../app";
import { createTestDeps } from "../test-utils";

describe("games API", () => {
  it("requires Matrix bearer auth", async () => {
    const app = createApp(createTestDeps());
    const response = await app.request("/games", { method: "POST", body: "{}" });
    expect(response.status).toBe(401);
  });

  it("creates a game and defaults agent source room to source room", async () => {
    const app = createApp(createTestDeps());
    const response = await app.request("/games", {
      method: "POST",
      headers: {
        authorization: "Bearer matrix-token-alice",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sourceMatrixRoomId: "!source:example.com",
        title: "Friday Werewolf",
        targetPlayerCount: 6,
        timing: { nightActionSeconds: 45, speechSeconds: 60, voteSeconds: 30 },
        allowedSourceMatrixRoomIds: [],
      }),
    });
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.gameRoomId).toMatch(/^game_/);
    expect(body.card.sourceMatrixRoomId).toBe("!source:example.com");
    expect(body.card.targetPlayerCount).toBe(6);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
pnpm test apps/api/src/routes/games.test.ts
```

Expected: FAIL because `createApp` is missing.

- [ ] **Step 3: Implement Matrix auth context**

Create `apps/api/src/context/auth.ts`:

```ts
import { AppError } from "@werewolf/shared";

export interface MatrixWhoami {
  user_id: string;
  device_id?: string;
}

export interface MatrixAuthClient {
  whoami(token: string): Promise<MatrixWhoami>;
}

export interface AuthenticatedUser {
  id: string;
  matrixUserId: string;
  displayName: string;
}

export async function authenticateRequest(
  request: Request,
  matrix: MatrixAuthClient
): Promise<AuthenticatedUser> {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/);
  if (!match) {
    throw new AppError("unauthorized", "Matrix bearer token is required", 401);
  }
  const whoami = await matrix.whoami(match[1]);
  return {
    id: whoami.user_id,
    matrixUserId: whoami.user_id,
    displayName: whoami.user_id,
  };
}
```

- [ ] **Step 4: Implement game service and routes**

Create `apps/api/src/services/game-service.ts`:

```ts
import { createGameRequestSchema, type CreateGameRequest } from "@werewolf/shared";

export interface StoredGameRoom {
  id: string;
  creatorUserId: string;
  title: string;
  status: "waiting";
  targetPlayerCount: number;
  timing: CreateGameRequest["timing"];
  createdFromMatrixRoomId: string;
  allowedSourceMatrixRoomIds: string[];
  agentSourceMatrixRoomId: string;
}

export class InMemoryGameService {
  private rooms = new Map<string, StoredGameRoom>();
  private nextId = 1;

  createGame(input: unknown, creatorUserId: string): { room: StoredGameRoom; card: Record<string, unknown> } {
    const parsed = createGameRequestSchema.parse(input);
    const id = `game_${this.nextId}`;
    this.nextId += 1;
    const room: StoredGameRoom = {
      id,
      creatorUserId,
      title: parsed.title,
      status: "waiting",
      targetPlayerCount: parsed.targetPlayerCount,
      timing: parsed.timing,
      createdFromMatrixRoomId: parsed.sourceMatrixRoomId,
      allowedSourceMatrixRoomIds: parsed.allowedSourceMatrixRoomIds,
      agentSourceMatrixRoomId: parsed.agentSourceMatrixRoomId ?? parsed.sourceMatrixRoomId,
    };
    this.rooms.set(id, room);
    return {
      room,
      card: {
        gameRoomId: id,
        sourceMatrixRoomId: parsed.sourceMatrixRoomId,
        title: parsed.title,
        targetPlayerCount: parsed.targetPlayerCount,
        webUrl: `/games/${id}?sourceMatrixRoomId=${encodeURIComponent(parsed.sourceMatrixRoomId)}`,
      },
    };
  }

  getGame(gameRoomId: string): StoredGameRoom | null {
    return this.rooms.get(gameRoomId) ?? null;
  }
}
```

Create `apps/api/src/routes/games.ts`:

```ts
import { Hono } from "hono";
import { AppError } from "@werewolf/shared";
import { authenticateRequest, type MatrixAuthClient } from "../context/auth";
import type { InMemoryGameService } from "../services/game-service";

export interface GamesRouteDeps {
  matrix: MatrixAuthClient;
  games: InMemoryGameService;
}

export function createGamesRoutes(deps: GamesRouteDeps): Hono {
  const app = new Hono();

  app.post("/", async (c) => {
    try {
      const user = await authenticateRequest(c.req.raw, deps.matrix);
      const body = await c.req.json();
      const { room, card } = deps.games.createGame(body, user.id);
      return c.json({ gameRoomId: room.id, card }, 201);
    } catch (error) {
      if (error instanceof AppError) {
        return c.json({ error: error.message, code: error.code }, error.status);
      }
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 400);
    }
  });

  return app;
}
```

Create `apps/api/src/app.ts`:

```ts
import { Hono } from "hono";
import { createGamesRoutes, type GamesRouteDeps } from "./routes/games";

export type AppDeps = GamesRouteDeps;

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();
  app.route("/games", createGamesRoutes(deps));
  return app;
}
```

Create `apps/api/src/server.ts`:

```ts
import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { InMemoryGameService } from "./services/game-service";

const matrixBaseUrl = process.env.MATRIX_BASE_URL ?? "http://localhost:8008";
const app = createApp({
  games: new InMemoryGameService(),
  matrix: {
    async whoami(token) {
      const response = await fetch(`${matrixBaseUrl}/_matrix/client/v3/account/whoami`, {
        headers: { authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        throw new Error(`Matrix whoami failed: HTTP ${response.status}`);
      }
      return (await response.json()) as { user_id: string; device_id?: string };
    },
  },
});

serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 3000) });
```

Create `apps/api/src/test-utils.ts`:

```ts
import { InMemoryGameService } from "./services/game-service";

export function createTestDeps() {
  return {
    games: new InMemoryGameService(),
    matrix: {
      async whoami(token: string) {
        if (token === "matrix-token-alice") {
          return { user_id: "@alice:example.com" };
        }
        throw new Error("invalid token");
      },
    },
  };
}
```

- [ ] **Step 5: Run tests**

Run:

```bash
pnpm test apps/api/src/routes/games.test.ts
pnpm --filter @werewolf/api typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api
git commit -m "feat: add matrix-authenticated game creation API"
```

---

### Task 8: Room Seat Management And Start API

**Files:**
- Modify: `apps/api/src/services/game-service.ts`
- Modify: `apps/api/src/routes/games.ts`
- Test: `apps/api/src/routes/game-lifecycle.test.ts`

- [ ] **Step 1: Write failing lifecycle tests**

Create `apps/api/src/routes/game-lifecycle.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createApp } from "../app";
import { createTestDeps } from "../test-utils";

async function createGame(app: ReturnType<typeof createApp>) {
  const response = await app.request("/games", {
    method: "POST",
    headers: { authorization: "Bearer matrix-token-alice", "content-type": "application/json" },
    body: JSON.stringify({
      sourceMatrixRoomId: "!source:example.com",
      title: "Lifecycle",
      targetPlayerCount: 6,
      timing: { nightActionSeconds: 45, speechSeconds: 60, voteSeconds: 30 },
      allowedSourceMatrixRoomIds: [],
    }),
  });
  return (await response.json()).gameRoomId as string;
}

describe("game lifecycle", () => {
  it("lets current user join and leave before start", async () => {
    const app = createApp(createTestDeps());
    const gameRoomId = await createGame(app);
    const join = await app.request(`/games/${gameRoomId}/join`, {
      method: "POST",
      headers: { authorization: "Bearer matrix-token-alice" },
    });
    expect(join.status).toBe(200);
    const leave = await app.request(`/games/${gameRoomId}/leave`, {
      method: "POST",
      headers: { authorization: "Bearer matrix-token-alice" },
    });
    expect(leave.status).toBe(200);
  });

  it("rejects start until target player count is reached", async () => {
    const app = createApp(createTestDeps());
    const gameRoomId = await createGame(app);
    const start = await app.request(`/games/${gameRoomId}/start`, {
      method: "POST",
      headers: { authorization: "Bearer matrix-token-alice" },
    });
    expect(start.status).toBe(409);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
pnpm test apps/api/src/routes/game-lifecycle.test.ts
```

Expected: FAIL because join, leave, and start routes are missing.

- [ ] **Step 3: Extend game service**

Modify `apps/api/src/services/game-service.ts` to include players and lifecycle methods:

```ts
import { AppError, createGameRequestSchema, type CreateGameRequest } from "@werewolf/shared";

export interface StoredPlayer {
  id: string;
  kind: "user" | "agent";
  userId?: string;
  agentId?: string;
  displayName: string;
  seatNo: number;
  ready: boolean;
  onlineState: "online" | "offline";
  leftAt: string | null;
}

export interface StoredGameRoom {
  id: string;
  creatorUserId: string;
  title: string;
  status: "waiting" | "active" | "paused" | "ended";
  targetPlayerCount: number;
  timing: CreateGameRequest["timing"];
  createdFromMatrixRoomId: string;
  allowedSourceMatrixRoomIds: string[];
  agentSourceMatrixRoomId: string;
  players: StoredPlayer[];
}

export class InMemoryGameService {
  private rooms = new Map<string, StoredGameRoom>();
  private nextId = 1;

  createGame(input: unknown, creatorUserId: string): { room: StoredGameRoom; card: Record<string, unknown> } {
    const parsed = createGameRequestSchema.parse(input);
    const id = `game_${this.nextId}`;
    this.nextId += 1;
    const room: StoredGameRoom = {
      id,
      creatorUserId,
      title: parsed.title,
      status: "waiting",
      targetPlayerCount: parsed.targetPlayerCount,
      timing: parsed.timing,
      createdFromMatrixRoomId: parsed.sourceMatrixRoomId,
      allowedSourceMatrixRoomIds: parsed.allowedSourceMatrixRoomIds,
      agentSourceMatrixRoomId: parsed.agentSourceMatrixRoomId ?? parsed.sourceMatrixRoomId,
      players: [],
    };
    this.rooms.set(id, room);
    return {
      room,
      card: {
        gameRoomId: id,
        sourceMatrixRoomId: parsed.sourceMatrixRoomId,
        title: parsed.title,
        targetPlayerCount: parsed.targetPlayerCount,
        webUrl: `/games/${id}?sourceMatrixRoomId=${encodeURIComponent(parsed.sourceMatrixRoomId)}`,
      },
    };
  }

  getGame(gameRoomId: string): StoredGameRoom | null {
    return this.rooms.get(gameRoomId) ?? null;
  }

  join(gameRoomId: string, userId: string, displayName: string): StoredPlayer {
    const room = this.requireWaitingRoom(gameRoomId);
    const existing = room.players.find((player) => player.userId === userId);
    if (existing) {
      existing.leftAt = null;
      existing.onlineState = "online";
      return existing;
    }
    const player: StoredPlayer = {
      id: `player_${room.players.length + 1}`,
      kind: "user",
      userId,
      displayName,
      seatNo: room.players.length + 1,
      ready: true,
      onlineState: "online",
      leftAt: null,
    };
    room.players.push(player);
    return player;
  }

  leave(gameRoomId: string, userId: string): StoredPlayer {
    const room = this.requireWaitingRoom(gameRoomId);
    const player = room.players.find((candidate) => candidate.userId === userId && !candidate.leftAt);
    if (!player) {
      throw new AppError("not_found", "Player is not in this room", 404);
    }
    player.leftAt = new Date().toISOString();
    player.onlineState = "offline";
    return player;
  }

  start(gameRoomId: string, userId: string): StoredGameRoom {
    const room = this.requireWaitingRoom(gameRoomId);
    if (room.creatorUserId !== userId) {
      throw new AppError("forbidden", "Only creator can start the game", 403);
    }
    const activePlayers = room.players.filter((player) => !player.leftAt);
    if (activePlayers.length !== room.targetPlayerCount) {
      throw new AppError("conflict", `Need ${room.targetPlayerCount} active players to start`, 409);
    }
    room.status = "active";
    return room;
  }

  private requireWaitingRoom(gameRoomId: string): StoredGameRoom {
    const room = this.rooms.get(gameRoomId);
    if (!room) {
      throw new AppError("not_found", "Game room not found", 404);
    }
    if (room.status !== "waiting") {
      throw new AppError("conflict", "Game room is not waiting", 409);
    }
    return room;
  }
}
```

- [ ] **Step 4: Add lifecycle routes**

Modify `apps/api/src/routes/games.ts` to add route handlers after `POST /`:

```ts
  app.post("/:gameRoomId/join", async (c) => {
    try {
      const user = await authenticateRequest(c.req.raw, deps.matrix);
      const player = deps.games.join(c.req.param("gameRoomId"), user.id, user.displayName);
      return c.json({ player });
    } catch (error) {
      if (error instanceof AppError) return c.json({ error: error.message, code: error.code }, error.status);
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 400);
    }
  });

  app.post("/:gameRoomId/leave", async (c) => {
    try {
      const user = await authenticateRequest(c.req.raw, deps.matrix);
      const player = deps.games.leave(c.req.param("gameRoomId"), user.id);
      return c.json({ player });
    } catch (error) {
      if (error instanceof AppError) return c.json({ error: error.message, code: error.code }, error.status);
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 400);
    }
  });

  app.post("/:gameRoomId/start", async (c) => {
    try {
      const user = await authenticateRequest(c.req.raw, deps.matrix);
      const room = deps.games.start(c.req.param("gameRoomId"), user.id);
      return c.json({ status: room.status });
    } catch (error) {
      if (error instanceof AppError) return c.json({ error: error.message, code: error.code }, error.status);
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 400);
    }
  });
```

- [ ] **Step 5: Run tests**

Run:

```bash
pnpm test apps/api/src/routes/games.test.ts apps/api/src/routes/game-lifecycle.test.ts
pnpm --filter @werewolf/api typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api
git commit -m "feat: add waiting room lifecycle API"
```

---

### Task 9: Agent Client And Tool Harness

**Files:**
- Create: `packages/agent-client/src/synapse-agents.ts`
- Create: `packages/agent-client/src/unseal-llm.ts`
- Create: `packages/agent-client/src/harness.ts`
- Modify: `packages/agent-client/src/index.ts`
- Test: `packages/agent-client/src/harness.test.ts`
- Test: `packages/agent-client/src/synapse-agents.test.ts`

- [ ] **Step 1: Write failing harness tests**

Create `packages/agent-client/src/harness.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildAgentTurnTools } from "./harness";

describe("agent harness", () => {
  it("exposes only vote tools during day_vote", () => {
    const tools = buildAgentTurnTools({
      phase: "day_vote",
      role: "villager",
      alivePlayerIds: ["p1", "p2", "p3"],
      selfPlayerId: "p1",
    });
    expect(Object.keys(tools)).toEqual(["submitVote", "abstain"]);
  });

  it("exposes only seer tools during seer night", () => {
    const tools = buildAgentTurnTools({
      phase: "night_seer",
      role: "seer",
      alivePlayerIds: ["p1", "p2", "p3"],
      selfPlayerId: "p1",
    });
    expect(Object.keys(tools)).toEqual(["seerInspect", "passAction"]);
  });
});
```

Create `packages/agent-client/src/synapse-agents.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { listRoomAgents } from "./synapse-agents";

describe("listRoomAgents", () => {
  it("calls Synapse room agents endpoint with Matrix bearer token", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ agents: [{ user_id: "@bot:test", display_name: "Bot", user_type: "bot", membership: "join" }], total: 1 }), { status: 200 })
    );
    const result = await listRoomAgents({
      homeserverUrl: "https://matrix.example.com",
      roomId: "!room:test",
      matrixToken: "token",
      fetchImpl,
    });
    expect(fetchImpl.mock.calls[0]?.[0]).toBe("https://matrix.example.com/chatbot/v1/rooms/!room%3Atest/agents?membership=join");
    expect(result.agents[0]?.userId).toBe("@bot:test");
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
pnpm test packages/agent-client/src/harness.test.ts packages/agent-client/src/synapse-agents.test.ts
```

Expected: FAIL because files are missing.

- [ ] **Step 3: Implement Synapse and LLM clients**

Create `packages/agent-client/src/synapse-agents.ts`:

```ts
import { z } from "zod";

const responseSchema = z.object({
  agents: z.array(
    z.object({
      user_id: z.string(),
      display_name: z.string().optional(),
      avatar_url: z.string().optional(),
      user_type: z.string(),
      membership: z.string(),
    })
  ),
  total: z.number(),
});

export interface ListRoomAgentsInput {
  homeserverUrl: string;
  roomId: string;
  matrixToken: string;
  fetchImpl?: typeof fetch;
}

export async function listRoomAgents(input: ListRoomAgentsInput) {
  const fetcher = input.fetchImpl ?? fetch;
  const url = `${input.homeserverUrl}/chatbot/v1/rooms/${encodeURIComponent(input.roomId)}/agents?membership=join`;
  const response = await fetcher(url, {
    headers: { authorization: `Bearer ${input.matrixToken}` },
  });
  if (!response.ok) {
    throw new Error(`Synapse room agents failed: HTTP ${response.status}`);
  }
  const parsed = responseSchema.parse(await response.json());
  return {
    agents: parsed.agents.map((agent) => ({
      userId: agent.user_id,
      displayName: agent.display_name ?? agent.user_id,
      avatarUrl: agent.avatar_url,
      userType: agent.user_type,
      membership: agent.membership,
    })),
    total: parsed.total,
  };
}
```

Create `packages/agent-client/src/unseal-llm.ts`:

```ts
import { z } from "zod";

export const llmGenerateResponseSchema = z.object({
  text: z.string().default(""),
}).passthrough();

export interface GenerateWithAgentInput {
  apiBaseUrl: string;
  adminToken: string;
  agentId: string;
  body: Record<string, unknown>;
  fetchImpl?: typeof fetch;
}

export async function generateWithAgent(input: GenerateWithAgentInput) {
  const fetcher = input.fetchImpl ?? fetch;
  const response = await fetcher(
    `${input.apiBaseUrl}/agents/${encodeURIComponent(input.agentId)}/llm/generate`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": input.adminToken,
      },
      body: JSON.stringify(input.body),
    }
  );
  if (!response.ok) {
    throw new Error(`Unseal agent generate failed: HTTP ${response.status}`);
  }
  return llmGenerateResponseSchema.parse(await response.json());
}
```

- [ ] **Step 4: Implement precise tool exposure**

Create `packages/agent-client/src/harness.ts`:

```ts
import type { GamePhase, Role } from "@werewolf/shared";

export interface ToolDeclaration {
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface BuildAgentTurnToolsInput {
  phase: GamePhase;
  role: Role;
  alivePlayerIds: string[];
  selfPlayerId: string;
}

const targetPlayerSchema = {
  type: "object",
  properties: {
    targetPlayerId: { type: "string" },
    reason: { type: "string" },
  },
  required: ["targetPlayerId"],
  additionalProperties: false,
};

export function buildAgentTurnTools(input: BuildAgentTurnToolsInput): Record<string, ToolDeclaration> {
  if (input.phase === "day_vote") {
    return {
      submitVote: {
        description: "Vote to exile one living player other than yourself.",
        inputSchema: targetPlayerSchema,
      },
      abstain: {
        description: "Abstain from the current vote.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
      },
    };
  }

  if (input.phase === "day_speak") {
    return {
      saySpeech: {
        description: "Say your public speech for the current turn.",
        inputSchema: {
          type: "object",
          properties: { speech: { type: "string", minLength: 1 } },
          required: ["speech"],
          additionalProperties: false,
        },
      },
    };
  }

  if (input.phase === "night_seer" && input.role === "seer") {
    return {
      seerInspect: { description: "Inspect one living player's alignment.", inputSchema: targetPlayerSchema },
      passAction: { description: "Skip the seer action.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
    };
  }

  if (input.phase === "night_guard" && input.role === "guard") {
    return {
      guardProtect: { description: "Protect one living player tonight.", inputSchema: targetPlayerSchema },
      passAction: { description: "Skip the guard action.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
    };
  }

  if (input.phase === "night_wolf" && input.role === "werewolf") {
    return {
      wolfKill: { description: "Select the wolf team kill target.", inputSchema: targetPlayerSchema },
      passAction: { description: "Skip the wolf kill action.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
    };
  }

  if (input.phase === "night_witch_heal" && input.role === "witch") {
    return {
      witchHeal: { description: "Use heal on the night death target.", inputSchema: targetPlayerSchema },
      passAction: { description: "Do not use heal.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
    };
  }

  if (input.phase === "night_witch_poison" && input.role === "witch") {
    return {
      witchPoison: { description: "Poison one living player.", inputSchema: targetPlayerSchema },
      passAction: { description: "Do not use poison.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
    };
  }

  return {};
}
```

Modify `packages/agent-client/src/index.ts`:

```ts
export * from "./harness";
export * from "./synapse-agents";
export * from "./unseal-llm";
```

- [ ] **Step 5: Run tests**

Run:

```bash
pnpm test packages/agent-client/src/harness.test.ts packages/agent-client/src/synapse-agents.test.ts
pnpm --filter @werewolf/agent-client typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/agent-client
git commit -m "feat: add agent discovery and precise tool harness"
```

---

### Task 10: Runtime Worker Tick Skeleton

**Files:**
- Create: `apps/runtime-worker/src/runtime/tick.ts`
- Create: `apps/runtime-worker/src/runtime/ai-turn.ts`
- Create: `apps/runtime-worker/src/index.ts`
- Test: `apps/runtime-worker/src/runtime/tick.test.ts`

- [ ] **Step 1: Write failing runtime tick test**

Create `apps/runtime-worker/src/runtime/tick.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computeNextRuntimeAction } from "./tick";

describe("computeNextRuntimeAction", () => {
  it("closes an expired phase", () => {
    const action = computeNextRuntimeAction({
      now: new Date("2026-05-09T10:01:00.000Z"),
      projection: {
        gameRoomId: "game_1",
        status: "active",
        phase: "night_guard",
        day: 1,
        deadlineAt: "2026-05-09T10:00:45.000Z",
        currentSpeakerPlayerId: null,
        winner: null,
        alivePlayerIds: ["p1", "p2"],
        version: 1,
      },
    });
    expect(action.kind).toBe("close_phase");
  });

  it("does nothing while paused", () => {
    const action = computeNextRuntimeAction({
      now: new Date("2026-05-09T10:01:00.000Z"),
      projection: {
        gameRoomId: "game_1",
        status: "paused",
        phase: "night_guard",
        day: 1,
        deadlineAt: "2026-05-09T10:00:45.000Z",
        currentSpeakerPlayerId: null,
        winner: null,
        alivePlayerIds: ["p1", "p2"],
        version: 1,
      },
    });
    expect(action.kind).toBe("noop");
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
pnpm test apps/runtime-worker/src/runtime/tick.test.ts
```

Expected: FAIL because `tick.ts` is missing.

- [ ] **Step 3: Implement runtime tick decision**

Create `apps/runtime-worker/src/runtime/tick.ts`:

```ts
import type { RoomProjection } from "@werewolf/engine";

export type RuntimeAction =
  | { kind: "noop" }
  | { kind: "close_phase"; gameRoomId: string; phase: string; day: number };

export interface ComputeNextRuntimeActionInput {
  now: Date;
  projection: RoomProjection;
}

export function computeNextRuntimeAction(input: ComputeNextRuntimeActionInput): RuntimeAction {
  if (input.projection.status !== "active") {
    return { kind: "noop" };
  }
  if (!input.projection.deadlineAt) {
    return { kind: "noop" };
  }
  if (new Date(input.projection.deadlineAt).getTime() > input.now.getTime()) {
    return { kind: "noop" };
  }
  return {
    kind: "close_phase",
    gameRoomId: input.projection.gameRoomId,
    phase: input.projection.phase,
    day: input.projection.day,
  };
}
```

Create `apps/runtime-worker/src/runtime/ai-turn.ts`:

```ts
import { buildAgentTurnTools } from "@werewolf/agent-client";
import type { GamePhase, Role } from "@werewolf/shared";

export interface BuildAiTurnInput {
  phase: GamePhase;
  role: Role;
  selfPlayerId: string;
  alivePlayerIds: string[];
}

export function buildAiTurn(input: BuildAiTurnInput) {
  return {
    tools: buildAgentTurnTools(input),
    messages: [
      {
        role: "system" as const,
        content: "You are playing Werewolf. Use exactly one available tool to act.",
      },
    ],
  };
}
```

Create `apps/runtime-worker/src/index.ts`:

```ts
console.log("werewolf runtime worker ready");
```

- [ ] **Step 4: Run tests**

Run:

```bash
pnpm test apps/runtime-worker/src/runtime/tick.test.ts
pnpm --filter @werewolf/runtime-worker typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/runtime-worker
git commit -m "feat: add runtime tick decision skeleton"
```

---

### Task 11: SSE Events And Perspective Filtering

**Files:**
- Create: `apps/api/src/services/perspective-service.ts`
- Create: `apps/api/src/services/sse-broker.ts`
- Create: `apps/api/src/routes/events.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/src/services/perspective-service.test.ts`

- [ ] **Step 1: Write failing perspective tests**

Create `apps/api/src/services/perspective-service.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { canSeeEvent } from "./perspective-service";

describe("canSeeEvent", () => {
  it("allows public events for everyone", () => {
    expect(canSeeEvent({ playerId: "p1", team: "good" }, "public")).toBe(true);
  });

  it("allows private user events only for that player", () => {
    expect(canSeeEvent({ playerId: "p1", team: "good" }, "private:user:p1")).toBe(true);
    expect(canSeeEvent({ playerId: "p2", team: "good" }, "private:user:p1")).toBe(false);
  });

  it("allows wolf team events only for wolves", () => {
    expect(canSeeEvent({ playerId: "p1", team: "wolf" }, "private:team:wolf")).toBe(true);
    expect(canSeeEvent({ playerId: "p2", team: "good" }, "private:team:wolf")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
pnpm test apps/api/src/services/perspective-service.test.ts
```

Expected: FAIL because `perspective-service.ts` is missing.

- [ ] **Step 3: Implement perspective and SSE services**

Create `apps/api/src/services/perspective-service.ts`:

```ts
export interface ViewerPerspective {
  playerId: string;
  team: "wolf" | "good";
}

export function canSeeEvent(viewer: ViewerPerspective, visibility: string): boolean {
  if (visibility === "public") return true;
  if (visibility === "runtime") return false;
  if (visibility === "private:team:wolf") return viewer.team === "wolf";
  if (visibility.startsWith("private:user:")) {
    return visibility.slice("private:user:".length) === viewer.playerId;
  }
  return false;
}
```

Create `apps/api/src/services/sse-broker.ts`:

```ts
export class SseBroker {
  private listeners = new Map<string, Set<(payload: string) => void>>();

  subscribe(gameRoomId: string, listener: (payload: string) => void): () => void {
    const set = this.listeners.get(gameRoomId) ?? new Set();
    set.add(listener);
    this.listeners.set(gameRoomId, set);
    return () => {
      set.delete(listener);
      if (set.size === 0) {
        this.listeners.delete(gameRoomId);
      }
    };
  }

  publish(gameRoomId: string, payload: unknown): void {
    const serialized = `data: ${JSON.stringify(payload)}\n\n`;
    for (const listener of this.listeners.get(gameRoomId) ?? []) {
      listener(serialized);
    }
  }
}
```

Create `apps/api/src/routes/events.ts`:

```ts
import { Hono } from "hono";
import type { SseBroker } from "../services/sse-broker";

export function createEventsRoutes(broker: SseBroker): Hono {
  const app = new Hono();
  app.get("/:gameRoomId/subscribe", (c) => {
    const stream = new ReadableStream({
      start(controller) {
        const unsubscribe = broker.subscribe(c.req.param("gameRoomId"), (payload) => {
          controller.enqueue(new TextEncoder().encode(payload));
        });
        c.req.raw.signal.addEventListener("abort", unsubscribe);
      },
    });
    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
      },
    });
  });
  return app;
}
```

Modify `apps/api/src/app.ts`:

```ts
import { Hono } from "hono";
import { createEventsRoutes } from "./routes/events";
import { createGamesRoutes, type GamesRouteDeps } from "./routes/games";
import { SseBroker } from "./services/sse-broker";

export type AppDeps = GamesRouteDeps & { broker?: SseBroker };

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();
  const broker = deps.broker ?? new SseBroker();
  app.route("/games", createGamesRoutes(deps));
  app.route("/games", createEventsRoutes(broker));
  return app;
}
```

- [ ] **Step 4: Run tests**

Run:

```bash
pnpm test apps/api/src/services/perspective-service.test.ts apps/api/src/routes/games.test.ts apps/api/src/routes/game-lifecycle.test.ts
pnpm --filter @werewolf/api typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api
git commit -m "feat: add perspective filtering and SSE broker"
```

---

### Task 12: Web MVP

**Files:**
- Create: `apps/web/index.html`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/api/client.ts`
- Create: `apps/web/src/routes/__root.tsx`
- Create: `apps/web/src/routes/create.tsx`
- Create: `apps/web/src/routes/game.$gameRoomId.tsx`
- Create: `apps/web/src/components/WaitingRoom.tsx`
- Create: `apps/web/src/components/GameTable.tsx`
- Create: `apps/web/src/components/PrivatePanel.tsx`

- [ ] **Step 1: Create Web HTML entry**

Write `apps/web/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Werewolf</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Create API client**

Write `apps/web/src/api/client.ts`:

```ts
export interface ApiClientOptions {
  baseUrl: string;
  getMatrixToken(): string;
}

export function createApiClient(options: ApiClientOptions) {
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${options.baseUrl}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${options.getMatrixToken()}`,
        ...(init.headers ?? {}),
      },
    });
    if (!response.ok) {
      throw new Error(await response.text());
    }
    return (await response.json()) as T;
  }

  return {
    createGame(body: unknown) {
      return request<{ gameRoomId: string; card: Record<string, unknown> }>("/games", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    joinGame(gameRoomId: string) {
      return request<{ player: unknown }>(`/games/${gameRoomId}/join`, { method: "POST" });
    },
    startGame(gameRoomId: string) {
      return request<{ status: string }>(`/games/${gameRoomId}/start`, { method: "POST" });
    },
  };
}
```

- [ ] **Step 3: Create React entry and routes**

Write `apps/web/src/main.tsx`:

```tsx
import React from "react";
import { createRoot } from "react-dom/client";
import { CreateGamePage } from "./routes/create";

createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <CreateGamePage />
  </React.StrictMode>
);
```

Write `apps/web/src/routes/__root.tsx`:

```tsx
export function RootLayout({ children }: { children: React.ReactNode }) {
  return <main style={{ minHeight: "100vh", background: "#111", color: "#f6f3ec" }}>{children}</main>;
}
```

Write `apps/web/src/routes/create.tsx`:

```tsx
import { useState } from "react";
import { createApiClient } from "../api/client";

export function CreateGamePage() {
  const [title, setTitle] = useState("狼人杀");
  const [sourceMatrixRoomId, setSourceMatrixRoomId] = useState("!room:example.com");
  const [targetPlayerCount, setTargetPlayerCount] = useState(6);
  const [createdUrl, setCreatedUrl] = useState("");

  const client = createApiClient({
    baseUrl: import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000",
    getMatrixToken: () => localStorage.getItem("matrixToken") ?? "matrix-token-alice",
  });

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const result = await client.createGame({
      sourceMatrixRoomId,
      title,
      targetPlayerCount,
      timing: { nightActionSeconds: 45, speechSeconds: 60, voteSeconds: 30 },
      allowedSourceMatrixRoomIds: [],
    });
    setCreatedUrl(String(result.card.webUrl));
  }

  return (
    <main style={{ padding: 24, maxWidth: 920, margin: "0 auto" }}>
      <form onSubmit={submit} style={{ display: "grid", gap: 16 }}>
        <h1>Werewolf</h1>
        <label>
          Title
          <input value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label>
          Source Matrix Room
          <input value={sourceMatrixRoomId} onChange={(event) => setSourceMatrixRoomId(event.target.value)} />
        </label>
        <label>
          Players
          <input
            type="number"
            min={6}
            max={12}
            value={targetPlayerCount}
            onChange={(event) => setTargetPlayerCount(Number(event.target.value))}
          />
        </label>
        <button type="submit">Create Game</button>
        {createdUrl ? <p>Game card URL: {createdUrl}</p> : null}
      </form>
    </main>
  );
}
```

- [ ] **Step 4: Create room components**

Write `apps/web/src/components/WaitingRoom.tsx`:

```tsx
export function WaitingRoom({ players }: { players: Array<{ id: string; displayName: string }> }) {
  return (
    <section>
      <h2>Waiting Room</h2>
      <ul>
        {players.map((player) => (
          <li key={player.id}>{player.displayName}</li>
        ))}
      </ul>
    </section>
  );
}
```

Write `apps/web/src/components/GameTable.tsx`:

```tsx
export function GameTable({ phase, deadlineAt }: { phase: string; deadlineAt: string | null }) {
  return (
    <section>
      <h2>{phase}</h2>
      <p>{deadlineAt ? `Deadline: ${deadlineAt}` : "No active deadline"}</p>
    </section>
  );
}
```

Write `apps/web/src/components/PrivatePanel.tsx`:

```tsx
export function PrivatePanel({ role }: { role?: string }) {
  return (
    <aside>
      <h2>Your Role</h2>
      <p>{role ?? "Hidden until game starts"}</p>
    </aside>
  );
}
```

Write `apps/web/src/routes/game.$gameRoomId.tsx`:

```tsx
import { GameTable } from "../components/GameTable";
import { PrivatePanel } from "../components/PrivatePanel";
import { WaitingRoom } from "../components/WaitingRoom";

export function GameRoomPage() {
  return (
    <main style={{ padding: 24, display: "grid", gap: 16 }}>
      <WaitingRoom players={[]} />
      <GameTable phase="waiting" deadlineAt={null} />
      <PrivatePanel />
    </main>
  );
}
```

- [ ] **Step 5: Verify Web build**

Run:

```bash
pnpm --filter @werewolf/web typecheck
pnpm --filter @werewolf/web build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web
git commit -m "feat: add web game room MVP"
```

---

### Task 13: Smoke Test Harness

**Files:**
- Create: `apps/api/src/smoke.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write smoke test**

Create `apps/api/src/smoke.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import { createTestDeps } from "./test-utils";

describe("werewolf vertical smoke", () => {
  it("creates a game, joins creator, and rejects early start", async () => {
    const app = createApp(createTestDeps());
    const create = await app.request("/games", {
      method: "POST",
      headers: { authorization: "Bearer matrix-token-alice", "content-type": "application/json" },
      body: JSON.stringify({
        sourceMatrixRoomId: "!source:example.com",
        title: "Smoke Game",
        targetPlayerCount: 6,
        timing: { nightActionSeconds: 45, speechSeconds: 60, voteSeconds: 30 },
        allowedSourceMatrixRoomIds: [],
      }),
    });
    expect(create.status).toBe(201);
    const { gameRoomId } = await create.json();

    const join = await app.request(`/games/${gameRoomId}/join`, {
      method: "POST",
      headers: { authorization: "Bearer matrix-token-alice" },
    });
    expect(join.status).toBe(200);

    const start = await app.request(`/games/${gameRoomId}/start`, {
      method: "POST",
      headers: { authorization: "Bearer matrix-token-alice" },
    });
    expect(start.status).toBe(409);
  });
});
```

- [ ] **Step 2: Add root smoke script**

Modify `package.json` scripts:

```json
{
  "scripts": {
    "build": "pnpm -r build",
    "dev": "pnpm --parallel --filter @werewolf/api --filter @werewolf/runtime-worker --filter @werewolf/web dev",
    "smoke": "vitest run apps/api/src/smoke.test.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "pnpm -r typecheck"
  }
}
```

- [ ] **Step 3: Run full verification**

Run:

```bash
pnpm test
pnpm typecheck
pnpm smoke
pnpm --filter @werewolf/web build
```

Expected: all commands exit 0.

- [ ] **Step 4: Commit**

```bash
git add package.json apps/api/src/smoke.test.ts
git commit -m "test: add vertical smoke coverage"
```

---

### Task 14: Night, Vote, And Win Resolution Engine

**Files:**
- Create: `packages/werewolf-engine/src/night.ts`
- Create: `packages/werewolf-engine/src/day.ts`
- Create: `packages/werewolf-engine/src/tick.ts`
- Modify: `packages/werewolf-engine/src/index.ts`
- Test: `packages/werewolf-engine/src/night.test.ts`
- Test: `packages/werewolf-engine/src/day.test.ts`
- Test: `packages/werewolf-engine/src/tick.test.ts`

- [ ] **Step 1: Write failing night resolution tests**

Create `packages/werewolf-engine/src/night.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolveNight } from "./night";

describe("resolveNight", () => {
  it("kills the wolf target when not guarded or healed", () => {
    const result = resolveNight({
      gameRoomId: "game_1",
      day: 1,
      alivePlayerIds: ["wolf", "guard", "witch", "seer", "villager", "villager2"],
      actions: [
        { actorPlayerId: "wolf", kind: "wolfKill", targetPlayerId: "villager" },
        { actorPlayerId: "guard", kind: "guardProtect", targetPlayerId: "seer" },
      ],
      now: new Date("2026-05-09T10:00:00.000Z"),
    });
    expect(result.eliminatedPlayerIds).toEqual(["villager"]);
    expect(result.events.some((event) => event.type === "night_resolved")).toBe(true);
  });

  it("prevents wolf death when guard protects the target", () => {
    const result = resolveNight({
      gameRoomId: "game_1",
      day: 1,
      alivePlayerIds: ["wolf", "guard", "witch", "seer", "villager", "villager2"],
      actions: [
        { actorPlayerId: "wolf", kind: "wolfKill", targetPlayerId: "villager" },
        { actorPlayerId: "guard", kind: "guardProtect", targetPlayerId: "villager" },
      ],
      now: new Date("2026-05-09T10:00:00.000Z"),
    });
    expect(result.eliminatedPlayerIds).toEqual([]);
  });

  it("adds poison death even when wolf kill is healed", () => {
    const result = resolveNight({
      gameRoomId: "game_1",
      day: 1,
      alivePlayerIds: ["wolf", "guard", "witch", "seer", "villager", "villager2"],
      actions: [
        { actorPlayerId: "wolf", kind: "wolfKill", targetPlayerId: "villager" },
        { actorPlayerId: "witch", kind: "witchHeal", targetPlayerId: "villager" },
        { actorPlayerId: "witch", kind: "witchPoison", targetPlayerId: "wolf" },
      ],
      now: new Date("2026-05-09T10:00:00.000Z"),
    });
    expect(result.eliminatedPlayerIds).toEqual(["wolf"]);
  });
});
```

- [ ] **Step 2: Write failing vote and winner tests**

Create `packages/werewolf-engine/src/day.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolveDayVote, determineWinner } from "./day";

describe("resolveDayVote", () => {
  it("exiles the highest voted player", () => {
    const result = resolveDayVote({
      gameRoomId: "game_1",
      day: 1,
      alivePlayerIds: ["p1", "p2", "p3", "p4"],
      votes: [
        { actorPlayerId: "p1", targetPlayerId: "p3" },
        { actorPlayerId: "p2", targetPlayerId: "p3" },
        { actorPlayerId: "p3", targetPlayerId: "p2" },
      ],
      now: new Date("2026-05-09T10:00:00.000Z"),
    });
    expect(result.exiledPlayerId).toBe("p3");
    expect(result.events.map((event) => event.type)).toContain("player_eliminated");
  });

  it("exiles nobody on tie", () => {
    const result = resolveDayVote({
      gameRoomId: "game_1",
      day: 1,
      alivePlayerIds: ["p1", "p2", "p3", "p4"],
      votes: [
        { actorPlayerId: "p1", targetPlayerId: "p3" },
        { actorPlayerId: "p2", targetPlayerId: "p4" },
      ],
      now: new Date("2026-05-09T10:00:00.000Z"),
    });
    expect(result.exiledPlayerId).toBeNull();
  });
});

describe("determineWinner", () => {
  it("returns wolf when wolves reach parity", () => {
    expect(
      determineWinner([
        { playerId: "w1", role: "werewolf", alive: true },
        { playerId: "g1", role: "villager", alive: true },
      ])
    ).toBe("wolf");
  });

  it("returns good when all wolves are dead", () => {
    expect(
      determineWinner([
        { playerId: "w1", role: "werewolf", alive: false },
        { playerId: "g1", role: "villager", alive: true },
      ])
    ).toBe("good");
  });
});
```

Create `packages/werewolf-engine/src/tick.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { nextPhaseAfterClosedPhase } from "./tick";

describe("nextPhaseAfterClosedPhase", () => {
  it("advances through fixed night order", () => {
    expect(nextPhaseAfterClosedPhase("night_guard")).toBe("night_wolf");
    expect(nextPhaseAfterClosedPhase("night_wolf")).toBe("night_witch_heal");
    expect(nextPhaseAfterClosedPhase("night_witch_heal")).toBe("night_witch_poison");
    expect(nextPhaseAfterClosedPhase("night_witch_poison")).toBe("night_seer");
    expect(nextPhaseAfterClosedPhase("night_seer")).toBe("night_resolution");
  });

  it("moves from day vote to day resolution", () => {
    expect(nextPhaseAfterClosedPhase("day_vote")).toBe("day_resolution");
  });
});
```

- [ ] **Step 3: Run tests to verify failure**

Run:

```bash
pnpm test packages/werewolf-engine/src/night.test.ts packages/werewolf-engine/src/day.test.ts packages/werewolf-engine/src/tick.test.ts
```

Expected: FAIL because `night.ts`, `day.ts`, and `tick.ts` are missing.

- [ ] **Step 4: Implement night resolution**

Create `packages/werewolf-engine/src/night.ts`:

```ts
import type { GameEvent } from "@werewolf/shared";

export type NightAction =
  | { actorPlayerId: string; kind: "wolfKill"; targetPlayerId: string }
  | { actorPlayerId: string; kind: "guardProtect"; targetPlayerId: string }
  | { actorPlayerId: string; kind: "witchHeal"; targetPlayerId: string }
  | { actorPlayerId: string; kind: "witchPoison"; targetPlayerId: string }
  | { actorPlayerId: string; kind: "seerInspect"; targetPlayerId: string }
  | { actorPlayerId: string; kind: "passAction" };

export interface ResolveNightInput {
  gameRoomId: string;
  day: number;
  alivePlayerIds: string[];
  actions: NightAction[];
  now: Date;
}

export interface ResolveNightResult {
  eliminatedPlayerIds: string[];
  events: GameEvent[];
}

function latestTarget(actions: NightAction[], kind: NightAction["kind"]): string | null {
  const matching = actions.filter((action) => action.kind === kind && "targetPlayerId" in action);
  const latest = matching.at(-1);
  return latest && "targetPlayerId" in latest ? latest.targetPlayerId : null;
}

export function resolveNight(input: ResolveNightInput): ResolveNightResult {
  const wolfTarget = latestTarget(input.actions, "wolfKill");
  const guardTarget = latestTarget(input.actions, "guardProtect");
  const healTarget = latestTarget(input.actions, "witchHeal");
  const poisonTarget = latestTarget(input.actions, "witchPoison");

  const deaths = new Set<string>();
  if (wolfTarget && wolfTarget !== guardTarget && wolfTarget !== healTarget) {
    deaths.add(wolfTarget);
  }
  if (poisonTarget) {
    deaths.add(poisonTarget);
  }

  const eliminatedPlayerIds = [...deaths].filter((playerId) =>
    input.alivePlayerIds.includes(playerId)
  );
  const createdAt = input.now.toISOString();
  const events: GameEvent[] = [
    {
      id: "pending",
      gameRoomId: input.gameRoomId,
      seq: 1,
      type: "night_resolved",
      visibility: "runtime",
      actorId: "runtime",
      payload: {
        day: input.day,
        wolfTarget,
        guardTarget,
        healTarget,
        poisonTarget,
        eliminatedPlayerIds,
      },
      createdAt,
    },
    ...eliminatedPlayerIds.map((playerId, index) => ({
      id: "pending",
      gameRoomId: input.gameRoomId,
      seq: index + 2,
      type: "player_eliminated" as const,
      visibility: "public" as const,
      actorId: "runtime",
      subjectId: playerId,
      payload: { playerId, reason: "night" },
      createdAt,
    })),
  ];
  return { eliminatedPlayerIds, events };
}
```

- [ ] **Step 5: Implement day resolution and win checks**

Create `packages/werewolf-engine/src/day.ts`:

```ts
import type { Role, GameEvent } from "@werewolf/shared";

export interface VoteRecord {
  actorPlayerId: string;
  targetPlayerId: string;
}

export interface ResolveDayVoteInput {
  gameRoomId: string;
  day: number;
  alivePlayerIds: string[];
  votes: VoteRecord[];
  now: Date;
}

export interface ResolveDayVoteResult {
  exiledPlayerId: string | null;
  tally: Record<string, number>;
  events: GameEvent[];
}

export function resolveDayVote(input: ResolveDayVoteInput): ResolveDayVoteResult {
  const tally: Record<string, number> = {};
  for (const vote of input.votes) {
    if (!input.alivePlayerIds.includes(vote.actorPlayerId)) continue;
    if (!input.alivePlayerIds.includes(vote.targetPlayerId)) continue;
    tally[vote.targetPlayerId] = (tally[vote.targetPlayerId] ?? 0) + 1;
  }
  const sorted = Object.entries(tally).sort((a, b) => b[1] - a[1]);
  const top = sorted[0];
  const second = sorted[1];
  const exiledPlayerId = top && (!second || top[1] > second[1]) ? top[0] : null;
  const createdAt = input.now.toISOString();
  const events: GameEvent[] = [
    {
      id: "pending",
      gameRoomId: input.gameRoomId,
      seq: 1,
      type: "phase_closed",
      visibility: "public",
      actorId: "runtime",
      payload: { phase: "day_vote", day: input.day, tally, exiledPlayerId },
      createdAt,
    },
  ];
  if (exiledPlayerId) {
    events.push({
      id: "pending",
      gameRoomId: input.gameRoomId,
      seq: 2,
      type: "player_eliminated",
      visibility: "public",
      actorId: "runtime",
      subjectId: exiledPlayerId,
      payload: { playerId: exiledPlayerId, reason: "vote" },
      createdAt,
    });
  }
  return { exiledPlayerId, tally, events };
}

export interface WinnerPlayerState {
  playerId: string;
  role: Role;
  alive: boolean;
}

export function determineWinner(players: WinnerPlayerState[]): "wolf" | "good" | null {
  const alive = players.filter((player) => player.alive);
  const wolves = alive.filter((player) => player.role === "werewolf").length;
  const good = alive.length - wolves;
  if (wolves === 0) return "good";
  if (wolves >= good) return "wolf";
  return null;
}
```

- [ ] **Step 6: Implement phase order**

Create `packages/werewolf-engine/src/tick.ts`:

```ts
import type { GamePhase } from "@werewolf/shared";

const phaseOrder: GamePhase[] = [
  "night_guard",
  "night_wolf",
  "night_witch_heal",
  "night_witch_poison",
  "night_seer",
  "night_resolution",
  "day_speak",
  "day_vote",
  "day_resolution",
];

export function nextPhaseAfterClosedPhase(phase: GamePhase): GamePhase {
  if (phase === "day_resolution") return "night_guard";
  const index = phaseOrder.indexOf(phase);
  if (index < 0 || index + 1 >= phaseOrder.length) {
    throw new Error(`No next phase for ${phase}`);
  }
  return phaseOrder[index + 1]!;
}
```

Modify `packages/werewolf-engine/src/index.ts`:

```ts
export * from "./actions";
export * from "./commands";
export * from "./day";
export * from "./events";
export * from "./night";
export * from "./projection";
export * from "./roles";
export * from "./start";
export * from "./state";
export * from "./tick";
```

- [ ] **Step 7: Run tests**

Run:

```bash
pnpm test packages/werewolf-engine/src/night.test.ts packages/werewolf-engine/src/day.test.ts packages/werewolf-engine/src/tick.test.ts
pnpm --filter @werewolf/engine typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/werewolf-engine
git commit -m "feat: add werewolf settlement engine"
```

---

### Task 15: Wire Start API To Engine Events

**Files:**
- Modify: `apps/api/src/services/game-service.ts`
- Modify: `apps/api/src/routes/games.ts`
- Test: `apps/api/src/routes/start-engine.test.ts`

- [ ] **Step 1: Write failing start integration test**

Create `apps/api/src/routes/start-engine.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createApp } from "../app";
import { createTestDeps } from "../test-utils";

async function createGame(app: ReturnType<typeof createApp>) {
  const response = await app.request("/games", {
    method: "POST",
    headers: { authorization: "Bearer matrix-token-alice", "content-type": "application/json" },
    body: JSON.stringify({
      sourceMatrixRoomId: "!source:example.com",
      title: "Start Engine",
      targetPlayerCount: 6,
      timing: { nightActionSeconds: 45, speechSeconds: 60, voteSeconds: 30 },
      allowedSourceMatrixRoomIds: [],
    }),
  });
  return (await response.json()).gameRoomId as string;
}

describe("start API engine integration", () => {
  it("returns start events when six players are seated", async () => {
    const deps = createTestDeps();
    const app = createApp(deps);
    const gameRoomId = await createGame(app);
    for (const token of [
      "matrix-token-alice",
      "matrix-token-bob",
      "matrix-token-cara",
      "matrix-token-dan",
      "matrix-token-erin",
      "matrix-token-finn",
    ]) {
      const join = await app.request(`/games/${gameRoomId}/join`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(join.status).toBe(200);
    }
    const start = await app.request(`/games/${gameRoomId}/start`, {
      method: "POST",
      headers: { authorization: "Bearer matrix-token-alice" },
    });
    expect(start.status).toBe(200);
    const body = await start.json();
    expect(body.status).toBe("active");
    expect(body.events.map((event: { type: string }) => event.type)).toEqual([
      "game_started",
      "roles_assigned",
      "phase_started",
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
pnpm test apps/api/src/routes/start-engine.test.ts
```

Expected: FAIL because test deps only know Alice or because start does not return events.

- [ ] **Step 3: Extend test identities**

Modify `apps/api/src/test-utils.ts`:

```ts
import { InMemoryGameService } from "./services/game-service";

const tokenUsers: Record<string, string> = {
  "matrix-token-alice": "@alice:example.com",
  "matrix-token-bob": "@bob:example.com",
  "matrix-token-cara": "@cara:example.com",
  "matrix-token-dan": "@dan:example.com",
  "matrix-token-erin": "@erin:example.com",
  "matrix-token-finn": "@finn:example.com",
};

export function createTestDeps() {
  return {
    games: new InMemoryGameService(),
    matrix: {
      async whoami(token: string) {
        const userId = tokenUsers[token];
        if (userId) return { user_id: userId };
        throw new Error("invalid token");
      },
    },
  };
}
```

- [ ] **Step 4: Wire `startGame` engine into service**

Modify the `start` method in `apps/api/src/services/game-service.ts`:

```ts
import { startGame } from "@werewolf/engine";
```

Replace `start` with:

```ts
  start(gameRoomId: string, userId: string) {
    const room = this.requireWaitingRoom(gameRoomId);
    if (room.creatorUserId !== userId) {
      throw new AppError("forbidden", "Only creator can start the game", 403);
    }
    const activePlayers = room.players.filter((player) => !player.leftAt);
    if (activePlayers.length !== room.targetPlayerCount) {
      throw new AppError("conflict", `Need ${room.targetPlayerCount} active players to start`, 409);
    }
    const result = startGame({
      gameRoomId,
      targetPlayerCount: room.targetPlayerCount,
      seats: activePlayers.map((player) => ({
        playerId: player.id,
        displayName: player.displayName,
        seatNo: player.seatNo,
        kind: player.kind,
      })),
      now: new Date("2026-05-09T10:00:00.000Z"),
      shuffleSeed: gameRoomId,
      timing: room.timing,
    });
    room.status = "active";
    return { room, ...result };
  }
```

- [ ] **Step 5: Return engine events from route**

Modify the `POST /:gameRoomId/start` handler in `apps/api/src/routes/games.ts`:

```ts
  app.post("/:gameRoomId/start", async (c) => {
    try {
      const user = await authenticateRequest(c.req.raw, deps.matrix);
      const result = deps.games.start(c.req.param("gameRoomId"), user.id);
      return c.json({
        status: result.room.status,
        projection: result.projection,
        events: result.events,
      });
    } catch (error) {
      if (error instanceof AppError) return c.json({ error: error.message, code: error.code }, error.status);
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 400);
    }
  });
```

- [ ] **Step 6: Run tests**

Run:

```bash
pnpm test apps/api/src/routes/start-engine.test.ts apps/api/src/routes/game-lifecycle.test.ts
pnpm --filter @werewolf/api typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api
git commit -m "feat: wire game start API to engine"
```

---

### Task 16: Persistent Drizzle Repository Adapter

**Files:**
- Modify: `packages/db/package.json`
- Create: `packages/db/drizzle.config.ts`
- Create: `packages/db/src/repositories/drizzle-events.ts`
- Create: `packages/db/src/repositories/drizzle-rooms.ts`
- Modify: `packages/db/src/client.ts`
- Test: `packages/db/src/repositories/drizzle-events.test.ts`

- [ ] **Step 1: Add migration tooling dependency**

Modify `packages/db/package.json` to include `drizzle-kit` in `devDependencies`:

```json
{
  "devDependencies": {
    "drizzle-kit": "^0.31.0",
    "typescript": "^5.9.0",
    "vitest": "^4.0.0"
  }
}
```

Keep the existing `dependencies` from Task 1 and Task 6.

- [ ] **Step 2: Add Drizzle config**

Create `packages/db/drizzle.config.ts`:

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/werewolf",
  },
});
```

- [ ] **Step 3: Write failing persistent event adapter test**

Create `packages/db/src/repositories/drizzle-events.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createDrizzleEventRepositorySql } from "./drizzle-events";

describe("createDrizzleEventRepositorySql", () => {
  it("uses room scoped max seq before insert", () => {
    const sql = createDrizzleEventRepositorySql("game_1", 2);
    expect(sql.lockKey).toBe("events:game_1");
    expect(sql.insertCount).toBe(2);
  });
});
```

- [ ] **Step 4: Run test to verify failure**

Run:

```bash
pnpm test packages/db/src/repositories/drizzle-events.test.ts
```

Expected: FAIL because `drizzle-events.ts` is missing.

- [ ] **Step 5: Implement Drizzle event adapter planning surface**

Create `packages/db/src/repositories/drizzle-events.ts`:

```ts
import type { GameEvent } from "@werewolf/shared";

export interface DrizzleEventAppendPlan {
  lockKey: string;
  insertCount: number;
}

export function createDrizzleEventRepositorySql(
  gameRoomId: string,
  insertCount: number
): DrizzleEventAppendPlan {
  return {
    lockKey: `events:${gameRoomId}`,
    insertCount,
  };
}

export interface DrizzleEventRepository {
  append(gameRoomId: string, events: GameEvent[]): Promise<GameEvent[]>;
  listAfter(gameRoomId: string, afterSeq: number): Promise<GameEvent[]>;
}
```

Create `packages/db/src/repositories/drizzle-rooms.ts`:

```ts
export interface RuntimeLeaseResult {
  gameRoomId: string;
  leaseUntil: Date;
}

export interface DrizzleRoomRepository {
  acquireRuntimeLease(now: Date, leaseMs: number): Promise<RuntimeLeaseResult[]>;
  releaseRuntimeLease(gameRoomId: string): Promise<void>;
}
```

Modify `packages/db/src/client.ts`:

```ts
export * from "./schema";
export * from "./repositories/drizzle-events";
export * from "./repositories/drizzle-rooms";
export * from "./repositories/events";
export * from "./repositories/projections";
export * from "./repositories/rooms";
export * from "./repositories/users";
```

- [ ] **Step 6: Generate migration files**

Run:

```bash
pnpm --filter @werewolf/db exec drizzle-kit generate
```

Expected: command exits 0 and creates files under `packages/db/drizzle`.

- [ ] **Step 7: Run tests and typecheck**

Run:

```bash
pnpm test packages/db/src/repositories/drizzle-events.test.ts packages/db/src/repositories/events.test.ts
pnpm --filter @werewolf/db typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/db
git commit -m "feat: add persistent repository adapter surface"
```

---

## Final Verification

Run:

```bash
git status --short
pnpm test
pnpm typecheck
pnpm --filter @werewolf/web build
```

Expected:

- `git status --short` shows no uncommitted changes.
- Tests pass.
- Typecheck passes.
- Web build passes.

## Follow-Up Plans

After this MVP lands, write separate plans for:

- Replacing API in-memory service methods with the persistent repository adapter once a development Postgres container is selected.
- Post-game summary generation.
- Matrix card sender integration.
- Production deployment and observability.
