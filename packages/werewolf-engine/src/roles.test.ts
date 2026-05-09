import { describe, expect, it } from "vitest";
import { buildRolePlan } from "./roles";

describe("role distribution", () => {
  it.each([
    [6, { werewolf: 1, seer: 1, witch: 1, guard: 1, villager: 2 }],
    [7, { werewolf: 2, seer: 1, witch: 1, guard: 1, villager: 2 }],
    [9, { werewolf: 2, seer: 1, witch: 1, guard: 1, villager: 4 }],
    [10, { werewolf: 3, seer: 1, witch: 1, guard: 1, villager: 4 }],
    [12, { werewolf: 3, seer: 1, witch: 1, guard: 1, villager: 6 }],
  ])("creates the existing v2 distribution for %s players", (count, expected) => {
    const roles = buildRolePlan(count);
    const actual = Object.fromEntries(
      ["werewolf", "seer", "witch", "guard", "villager"].map((role) => [
        role,
        roles.filter((item) => item === role).length,
      ])
    );
    expect(actual).toEqual(expected);
  });

  it("rejects unsupported player counts", () => {
    expect(() => buildRolePlan(5)).toThrow("Werewolf supports 6 to 12 players");
    expect(() => buildRolePlan(13)).toThrow("Werewolf supports 6 to 12 players");
  });
});
