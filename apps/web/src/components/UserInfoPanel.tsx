import type { SeatData } from "./SeatAvatar";
import { useT } from "../i18n/I18nProvider";

interface UserInfoPanelProps {
  seat: SeatData | null;
  onClose: () => void;
}

export function UserInfoPanel({ seat, onClose }: UserInfoPanelProps) {
  const t = useT();
  const open = Boolean(seat);
  const fallbackName = t("seat.fallbackName", { n: seat?.seatNo ?? 0 });
  const title = seat?.displayName?.trim().length
    ? seat.displayName
    : fallbackName;
  const status = !seat
    ? ""
    : seat.isEmpty
      ? t("seat.empty")
      : seat.isDead
        ? t("user.statusDead")
        : t("user.statusAlive");
  const kind = !seat || seat.isEmpty
    ? "—"
    : seat.kind === "agent"
      ? t("user.kindAgent")
      : t("user.kindUser");
  if (!open) return null;

  return (
    <>
      <div
        className="sheet-backdrop show"
        onClick={onClose}
        aria-hidden
      />
      <section className="profile-dialog open" role="dialog" aria-modal="true">
        {seat ? (
          <>
            <div className="profile-head">
              <div className="profile-avatar">
                {seat.isEmpty ? "+" : seat.seatNo}
              </div>
              <div>
                <div className="profile-name">{title}</div>
                <div className="profile-meta">
                  {t("seat.numberLabel", { n: seat.seatNo })} · {status}
                </div>
              </div>
              <button
                type="button"
                className="profile-close"
                onClick={onClose}
                aria-label={t("user.close")}
              >
                ×
              </button>
            </div>
            <div className="profile-facts">
              <div className="profile-fact">
                <b>{t("user.fact.seat")}</b>
                <span>{t("seat.numberLabel", { n: seat.seatNo })}</span>
              </div>
              <div className="profile-fact">
                <b>{t("user.fact.state")}</b>
                <span>{status}</span>
              </div>
              <div className="profile-fact">
                <b>{t("user.fact.identity")}</b>
                <span>{t("user.fact.identityHidden")}</span>
              </div>
              <div className="profile-fact">
                <b>{t("user.fact.kind")}</b>
                <span>{kind}</span>
              </div>
            </div>
          </>
        ) : null}
      </section>
    </>
  );
}
