import { describe, expect, it } from "vitest";
import { normalizeDisplayRole, ROLE_LABEL, serverPhaseToDisplayPhase } from "./roles";

describe("role display constants", () => {
  it("maps server roles and phases without changing game protocol names", () => {
    expect(normalizeDisplayRole("prophet")).toBe("seer");
    expect(normalizeDisplayRole("civilian")).toBe("villager");
    expect(normalizeDisplayRole("werewolf")).toBe("werewolf");
    expect(serverPhaseToDisplayPhase("day_speak")).toBe("day");
    expect(serverPhaseToDisplayPhase("night_witch_heal")).toBe("witch-save");
    expect(serverPhaseToDisplayPhase("tie_vote")).toBe("tie");
  });

  it("has labels for every role shown by the migrated client artwork", () => {
    for (const role of ["villager", "guard", "hunter", "seer", "werewolf", "witch"] as const) {
      expect(ROLE_LABEL[role]).toBeTruthy();
    }
  });
});
