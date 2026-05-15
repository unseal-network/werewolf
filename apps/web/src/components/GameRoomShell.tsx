import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useI18n } from "../i18n/I18nProvider";
import { SeatAvatar } from "./SeatAvatar";
import type { SeatData } from "./SeatAvatar";
import { GameEngine, type EngineGameState } from "../engine/GameEngine";
import { RoleRevealEngine } from "./RoleRevealEngine";
import { computeVisibleSeatCount, splitSeatsIntoRails } from "../game/seatLayout";

export type SceneId = "lobby" | "deal" | "night" | "day" | "vote" | "tie" | "end" | "waiting";

interface GameRoomShellProps {
  title: string;
  roomCode: string;
  sourceMatrixRoomId?: string | undefined;
  playerCount: number;
  targetPlayerCount: number;
  phaseLabel: string;
  day?: number | undefined;
  rawPhase?: string | null | undefined;
  deadlineAt?: string | null | undefined;
  aliveCount?: number | undefined;
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
  onRoleCardClose?: () => void;
  onHomeClick?: () => void;
  isLoading?: boolean;
  errorMessage?: string | undefined;
  centerInfo?: ReactNode;
}

function useCountdown(deadlineAt: string | null | undefined) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!deadlineAt) {
      setSeconds(0);
      return;
    }
    const deadlineMs = new Date(deadlineAt).getTime();
    if (!Number.isFinite(deadlineMs)) {
      setSeconds(0);
      return;
    }
    const tick = () => setSeconds(Math.max(0, Math.floor((deadlineMs - Date.now()) / 1000)));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [deadlineAt]);
  return seconds;
}

function phaseIcon(scene: SceneId) {
  switch (scene) {
    case "night":
      return "夜";
    case "day":
      return "昼";
    case "vote":
      return "票";
    case "tie":
      return "决";
    case "deal":
      return "牌";
    case "end":
      return "终";
    default:
      return "局";
  }
}

function shouldSuppressGameContextMenu(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest("textarea, input, [contenteditable='true']")) return false;
  return Boolean(
    target.closest(
      [
        "button",
        "[role='button']",
        ".seat",
        ".avatar",
        ".player-picker",
        ".player-picker-wheel",
        ".player-picker-avatar",
        ".player-picker-slice",
        ".stage-action-button",
        ".role-card-entry",
      ].join(", ")
    )
  );
}

function PlayerRail({
  className,
  seats,
  slotCount,
  onSeatClick,
}: {
  className: string;
  seats: SeatData[];
  slotCount: number;
  onSeatClick: (seatNo: number) => void;
}) {
  const slots = Array.from({ length: slotCount }, (_, index) => seats[index]);
  return (
    <aside className={className}>
      {slots.map((seat, index) =>
        seat ? (
          <SeatAvatar
            key={seat.seatNo}
            seat={seat}
            onClick={() => onSeatClick(seat.seatNo)}
          />
        ) : (
          <div
            key={`rail-spacer-${index}`}
            className="seat rail-seat-spacer"
            aria-hidden
          />
        )
      )}
    </aside>
  );
}

