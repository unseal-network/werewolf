import { describe, expect, it } from "vitest";
import { resolveNight } from "./night";

describe("resolveNight", () => {
  it("kills the wolf target when not guarded or healed", () => {
    const result = resolveNight({
      gameRoomId: "game_1",
      day: 1,
      alivePlayerIds: ["wolf", "guard", "witch", "seer", "villager", "villager2"],
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
});
