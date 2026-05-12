import Phaser from "phaser";
import type { EngineGameState } from "../GameEngine";

export abstract class BaseScene extends Phaser.Scene {
  protected gameState: EngineGameState = {
    scene: "lobby",
    phase: null,
    seats: [],
    selectedTargetId: null,
  };

  init(data?: { gameState?: EngineGameState }) {
    if (data?.gameState) {
      this.gameState = data.gameState;
    }
  }

  updateGameState(state: EngineGameState) {
    this.gameState = state;
    this.onStateUpdate();
  }

  protected onStateUpdate(): void {
    // Override in subclasses
  }

  protected bootRoleCardLayer(): void {
    // Role reveal is rendered by the DOM overlay so it can size against the real viewport.
  }
}
