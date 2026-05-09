import { describe, expect, it } from "vitest";
import { nextPhaseAfterClosedPhase } from "./tick";

describe("nextPhaseAfterClosedPhase", () => {
  it("advances through fixed night order", () => {
    expect(nextPhaseAfterClosedPhase("night_guard")).toBe("night_wolf");
    expect(nextPhaseAfterClosedPhase("night_wolf")).toBe("night_witch_heal");
    expect(nextPhaseAfterClosedPhase("night_witch_heal")).toBe(
      "night_witch_poison"
    );
    expect(nextPhaseAfterClosedPhase("night_witch_poison")).toBe("night_seer");
    expect(nextPhaseAfterClosedPhase("night_seer")).toBe("night_resolution");
  });

  it("moves from day vote to day resolution", () => {
    expect(nextPhaseAfterClosedPhase("day_vote")).toBe("day_resolution");
  });
});
