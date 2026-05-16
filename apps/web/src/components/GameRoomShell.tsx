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

function clampValue(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function useResponsiveGameLayoutVars(railSlotCount: number) {
  const [vars, setVars] = useState<React.CSSProperties>({});

  useEffect(() => {
    const update = () => {
      const viewport = window.visualViewport;
      const width = viewport?.width ?? window.innerWidth;
      const height = viewport?.height ?? window.innerHeight;
      const compact = width <= 560;
      const narrow = width <= 760;
      const railRows = Math.max(1, railSlotCount);
      const hudSafeHeight = compact ? height * 0.145 : narrow ? height * 0.13 : height * 0.14;
      const tableTopGap = clampValue(
        height * (compact ? 0.024 : 0.028),
        compact ? 16 : 20,
        compact ? 28 : 38
      );
      const railHeight = clampValue(
        compact ? height * 0.56 : narrow ? height * 0.6 : height * 0.62,
        compact ? 360 : 450,
        compact ? height - hudSafeHeight - 230 : narrow ? height - hudSafeHeight - 250 : height - hudSafeHeight - 290
      );
      const seatFromHeight = (railHeight / railRows - (compact ? 10 : 14)) / (compact ? 1.04 : 0.98);
      const seatFromWidth = compact ? width * 0.164 : narrow ? width * 0.115 : width * 0.058;
      const seat = clampValue(
        Math.min(seatFromHeight, seatFromWidth),
        compact ? 48 : narrow ? 58 : 64,
        compact ? 64 : narrow ? 78 : 90
      );
      const avatar = seat * (compact ? 0.72 : 0.7);
      const railWidth = avatar * (compact ? 1.72 : 1.66);
      const naturalSlot = avatar * (compact ? 1.45 : 1.4) + (compact ? 16 : 20);
      const seatSlot = Math.min(naturalSlot, railHeight / railRows);
      const actionWidth = clampValue(
        width - railWidth * 2 - width * (compact ? 0.34 : narrow ? 0.4 : 0.22),
        compact ? 220 : narrow ? 260 : 260,
        compact ? 300 : narrow ? 360 : 380
      );
      const actionBottom = clampValue(
        height * (compact ? 0.022 : narrow ? 0.028 : 0.04),
        compact ? 14 : 18,
        compact ? 32 : narrow ? 38 : 52
      );
      const uiScale = clampValue(
        Math.min(
          seat / (compact ? 64 : narrow ? 78 : 90),
          actionWidth / (compact ? 300 : narrow ? 360 : 380),
          railHeight / (compact ? 500 : narrow ? 620 : 706)
        ),
        compact ? 0.72 : narrow ? 0.82 : 0.78,
        1
      );
      const hudScale = clampValue(uiScale * (compact ? 1.34 : 1.1), compact ? 0.96 : 0.9, 1);
      const actionScale = clampValue(uiScale * 1.2, compact ? 0.88 : 0.86, 1);
      setVars({
        ["--layout-ui-scale" as string]: uiScale.toFixed(4),
        ["--layout-hud-scale" as string]: hudScale.toFixed(4),
        ["--layout-action-scale" as string]: actionScale.toFixed(4),
        ["--layout-seat" as string]: `${seat.toFixed(2)}px`,
        ["--layout-avatar" as string]: `${avatar.toFixed(2)}px`,
        ["--layout-rail-width" as string]: `${railWidth.toFixed(2)}px`,
        ["--layout-seat-slot" as string]: `${seatSlot.toFixed(2)}px`,
        ["--layout-rail-height" as string]: `${railHeight.toFixed(2)}px`,
        ["--layout-table-top-gap" as string]: `${tableTopGap.toFixed(2)}px`,
        ["--layout-action-width" as string]: `${actionWidth.toFixed(2)}px`,
        ["--layout-action-bottom" as string]: `${actionBottom.toFixed(2)}px`,
      });
    };

    update();
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    return () => {
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
    };
  }, [railSlotCount]);

  return vars;
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
  avatarMode,
  onSeatClick,
}: {
  className: string;
  seats: SeatData[];
  slotCount: number;
  avatarMode: "identity" | "hooded";
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
            avatarMode={avatarMode}
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
  const assetBase = `${(import.meta.env.BASE_URL ?? "/").replace(/\/?$/, "/")}assets/werewolf-ui/final`;
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
  const responsiveLayoutVars = useResponsiveGameLayoutVars(railSlotCount);
  const centerBelongsToModal = scene === "end";
  const avatarMode = scene === "lobby" ? "identity" : "hooded";
  const rootStyle = {
    ["--accent" as string]: accent,
    ["--role-card-back-url" as string]: `url("${assetBase}/card/role-card-back.png")`,
    ...responsiveLayoutVars,
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
            avatarMode={avatarMode}
            onSeatClick={onSeatClick}
          />
          <div className="center-info-region">
            {centerInfo}
          </div>
          <PlayerRail
            className="player-rail player-rail-right"
            seats={rails.right}
            slotCount={railSlotCount}
            avatarMode={avatarMode}
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
