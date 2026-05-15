import { useEffect, useRef, useState } from "react";
import Phaser from "phaser";

type DemoPhase =
  | "deal"
  | "wolf_public"
  | "wolf_private"
  | "witch_heal"
  | "witch_poison"
  | "seer"
  | "vote"
  | "daybreak";

type DemoTime = "night" | "day";

const phaseOptions: Array<{ id: DemoPhase; label: string; time: DemoTime }> = [
  { id: "deal", label: "身份发牌", time: "night" },
  { id: "wolf_public", label: "狼人阶段 · 非狼人偷窥", time: "night" },
  { id: "wolf_private", label: "狼人阶段 · 狼人视角", time: "night" },
  { id: "witch_heal", label: "女巫救人", time: "night" },
  { id: "witch_poison", label: "女巫下毒", time: "night" },
  { id: "seer", label: "预言家查验", time: "night" },
  { id: "vote", label: "白天投票", time: "day" },
  { id: "daybreak", label: "日夜过渡", time: "day" },
];

const assetBase = `${(import.meta.env.BASE_URL ?? "/").replace(/\/?$/, "/")}assets`;

interface AnimationDemoState {
  phase: DemoPhase;
  playerCount: number;
  time: DemoTime;
}

class AnimationDemoScene extends Phaser.Scene {
  private state: AnimationDemoState = {
    phase: "wolf_public",
    playerCount: 10,
    time: "night",
  };

  private bgNightScene?: Phaser.GameObjects.Image;
  private bgDayScene?: Phaser.GameObjects.Image;
  private dayWash?: Phaser.GameObjects.Rectangle;
  private nightWash?: Phaser.GameObjects.Rectangle;
  private windowGlow?: Phaser.GameObjects.Rectangle;
  private stageGlow?: Phaser.GameObjects.Ellipse;
  private avatarLayer?: Phaser.GameObjects.Container;
  private effectLayer?: Phaser.GameObjects.Container;
  private fogLayer?: Phaser.GameObjects.Container;
  private transitionRect?: Phaser.GameObjects.Rectangle;

  constructor() {
    super({ key: "AnimationDemoScene" });
  }

  preload() {
    this.load.image("village-stage-night", `${assetBase}/animation-demo/village-stage-unified.png`);
    this.load.image("village-stage-day", `${assetBase}/animation-demo/village-stage-day.png`);
    this.load.image("role-card-back", `${assetBase}/role-cards/card-back.png`);
    this.load.image("role-villager", `${assetBase}/role-cards/villager.png`);
  }

  create(data?: Partial<AnimationDemoState>) {
    this.state = { ...this.state, ...data };
    const { width, height } = this.scale;

    this.bgNightScene = this.add.image(width / 2, height / 2, "village-stage-night");
    this.bgDayScene = this.add.image(width / 2, height / 2, "village-stage-day");
    this.fitCover(this.bgNightScene);
    this.fitCover(this.bgDayScene);

    this.dayWash = this.add.rectangle(width / 2, height / 2, width, height, 0xf3dfbd, 0);
    this.dayWash.setBlendMode(Phaser.BlendModes.NORMAL);
    this.nightWash = this.add.rectangle(width / 2, height / 2, width, height, 0x07131f, 0);
    this.nightWash.setBlendMode(Phaser.BlendModes.MULTIPLY);
    this.windowGlow = this.add.rectangle(width / 2, height * 0.42, width, height * 0.52, 0xffbd68, 0);
    this.windowGlow.setBlendMode(Phaser.BlendModes.ADD);

    this.stageGlow = this.add.ellipse(
      width / 2,
      height * 0.62,
      width * 0.18,
      height * 0.13,
      0xff8a30,
      0.18
    );
    this.stageGlow.setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({
      targets: this.stageGlow,
      alpha: { from: 0.10, to: 0.24 },
      scaleX: { from: 0.92, to: 1.08 },
      scaleY: { from: 0.88, to: 1.04 },
      duration: 1500,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });

    this.fogLayer = this.add.container(0, 0);
    this.avatarLayer = this.add.container(0, 0);
    this.effectLayer = this.add.container(0, 0);
    this.transitionRect = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0);

