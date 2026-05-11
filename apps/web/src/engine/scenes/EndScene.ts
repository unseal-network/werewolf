import { BaseScene } from "./BaseScene";

export class EndScene extends BaseScene {
  constructor() {
    super({ key: "EndScene" });
  }

  create() {
    const { width, height } = this.scale;

    // Gold-green celebration gradient
    const graphics = this.add.graphics();
    const steps = 20;
    for (let i = 0; i < steps; i++) {
      const y = (height / steps) * i;
      const ratio = i / steps;
      // Top: warm gold → Bottom: soft green
      const topR = 255, topG = 248, topB = 220;
      const botR = 200, botG = 240, botB = 210;

      const r = Math.floor(topR + (botR - topR) * ratio);
      const g = Math.floor(topG + (botG - topG) * ratio);
      const b = Math.floor(topB + (botB - topB) * ratio);

      const color = (r << 16) | (g << 8) | b;
      graphics.fillStyle(color, 1);
      graphics.fillRect(0, y, width, height / steps + 1);
    }

    // Central celebration glow
    const glow = this.add.graphics();
    glow.fillStyle(0xf5c95a, 0.12);
    glow.fillCircle(width * 0.5, height * 0.35, Math.min(width, height) * 0.35);

    // Floating particles (confetti-like)
    const colors = [0xf5c95a, 0x13a36c, 0x435cff, 0xff6b6b, 0x4ecdc4];
    for (let i = 0; i < 30; i++) {
      const px = Phaser.Math.Between(0, width);
      const py = Phaser.Math.Between(-20, height);
      const color = Phaser.Utils.Array.GetRandom(colors);
      const size = Phaser.Math.Between(3, 6);

      const particle = this.add.rectangle(px, py, size, size, color, 0.6);
      particle.rotation = Phaser.Math.FloatBetween(0, Math.PI);

      this.tweens.add({
        targets: particle,
        y: py + Phaser.Math.Between(100, 300),
        x: px + Phaser.Math.Between(-80, 80),
        rotation: particle.rotation + Phaser.Math.FloatBetween(3, 8),
        alpha: { from: 0.6, to: 0 },
        duration: Phaser.Math.Between(4000, 8000),
        ease: "Sine.easeOut",
        repeat: -1,
        delay: Phaser.Math.Between(0, 3000),
        onRepeat: () => {
          particle.y = Phaser.Math.Between(-20, height * 0.3);
          particle.x = Phaser.Math.Between(0, width);
          particle.alpha = 0.6;
        },
      });
    }

    // Subtle light rays from center
    const rays = this.add.graphics();
    const rayCount = 8;
    for (let i = 0; i < rayCount; i++) {
      const angle = (Math.PI * 2 / rayCount) * i;
      const length = Math.min(width, height) * 0.5;
      rays.fillStyle(0xfff8e1, 0.03);
      rays.fillTriangle(
        width * 0.5, height * 0.3,
        width * 0.5 + Math.cos(angle - 0.15) * length,
        height * 0.3 + Math.sin(angle - 0.15) * length,
        width * 0.5 + Math.cos(angle + 0.15) * length,
        height * 0.3 + Math.sin(angle + 0.15) * length
      );
    }
  }
}
