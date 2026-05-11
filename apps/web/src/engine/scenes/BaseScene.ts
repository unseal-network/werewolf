import Phaser from "phaser";
import type { EngineGameState } from "../GameEngine";

export abstract class BaseScene extends Phaser.Scene {
  protected gameState: EngineGameState = {
    scene: "lobby",
    phase: null,
    seats: [],
    selectedTargetId: null,
  };

  updateGameState(state: EngineGameState) {
    this.gameState = state;
    this.onStateUpdate();
  }

  protected onStateUpdate(): void {
    // Override in subclasses
  }
}
