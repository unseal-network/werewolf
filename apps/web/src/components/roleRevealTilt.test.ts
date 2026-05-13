import { describe, expect, it } from "vitest";
import {
  ROLE_REVEAL_MAX_TILT_DEG,
  getRoleRevealTiltFromOrientation,
  getRoleRevealTiltFromPointer,
} from "./roleRevealTilt";

describe("role reveal gyro tilt", () => {
  it("uses the first device orientation sample as the neutral pose", () => {
    expect(
      getRoleRevealTiltFromOrientation({
        beta: 48,
        gamma: -8,
        originBeta: 48,
        originGamma: -8,
      })
    ).toEqual({ tiltX: 0, tiltY: -0 });
  });

  it("maps beta into CSS rotateX without the old inverted sign", () => {
    expect(
      getRoleRevealTiltFromOrientation({
        beta: 58,
        gamma: 0,
        originBeta: 48,
        originGamma: 0,
      }).tiltX
    ).toBeCloseTo(4.2);
  });

  it("maps gamma into CSS rotateY with the corrected visual direction", () => {
    expect(
      getRoleRevealTiltFromOrientation({
        beta: 0,
        gamma: 10,
        originBeta: 0,
        originGamma: 0,
      }).tiltY
    ).toBeCloseTo(-5.8);
  });

  it("clamps sudden device orientation jumps", () => {
    expect(
      getRoleRevealTiltFromOrientation({
        beta: 140,
        gamma: -90,
        originBeta: 0,
        originGamma: 0,
      })
    ).toEqual({
      tiltX: ROLE_REVEAL_MAX_TILT_DEG,
      tiltY: ROLE_REVEAL_MAX_TILT_DEG,
    });
  });

  it("keeps desktop pointer tilt behavior unchanged", () => {
    expect(getRoleRevealTiltFromPointer(0.25, 0.25)).toEqual({
      tiltX: -5.5,
      tiltY: 5.5,
    });
  });
});
