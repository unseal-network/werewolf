import { useEffect, useRef } from "react";
import type { EngineRoleCardState } from "../engine/GameEngine";
import {
  getRoleRevealTiltFromOrientation,
  getRoleRevealTiltFromPointer,
} from "./roleRevealTilt";

interface RoleRevealEngineProps {
  roleCard?: EngineRoleCardState | undefined;
  onClose?: (() => void) | undefined;
}

export function RoleRevealEngine({ roleCard, onClose }: RoleRevealEngineProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const closeBlockedRef = useRef(false);

  useEffect(() => {
    if (!roleCard?.visible || roleCard.nonce <= 0) return;
    const host = hostRef.current;
    const card = cardRef.current;
    if (!host || !card) return;

    let originBeta: number | undefined;
    let originGamma: number | undefined;
    let frame = 0;

    const applyTilt = (tiltX: number, tiltY: number) => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        card.style.setProperty("--card-tilt-x", `${tiltX.toFixed(2)}deg`);
        card.style.setProperty("--card-tilt-y", `${tiltY.toFixed(2)}deg`);
        card.style.setProperty("--card-glare-x", `${50 + tiltY * 1.8}%`);
        card.style.setProperty("--card-glare-y", `${46 - tiltX * 1.4}%`);
      });
    };

    const onOrientation = (event: DeviceOrientationEvent) => {
      if (event.beta == null || event.gamma == null) return;
      originBeta ??= event.beta;
      originGamma ??= event.gamma;
      const { tiltX, tiltY } = getRoleRevealTiltFromOrientation({
        beta: event.beta,
        gamma: event.gamma,
        originBeta,
        originGamma,
      });
      applyTilt(tiltX, tiltY);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const rect = card.getBoundingClientRect();
      const relX = (event.clientX - (rect.left + rect.width / 2)) / rect.width;
      const relY = (event.clientY - (rect.top + rect.height / 2)) / rect.height;
      const { tiltX, tiltY } = getRoleRevealTiltFromPointer(relX, relY);
      applyTilt(tiltX, tiltY);
    };

    const onPointerLeave = () => applyTilt(0, 0);

    window.addEventListener("deviceorientation", onOrientation);
    host.addEventListener("pointermove", onPointerMove);
    host.addEventListener("pointerleave", onPointerLeave);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("deviceorientation", onOrientation);
      host.removeEventListener("pointermove", onPointerMove);
      host.removeEventListener("pointerleave", onPointerLeave);
    };
  }, [roleCard?.visible, roleCard?.nonce]);

  async function requestGyroPermissionIfNeeded() {
    const orientation = window.DeviceOrientationEvent as
      | (typeof DeviceOrientationEvent & {
          requestPermission?: () => Promise<"granted" | "denied">;
        })
      | undefined;
    if (typeof orientation?.requestPermission !== "function") return false;
    closeBlockedRef.current = true;
    try {
      await orientation.requestPermission();
    } catch {
      // Permission can fail outside secure contexts; pointer fallback still works.
    }
    window.setTimeout(() => {
      closeBlockedRef.current = false;
    }, 0);
    return true;
  }

  if (!roleCard?.visible || roleCard.nonce <= 0) return null;
  return (
    <div
      ref={hostRef}
      className="role-reveal-engine"
    >
      <div
        ref={cardRef}
        className="role-reveal-card3d"
        role="button"
        tabIndex={0}
        aria-label={roleCard.roleLabel}
        onPointerDown={() => {
          void requestGyroPermissionIfNeeded();
        }}
        onClick={() => {
          if (closeBlockedRef.current) return;
          onClose?.();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onClose?.();
          }
        }}
      >
        <div className="role-reveal-card3d-glow" />
        <div className="role-reveal-card3d-inner">
          <div className="role-reveal-card3d-face role-reveal-card3d-back">
            <img src={roleCard.cardBackUrl} alt="" draggable={false} />
          </div>
          <div className="role-reveal-card3d-face role-reveal-card3d-front">
            <img src={roleCard.cardFrontUrl} alt="" draggable={false} />
          </div>
        </div>
        <div className="role-reveal-card3d-glare" />
      </div>
    </div>
  );
}
