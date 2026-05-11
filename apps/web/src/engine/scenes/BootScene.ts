import Phaser from "phaser";

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: "BootScene" });
  }

  create() {
    // Boot scene is a minimal launcher
    // The actual scene is started by GameEngine based on game state
  }
}
