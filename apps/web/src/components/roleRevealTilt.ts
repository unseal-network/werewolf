export const ROLE_REVEAL_MAX_TILT_DEG = 18;
export const ROLE_REVEAL_BETA_TO_TILT = 0.42;
export const ROLE_REVEAL_GAMMA_TO_TILT = 0.58;

export interface RoleRevealTilt {
  tiltX: number;
  tiltY: number;
}

export interface RoleRevealOrientationInput {
  beta: number;
  gamma: number;
  originBeta: number;
  originGamma: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function getRoleRevealTiltFromOrientation({
  beta,
  gamma,
  originBeta,
  originGamma,
}: RoleRevealOrientationInput): RoleRevealTilt {
  const deltaBeta = beta - originBeta;
  const deltaGamma = gamma - originGamma;
  return {
    tiltX: clamp(
      deltaBeta * ROLE_REVEAL_BETA_TO_TILT,
      -ROLE_REVEAL_MAX_TILT_DEG,
      ROLE_REVEAL_MAX_TILT_DEG
    ),
    tiltY: clamp(
      deltaGamma * -ROLE_REVEAL_GAMMA_TO_TILT,
      -ROLE_REVEAL_MAX_TILT_DEG,
      ROLE_REVEAL_MAX_TILT_DEG
    ),
  };
}

export function getRoleRevealTiltFromPointer(
  relativeX: number,
  relativeY: number
): RoleRevealTilt {
  return {
    tiltX: clamp(relativeY * -22, -ROLE_REVEAL_MAX_TILT_DEG, ROLE_REVEAL_MAX_TILT_DEG),
    tiltY: clamp(relativeX * 22, -ROLE_REVEAL_MAX_TILT_DEG, ROLE_REVEAL_MAX_TILT_DEG),
  };
}
