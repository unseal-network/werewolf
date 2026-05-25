import { useEffect, useRef, useState } from "react";
import { useT } from "../i18n/I18nProvider";

export interface RoleCardLayerProps {
  roleId?: string | undefined;
  ownerName?: string | undefined;
  enabled: boolean;
  onReveal?: () => void;
  onOpenChange?: (open: boolean) => void;
}

const ROLE_KEY: Record<string, string> = {
  werewolf: "role.werewolf",
  villager: "role.villager",
  seer: "role.seer",
  witch: "role.witch",
  guard: "role.guard",
  hunter: "role.hunter",
  idiot: "role.idiot",
};

const ROLE_SYMBOL: Record<string, string> = {
  werewolf: "狼",
  villager: "民",
  seer: "占",
  witch: "巫",
  guard: "守",
  hunter: "猎",
  idiot: "白",
};

const ROLE_HAS_AVATAR = new Set(["werewolf", "villager", "seer", "witch", "guard"]);

const avatarBase = `${(import.meta.env.BASE_URL ?? "/").replace(/\/?$/, "/")}assets/roles-avatar`;

type BadgeState = "hidden" | "revealing" | "visible";

export function RoleCardLayer({
  roleId,
  ownerName,
  enabled,
  onReveal,
  onOpenChange,
}: RoleCardLayerProps) {
  const t = useT();
  const [revealedThisDeal, setRevealedThisDeal] = useState(false);
  const [badgeState, setBadgeState] = useState<BadgeState>("hidden");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (enabled && !revealedThisDeal) {
      setBadgeState("revealing");
      setRevealedThisDeal(true);
      onReveal?.();
      timerRef.current = setTimeout(() => setBadgeState("visible"), 1200);
      return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    }
    if (!enabled) {
      if (timerRef.current) clearTimeout(timerRef.current);
      setRevealedThisDeal(false);
      setBadgeState("hidden");
    }
  }, [enabled, onReveal, revealedThisDeal]);

  useEffect(() => { onOpenChange?.(false); }, [onOpenChange]);

  if (!enabled) return null;

  const role = roleId ?? "villager";
  const roleLabel = ROLE_KEY[role] ? t(ROLE_KEY[role]) : t("role.unknown");
  const symbol = ROLE_SYMBOL[role] ?? "";
  const owner = ownerName ?? t("roleCard.fallbackOwner");
  const hasAvatar = ROLE_HAS_AVATAR.has(role);

  return (
    <button
      type="button"
      className={`role-badge role-badge--${badgeState}`}
      onClick={onReveal}
      aria-label={`${t("roleCard.entry")} · ${owner} · ${roleLabel}`}
      title={`${owner} · ${roleLabel}`}
      data-role={role}
    >
      {/* 扫光层 */}
      <span className="role-badge-shimmer" aria-hidden />

      {/* 头像圆形 */}
      <span className="role-badge-avatar" aria-hidden>
        {hasAvatar ? (
          <img
            src={`${avatarBase}/${role}.png`}
            alt=""
            draggable={false}
            className="role-badge-avatar-img"
          />
        ) : (
          <span className="role-badge-avatar-symbol">{symbol}</span>
        )}
      </span>

      {/* 角色名文字条 */}
      <span className="role-badge-name">{roleLabel}</span>
    </button>
  );
}
