import { describe, expect, it } from "vitest";
import { canSeeEvent } from "./perspective-service";

describe("canSeeEvent", () => {
  it("allows public events for everyone", () => {
    expect(canSeeEvent({ playerId: "p1", team: "good" }, "public")).toBe(
      true
    );
  });

  it("allows private user events only for that player", () => {
    expect(canSeeEvent({ playerId: "p1", team: "good" }, "private:user:p1")).toBe(
      true
    );
    expect(canSeeEvent({ playerId: "p2", team: "good" }, "private:user:p1")).toBe(
      false
    );
  });

  it("allows wolf team events only for wolves", () => {
    expect(canSeeEvent({ playerId: "p1", team: "wolf" }, "private:team:wolf")).toBe(
      true
    );
    expect(canSeeEvent({ playerId: "p2", team: "good" }, "private:team:wolf")).toBe(
      false
    );
  });
});
