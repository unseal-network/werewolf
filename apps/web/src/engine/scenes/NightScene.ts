import { BaseScene } from "./BaseScene";

export class NightScene extends BaseScene {
  private stars: Phaser.GameObjects.Arc[] = [];

  constructor() {
    super({ key: "NightScene" });
  }

  create() {
    const { width, height } = this.scale;

    this.createGothicSky(width, height);
    this.createStars(width, height);
    this.createCrescentMoon(width, height);
    this.createThickFog(width, height);
    this.createGothicGround(width, height);
    this.createBats(width, height);
    this.createGothicSpires(width, height);
  }

  private createGothicSky(width: number, height: number) {
    const graphics = this.add.graphics();
    const steps = 24;
    for (let i = 0; i < steps; i++) {
      const y = (height / steps) * i;
      const ratio = i / steps;
      // Gothic sky: deep purple-black gradient
      const r = Math.floor(8 + ratio * 5);
      const g = Math.floor(6 + ratio * 4);
      const b = Math.floor(18 + ratio * 8);
      const color = (r << 16) | (g << 8) | b;
      graphics.fillStyle(color, 1);
      graphics.fillRect(0, y, width, height / steps + 1);
    }

    // Eerie purple glow near top-right (behind moon)
    const glow = this.add.graphics();
    glow.fillStyle(0x4a306d, 0.12);
    glow.fillCircle(width * 0.82, height * 0.15, Math.min(width, height) * 0.35);
  }

  private createStars(width: number, height: number) {
    const starCount = Math.floor((width * height) / 5000);

    for (let i = 0; i < starCount; i++) {
      const x = Phaser.Math.Between(10, width - 10);
      const y = Phaser.Math.Between(10, height * 0.6);
      const size = Phaser.Math.FloatBetween(0.4, 1.8);
      const baseAlpha = Phaser.Math.FloatBetween(0.2, 0.7);
      // Slight blue/purple tint for stars
      const tint = Phaser.Math.Between(0, 2);
      const color = tint === 0 ? 0xffffff : tint === 1 ? 0xd0d0ff : 0xffd0ff;

      const star = this.add.circle(x, y, size, color, baseAlpha);
      this.stars.push(star);

      this.tweens.add({
        targets: star,
        alpha: { from: baseAlpha * 0.2, to: Math.min(0.9, baseAlpha + 0.2) },
        duration: Phaser.Math.Between(2500, 6000),
        ease: "Sine.easeInOut",
        yoyo: true,
        repeat: -1,
        delay: Phaser.Math.Between(0, 4000),
      });
    }
  }

  private createCrescentMoon(width: number, height: number) {
    const moonX = width * 0.82;
    const moonY = height * 0.16;
    const moonRadius = Math.min(width, height) * 0.065;

    // Moon outer glow
    for (let i = 3; i >= 1; i--) {
      const glow = this.add.circle(
        moonX,
        moonY,
        moonRadius * (1 + i * 0.5),
        0xddd0f0,
        0.04 * i
      );
      this.tweens.add({
        targets: glow,
        scaleX: 1 + 0.08 * i,
        scaleY: 1 + 0.08 * i,
        alpha: { from: 0.03 * i, to: 0.06 * i },
        duration: 5000 + i * 1200,
        ease: "Sine.easeInOut",
        yoyo: true,
        repeat: -1,
      });
    }

    // Full moon circle (pale blue-white)
    const fullMoon = this.add.circle(moonX, moonY, moonRadius, 0xe8e0f5, 0.9);

    // Crescent shadow (slightly offset dark circle to create crescent shape)
    const shadow = this.add.circle(
      moonX + moonRadius * 0.35,
      moonY - moonRadius * 0.1,
      moonRadius * 0.92,
      0x0a0618,
      0.95
    );

    // Gentle floating
    this.tweens.add({
      targets: [fullMoon, shadow],
      y: moonY + 6,
      duration: 7000,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });
  }

  private createThickFog(width: number, height: number) {
    const fogHeight = height * 0.35;
    const fogY = height - fogHeight;

    const fog = this.add.graphics();
    const steps = 12;
    for (let i = 0; i < steps; i++) {
      const ratio = i / steps;
      const alpha = 0.2 * (1 - ratio);
      const y = fogY + (fogHeight / steps) * i;
      // Purple-grey fog
      fog.fillStyle(0x5a4a6a, alpha);
      fog.fillRect(0, y, width, fogHeight / steps + 1);
    }

    this.tweens.add({
      targets: fog,
      x: -40,
      duration: 18000,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });
  }

  private createGothicGround(width: number, height: number) {
    const graphics = this.add.graphics();
    // Dark ground silhouette
    graphics.fillStyle(0x05030a, 1);
    graphics.fillRect(0, height * 0.82, width, height * 0.18);
  }

