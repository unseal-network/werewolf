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

export function resolveNight(input: ResolveNightInput): ResolveNightResult {
  const wolfTarget = latestTarget(input.actions, "wolfKill");
  const guardTarget = latestTarget(input.actions, "guardProtect");
  const healTarget = latestTarget(input.actions, "witchHeal");
  const poisonTarget = latestTarget(input.actions, "witchPoison");

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
