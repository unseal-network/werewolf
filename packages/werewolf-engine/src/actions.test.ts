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
});
