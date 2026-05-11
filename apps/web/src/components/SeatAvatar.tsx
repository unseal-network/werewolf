import { memo } from "react";
import { useT } from "../i18n/I18nProvider";

export interface SeatData {
  seatNo: number;
  playerId: string | undefined;
  displayName: string | undefined;
  kind: "user" | "agent" | undefined;
  isEmpty: boolean;
  isDead: boolean;
  isCurrentUser: boolean;
  isActionTarget: boolean;
  isSelected: boolean;
  isCurrentSpeaker?: boolean;
  isWolfTeammate?: boolean;
}

interface SeatAvatarProps {
  seat: SeatData;
  onClick: () => void;
}

export const SeatAvatar = memo(function SeatAvatar({ seat, onClick }: SeatAvatarProps) {
  const t = useT();
  const fallbackName = t("seat.fallbackName", { n: seat.seatNo });
  const fullName = seat.displayName?.trim() ? seat.displayName : fallbackName;
  const isInteractable = seat.isEmpty || seat.isActionTarget;
  const classes = [
    "seat",
    seat.isEmpty ? "empty" : "",
    seat.isDead ? "dead" : "",
    seat.isActionTarget ? "selectable" : "",
    seat.isCurrentUser || seat.isCurrentSpeaker ? "active" : "",
    seat.isSelected ? "selected" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      className={classes}
      data-seat-no={seat.seatNo}
      onClick={onClick}
      title={seat.isEmpty ? t("seat.tipEmpty", { n: seat.seatNo }) : fullName}
      aria-label={fullName}
    >
      <div className="avatar" aria-hidden>
        {seat.isEmpty ? "+" : seat.seatNo}
      </div>
      <div className="seat-name">
        {seat.isEmpty
          ? t("seat.empty")
          : t("seat.numberLabel", { n: seat.seatNo })}
      </div>
      <div className="seat-tooltip">{fullName}</div>
      {seat.isDead ? <span className="seat-dead-tag">{t("seat.dead")}</span> : null}
      {seat.isWolfTeammate ? <span className="seat-wolf-tag">{t("seat.wolfTeammate")}</span> : null}
    </button>
  );
});
