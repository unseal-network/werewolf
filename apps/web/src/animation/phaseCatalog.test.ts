import { describe, expect, it } from "vitest";
import { getPhaseAnimationCue } from "./phaseCatalog";

describe("phase catalog", () => {
  it("maps known game phases to fixed scene/controls contract", () => {
    const cases = [
      {
        phase: "lobby" as const,
        scene: "lobby",
        showLogCapsule: false,
        showRoleCard: false,
      },
      {
        phase: "deal" as const,
        scene: "deal",
        showLogCapsule: false,
        showRoleCard: true,
      },
      {
        phase: "guard" as const,
        scene: "night",
        targetMode: "highlightAndConfirm",
        canAct: true,
      },
      {
        phase: "wolf" as const,
        scene: "night",
        targetMode: "highlightAndConfirm",
        canAct: true,
      },
      {
        phase: "witch-save" as const,
        scene: "night",
        label: "女巫救人",
        canAct: true,
      },
      {
        phase: "witch-poison" as const,
        scene: "night",
        label: "女巫毒人",
        canAct: true,
      },
      {
        phase: "seer" as const,
        targetMode: "highlightAndConfirm",
        scene: "night",
        canAct: true,
      },
      {
        phase: "day" as const,
        scene: "daySpeech",
        canAct: false,
        showRoleCard: false,
      },
      {
        phase: "vote" as const,
        scene: "vote",
        canAct: true,
      },
      {
        phase: "tie" as const,
        scene: "vote",
        canAct: true,
      },
      {
        phase: "end" as const,
        scene: "end",
        showLogCapsule: true,
      },
    ];

    const unique = cases.map((entry) => getPhaseAnimationCue(entry.phase));
    expect(unique).toHaveLength(cases.length);

    for (const [index, item] of cases.entries()) {
      const cue = unique[index]!;
      expect(cue.phaseId).toBe(item.phase);
      expect(cue.scene).toBe(item.scene);
      if ("label" in item) {
        expect(cue.label).toBe(item.label);
      }
      if ("showLogCapsule" in item) {
        expect(cue.showLogCapsule).toBe(item.showLogCapsule);
      }
      if ("showRoleCard" in item) {
        expect(cue.showRoleCard).toBe(item.showRoleCard);
      }
      if ("targetMode" in item) {
        expect(cue.targetMode).toBe(item.targetMode);
      }
      if ("canAct" in item) {
        expect(cue.canAct).toBe(item.canAct);
      }
    }
  });

  it("falls back to lobby cue for unknown phases", () => {
    const cue = getPhaseAnimationCue("unexpected-phase");
    expect(cue.phaseId).toBe("lobby");
    expect(cue.scene).toBe("lobby");
    expect(cue.canAct).toBe(false);
  });
});
