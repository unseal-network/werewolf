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
