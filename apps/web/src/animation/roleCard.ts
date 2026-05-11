export type RoleCardState = "hidden" | "entering" | "visible" | "exiting";

export interface RoleCardTransition {
  state: RoleCardState;
  durationMs: number;
  shouldShow: boolean;
}

export function getRoleCardTransition(
  hasPhaseDealt: boolean,
  showReplay: boolean
): RoleCardTransition {
  if (hasPhaseDealt && showReplay) {
    return {
      state: "visible",
      durationMs: 260,
      shouldShow: true,
    };
  }

  if (hasPhaseDealt && !showReplay) {
    return {
      state: "visible",
      durationMs: 260,
      shouldShow: true,
    };
  }

  return {
    state: "hidden",
    durationMs: 180,
    shouldShow: false,
  };
}

export function roleCopyFromId(roleId: string | undefined): string {
  switch (roleId) {
    case "werewolf":
      return "狼人";
    case "seer":
      return "预言家";
    case "witch":
      return "女巫";
    case "guard":
      return "守卫";
    default:
      return "村民";
  }
}
