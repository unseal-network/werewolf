import { describe, expect, it } from "vitest";
import type { PlayerPrivateState } from "./state";
import { resolveNight } from "./night";

const privateStates: PlayerPrivateState[] = [
  { playerId: "wolf", role: "werewolf", team: "wolf", alive: true, knownTeammatePlayerIds: [] },
  { playerId: "guard", role: "guard", team: "good", alive: true, knownTeammatePlayerIds: [] },
  {
    playerId: "witch",
    role: "witch",
    team: "good",
    alive: true,
    knownTeammatePlayerIds: [],
    witchItems: { healAvailable: true, poisonAvailable: true },
  },
  { playerId: "seer", role: "seer", team: "good", alive: true, knownTeammatePlayerIds: [] },
  { playerId: "villager", role: "villager", team: "good", alive: true, knownTeammatePlayerIds: [] },
  { playerId: "villager2", role: "villager", team: "good", alive: true, knownTeammatePlayerIds: [] },
];

describe("resolveNight", () => {
  it("kills the wolf target when not guarded or healed", () => {
    const result = resolveNight({
      gameRoomId: "game_1",
      day: 1,
      alivePlayerIds: ["wolf", "guard", "witch", "seer", "villager", "villager2"],
      privateStates,
      actions: [
        { actorPlayerId: "wolf", kind: "wolfKill", targetPlayerId: "villager" },
        { actorPlayerId: "guard", kind: "guardProtect", targetPlayerId: "seer" },
      ],
      now: new Date("2026-05-09T10:00:00.000Z"),
    });
    expect(result.eliminatedPlayerIds).toEqual(["villager"]);
    expect(result.events.some((event) => event.type === "night_resolved")).toBe(true);
  });

  it("prevents wolf death when guard protects the target", () => {
    const result = resolveNight({
      gameRoomId: "game_1",
      day: 1,
      alivePlayerIds: ["wolf", "guard", "witch", "seer", "villager", "villager2"],
      privateStates,
      actions: [
        { actorPlayerId: "wolf", kind: "wolfKill", targetPlayerId: "villager" },
        { actorPlayerId: "guard", kind: "guardProtect", targetPlayerId: "villager" },
      ],
      now: new Date("2026-05-09T10:00:00.000Z"),
    });
    expect(result.eliminatedPlayerIds).toEqual([]);
  });

  it("adds poison death even when wolf kill is healed", () => {
    const result = resolveNight({
      gameRoomId: "game_1",
      day: 1,
      alivePlayerIds: ["wolf", "guard", "witch", "seer", "villager", "villager2"],
      privateStates,
      actions: [
        { actorPlayerId: "wolf", kind: "wolfKill", targetPlayerId: "villager" },
        { actorPlayerId: "witch", kind: "witchHeal", targetPlayerId: "villager" },
        { actorPlayerId: "witch", kind: "witchPoison", targetPlayerId: "wolf" },
      ],
      now: new Date("2026-05-09T10:00:00.000Z"),
    });
    expect(result.eliminatedPlayerIds).toEqual(["wolf"]);
  });

  it("kills the wolf target when guard and witch both protect the same target", () => {
    const result = resolveNight({
      gameRoomId: "game_1",
      day: 1,
      alivePlayerIds: ["wolf", "guard", "witch", "seer", "villager", "villager2"],
      privateStates,
      actions: [
        { actorPlayerId: "wolf", kind: "wolfKill", targetPlayerId: "villager" },
        { actorPlayerId: "guard", kind: "guardProtect", targetPlayerId: "villager" },
        { actorPlayerId: "witch", kind: "witchHeal", targetPlayerId: "villager" },
      ],
      now: new Date("2026-05-09T10:00:00.000Z"),
    });
    expect(result.eliminatedPlayerIds).toEqual(["villager"]);
    expect(result.events[0]?.payload.guardAndHealConflict).toBe(true);
  });

  it("rejects night actions submitted by the wrong role", () => {
    expect(() =>
      resolveNight({
        gameRoomId: "game_1",
        day: 1,
        alivePlayerIds: ["wolf", "guard", "witch", "seer", "villager", "villager2"],
        privateStates,
        actions: [
          { actorPlayerId: "seer", kind: "wolfKill", targetPlayerId: "villager" },
        ],
        now: new Date("2026-05-09T10:00:00.000Z"),
      })
    ).toThrow("seer cannot perform wolfKill");
  });

  it("rejects duplicate singleton night actions instead of taking the latest", () => {
    expect(() =>
      resolveNight({
        gameRoomId: "game_1",
        day: 1,
        alivePlayerIds: ["wolf", "guard", "witch", "seer", "villager", "villager2"],
        privateStates,
        actions: [
          { actorPlayerId: "guard", kind: "guardProtect", targetPlayerId: "seer" },
          { actorPlayerId: "guard", kind: "guardProtect", targetPlayerId: "villager" },
        ],
        now: new Date("2026-05-09T10:00:00.000Z"),
      })
    ).toThrow("Multiple guardProtect actions submitted");
  });

  it("allows wolf kills targeting wolf-team players during resolution", () => {
    const result = resolveNight({
      gameRoomId: "game_1",
      day: 1,
      alivePlayerIds: ["wolf", "guard", "witch", "seer", "villager", "villager2"],
      privateStates,
      actions: [
        { actorPlayerId: "wolf_team", kind: "wolfKill", targetPlayerId: "wolf" },
      ],
      now: new Date("2026-05-09T10:00:00.000Z"),
    });

    expect(result.eliminatedPlayerIds).toEqual(["wolf"]);
  });

  it("rejects actions recorded under the wrong night phase", () => {
    expect(() =>
      resolveNight({
        gameRoomId: "game_1",
        day: 1,
        alivePlayerIds: ["wolf", "guard", "witch", "seer", "villager", "villager2"],
        privateStates,
        actions: [
          {
            actorPlayerId: "guard",
            kind: "guardProtect",
            targetPlayerId: "seer",
            day: 1,
            phase: "night_wolf",
          },
        ],
        now: new Date("2026-05-09T10:00:00.000Z"),
      })
    ).toThrow("guardProtect cannot be recorded during night_wolf");
  });
});