    this.createFog();
    this.renderState(true);
  }

  updateDemoState(next: Partial<AnimationDemoState>) {
    this.state = { ...this.state, ...next };
    this.renderState(false);
  }

  private renderState(initial: boolean) {
    const targetDaySceneAlpha = this.state.time === "day" ? 1 : 0;
    const targetDayAlpha = this.state.time === "day" ? 0.04 : 0.02;
    const targetNightAlpha = this.state.time === "day" ? 0.00 : 0.42;
    const targetWindowAlpha = this.state.time === "day" ? 0.00 : 0.10;
    if (initial) {
      this.bgDayScene?.setAlpha(targetDaySceneAlpha);
      this.dayWash?.setAlpha(targetDayAlpha);
      this.nightWash?.setAlpha(targetNightAlpha);
      this.windowGlow?.setAlpha(targetWindowAlpha);
    } else {
      this.playTimeTransition(targetDaySceneAlpha, targetDayAlpha, targetNightAlpha, targetWindowAlpha);
    }
    this.renderAvatars();
    this.playPhaseEffect();
  }

  private playTimeTransition(
    targetDaySceneAlpha: number,
    targetDayAlpha: number,
    targetNightAlpha: number,
    targetWindowAlpha: number
  ) {
    if (!this.bgDayScene || !this.dayWash || !this.nightWash || !this.windowGlow || !this.transitionRect) return;
    this.tweens.killTweensOf([this.bgDayScene, this.dayWash, this.nightWash, this.windowGlow]);
    this.tweens.add({
      targets: this.bgDayScene,
      alpha: targetDaySceneAlpha,
      duration: 900,
      ease: "Sine.easeInOut",
    });
    this.tweens.add({
      targets: this.dayWash,
      alpha: targetDayAlpha,
      duration: 900,
      ease: "Sine.easeInOut",
    });
    this.tweens.add({
      targets: this.nightWash,
      alpha: targetNightAlpha,
      duration: 900,
      ease: "Sine.easeInOut",
    });
    this.tweens.add({
      targets: this.windowGlow,
      alpha: targetWindowAlpha,
      duration: 900,
      ease: "Sine.easeInOut",
    });
    this.transitionRect.setFillStyle(targetDaySceneAlpha > 0 ? 0xd8d0bb : 0x162431, 0);
    this.tweens.add({
      targets: this.transitionRect,
      alpha: { from: 0.22, to: 0 },
      duration: 780,
      ease: "Sine.easeOut",
    });
  }

  private renderAvatars() {
    if (!this.avatarLayer) return;
    this.avatarLayer.removeAll(true);
    const { width, height } = this.scale;
    const cx = width / 2;
    const cy = height * 0.62;
    const rx = Math.min(width * 0.32, 470);
    const ry = Math.min(height * 0.22, 190);
    const count = this.state.playerCount;

    for (let i = 0; i < count; i += 1) {
      const angle = -Math.PI / 2 + (Math.PI * 2 * i) / count;
      const x = cx + Math.cos(angle) * rx;
      const y = cy + Math.sin(angle) * ry;
      const state = this.avatarStateForIndex(i);
      const avatar = this.createAvatar(i + 1, state);
      avatar.setPosition(x, y);
      avatar.setScale(0.76 + (y - (cy - ry)) / (ry * 2) * 0.16);
      this.avatarLayer.add(avatar);
    }
  }

  private avatarStateForIndex(index: number) {
    if (this.state.phase === "wolf_private" && index === 5) return "target";
    if (this.state.phase === "vote" && index === 2) return "selected";
    if (this.state.phase === "daybreak" && index === 4) return "dead";
    if (this.state.phase === "wolf_private" && (index === 0 || index === 3)) return "wolf";
    if (index === 1) return "speaking";
    return "normal";
  }

  private createAvatar(seatNo: number, state: string) {
    const group = this.add.container(0, 0);
    const radius = 28;
    const outerColor =
      state === "dead" ? 0x55565f :
      state === "selected" ? 0xe6c36a :
      state === "target" ? 0xc34b4f :
      state === "wolf" ? 0x8f2f3d :
      state === "speaking" ? 0xffd781 :
      0xbda267;
    const glowColor =
      state === "target" ? 0xb52f3a :
      state === "selected" ? 0xe4b650 :
      state === "speaking" ? 0xff8a30 :
      state === "wolf" ? 0x7f2030 :
      0x5eb9b2;

    const glow = this.add.circle(0, 0, radius + 9, glowColor, state === "normal" ? 0.04 : 0.20);
    glow.setBlendMode(Phaser.BlendModes.ADD);
    group.add(glow);

    const outer = this.add.circle(0, 0, radius + 4, outerColor, 0.92);
    group.add(outer);
    const inner = this.add.circle(0, 0, radius, 0x15191f, 0.98);
    group.add(inner);
    const portrait = this.add.circle(0, -1, radius - 6, state === "dead" ? 0x74757a : 0x29333a, 1);
    group.add(portrait);

    const head = this.add.circle(0, -8, 10, state === "dead" ? 0x9b9b9b : 0xc8b28a, 0.88);
    const shoulders = this.add.ellipse(0, 12, 34, 20, state === "dead" ? 0x5a5a5a : 0x4d4034, 0.90);
    group.add([head, shoulders]);

    const ring = this.add.circle(0, 0, radius + 7);
    ring.setStrokeStyle(2, outerColor, 0.80);
    group.add(ring);

    const seat = this.add.text(0, radius + 15, String(seatNo), {
      fontFamily: "Inter, sans-serif",
      fontSize: "11px",
      color: state === "dead" ? "#a9a9a9" : "#f6e4ae",
      fontStyle: "bold",
    });
    seat.setOrigin(0.5);
    group.add(seat);

    if (state === "wolf") {
      const mark = this.add.text(radius - 5, -radius + 4, "◥", {
        fontFamily: "serif",
        fontSize: "16px",
        color: "#e48282",
      });
      mark.setOrigin(0.5);
      group.add(mark);
    }

    if (state === "dead") {
      const slash = this.add.line(0, 0, -25, -25, 25, 25, 0x24242a, 0.82);
      slash.setLineWidth(5);
      group.add(slash);
    }

    if (state === "speaking" || state === "selected" || state === "target") {
      this.tweens.add({
        targets: glow,
        alpha: { from: 0.12, to: 0.36 },
        scale: { from: 0.92, to: 1.10 },
        duration: 1000,
        ease: "Sine.easeInOut",
        yoyo: true,
        repeat: -1,
      });
    }
    return group;
  }

  private playPhaseEffect() {
    if (!this.effectLayer) return;
    this.effectLayer.removeAll(true);
    switch (this.state.phase) {
      case "deal":
        this.playDealEffect();
        break;
      case "wolf_public":
        this.playWolfPublicEffect();
        break;
      case "wolf_private":
        this.playWolfPrivateEffect();
        break;
      case "witch_heal":
        this.playWitchEffect(0x63d98b, "heal");
        break;
      case "witch_poison":
        this.playWitchEffect(0x8f5bd6, "poison");
        break;
      case "seer":
        this.playSeerEffect();
        break;
      case "vote":
        this.playVoteEffect();
        break;
      case "daybreak":
        this.playDaybreakEffect();
        break;
    }
  }

  private playDealEffect() {
    if (!this.effectLayer) return;
    const { width, height } = this.scale;
    const card = this.add.image(width / 2, height * 0.56, "role-card-back");
    card.setDisplaySize(120, 180);
    card.setAlpha(0);
    this.effectLayer.add(card);
    this.tweens.add({
      targets: card,
      y: height * 0.40,
      alpha: 1,
      scale: { from: 0.4, to: 1 },
      duration: 620,
      ease: "Back.easeOut",
    });
  }

  private playWolfPublicEffect() {
    if (!this.effectLayer) return;
    const { width, height } = this.scale;
    const veil = this.add.rectangle(width / 2, height / 2, width, height, 0x0a0d14, 0.32);
    this.effectLayer.add(veil);
    for (let i = 0; i < 3; i += 1) {
      const wolf = this.add.ellipse(-120 - i * 80, height * (0.38 + i * 0.08), 80, 30, 0x05070a, 0.28);
      wolf.setScale(1.4, 0.7);
      this.effectLayer.add(wolf);
      this.tweens.add({
        targets: wolf,
        x: width + 160,
        alpha: { from: 0.10, to: 0.32 },
        duration: 2600 + i * 420,
        ease: "Sine.easeInOut",
        repeat: -1,
        delay: i * 500,
      });
    }
  }

  private playWolfPrivateEffect() {
    if (!this.effectLayer) return;
    const { width, height } = this.scale;
    const claw = this.add.text(width / 2 + 170, height * 0.54, "╱╱╱", {
      fontFamily: "serif",
      fontSize: "72px",
      color: "#bb2f3d",
      fontStyle: "bold",
    });
    claw.setOrigin(0.5);
    claw.setAlpha(0);
    this.effectLayer.add(claw);
    this.tweens.add({
      targets: claw,
      alpha: { from: 0, to: 0.88 },
      x: width / 2 + 80,
      duration: 520,
      ease: "Cubic.easeOut",
      yoyo: true,
      repeat: -1,
      repeatDelay: 1300,
    });
  }

  private playWitchEffect(color: number, kind: "heal" | "poison") {
    if (!this.effectLayer) return;
    const { width, height } = this.scale;
    const targetY = height * 0.56;
    const mist = this.add.ellipse(width / 2 + 120, targetY, 160, 64, color, 0.18);
    mist.setBlendMode(Phaser.BlendModes.ADD);
    this.effectLayer.add(mist);
    const body = this.add.ellipse(width / 2 + 120, targetY + 24, 70, 26, kind === "heal" ? 0x25352d : 0x2d2238, 0.72);
    this.effectLayer.add(body);
    this.tweens.add({
      targets: mist,
      alpha: { from: 0.08, to: 0.32 },
      scaleX: { from: 0.8, to: 1.28 },
      duration: 1100,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });
    if (kind === "heal") {
      this.tweens.add({
        targets: body,
        y: targetY - 8,
        duration: 900,
        ease: "Back.easeOut",
        yoyo: true,
        repeat: -1,
        repeatDelay: 1000,
      });
    }
  }

  private playSeerEffect() {
    if (!this.effectLayer) return;
    const { width, height } = this.scale;
    const beam = this.add.triangle(width / 2, height * 0.40, 0, -120, -80, 90, 80, 90, 0x98dfe8, 0.16);
    beam.setBlendMode(Phaser.BlendModes.ADD);
    this.effectLayer.add(beam);
    this.tweens.add({
      targets: beam,
      angle: { from: -8, to: 8 },
      alpha: { from: 0.08, to: 0.22 },
      duration: 1400,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });
  }

  private playVoteEffect() {
    if (!this.effectLayer) return;
    const { width, height } = this.scale;
    const ring = this.add.ellipse(width / 2, height * 0.56, width * 0.44, height * 0.28);
    ring.setStrokeStyle(3, 0xb23a42, 0.42);
    this.effectLayer.add(ring);
    this.tweens.add({
      targets: ring,
      alpha: { from: 0.26, to: 0.72 },
      scale: { from: 0.96, to: 1.04 },
      duration: 1200,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });
  }

  private playDaybreakEffect() {
    if (!this.effectLayer) return;
    const { width, height } = this.scale;
    const wash = this.add.rectangle(width / 2, height / 2, width, height, 0xd8d0bb, 0.22);
    this.effectLayer.add(wash);
    this.tweens.add({
      targets: wash,
      alpha: { from: 0.30, to: 0.04 },
      duration: 1400,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });
  }

  private createFog() {
    if (!this.fogLayer) return;
    const { width, height } = this.scale;
    for (let i = 0; i < 5; i += 1) {
      const fog = this.add.ellipse(
        Phaser.Math.Between(-120, width + 120),
        height * Phaser.Math.FloatBetween(0.30, 0.74),
        width * Phaser.Math.FloatBetween(0.20, 0.40),
        height * Phaser.Math.FloatBetween(0.05, 0.10),
        0xcad8d4,
        0.04
      );
      this.fogLayer.add(fog);
      this.tweens.add({
        targets: fog,
        x: fog.x + Phaser.Math.Between(120, 260),
        duration: Phaser.Math.Between(9000, 16000),
        ease: "Sine.easeInOut",
        yoyo: true,
        repeat: -1,
      });
    }
  }

  private fitCover(image?: Phaser.GameObjects.Image) {
    if (!image) return;
    const { width, height } = this.scale;
    const scale = Math.max(width / image.width, height / image.height);
    image.setScale(scale);
  }
}

