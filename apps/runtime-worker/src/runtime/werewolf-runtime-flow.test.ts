import { describe, expect, it } from "vitest";
import { resolveDayVote, resolveNight } from "@werewolf/engine";
import { nextPhaseAfterClosedPhase } from "@werewolf/engine";

describe("werewolf runtime night flow", () => {
  it("advances through guard, wolf, witch heal, witch poison, seer, then night resolution", () => {
    expect(nextPhaseAfterClosedPhase("night_guard")).toBe("night_wolf");
    expect(nextPhaseAfterClosedPhase("night_wolf")).toBe("night_witch_heal");
    expect(nextPhaseAfterClosedPhase("night_witch_heal")).toBe(
      "night_witch_poison"
    );
    expect(nextPhaseAfterClosedPhase("night_witch_poison")).toBe("night_seer");
    expect(nextPhaseAfterClosedPhase("night_seer")).toBe("night_resolution");
  });

  it("resolves guard, wolf kill, witch heal, witch poison, and seer inspection as one night", () => {
    const result = resolveNight({
      gameRoomId: "game_1",
      day: 1,
      alivePlayerIds: ["wolf", "guard", "witch", "seer", "villager", "v2"],
      privateStates: [
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
        { playerId: "v2", role: "villager", team: "good", alive: true, knownTeammatePlayerIds: [] },
      ],
      actions: [
        { actorPlayerId: "guard", kind: "guardProtect", targetPlayerId: "seer" },
        { actorPlayerId: "wolf", kind: "wolfKill", targetPlayerId: "villager" },
        { actorPlayerId: "witch", kind: "witchHeal", targetPlayerId: "villager" },
        { actorPlayerId: "witch", kind: "witchPoison", targetPlayerId: "wolf" },
        { actorPlayerId: "seer", kind: "seerInspect", targetPlayerId: "wolf" },
      ],
      now: new Date("2026-05-09T10:00:00.000Z"),
    });

    expect(result.eliminatedPlayerIds).toEqual(["wolf"]);
    expect(result.events.map((event) => event.type)).toContain(
      "night_resolved"
    );
  });

  it("opens a private wolf team discussion window during the wolf phase", async () => {
    const runtime = await import("./game-runtime");
    const window = runtime.openWolfDiscussionWindow({
      gameRoomId: "game_1",
      day: 1,
      wolfPlayerIds: ["wolf_1", "wolf_2"],
      now: new Date("2026-05-09T10:00:00.000Z"),
    });

    expect(window.phase).toBe("night_wolf");
    expect(window.visibility).toBe("private:team:wolf");
    expect(window.allowedSpeakerPlayerIds).toEqual(["wolf_1", "wolf_2"]);
  });
});

describe("werewolf runtime day speech flow", () => {
  it("builds the day speech queue in seat order using only alive players", async () => {
    const runtime = await import("./game-runtime");
    const queue = runtime.buildDaySpeechQueue({
      players: [
        { playerId: "p3", seatNo: 3, alive: true },
        { playerId: "p1", seatNo: 1, alive: true },
        { playerId: "p2", seatNo: 2, alive: false },
        { playerId: "p4", seatNo: 4, alive: true },
      ],
    });

    expect(queue).toEqual(["p1", "p3", "p4"]);
  });
});

describe("werewolf runtime vote and tie-break flow", () => {
  it("exiles the unique highest voted player", () => {
    const result = resolveDayVote({
      gameRoomId: "game_1",
      day: 1,
      alivePlayerIds: ["p1", "p2", "p3", "p4"],
      votes: [
        { actorPlayerId: "p1", targetPlayerId: "p3" },
        { actorPlayerId: "p2", targetPlayerId: "p3" },
        { actorPlayerId: "p3", targetPlayerId: "p2" },
      ],
      now: new Date("2026-05-09T10:00:00.000Z"),
    });

    expect(result.exiledPlayerId).toBe("p3");
    expect(result.events.map((event) => event.type)).toContain(
      "player_eliminated"
    );
  });

  it("returns tied player ids and requests tied-player speeches before revote", () => {
    const result = resolveDayVote({
      gameRoomId: "game_1",
      day: 1,
      alivePlayerIds: ["p1", "p2", "p3", "p4"],
      votes: [
        { actorPlayerId: "p1", targetPlayerId: "p2" },
        { actorPlayerId: "p2", targetPlayerId: "p3" },
        { actorPlayerId: "p3", targetPlayerId: "p2" },
        { actorPlayerId: "p4", targetPlayerId: "p3" },
      ],
      now: new Date("2026-05-09T10:00:00.000Z"),
    }) as ReturnType<typeof resolveDayVote> & {
      tiedPlayerIds?: string[];
      nextPhase?: string;
      speechQueue?: string[];
    };

    expect(result.exiledPlayerId).toBeNull();
    expect(result.tiedPlayerIds).toEqual(["p2", "p3"]);
    expect(result.nextPhase).toBe("tie_speech");
    expect(result.speechQueue).toEqual(["p2", "p3"]);
  });

  it("limits a tie-break revote to the tied players only", () => {
    const result = resolveDayVote({
      gameRoomId: "game_1",
      day: 1,
      alivePlayerIds: ["p1", "p2", "p3", "p4"],
      allowedTargetPlayerIds: ["p2", "p3"],
      votes: [
        { actorPlayerId: "p1", targetPlayerId: "p2" },
        { actorPlayerId: "p2", targetPlayerId: "p3" },
        { actorPlayerId: "p3", targetPlayerId: "p2" },
        { actorPlayerId: "p4", targetPlayerId: "p4" },
      ],
      now: new Date("2026-05-09T10:00:00.000Z"),
    } as Parameters<typeof resolveDayVote>[0] & {
      allowedTargetPlayerIds: string[];
    });

    expect(result.tally).toEqual({ p2: 2, p3: 1 });
    expect(result.exiledPlayerId).toBe("p2");
  });
});
