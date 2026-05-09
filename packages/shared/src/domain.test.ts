import { describe, expect, it } from "vitest";
import {
  gamePhaseSchema,
  playerKindSchema,
  roleSchema,
  roomStatusSchema,
  teamForRole,
} from "./domain";

describe("domain contracts", () => {
  it("accepts first-version roles and maps teams", () => {
    expect(roleSchema.parse("werewolf")).toBe("werewolf");
    expect(roleSchema.parse("seer")).toBe("seer");
    expect(roleSchema.parse("witch")).toBe("witch");
    expect(roleSchema.parse("guard")).toBe("guard");
    expect(roleSchema.parse("villager")).toBe("villager");
    expect(teamForRole("werewolf")).toBe("wolf");
    expect(teamForRole("seer")).toBe("good");
  });

  it("accepts room status, player kind, and runtime phases", () => {
    expect(roomStatusSchema.parse("waiting")).toBe("waiting");
    expect(playerKindSchema.parse("agent")).toBe("agent");
    expect(gamePhaseSchema.parse("night_guard")).toBe("night_guard");
    expect(gamePhaseSchema.parse("day_vote")).toBe("day_vote");
  });
});
