import { useEffect, useState } from "react";
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

export function RoleCardLayer({
  roleId,
  ownerName,
  enabled,
  onReveal,
  onOpenChange,
}: RoleCardLayerProps) {
  const t = useT();
  const [revealedThisDeal, setRevealedThisDeal] = useState(false);

  // Auto-open when entering a deal-like enabled state for the first time
  useEffect(() => {
    if (enabled && !revealedThisDeal) {
      onReveal?.();
      setRevealedThisDeal(true);
    }
    if (!enabled) {
      setRevealedThisDeal(false);
    }
  }, [enabled, onReveal, revealedThisDeal]);

  useEffect(() => {
    onOpenChange?.(false);
  }, [onOpenChange]);

  if (!enabled) {
    return null;
  }

  const role = roleId ?? "villager";
  const roleLabel = ROLE_KEY[role] ? t(ROLE_KEY[role]) : t("role.unknown");
  const symbol = ROLE_SYMBOL[role] ?? "";
  const owner = ownerName ?? t("roleCard.fallbackOwner");

  return (
    <button
      type="button"
      className="role-card-entry"
      onClick={onReveal}
      aria-label={`${t("roleCard.entry")} · ${owner} · ${roleLabel}`}
      title={`${owner} · ${roleLabel}`}
      data-role={role}
    >
      <span className="role-card-entry-back" aria-hidden />
      <span className="role-card-entry-mark" aria-hidden>{symbol}</span>
      <span className="role-card-entry-text">{t("roleCard.entry")}</span>
    </button>
  );
}
