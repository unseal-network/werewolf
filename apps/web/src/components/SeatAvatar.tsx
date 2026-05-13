import { memo } from "react";
import { normalizeDisplayRole, ROLE_COLOR, ROLE_IMG } from "../constants/roles";
import { useT } from "../i18n/I18nProvider";

export interface SeatData {
  seatNo: number;
  playerId: string | undefined;
  userId: string | undefined;
  agentId: string | undefined;
  invitedByUserId: string | undefined;
  displayName: string | undefined;
  avatarUrl: string | undefined;
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

const AVATAR_COLORS = [
  { bg: "#7f1d1d", fg: "#fecaca" },
  { bg: "#073b8f", fg: "#67e8f9" },
  { bg: "#831843", fg: "#f9a8d4" },
  { bg: "#5b0a86", fg: "#f0abfc" },
  { bg: "#064e3b", fg: "#86efac" },
  { bg: "#14532d", fg: "#4ade80" },
  { bg: "#854d0e", fg: "#fde68a" },
  { bg: "#312e81", fg: "#c4b5fd" },
  { bg: "#7c2d12", fg: "#fdba74" },
  { bg: "#134e4a", fg: "#5eead4" },
];

function stableHash(value: string): number {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 33) ^ value.charCodeAt(i);
  }
  return hash >>> 0;
}

export function avatarPalette(seed: string): { bg: string; fg: string } {
  return AVATAR_COLORS[stableHash(seed) % AVATAR_COLORS.length] ?? AVATAR_COLORS[0]!;
}

export const SeatAvatar = memo(function SeatAvatar({ seat, onClick }: SeatAvatarProps) {
  const t = useT();
  const fallbackName = t("seat.fallbackName", { n: seat.seatNo });
  const fullName = seat.displayName?.trim() ? seat.displayName : fallbackName;
  const roleId = seat.visibleRole ? normalizeDisplayRole(seat.visibleRole) : undefined;
  const roleImg = roleId ? ROLE_IMG[roleId] : undefined;
  const roleColor = roleId ? ROLE_COLOR[roleId] : undefined;
  const hasImageAvatar = Boolean(seat.avatarUrl && !seat.isEmpty && !roleImg);
  const hasLetterAvatar = Boolean(!seat.isEmpty && !roleImg && !hasImageAvatar);
  const palette = hasLetterAvatar
    ? avatarPalette(seat.userId ?? seat.agentId ?? seat.playerId ?? fullName)
    : undefined;
  const avatarStyle = {
    ...(roleColor ? { ["--seat-role-color" as string]: roleColor } : {}),
    ...(palette
      ? {
          ["--seat-avatar-bg" as string]: palette.bg,
          ["--seat-avatar-fg" as string]: palette.fg,
        }
      : {}),
  };
  const classes = [
    "seat",
    seat.isEmpty ? "empty" : "",
    roleImg ? "has-role-avatar" : "",
    hasImageAvatar ? "has-image-avatar" : "",
    hasLetterAvatar ? "has-letter-avatar" : "",
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
        style={avatarStyle}
      >
        {roleImg ? (
          <img
            className="seat-avatar-img role-avatar-img"
            src={roleImg}
            alt=""
            draggable={false}
          />
        ) : seat.avatarUrl && !seat.isEmpty ? (
          <img
            className="seat-avatar-img player-avatar-img"
            src={seat.avatarUrl}
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
