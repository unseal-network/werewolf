import { useEffect, useRef } from "react";
import Phaser from "phaser";
import type { EngineRoleCardState } from "../engine/GameEngine";

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
    if (!host) return;

    const getSize = () => ({
      width: Math.max(320, host.clientWidth || window.innerWidth),
      height: Math.max(480, host.clientHeight || window.innerHeight),
    });
    const initialSize = getSize();

    class RoleRevealScene extends Phaser.Scene {
      create() {
        this.cameras.main.setBackgroundColor("rgba(0,0,0,0)");
        this.buildReveal();
      }

      private buildReveal() {
        const { width, height } = this.scale;
        const centerX = width / 2;
        const centerY = height / 2;

        const veil = this.add
          .rectangle(centerX, centerY, width, height, 0x03020a, 0.92)
          .setDepth(0);
        this.tweens.add({
          targets: veil,
          alpha: { from: 0, to: 0.92 },
          duration: 280,
          ease: "Sine.easeOut",
        });

        this.makeSparkTexture();
        this.add.particles(0, 0, "role-reveal-spark", {
          x: { min: 0, max: width },
          y: { min: 0, max: height },
          lifespan: { min: 1600, max: 3600 },
          speedY: { min: -18, max: -4 },
          speedX: { min: -8, max: 8 },
          quantity: 2,
          frequency: 90,
          scale: { start: 0.9, end: 0 },
          alpha: { start: 0.9, end: 0 },
          tint: [0xf8d97e, 0xb8a5ff, 0xffffff],
          blendMode: Phaser.BlendModes.ADD,
        }).setDepth(1);

        const aura = this.add.graphics().setDepth(2);
        aura.fillStyle(0xf5d57d, 0.12);
        aura.fillCircle(centerX, centerY, Math.min(width, height) * 0.34);
        aura.fillStyle(0x8b5cf6, 0.10);
        aura.fillCircle(centerX, centerY, Math.min(width, height) * 0.44);
        this.tweens.add({
          targets: aura,
          scale: { from: 0.92, to: 1.06 },
          alpha: { from: 0.72, to: 1 },
          duration: 1800,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
        });

        this.addOrbit(centerX, centerY, Math.min(width, height) * 0.43, 2600, 0xf3d982);
        this.addOrbit(centerX, centerY, Math.min(width, height) * 0.31, 1900, 0xa78bfa, true);
      }

      private addOrbit(
        x: number,
        y: number,
        radius: number,
        duration: number,
        color: number,
        reverse = false
      ) {
        const orbit = this.add.container(x, y).setDepth(3);
        const ring = this.add.graphics();
        ring.lineStyle(1, color, 0.30);
        ring.strokeEllipse(0, 0, radius * 2, radius * 0.64);
        ring.lineStyle(2, color, 0.20);
        ring.beginPath();
        ring.arc(0, 0, radius, Phaser.Math.DegToRad(12), Phaser.Math.DegToRad(82));
        ring.strokePath();
        orbit.add(ring);
        this.tweens.add({
          targets: orbit,
          angle: reverse ? -360 : 360,
          duration,
          repeat: -1,
          ease: "Linear",
        });
      }

      private makeSparkTexture() {
        const g = this.add.graphics();
        g.fillStyle(0xffffff, 1);
        g.fillCircle(4, 4, 4);
        g.generateTexture("role-reveal-spark", 8, 8);
        g.destroy();
      }
    }

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host,
      width: initialSize.width,
      height: initialSize.height,
      transparent: true,
      backgroundColor: "#00000000",
      scene: RoleRevealScene,
      scale: {
        mode: Phaser.Scale.NONE,
      },
    });

    const resize = () => {
      const size = getSize();
      game.scale.resize(size.width, size.height);
    };
    window.addEventListener("resize", resize);

    return () => {
      window.removeEventListener("resize", resize);
      game.destroy(true);
    };
  }, [roleCard, roleCard?.nonce]);

  useEffect(() => {
    if (!roleCard?.visible || roleCard.nonce <= 0) return;
    const card = cardRef.current;
    if (!card) return;

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
      const tiltX = Phaser.Math.Clamp((event.beta - originBeta) * -0.42, -18, 18);
      const tiltY = Phaser.Math.Clamp((event.gamma - originGamma) * 0.58, -18, 18);
      applyTilt(tiltX, tiltY);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const rect = card.getBoundingClientRect();
      const relX = (event.clientX - rect.left) / rect.width - 0.5;
      const relY = (event.clientY - rect.top) / rect.height - 0.5;
      applyTilt(Phaser.Math.Clamp(relY * -18, -14, 14), Phaser.Math.Clamp(relX * 18, -14, 14));
    };

    const onPointerLeave = () => applyTilt(0, 0);

    window.addEventListener("deviceorientation", onOrientation);
    card.addEventListener("pointermove", onPointerMove);
    card.addEventListener("pointerleave", onPointerLeave);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("deviceorientation", onOrientation);
      card.removeEventListener("pointermove", onPointerMove);
      card.removeEventListener("pointerleave", onPointerLeave);
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
      <div ref={cardRef} className="role-reveal-card3d" aria-hidden>
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
