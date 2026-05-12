import { BaseScene } from "./BaseScene";

export class DayScene extends BaseScene {
  private clouds: Phaser.GameObjects.Container[] = [];

  constructor() {
    super({ key: "DayScene" });
  }

  create() {
    const { width, height } = this.scale;

    this.createGothicDaySky(width, height);
    this.createPaleSun(width, height);
    this.createDarkClouds(width, height);
    this.createGothicVillage(width, height);
    this.createCrows(width, height);
    this.bootRoleCardLayer();
  }

  private createGothicDaySky(width: number, height: number) {
    const graphics = this.add.graphics();
    const steps = 24;

    for (let i = 0; i < steps; i++) {
      const y = (height / steps) * i;
      const ratio = i / steps;
      // Gothic day: grey-purple sky, no warm colors
      const topR = 80, topG = 75, topB = 95;
      const botR = 45, botG = 40, botB = 55;

      const r = Math.floor(topR + (botR - topR) * ratio);
      const g = Math.floor(topG + (botG - topG) * ratio);
      const b = Math.floor(topB + (botB - topB) * ratio);

      const color = (r << 16) | (g << 8) | b;
      graphics.fillStyle(color, 1);
      graphics.fillRect(0, y, width, height / steps + 1);
    }
  }

  private createPaleSun(width: number, height: number) {
    const sunX = width * 0.78;
    const sunY = height * 0.14;
    const sunRadius = Math.min(width, height) * 0.05;

    // Pale, eerie sun glow
    for (let i = 2; i >= 1; i--) {
      const glow = this.add.circle(
        sunX,
        sunY,
        sunRadius * (1 + i * 0.6),
        0xddd5e0,
        0.06 * i
      );
      this.tweens.add({
        targets: glow,
        scaleX: 1.04,
        scaleY: 1.04,
        duration: 4000 + i * 800,
        ease: "Sine.easeInOut",
        yoyo: true,
        repeat: -1,
      });
    }

    // Pale sun body
    const sun = this.add.circle(sunX, sunY, sunRadius, 0xe8e0ee, 0.85);

    this.tweens.add({
      targets: sun,
      y: sunY + 4,
      duration: 6000,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });
  }

  private createDarkClouds(width: number, height: number) {
    const cloudCount = Math.floor(width / 200);

    for (let i = 0; i < cloudCount; i++) {
      const cx = Phaser.Math.Between(50, width - 50);
      const cy = Phaser.Math.Between(height * 0.06, height * 0.3);
      const scale = Phaser.Math.FloatBetween(0.7, 1.6);

      const cloudContainer = this.add.container(cx, cy);

      // Dark, ominous cloud puffs
      const puffColor = 0x4a4555;
      const puffs = [
        { x: 0, y: 0, rx: 38 * scale, ry: 22 * scale },
        { x: 28 * scale, y: -10 * scale, rx: 32 * scale, ry: 20 * scale },
        { x: -26 * scale, y: -6 * scale, rx: 28 * scale, ry: 18 * scale },
        { x: 18 * scale, y: 6 * scale, rx: 26 * scale, ry: 16 * scale },
        { x: -14 * scale, y: 10 * scale, rx: 24 * scale, ry: 14 * scale },
      ];

      for (const puff of puffs) {
        const ellipse = this.add.ellipse(
          puff.x, puff.y, puff.rx * 2, puff.ry * 2,
          puffColor, 0.7
        );
        cloudContainer.add(ellipse);
      }

      // Slow ominous drift
      const speed = Phaser.Math.Between(25000, 50000);
      this.tweens.add({
        targets: cloudContainer,
        x: cx + Phaser.Math.Between(80, 250),
        duration: speed,
        ease: "Linear",
        yoyo: true,
        repeat: -1,
      });
    }
  }

  private createGothicVillage(width: number, height: number) {
    const baseY = height * 0.8;
    const graphics = this.add.graphics();

    // Dark hills
    graphics.fillStyle(0x1a1520, 0.8);
    graphics.beginPath();
    graphics.moveTo(0, baseY);
    for (let x = 0; x <= width; x += 15) {
      const y = baseY - Math.sin(x / width * Math.PI * 3) * 25 - 10;
      graphics.lineTo(x, y);
    }
    graphics.lineTo(width, height);
    graphics.lineTo(0, height);
    graphics.closePath();
    graphics.fillPath();

    // Gothic buildings silhouette
    graphics.fillStyle(0x0f0b14, 1);
    const buildingCount = Math.floor(width / 60);
    for (let i = 0; i < buildingCount; i++) {
      const bx = (width / buildingCount) * i + Phaser.Math.Between(-10, 10);
      const bw = Phaser.Math.Between(25, 50);
      const bh = Phaser.Math.Between(40, 100);
      const by = baseY - 15;

      // Building body
      graphics.fillRect(bx, by - bh, bw, bh + 20);
      // Pointed Gothic roof
      graphics.fillTriangle(
        bx - 4, by - bh,
        bx + bw / 2, by - bh - Phaser.Math.Between(20, 40),
        bx + bw + 4, by - bh
      );

      // Arched windows with dim light
      if (Math.random() > 0.5) {
        graphics.fillStyle(0xff9944, 0.08);
        graphics.fillEllipse(bx + bw / 2, by - bh * 0.45, bw * 0.4, bh * 0.22);
        graphics.fillStyle(0x0f0b14, 1);
      }
    }
  }

  private createCrows(width: number, height: number) {
    for (let i = 0; i < 4; i++) {
      const startX = Phaser.Math.Between(-50, width);
      const startY = Phaser.Math.Between(height * 0.05, height * 0.35);

      // Crow as simple V shape text
      const crow = this.add.text(startX, startY, "V", {
        fontSize: `${Phaser.Math.Between(12, 18)}px`,
        color: "#0a080f",
        fontFamily: "sans-serif",
      });
      crow.setAlpha(0.5);

      this.tweens.add({
        targets: crow,
        x: startX + Phaser.Math.Between(200, 500),
        y: startY + Phaser.Math.Between(-20, 20),
        duration: Phaser.Math.Between(8000, 15000),
        ease: "Linear",
        repeat: -1,
        delay: Phaser.Math.Between(0, 5000),
        onRepeat: () => {
          crow.x = Phaser.Math.Between(-50, width * 0.3);
          crow.y = Phaser.Math.Between(height * 0.05, height * 0.35);
        },
      });
    }
  }
}