  private createGothicSpires(width: number, height: number) {
    const graphics = this.add.graphics();
    const baseY = height * 0.82;

    // Helper to draw a gothic spire
    const drawSpire = (x: number, w: number, h: number, color: number) => {
      // Main tower body
      graphics.fillStyle(color, 1);
      graphics.fillRect(x - w / 2, baseY - h, w, h);
      // Pointed roof
      graphics.fillTriangle(
        x - w / 2 - w * 0.15,
        baseY - h,
        x,
        baseY - h - h * 0.35,
        x + w / 2 + w * 0.15,
        baseY - h
      );
      // Cross on top
      graphics.fillRect(x - 1, baseY - h - h * 0.42, 2, h * 0.08);
      graphics.fillRect(x - w * 0.04, baseY - h - h * 0.38, w * 0.08, 2);
      // Gothic arched window
      graphics.fillStyle(0xffaa33, 0.15);
      graphics.fillEllipse(x, baseY - h * 0.55, w * 0.35, h * 0.18);
    };

    // Draw multiple spires across the screen
    const spires = [
      { x: width * 0.08, w: 28, h: 100 },
      { x: width * 0.18, w: 40, h: 160 },
      { x: width * 0.28, w: 24, h: 80 },
      { x: width * 0.38, w: 50, h: 200 },
      { x: width * 0.48, w: 32, h: 120 },
      { x: width * 0.58, w: 44, h: 180 },
      { x: width * 0.68, w: 26, h: 90 },
      { x: width * 0.78, w: 48, h: 220 },
      { x: width * 0.88, w: 34, h: 140 },
      { x: width * 0.95, w: 22, h: 70 },
    ];

    for (const spire of spires) {
      drawSpire(spire.x, spire.w, spire.h, 0x0a0614);
    }

    // Draw tombstones in foreground
    graphics.fillStyle(0x0e0a18, 1);
    for (let i = 0; i < 8; i++) {
      const tx = Phaser.Math.Between(width * 0.05, width * 0.95);
      const tw = Phaser.Math.Between(12, 22);
      const th = Phaser.Math.Between(25, 45);
      const ty = baseY - th + Phaser.Math.Between(0, 15);
      // Tombstone shape (rounded top rectangle)
      graphics.fillRoundedRect(tx, ty, tw, th, tw / 2);
    }

    // Dead trees
    graphics.lineStyle(2, 0x0a0614, 1);
    for (let i = 0; i < 5; i++) {
      const tx = Phaser.Math.Between(width * 0.1, width * 0.9);
      const th = Phaser.Math.Between(40, 80);
      // Trunk
      graphics.lineBetween(tx, baseY, tx, baseY - th);
      // Branches
      graphics.lineBetween(tx, baseY - th * 0.4, tx - 15, baseY - th * 0.6);
      graphics.lineBetween(tx, baseY - th * 0.5, tx + 12, baseY - th * 0.7);
      graphics.lineBetween(tx, baseY - th * 0.7, tx - 10, baseY - th * 0.85);
    }
  }

  private createBats(width: number, height: number) {
    for (let i = 0; i < 6; i++) {
      const startX = Phaser.Math.Between(-30, width);
      const startY = Phaser.Math.Between(height * 0.1, height * 0.45);
      const scale = Phaser.Math.FloatBetween(0.4, 0.8);

      // Draw bat shape using graphics
      const bat = this.add.graphics();
      bat.fillStyle(0x080510, 0.7);
      // Simple bat silhouette
      const wingSpan = 20 * scale;
      const bodyH = 8 * scale;
      bat.beginPath();
      bat.moveTo(0, 0);
      bat.lineTo(-wingSpan, -bodyH);
      bat.lineTo(-wingSpan * 0.3, -bodyH * 0.3);
      bat.lineTo(0, -bodyH * 0.8);
      bat.lineTo(wingSpan * 0.3, -bodyH * 0.3);
      bat.lineTo(wingSpan, -bodyH);
      bat.closePath();
      bat.fillPath();
      bat.x = startX;
      bat.y = startY;

      this.tweens.add({
        targets: bat,
        x: startX + Phaser.Math.Between(150, 400),
        y: startY + Phaser.Math.Between(-40, 40),
        duration: Phaser.Math.Between(6000, 12000),
        ease: "Linear",
        repeat: -1,
        delay: Phaser.Math.Between(0, 6000),
        onRepeat: () => {
          bat.x = Phaser.Math.Between(-30, width * 0.3);
          bat.y = Phaser.Math.Between(height * 0.1, height * 0.45);
        },
      });

      // Wing flap (scale Y)
      this.tweens.add({
        targets: bat,
        scaleY: 0.6,
        duration: 200,
        ease: "Sine.easeInOut",
        yoyo: true,
        repeat: -1,
      });
    }
  }
}
