import { BaseScene } from "./BaseScene";

export class VoteScene extends BaseScene {
  constructor() {
    super({ key: "VoteScene" });
  }

  create() {
    const { width, height } = this.scale;

    // Dark red-leaning sky
    const graphics = this.add.graphics();
    const steps = 20;
    for (let i = 0; i < steps; i++) {
      const y = (height / steps) * i;
      const ratio = i / steps;
      // Top: dark crimson → Bottom: dark brown
      const r = Math.floor(40 + ratio * 20);
      const g = Math.floor(15 + ratio * 5);
      const b = Math.floor(15 + ratio * 5);
      const color = (r << 16) | (g << 8) | b;
      graphics.fillStyle(color, 1);
      graphics.fillRect(0, y, width, height / steps + 1);
    }

    // Tension glow center-top
    const glow = this.add.graphics();
    glow.fillStyle(0xff4444, 0.08);
    glow.fillCircle(width * 0.5, height * 0.15, Math.min(width, height) * 0.4);

    // Flying crows (simple V shapes)
    for (let i = 0; i < 5; i++) {
      const startX = Phaser.Math.Between(-50, width);
      const startY = Phaser.Math.Between(height * 0.1, height * 0.4);
      const crow = this.add.text(startX, startY, "V", {
        fontSize: "14px",
        color: "#1a0a0a",
        fontFamily: "sans-serif",
      });
      crow.setAlpha(0.6);

      this.tweens.add({
        targets: crow,
        x: startX + Phaser.Math.Between(200, 500),
        y: startY + Phaser.Math.Between(-30, 30),
        duration: Phaser.Math.Between(8000, 15000),
        ease: "Linear",
        repeat: -1,
        delay: Phaser.Math.Between(0, 5000),
        onRepeat: () => {
          crow.x = Phaser.Math.Between(-50, width * 0.3);
          crow.y = Phaser.Math.Between(height * 0.1, height * 0.4);
        },
      });
    }

    // Falling leaves (particles)
    for (let i = 0; i < 15; i++) {
      const lx = Phaser.Math.Between(0, width);
      const ly = Phaser.Math.Between(-20, height * 0.5);
      const leaf = this.add.ellipse(lx, ly, 6, 3, 0x8b4513, 0.5);
      leaf.rotation = Phaser.Math.FloatBetween(0, Math.PI);

      this.tweens.add({
        targets: leaf,
        y: height + 20,
        x: lx + Phaser.Math.Between(-50, 50),
        rotation: leaf.rotation + Phaser.Math.FloatBetween(2, 5),
        duration: Phaser.Math.Between(6000, 12000),
        ease: "Linear",
        repeat: -1,
        delay: Phaser.Math.Between(0, 8000),
      });
    }
  }
}
