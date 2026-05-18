import { describe, expect, it } from "vitest";
import { createGameRequestSchema } from "./dto";

describe("create game request schema", () => {
  it("defaults agent speech playback to normal speed", () => {
    const parsed = createGameRequestSchema.parse({
      sourceMatrixRoomId: "!room:example.com",
      title: "Werewolf",
      timing: {
        nightActionSeconds: 45,
        speechSeconds: 60,
        voteSeconds: 30,
      },
    });

    expect(parsed.timing.agentSpeechRate).toBe(1);
  });
});