export function GameRoomShell({
  title,
  roomCode,
  sourceMatrixRoomId,
  playerCount,
  targetPlayerCount,
  phaseLabel,
  day,
  rawPhase,
  deadlineAt,
  aliveCount,
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
  onRoleCardClose,
  onHomeClick,
  isLoading,
  errorMessage,
  centerInfo,
}: GameRoomShellProps) {
  const { t } = useI18n();
  const assetBase = `${(import.meta.env.BASE_URL ?? "/").replace(/\/?$/, "/")}assets/role-cards`;
  const countdown = useCountdown(deadlineAt);
  const danger = countdown > 0 && countdown <= 10;
  const living = aliveCount ?? playerCount;
  const activeSeats = useMemo(
    () => seats.filter((seat) => seat.seatNo <= seatCount),
    [seatCount, seats]
  );
  const visibleSeatCount = computeVisibleSeatCount({
    seatCount,
    playerCount,
    occupiedSeatCount: activeSeats.filter((seat) => !seat.isEmpty).length,
  });
  const boardSeats = activeSeats.slice(0, visibleSeatCount);
  const rails = splitSeatsIntoRails(boardSeats);
  const railSlotCount = Math.max(rails.left.length, rails.right.length);
  const centerBelongsToModal = scene === "end";
  const rootStyle = {
    ["--accent" as string]: accent,
    ["--role-card-back-url" as string]: `url("${assetBase}/card-back.png")`,
  } as React.CSSProperties;
  return (
    <main
      className="game-room-root game-layout-root"
      data-scene={scene}
      style={rootStyle}
      onContextMenuCapture={(event) => {
        if (shouldSuppressGameContextMenu(event.target)) {
          event.preventDefault();
        }
      }}
      onDragStartCapture={(event) => {
        if (shouldSuppressGameContextMenu(event.target)) {
          event.preventDefault();
        }
      }}
    >
      <div className="scene-layer" aria-hidden>
        <GameEngine gameState={engineGameState} />
      </div>

      <div className="game-ui-layout">
        {isLoading ? (
          <div className="runtime-loading-bar" aria-live="polite">
            <div className="runtime-loading-track">
              <div className="runtime-loading-thumb" />
            </div>
          </div>
        ) : null}

        <header className="hud-region" aria-label="room-meta">
          <button
            type="button"
            className="hud-back-button"
            onClick={onHomeClick}
            aria-label={t("common.back")}
          >
            ←
          </button>
          <div className="hud-phase-token" aria-hidden>
            {phaseIcon(scene)}
          </div>
          <div className="hud-status">
            <div className="hud-phase-line">
              {phaseLabel}
              {day ? ` · 第 ${day} 天` : ""}
            </div>
            <div className="hud-room-title">{title}</div>
            {sourceMatrixRoomId ? (
              <div className="hud-room-source">{roomCode}</div>
            ) : null}
          </div>
          <div className="hud-metrics">
            <span className={`hud-countdown ${danger ? "danger" : ""}`}>
              {deadlineAt ? (countdown > 0 ? countdown : "✓") : "--"}
            </span>
            <span className="hud-alive-count">{living}/{targetPlayerCount || playerCount}</span>
          </div>
        </header>

        {errorMessage ? (
          <div className="layout-error-toast" role="alert" aria-live="polite">
            {errorMessage}
          </div>
        ) : null}

        <main className="table-region">
          <PlayerRail
            className="player-rail player-rail-left"
            seats={rails.left}
            slotCount={railSlotCount}
            onSeatClick={onSeatClick}
          />
          <div className="center-info-region">
            {centerInfo ?? (
              <section className="center-info-panel" aria-live="polite">
                <div className="center-info-kicker">{rawPhase ?? scene}</div>
                <div className="center-info-title">{phaseLabel}</div>
                <div className="center-info-meta">{living}/{targetPlayerCount || playerCount} 存活</div>
              </section>
            )}
          </div>
          <PlayerRail
            className="player-rail player-rail-right"
            seats={rails.right}
            slotCount={railSlotCount}
            onSeatClick={onSeatClick}
          />
        </main>

        <section className="action-region" aria-label="game-actions">
          {centerBelongsToModal ? null : center}
        </section>

        <footer className="utility-region" aria-label="room-tools">
          <div className="utility-slot utility-role-card">{roleCardEntry}</div>
          <div className="utility-slot utility-timeline">{timeline}</div>
        </footer>
      </div>

      <section className="modal-layer" aria-live="polite">
        {centerBelongsToModal ? center : null}
        <RoleRevealEngine
          roleCard={engineGameState.roleCard}
          onClose={onRoleCardClose}
        />
        {overlays}
      </section>
    </main>
  );
}
