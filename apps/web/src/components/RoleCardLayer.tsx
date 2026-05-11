import { useEffect, useState } from "react";
import { useT } from "../i18n/I18nProvider";

export interface RoleCardLayerProps {
  roleId?: string | undefined;
  ownerName?: string | undefined;
  enabled: boolean;
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
  onOpenChange,
}: RoleCardLayerProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [revealedThisDeal, setRevealedThisDeal] = useState(false);

  // Auto-open when entering a deal-like enabled state for the first time
  useEffect(() => {
    if (enabled && !revealedThisDeal) {
      setOpen(true);
      setRevealedThisDeal(true);
    }
    if (!enabled) {
      setRevealedThisDeal(false);
      setOpen(false);
    }
  }, [enabled, revealedThisDeal]);

  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);

  if (!enabled && !confirmed) {
    return null;
  }

  const role = roleId ?? "villager";
  const roleLabel = ROLE_KEY[role] ? t(ROLE_KEY[role]) : t("role.unknown");
  const symbol = ROLE_SYMBOL[role] ?? "?";

  const close = () => {
    setOpen(false);
    setConfirmed(true);
  };

  const reopen = () => {
    setOpen(true);
  };

  return (
    <>
      {confirmed ? (
        <button
          type="button"
          className="role-card-entry"
          onClick={reopen}
          aria-label={t("roleCard.entry")}
          title={`${ownerName ?? t("roleCard.fallbackOwner")} · ${roleLabel}`}
        >
          ♜
        </button>
      ) : null}

      <div
        className={`sheet-backdrop ${open ? "show" : ""}`}
        onClick={close}
        aria-hidden
      />
      <div className={`role-card-dialog ${open ? "open" : ""}`}>
        <div
          className="role-card-art"
          data-role={role}
          onClick={close}
          role="button"
          aria-label={`${roleLabel}`}
          key={open ? "open" : "closed"}
        >
          <div className="role-card-symbol">{symbol}</div>
          <div className="role-card-title">{roleLabel}</div>
        </div>
      </div>
    </>
  );
}
