// @ts-nocheck
import { useEffect, useRef } from "react";
import Phaser from "phaser";
import { BootScene } from "./scenes/BootScene";
import { NightScene } from "./scenes/NightScene";
import { DayScene } from "./scenes/DayScene";
import { LobbyScene } from "./scenes/LobbyScene";
import { VoteScene } from "./scenes/VoteScene";
import { EndScene } from "./scenes/EndScene";
import type { SceneId } from "../components/GameRoomShell";

export interface EngineSeat {
  seatNo: number;
  playerId: string;
  displayName: string;
  isEmpty: boolean;
  isDead: boolean;
  isCurrentUser: boolean;
  isSelected: boolean;
  isLegalTarget: boolean;
  isWolfTeammate?: boolean;
}

export interface EngineGameState {
  scene: SceneId;
  phase: string | null;
  seats: EngineSeat[];
  selectedTargetId: string | null;
}

export interface GameEngineProps {
  gameState: EngineGameState;
  onSeatClick?: (playerId: string) => void;
}

export function GameEngine({ gameState, onSeatClick }: GameEngineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const callbacksRef = useRef({ onSeatClick });

  callbacksRef.current = { onSeatClick };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      parent: container,
      width: container.clientWidth || window.innerWidth,
      height: container.clientHeight || window.innerHeight,
      transparent: true,
      scene: [BootScene, LobbyScene, NightScene, DayScene, VoteScene, EndScene],
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      backgroundColor: "#00000000",
    };

    const game = new Phaser.Game(config);
    gameRef.current = game;

    // Bridge: Phaser events → React callbacks
    game.events.on("seat-click", (playerId: string) => {
      callbacksRef.current.onSeatClick?.(playerId);
    });

    return () => {
      game.destroy(true);
      gameRef.current = null;
    };
  }, []);

  // Sync game state changes to active Phaser scene
  useEffect(() => {
    const game = gameRef.current;
    if (!game) return;

    const activeScenes = game.scene.getScenes(true);
    for (const scene of activeScenes) {
      const s = scene as Phaser.Scene & { updateGameState?: (state: EngineGameState) => void };
      if (s.updateGameState) {
        s.updateGameState(gameState);
      }
    }

    // Trigger scene transition if scene changed
    const targetScene = mapSceneIdToSceneKey(gameState.scene);
    if (targetScene) {
      const currentScenes = game.scene.getScenes(true);
      const isTargetActive = currentScenes.some((s) => s.scene.key === targetScene);
      if (!isTargetActive) {
        // Fade out current, then start new
        for (const s of currentScenes) {
          game.scene.stop(s.scene.key);
        }
        game.scene.start(targetScene, { gameState });
      }
    }
  }, [gameState]);

  return <div ref={containerRef} className="game-engine-canvas" />;
}

function mapSceneIdToSceneKey(scene: SceneId): string | null {
  switch (scene) {
    case "lobby":
      return "LobbyScene";
    case "deal":
      return "LobbyScene";
    case "night":
      return "NightScene";
    case "day":
      return "DayScene";
    case "vote":
    case "tie":
      return "VoteScene";
    case "end":
      return "EndScene";
    case "waiting":
      return "LobbyScene";
    default:
      return null;
  }
}