import { describe, expect, it } from "vitest";
import { computeVisibleSeatCount } from "../game/seatLayout";

describe("game room seat layout", () => {
  it("keeps one open seat visible until the room reaches twelve players", () => {
    expect(computeVisibleSeatCount({ seatCount: 12, playerCount: 5, occupiedSeatCount: 5 })).toBe(6);
    expect(computeVisibleSeatCount({ seatCount: 12, playerCount: 6, occupiedSeatCount: 6 })).toBe(7);
    expect(computeVisibleSeatCount({ seatCount: 12, playerCount: 7, occupiedSeatCount: 7 })).toBe(8);
    expect(computeVisibleSeatCount({ seatCount: 12, playerCount: 11, occupiedSeatCount: 11 })).toBe(12);
    expect(computeVisibleSeatCount({ seatCount: 12, playerCount: 12, occupiedSeatCount: 12 })).toBe(12);
  });
});
