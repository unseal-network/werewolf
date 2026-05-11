import { describe, expect, it } from "vitest";
import { buildAgentTurnTools } from "./harness";

describe("agent harness", () => {
  it("exposes only vote tools during day_vote", () => {
    const tools = buildAgentTurnTools({
      phase: "day_vote",
      role: "villager",
      alivePlayerIds: ["p1", "p2", "p3"],
      selfPlayerId: "p1",
    });
    expect(Object.keys(tools)).toEqual(["submitVote", "abstain"]);
  });

  it("exposes vote tools during tie_vote", () => {
    const tools = buildAgentTurnTools({
      phase: "tie_vote",
      role: "villager",
      alivePlayerIds: ["p1", "p2", "p3"],
      selfPlayerId: "p1",
    });
    expect(Object.keys(tools)).toEqual(["submitVote", "abstain"]);
  });

  it("exposes only seer tools during seer night", () => {
    const tools = buildAgentTurnTools({
      phase: "night_seer",
      role: "seer",
      alivePlayerIds: ["p1", "p2", "p3"],
      selfPlayerId: "p1",
    });
    expect(Object.keys(tools)).toEqual(["seerInspect", "passAction"]);
  });
});
