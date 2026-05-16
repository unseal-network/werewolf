import { memo } from "react";
import { type DisplayRole, normalizeDisplayRole, ROLE_COLOR, ROLE_IMG } from "../constants/roles";
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

type SeatBadgeId = "blade" | "eye" | "moon" | "people" | "shield" | "star";

const ROLE_BADGE: Record<DisplayRole, SeatBadgeId> = {
  villager: "people",
  guard: "shield",
  hunter: "star",
  seer: "eye",
  werewolf: "blade",
  witch: "moon",
};

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

export function firstReadableInitial(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  const [matrixLocalPart = ""] = trimmed.slice(1).split(":");
  const localPart = trimmed.startsWith("@") ? matrixLocalPart : trimmed;
  const match = localPart.match(/[A-Za-z0-9\u4e00-\u9fff]/u);
  return match?.[0]?.toUpperCase();
}

function avatarIdentitySeed(seat: SeatData, fullName: string): string {
  return seat.userId ?? seat.agentId ?? seat.playerId ?? seat.displayName ?? fullName;
}

export function avatarInitial(seat: SeatData, fullName: string): string {
  return (
    firstReadableInitial(seat.userId) ??
    firstReadableInitial(seat.agentId) ??
    firstReadableInitial(seat.playerId) ??
    firstReadableInitial(seat.displayName) ??
    firstReadableInitial(fullName) ??
    "?"
  );
}

function seatBadgeId(seat: SeatData, roleId: DisplayRole | undefined): SeatBadgeId | undefined {
  if (seat.isEmpty) return undefined;
  if (seat.isActionTarget) return "blade";
  if (roleId) return ROLE_BADGE[roleId];
  if (seat.isCurrentUser) return "star";
  if (seat.isWolfTeammate) return "moon";
  return seat.kind === "agent" ? "people" : undefined;
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
  const badgeId = seatBadgeId(seat, roleId);
  const identitySeed = avatarIdentitySeed(seat, fullName);
  const palette = hasLetterAvatar
    ? avatarPalette(identitySeed)
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
    seat.isDead ? "seat-state-dead" : seat.isEmpty ? "seat-state-ready" : "seat-state-alive",
    seat.isSelected ? "seat-state-selected" : "",
    seat.isActionTarget ? "seat-state-target" : "",
    seat.isCurrentSpeaker ? "seat-state-speaking" : "",
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
        className={[
          "avatar",
          hasLetterAvatar ? "has-hooded-portrait" : "",
        ]
          .filter(Boolean)
          .join(" ")}
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
          <>
            {hasLetterAvatar ? <span className="seat-hooded-portrait" /> : null}
            <span className="seat-avatar-initial">{seat.isEmpty ? "+" : avatarInitial(seat, fullName)}</span>
          </>
        )}
        {badgeId ? (
          <span
            className={`seat-role-badge seat-role-badge-${badgeId}`}
          />
        ) : null}
        {!seat.isEmpty ? <span className="seat-number-badge">{seat.seatNo}</span> : null}
      </div>
      {!seat.isEmpty ? (
        <span className="seat-name" aria-hidden>
          {fullName}
        </span>
      ) : null}
    </button>
  );
});
