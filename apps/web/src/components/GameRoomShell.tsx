import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useI18n } from "../i18n/I18nProvider";
import { SeatAvatar } from "./SeatAvatar";
import type { SeatData } from "./SeatAvatar";
import { GameEngine, type EngineGameState } from "../engine/GameEngine";
import { RoleRevealEngine } from "./RoleRevealEngine";

export type SceneId = "lobby" | "deal" | "night" | "day" | "vote" | "tie" | "end" | "waiting";

interface GameRoomShellProps {
  title: string;
  roomCode: string;
  sourceMatrixRoomId?: string | undefined;
  playerCount: number;
  targetPlayerCount: number;
  phaseLabel: string;
  rawPhase?: string | null | undefined;
  day?: number | undefined;
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
      return "🌙";
    case "day":
      return "☀️";
    case "vote":
      return "🗳";
    case "tie":
      return "⚖️";
    case "deal":
      return "🃏";
    case "end":
      return "🏁";
    default:
      return "M";
  }
}

function VisualSeatGrid({
  seats,
  onSeatClick,
}: {
  seats: SeatData[];
  onSeatClick: (seatNo: number) => void;
}) {
  return (
    <div className="visual-seat-grid">
      {seats.map((seat) => (
        <SeatAvatar
          key={seat.seatNo}
          seat={seat}
          onClick={() => onSeatClick(seat.seatNo)}
        />
      ))}
    </div>
  );
}

export function GameRoomShell({
  title,
  roomCode,
  sourceMatrixRoomId,
  playerCount,
  targetPlayerCount,
  phaseLabel,
  rawPhase,
  day,
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
}: GameRoomShellProps) {
  const { t, locale, setLocale } = useI18n();
  const assetBase = `${(import.meta.env.BASE_URL ?? "/").replace(/\/?$/, "/")}assets/role-cards`;
  const countdown = useCountdown(deadlineAt);
  const danger = countdown > 0 && countdown <= 10;
  const living = aliveCount ?? playerCount;
  const activeSeats = useMemo(
    () => seats.filter((seat) => seat.seatNo <= seatCount),
    [seatCount, seats]
  );
  const visibleSeatCount = Math.min(
    seatCount,
    Math.max(6, playerCount, activeSeats.filter((seat) => !seat.isEmpty).length)
  );
  const boardSeats = activeSeats.slice(0, visibleSeatCount);
  const compact = boardSeats.length >= 10;
  const rootStyle = {
    ["--accent" as string]: accent,
    ["--role-card-back-url" as string]: `url("${assetBase}/card-back.png")`,
  } as React.CSSProperties;
  return (
    <main
      className="game-room-root visual-runtime-root"
      data-scene={scene}
      data-visual-runtime="true"
      data-compact={compact ? "true" : "false"}
      style={rootStyle}
    >
      <div
        className="game-engine-layer visual-role-engine"
      >
        <GameEngine gameState={engineGameState} />
      </div>

      <div className="dom-ui-layer">
        {isLoading ? (
          <div className="runtime-loading-bar" aria-live="polite">
            <div className="runtime-loading-track">
              <div className="runtime-loading-thumb" />
            </div>
          </div>
        ) : null}

        <header className="visual-topbar" aria-label="room-meta">
          <button
            type="button"
            className="visual-nav-button"
            onClick={onHomeClick}
            aria-label={t("common.back")}
          >
            ←
          </button>
          <div className="visual-phase-mark" aria-hidden>
            {phaseIcon(scene)}
          </div>
          <div className="visual-room-meta">
            <div className="visual-room-title">{title}</div>
            <div className="visual-room-subtitle">
              {phaseLabel}
              {day ? ` · 第 ${day} 天` : ""}
              {" · "}
              {living}/{targetPlayerCount || playerCount} 存活
            </div>
            {sourceMatrixRoomId ? (
              <div className="visual-room-source">{roomCode}</div>
            ) : null}
          </div>
          <div className="visual-top-actions">
            <div className={`visual-countdown ${danger ? "danger" : ""}`}>
              {deadlineAt ? (countdown > 0 ? countdown : "✓") : "—"}
            </div>
            <div className="locale-switcher visual-locale" role="group" aria-label={t("common.languageLabel")}>
              <button
                type="button"
                className={locale === "zh-CN" ? "active" : ""}
                onClick={() => setLocale("zh-CN")}
                aria-pressed={locale === "zh-CN"}
              >
                中
              </button>
              <button
                type="button"
                className={locale === "en" ? "active" : ""}
                onClick={() => setLocale("en")}
                aria-pressed={locale === "en"}
              >
                EN
              </button>
            </div>
          </div>
        </header>

        {errorMessage ? (
          <div className="visual-error-toast" role="alert" aria-live="polite">
            {errorMessage}
          </div>
        ) : null}

        {roleCardEntry}
        <RoleRevealEngine
          roleCard={engineGameState.roleCard}
          onClose={onRoleCardClose}
        />

        <main className="visual-game">
          <section className="visual-room">
            <div className="visual-magic-circle" aria-hidden />
            <div className="visual-center">{center}</div>
            <VisualSeatGrid seats={boardSeats} onSeatClick={onSeatClick} />
          </section>
        </main>

        {timeline}
        {overlays}
      </div>
    </main>
  );
}
