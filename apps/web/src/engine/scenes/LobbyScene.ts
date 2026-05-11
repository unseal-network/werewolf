import { BaseScene } from "./BaseScene";

export class LobbyScene extends BaseScene {
  constructor() {
    super({ key: "LobbyScene" });
  }

  create() {
    const { width, height } = this.scale;

    // Soft blue-white gradient background
    const bg = this.add.graphics();
    bg.fillGradientStyle(0xf9fbff, 0xf9fbff, 0xf4f6fb, 0xf4f6fb, 1);
    bg.fillRect(0, 0, width, height);

    // Subtle radial glow top-left
    const glow = this.add.graphics();
    glow.fillStyle(0xe8eeff, 0.5);
    glow.fillCircle(width * 0.15, height * 0.2, Math.min(width, height) * 0.4);

    // Subtle warm glow bottom-right
    const warmGlow = this.add.graphics();
    warmGlow.fillStyle(0xfff0dd, 0.35);
    warmGlow.fillCircle(width * 0.85, height * 0.75, Math.min(width, height) * 0.35);
  }
}
