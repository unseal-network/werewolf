import type { GameEvent, GamePhase, Role } from "@werewolf/shared";
import type { PlayerPrivateState } from "./state";

export type NightAction =
  | {
      actorPlayerId: string;
      kind: "wolfKill";
      targetPlayerId: string;
      day?: number;
      phase?: GamePhase;
    }
  | {
      actorPlayerId: string;
      kind: "guardProtect";
      targetPlayerId: string;
      day?: number;
      phase?: GamePhase;
    }
  | {
      actorPlayerId: string;
      kind: "witchHeal";
      targetPlayerId: string;
      day?: number;
      phase?: GamePhase;
    }
  | {
      actorPlayerId: string;
      kind: "witchPoison";
      targetPlayerId: string;
      day?: number;
      phase?: GamePhase;
    }
  | {
      actorPlayerId: string;
      kind: "seerInspect";
      targetPlayerId: string;
      day?: number;
      phase?: GamePhase;
    }
  | { actorPlayerId: string; kind: "passAction"; day?: number; phase?: GamePhase };

export interface ResolveNightInput {
  gameRoomId: string;
  day: number;
  alivePlayerIds: string[];
  privateStates: PlayerPrivateState[];
  actions: NightAction[];
  now: Date;
}

export interface ResolveNightResult {
  eliminatedPlayerIds: string[];
  events: GameEvent[];
}

function latestTarget(
  actions: NightAction[],
  kind: NightAction["kind"]
): string | null {
  const matching = actions.filter(
    (action) => action.kind === kind && "targetPlayerId" in action
  );
  const latest = matching.at(-1);
  return latest && "targetPlayerId" in latest ? latest.targetPlayerId : null;
}

function expectedRoleForAction(kind: NightAction["kind"]): Role | null {
  if (kind === "wolfKill") return "werewolf";
  if (kind === "guardProtect") return "guard";
  if (kind === "witchHeal" || kind === "witchPoison") return "witch";
  if (kind === "seerInspect") return "seer";
  return null;
}

function expectedPhaseForAction(kind: NightAction["kind"]): GamePhase | null {
  if (kind === "wolfKill") return "night_wolf";
  if (kind === "guardProtect") return "night_guard";
  if (kind === "witchHeal") return "night_witch_heal";
  if (kind === "witchPoison") return "night_witch_poison";
  if (kind === "seerInspect") return "night_seer";
  return null;
}

function assertValidNightActions(input: ResolveNightInput): NightAction[] {
  const states = new Map(input.privateStates.map((state) => [state.playerId, state]));
  const actions = input.actions.filter(
    (action) => action.day === undefined || action.day === input.day
  );
  const counts = new Map<NightAction["kind"], number>();

  for (const action of actions) {
    if (action.kind === "passAction") continue;
    if (!input.alivePlayerIds.includes(action.targetPlayerId)) {
      throw new Error(`${action.kind} target ${action.targetPlayerId} is not alive`);
    }
    const expectedPhase = expectedPhaseForAction(action.kind);
    if (action.phase !== undefined && action.phase !== expectedPhase) {
      throw new Error(`${action.kind} cannot be recorded during ${action.phase}`);
    }

    const expectedRole = expectedRoleForAction(action.kind);
    const actorState = states.get(action.actorPlayerId);
    const canAct =
      action.kind === "wolfKill" && action.actorPlayerId === "wolf_team"
        ? true
        : actorState?.alive === true &&
          input.alivePlayerIds.includes(action.actorPlayerId) &&
          actorState.role === expectedRole;
    if (!canAct) {
      throw new Error(`${action.actorPlayerId} cannot perform ${action.kind}`);
    }
    counts.set(action.kind, (counts.get(action.kind) ?? 0) + 1);
  }

  for (const kind of [
    "wolfKill",
    "guardProtect",
    "witchHeal",
    "witchPoison",
    "seerInspect",
  ] as const) {
    if ((counts.get(kind) ?? 0) > 1) {
      throw new Error(`Multiple ${kind} actions submitted`);
    }
  }

  return actions;
}

export function resolveNight(input: ResolveNightInput): ResolveNightResult {
  const actions = assertValidNightActions(input);
  const wolfTarget = latestTarget(actions, "wolfKill");
  const guardTarget = latestTarget(actions, "guardProtect");
  const healTarget = latestTarget(actions, "witchHeal");
  const poisonTarget = latestTarget(actions, "witchPoison");

  const deaths = new Set<string>();
  if (wolfTarget) {
    const guarded = wolfTarget === guardTarget;
    const healed = wolfTarget === healTarget;
    if ((!guarded && !healed) || (guarded && healed)) {
      deaths.add(wolfTarget);
    }
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
        guardAndHealConflict:
          Boolean(wolfTarget) && wolfTarget === guardTarget && wolfTarget === healTarget,
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