export function AnimationDemoPage() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<AnimationDemoScene | null>(null);
  const [phase, setPhase] = useState<DemoPhase>("wolf_public");
  const [playerCount, setPlayerCount] = useState(10);

  const phaseMeta = phaseOptions.find((item) => item.id === phase) ?? phaseOptions[0]!;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const scene = new AnimationDemoScene();
    sceneRef.current = scene;
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host,
      width: host.clientWidth || window.innerWidth,
      height: host.clientHeight || window.innerHeight,
      backgroundColor: "#05080a",
      scene,
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
    });
    return () => {
      sceneRef.current = null;
      game.destroy(true);
    };
  }, []);

  useEffect(() => {
    sceneRef.current?.updateDemoState({
      phase,
      playerCount,
      time: phaseMeta.time,
    });
  }, [phase, phaseMeta.time, playerCount]);

  return (
    <main className="flex h-screen bg-[#07041a] text-[#f7f1e7] overflow-hidden">
      <div ref={hostRef} className="flex-1 min-w-0" />
      <aside className="w-72 shrink-0 flex flex-col gap-5 p-6 bg-white/[0.04] border-l border-white/[0.08] overflow-y-auto">
        <div>
          <p className="text-xs font-semibold tracking-widest uppercase text-[#8b5cf6] mb-2">
            Werewolf Animation Lab
          </p>
          <h1 className="text-lg font-bold mb-2">哥特火堆阶段动画</h1>
          <p className="text-sm text-[#e2e8f0]/60 leading-relaxed">
            火堆与村落是氛围层，玩家头像由 UI 动态排布。这里先验证动画语言，不接入游戏流程。
          </p>
        </div>

        <label className="flex flex-col gap-1.5 text-sm font-medium text-[#e2e8f0]/70">
          阶段
          <select
            value={phase}
            onChange={(event) => setPhase(event.target.value as DemoPhase)}
            className="bg-white/[0.06] border border-white/[0.12] rounded-lg px-3 py-2 text-[#f7f1e7] text-sm"
          >
            {phaseOptions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-wrap gap-2">
          {[6, 8, 10, 12].map((count) => (
            <button
              key={count}
              type="button"
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                count === playerCount
                  ? "bg-[#7c3aed] text-white"
                  : "bg-white/[0.06] text-[#e2e8f0]/60 hover:bg-white/[0.1]"
              }`}
              onClick={() => setPlayerCount(count)}
            >
              {count} 人
            </button>
          ))}
        </div>

        <p className="text-xs text-[#e2e8f0]/40 leading-relaxed border-t border-white/[0.06] pt-4">
          当前方案：圆形头像降低密度，哥特感放在外圈、光环、角标和阶段特效中。
        </p>
      </aside>
    </main>
  );
}
