import { useI18n } from "../i18n/I18nProvider";

export interface FloatingRoomStatusProps {
  roomTitle: string;
  roomCode: string;
  sourceMatrixRoomId?: string | undefined;
  playerCount: number;
  targetPlayerCount: number;
  phaseLabel: string;
  onHomeClick?: (() => void) | undefined;
}

export function FloatingRoomStatus({
  roomTitle,
  roomCode,
  sourceMatrixRoomId,
  playerCount,
  targetPlayerCount,
  phaseLabel,
  onHomeClick,
}: FloatingRoomStatusProps) {
  const { t, locale, setLocale } = useI18n();
  const subtitle = sourceMatrixRoomId
    ? `${roomCode} · ${t("floatingStatus.source", { id: sourceMatrixRoomId })}`
    : roomCode;

  return (
    <header className="topbar" aria-label="room-meta">
      <div className="brand">
        {onHomeClick ? (
          <button type="button" className="mark home-btn" onClick={onHomeClick}>
            {t("app.brand")}
          </button>
        ) : (
          <div className="mark">{t("app.brand")}</div>
        )}
        <div>
          <div className="breadcrumb">
            <span className="room-title">{roomTitle}</span>
            <span className="slash">/</span>
            <span>{t("floatingStatus.targetSuffix")}</span>
            <span className="slash">/</span>
            <span className="phase-crumb">{phaseLabel}</span>
          </div>
          <div className="subtitle">
            {t("floatingStatus.headcount", { now: playerCount })}
            {" · "}
            {subtitle}
          </div>
        </div>
      </div>
      <div className="locale-switcher" role="group" aria-label={t("common.languageLabel")}>
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
    </header>
  );
}
