import { getPhaseAnimationCue, type PhaseId } from "../animation/phaseCatalog";
import type { ConfirmMode, ActionMode } from "../components/CenterStage";
import type { SceneId } from "../components/GameRoomShell";

export interface PhaseDressing {
  scene: SceneId;
  accent: string;
  kickerKey: string;
  copyKey: string;
  confirmMode: ConfirmMode;
}

export const PHASE_DRESSING: Record<string, PhaseDressing> = {
  lobby: { scene: "lobby", accent: "#435cff", kickerKey: "stage.kicker.lobby", copyKey: "", confirmMode: "vote" },
  deal: { scene: "deal", accent: "#7357d9", kickerKey: "stage.kicker.deal", copyKey: "", confirmMode: "vote" },
  guard: { scene: "night", accent: "#2c8cff", kickerKey: "stage.kicker.guard", copyKey: "", confirmMode: "guard" },
  wolf: { scene: "night", accent: "#c43d4d", kickerKey: "stage.kicker.wolf", copyKey: "", confirmMode: "wolf" },
  "witch-save": { scene: "night", accent: "#28a86d", kickerKey: "stage.kicker.witchHeal", copyKey: "", confirmMode: "witch-save" },
  "witch-poison": { scene: "night", accent: "#7751d9", kickerKey: "stage.kicker.witchPoison", copyKey: "", confirmMode: "witch-poison" },
  seer: { scene: "night", accent: "#1d95b8", kickerKey: "stage.kicker.seer", copyKey: "", confirmMode: "seer" },
  night: { scene: "night", accent: "#2c8cff", kickerKey: "stage.kicker.nightResolution", copyKey: "", confirmMode: "vote" },
  day: { scene: "day", accent: "#d58b21", kickerKey: "stage.kicker.daySpeak", copyKey: "", confirmMode: "vote" },
  dayResolution: { scene: "day", accent: "#d58b21", kickerKey: "stage.kicker.dayResolution", copyKey: "", confirmMode: "vote" },
  vote: { scene: "vote", accent: "#d84848", kickerKey: "stage.kicker.dayVote", copyKey: "", confirmMode: "vote" },
  tie: { scene: "tie", accent: "#b554d9", kickerKey: "stage.kicker.tieVote", copyKey: "", confirmMode: "vote" },
  end: { scene: "end", accent: "#13a36c", kickerKey: "stage.kicker.end", copyKey: "", confirmMode: "vote" },
};

export interface PhaseUiSpec {
  phaseId: PhaseId;
  labelKey: string;
  rawLabel?: string;
  actionMode: ActionMode;
  canRunRuntime: boolean;
  canProgress: boolean;
  showTimeline: boolean;
  showRoleCard: boolean;
}

function phaseSpec(
  phaseId: PhaseId,
  labelKey: string,
  actionMode: ActionMode,
  options: {
    canRunRuntime?: boolean;
    canProgress?: boolean;
    rawLabel?: string;
  } = {}
): PhaseUiSpec {
  const cue = getPhaseAnimationCue(phaseId);
  return {
    phaseId,
    labelKey,
    actionMode,
    canRunRuntime: options.canRunRuntime ?? true,
    canProgress: options.canProgress ?? true,
    showTimeline: cue.allowTimeline,
    showRoleCard: cue.showRoleCard,
    ...(options.rawLabel !== undefined ? { rawLabel: options.rawLabel } : {}),
  };
}

export function mapServerPhaseToUi(phase: string | null): PhaseUiSpec {
  if (!phase) {
    return phaseSpec("lobby", "phase.lobby", "lobby", {
      canRunRuntime: false,
      canProgress: false,
    });
  }

  switch (phase) {
    case "role_assignment":
      return phaseSpec("deal", "phase.deal", "deal");
    case "night_guard":
      return phaseSpec("guard", "phase.guard", "night");
    case "night_wolf":
      return phaseSpec("wolf", "phase.wolf", "night");
    case "night_witch_heal":
      return phaseSpec("witch-save", "phase.witchHeal", "night");
    case "night_witch_poison":
      return phaseSpec("witch-poison", "phase.witchPoison", "night");
    case "night_seer":
      return phaseSpec("seer", "phase.seer", "night");
    case "night_resolution":
      return phaseSpec("night", "phase.nightResolution", "night");
    case "day_speak":
      return phaseSpec("day", "phase.daySpeak", "day");
    case "day_vote":
      return phaseSpec("vote", "phase.dayVote", "vote");
    case "tie_speech":
      return phaseSpec("day", "phase.tieSpeech", "day");
    case "tie_vote":
      return phaseSpec("tie", "phase.tieVote", "tie");
    case "day_resolution":
      return phaseSpec("dayResolution", "phase.dayResolution", "waiting", {
        canProgress: false,
      });
    case "post_game":
      return phaseSpec("end", "phase.end", "end", {
        canRunRuntime: false,
        canProgress: false,
      });
    default:
      return phaseSpec("lobby", "phase.lobby", "waiting", {
        canRunRuntime: false,
        canProgress: false,
        rawLabel: phase,
      });
  }
}
