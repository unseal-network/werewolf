import { describe, expect, it } from "vitest";
import { canUseActionPanel, isNightRoleTurn } from "./actionAvailability";

describe("action availability", () => {
  it("recognizes the witch as the actor for both witch night phases", () => {
    expect(isNightRoleTurn({ phase: "night_witch_heal", role: "witch" })).toBe(
      true
    );
    expect(isNightRoleTurn({ phase: "night_witch_poison", role: "witch" })).toBe(
      true
    );
  });

  it("lets a night role open the action panel even when only pass is available", () => {
    expect(
      canUseActionPanel({
        hasPlayer: true,
        isAlive: true,
        actionMode: "night",
        hasActedThisPhase: false,
        hasActionTargets: false,
        isMyTurnToSpeak: false,
        phase: "night_witch_heal",
        role: "witch",
      })
    ).toBe(true);
  });

  it("keeps non-actors locked out of night role phases", () => {
    expect(
      canUseActionPanel({
        hasPlayer: true,
        isAlive: true,
        actionMode: "night",
        hasActedThisPhase: false,
        hasActionTargets: false,
        isMyTurnToSpeak: false,
        phase: "night_witch_heal",
        role: "seer",
      })
    ).toBe(false);
  });

  it("does not reopen the panel after the actor has submitted this phase", () => {
    expect(
      canUseActionPanel({
        hasPlayer: true,
        isAlive: true,
        actionMode: "night",
        hasActedThisPhase: true,
        hasActionTargets: false,
        isMyTurnToSpeak: false,
        phase: "night_witch_poison",
        role: "witch",
      })
    ).toBe(false);
  });
});
