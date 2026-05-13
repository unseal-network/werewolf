export type RoleId = "werewolf" | "seer" | "witch" | "guard" | "villager";

const PHASE_ROLE: Record<string, RoleId | undefined> = {
  night_guard: "guard",
  night_wolf: "werewolf",
  night_witch_heal: "witch",
  night_witch_poison: "witch",
  night_seer: "seer",
};

export function isNightRoleTurn({
  phase,
  role,
}: {
  phase: string | null | undefined;
  role: string | null | undefined;
}) {
  if (!phase || !role) return false;
  return PHASE_ROLE[phase] === role;
}

export function canUseActionPanel({
  hasPlayer,
  isAlive,
  actionMode,
  hasActedThisPhase,
  hasActionTargets,
  isMyTurnToSpeak,
  phase,
  role,
}: {
  hasPlayer: boolean;
  isAlive: boolean;
  actionMode: string;
  hasActedThisPhase: boolean;
  hasActionTargets: boolean;
  isMyTurnToSpeak: boolean;
  phase: string | null | undefined;
  role: string | null | undefined;
}) {
  if (!hasPlayer || !isAlive) return false;
  if (
    actionMode === "lobby" ||
    actionMode === "deal" ||
    actionMode === "end" ||
    actionMode === "waiting"
  ) {
    return false;
  }
  if (hasActedThisPhase) return false;
  if (hasActionTargets || isMyTurnToSpeak) return true;
  return actionMode === "night" && isNightRoleTurn({ phase, role });
}
