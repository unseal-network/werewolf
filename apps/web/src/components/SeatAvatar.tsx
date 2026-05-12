import { memo } from "react";
import { normalizeDisplayRole, ROLE_COLOR, ROLE_IMG } from "../constants/roles";
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
  visibleRole?: string | undefined;
}

interface SeatAvatarProps {
  seat: SeatData;
  onClick: () => void;
}

export const SeatAvatar = memo(function SeatAvatar({ seat, onClick }: SeatAvatarProps) {
  const t = useT();
  const fallbackName = t("seat.fallbackName", { n: seat.seatNo });
  const fullName = seat.displayName?.trim() ? seat.displayName : fallbackName;
  const roleId = seat.visibleRole ? normalizeDisplayRole(seat.visibleRole) : undefined;
  const roleImg = roleId ? ROLE_IMG[roleId] : undefined;
  const roleColor = roleId ? ROLE_COLOR[roleId] : undefined;
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
      <div
        className="avatar"
        aria-hidden
        style={roleColor ? { ["--seat-role-color" as string]: roleColor } : undefined}
      >
        {roleImg ? (
          <img
            className="seat-avatar-img"
            src={roleImg}
            alt=""
            draggable={false}
          />
        ) : (
          <span>{seat.isEmpty ? "+" : fullName.charAt(0).toUpperCase()}</span>
        )}
        {!seat.isEmpty ? <span className="seat-number-badge">{seat.seatNo}</span> : null}
        {seat.isSelected ? <span className="seat-selected-mark">✓</span> : null}
        {seat.isCurrentSpeaker && !seat.isDead ? <span className="seat-speaking-mark" /> : null}
      </div>
      <div className="seat-name">
        {seat.isEmpty
          ? t("seat.empty")
          : fullName}
      </div>
      <div className="seat-tooltip">{fullName}</div>
      {seat.isDead ? <span className="seat-dead-tag">{t("seat.dead")}</span> : null}
      {seat.isWolfTeammate ? <span className="seat-wolf-tag">{t("seat.wolfTeammate")}</span> : null}
    </button>
  );
});
