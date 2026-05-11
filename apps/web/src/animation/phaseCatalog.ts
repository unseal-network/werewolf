export type PhaseId =
  | "lobby"
  | "deal"
  | "night"
  | "guard"
  | "wolf"
  | "witch-save"
  | "witch-poison"
  | "seer"
  | "day"
  | "dayResolution"
  | "vote"
  | "tie"
  | "end";

export type SceneId =
  | "lobby"
  | "deal"
  | "night"
  | "daySpeech"
  | "vote"
  | "end";

export interface AnimationCue {
  phaseId: PhaseId;
  label: string;
  scene: SceneId;
  entryMs: number;
  loopMs: number | null;
  showLogCapsule: boolean;
  showRoleCard: boolean;
  targetMode: "none" | "highlightOnly" | "highlightAndConfirm";
  canAct: boolean;
  allowTimeline: boolean;
}

const catalog: Record<PhaseId, Omit<AnimationCue, "phaseId">> = {
  lobby: {
    label: "准备",
    scene: "lobby",
    entryMs: 180,
    loopMs: null,
    showLogCapsule: false,
    showRoleCard: false,
    targetMode: "none",
    canAct: false,
    allowTimeline: false,
  },
  deal: {
    label: "身份卡发放",
    scene: "deal",
    entryMs: 360,
    loopMs: null,
    showLogCapsule: false,
    showRoleCard: true,
    targetMode: "none",
    canAct: false,
    allowTimeline: false,
  },
  night: {
    label: "夜晚",
    scene: "night",
    entryMs: 220,
    loopMs: 1200,
    showLogCapsule: true,
    showRoleCard: false,
    targetMode: "none",
    canAct: false,
    allowTimeline: true,
  },
  guard: {
    label: "守卫",
    scene: "night",
    entryMs: 220,
    loopMs: 1200,
    showLogCapsule: true,
    showRoleCard: false,
    targetMode: "highlightAndConfirm",
    canAct: true,
    allowTimeline: true,
  },
  wolf: {
    label: "狼人",
    scene: "night",
    entryMs: 220,
    loopMs: 1200,
    showLogCapsule: true,
    showRoleCard: false,
    targetMode: "highlightAndConfirm",
    canAct: true,
    allowTimeline: true,
  },
  "witch-save": {
    label: "女巫救人",
    scene: "night",
    entryMs: 220,
    loopMs: 1200,
    showLogCapsule: true,
    showRoleCard: false,
    targetMode: "highlightAndConfirm",
    canAct: true,
    allowTimeline: true,
  },
  "witch-poison": {
    label: "女巫毒人",
    scene: "night",
    entryMs: 220,
    loopMs: 1200,
    showLogCapsule: true,
    showRoleCard: false,
    targetMode: "highlightAndConfirm",
    canAct: true,
    allowTimeline: true,
  },
  seer: {
    label: "预言家",
    scene: "night",
    entryMs: 220,
    loopMs: 1200,
    showLogCapsule: true,
    showRoleCard: false,
    targetMode: "highlightAndConfirm",
    canAct: true,
    allowTimeline: true,
  },
  day: {
    label: "白天",
    scene: "daySpeech",
    entryMs: 220,
    loopMs: null,
    showLogCapsule: true,
    showRoleCard: false,
    targetMode: "none",
    canAct: false,
    allowTimeline: true,
  },
  dayResolution: {
    label: "白天结算",
    scene: "daySpeech",
    entryMs: 220,
    loopMs: null,
    showLogCapsule: true,
    showRoleCard: false,
    targetMode: "none",
    canAct: false,
    allowTimeline: true,
  },
  vote: {
    label: "投票",
    scene: "vote",
    entryMs: 220,
    loopMs: 1200,
    showLogCapsule: true,
    showRoleCard: false,
    targetMode: "highlightAndConfirm",
    canAct: true,
    allowTimeline: true,
  },
  tie: {
    label: "平票重投",
    scene: "vote",
    entryMs: 220,
    loopMs: 1200,
    showLogCapsule: true,
    showRoleCard: false,
    targetMode: "highlightAndConfirm",
    canAct: true,
    allowTimeline: true,
  },
  end: {
    label: "结束",
    scene: "end",
    entryMs: 280,
    loopMs: null,
    showLogCapsule: true,
    showRoleCard: false,
    targetMode: "none",
    canAct: false,
    allowTimeline: true,
  },
};

export function getPhaseAnimationCue(phaseId: string): AnimationCue {
  const cue = catalog[phaseId as PhaseId];
  if (!cue) {
    return {
      phaseId: "lobby",
      ...catalog.lobby,
    };
  }

  return {
    phaseId: phaseId as PhaseId,
    ...cue,
  };
}
