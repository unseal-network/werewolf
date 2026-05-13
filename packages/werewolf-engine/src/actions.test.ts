import { describe, expect, it } from "vitest";
import { validatePlayerAction } from "./actions";

const base = {
  gameRoomId: "game_1",
  day: 1,
  alivePlayerIds: ["p1", "p2", "p3"],
  eliminatedPlayerIds: [],
};

describe("validatePlayerAction", () => {
  it("allows current speaker to submit speech", () => {
    const event = validatePlayerAction({
      ...base,
      phase: "day_speak",
      actorPlayerId: "p1",
      currentSpeakerPlayerId: "p1",
      action: { kind: "saySpeech", speech: "I suspect p2." },
      now: new Date("2026-05-09T10:00:00.000Z"),
    });
    expect(event.type).toBe("speech_submitted");
    expect(event.payload.speech).toBe("I suspect p2.");
  });

  it("rejects speech from non-speaker", () => {
    expect(() =>
      validatePlayerAction({
        ...base,
        phase: "day_speak",
        actorPlayerId: "p2",
        currentSpeakerPlayerId: "p1",
        action: { kind: "saySpeech", speech: "hello" },
        now: new Date("2026-05-09T10:00:00.000Z"),
      })
    ).toThrow("Only the current speaker can speak");
  });

  it("allows living players to vote for another living player", () => {
    const event = validatePlayerAction({
      ...base,
      phase: "day_vote",
      actorPlayerId: "p1",
      currentSpeakerPlayerId: null,
      action: { kind: "submitVote", targetPlayerId: "p2" },
      now: new Date("2026-05-09T10:00:00.000Z"),
    });
    expect(event.type).toBe("vote_submitted");
    expect(event.payload.targetPlayerId).toBe("p2");
  });

  it("rejects night actions that do not match the actor role", () => {
    expect(() =>
      validatePlayerAction({
        ...base,
        phase: "night_seer",
        actorPlayerId: "p1",
        currentSpeakerPlayerId: null,
        privateStates: [
          { playerId: "p1", role: "witch", team: "good", alive: true, knownTeammatePlayerIds: [] },
          { playerId: "p2", role: "werewolf", team: "wolf", alive: true, knownTeammatePlayerIds: [] },
          { playerId: "p3", role: "seer", team: "good", alive: true, knownTeammatePlayerIds: [] },
        ],
        action: { kind: "seerInspect", targetPlayerId: "p2" },
        now: new Date("2026-05-09T10:00:00.000Z"),
      })
    ).toThrow("You do not have the role for this action");
  });

  it("rejects repeated night actions in the same phase", () => {
    expect(() =>
      validatePlayerAction({
        ...base,
        phase: "night_guard",
        actorPlayerId: "p1",
        currentSpeakerPlayerId: null,
        privateStates: [
          { playerId: "p1", role: "guard", team: "good", alive: true, knownTeammatePlayerIds: [] },
          { playerId: "p2", role: "werewolf", team: "wolf", alive: true, knownTeammatePlayerIds: [] },
          { playerId: "p3", role: "seer", team: "good", alive: true, knownTeammatePlayerIds: [] },
        ],
        submittedNightActions: [
          { actorPlayerId: "p1", kind: "guardProtect", targetPlayerId: "p3", day: 1, phase: "night_guard" },
        ],
        action: { kind: "guardProtect", targetPlayerId: "p2" },
        now: new Date("2026-05-09T10:00:00.000Z"),
      })
    ).toThrow("You have already acted this phase");
  });
});
