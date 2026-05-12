import type { ReactNode } from "react";
import { FloatingRoomStatus } from "./FloatingRoomStatus";
import { SeatTracksLayout } from "./SeatTracks";
import type { SeatData } from "./SeatAvatar";
import { GameEngine, type EngineGameState } from "../engine/GameEngine";

export type SceneId = "lobby" | "deal" | "night" | "day" | "vote" | "tie" | "end" | "waiting";

interface GameRoomShellProps {
  title: string;
  roomCode: string;
  sourceMatrixRoomId?: string | undefined;
  playerCount: number;
  targetPlayerCount: number;
  phaseLabel: string;
  scene: SceneId;
  accent: string;
  seats: SeatData[];
  seatCount: number;
  onSeatClick: (seatNo: number) => void;
  center: ReactNode;
  timeline: ReactNode;
  roleCardEntry: ReactNode;
  overlays?: ReactNode;
  engineGameState: EngineGameState;
  onHomeClick?: () => void;
  isLoading?: boolean;
}

export function GameRoomShell({
  title,
  roomCode,
  sourceMatrixRoomId,
  playerCount,
  targetPlayerCount,
  phaseLabel,
  scene,
  accent,
  seats,
  seatCount,
  onSeatClick,
  center,
  timeline,
  roleCardEntry,
  overlays,
  engineGameState,
  onHomeClick,
  isLoading,
}: GameRoomShellProps) {
  const rootStyle = { ["--accent" as string]: accent } as React.CSSProperties;
  return (
    <main
      className="game-room-root"
      data-scene={scene}
      style={rootStyle}
    >
      {/* Phaser game engine canvas layer */}
      <div className="game-engine-layer">
        <GameEngine gameState={engineGameState} />
      </div>

      {/* DOM UI overlay layer */}
      <div className="dom-ui-layer">
        {isLoading ? (
          <div className="runtime-loading-bar" aria-live="polite">
            <div className="runtime-loading-track">
              <div className="runtime-loading-thumb" />
            </div>
          </div>
        ) : null}
        <FloatingRoomStatus
          roomTitle={title}
          roomCode={roomCode}
          sourceMatrixRoomId={sourceMatrixRoomId}
          playerCount={playerCount}
          targetPlayerCount={targetPlayerCount}
          phaseLabel={phaseLabel}
          onHomeClick={onHomeClick}
        />
        {roleCardEntry}

        <main className="game">
          <section className="room">
            <SeatTracksLayout
              seats={seats}
              seatCount={seatCount}
              onSeatClick={onSeatClick}
            />
            <div className="table">
              <div className="table-aura" aria-hidden />
              <div className="table-center-frame">{center}</div>
            </div>
          </section>
        </main>

        {timeline}
        {overlays}
      </div>
    </main>
  );
}
