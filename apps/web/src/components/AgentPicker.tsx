import { useCallback, useEffect, useMemo, useState } from "react";
import { useT } from "../i18n/I18nProvider";
import type { AgentCandidate } from "../api/client";
import { GameButton } from "./GameButton";
import { GameIconButton } from "./GameIconButton";
import { UiPanelFrame } from "./UiPanelFrame";

interface AgentPickerProps {
  open: boolean;
  loading: boolean;
  agents: AgentCandidate[];
  errorMessage?: string | undefined;
  sourceRoomId?: string | undefined;
  remainingSeats: number;
  activePlayerCount: number;
  targetPlayerCount: number;
  canStartNow: boolean;
  onAdd: (agent: AgentCandidate) => Promise<void>;
  onRemove: (agent: AgentCandidate) => Promise<void>;
  onFill?: ((targetPlayerCount: number) => Promise<void>) | undefined;
  onRefresh: () => void;
  onStartNow?: () => void;
  onClose: () => void;
}

export function AgentPicker({
  open,
  loading,
  agents,
  errorMessage,
  remainingSeats,
  activePlayerCount,
  targetPlayerCount,
  canStartNow,
  onAdd,
  onRemove,
  onFill,
  onRefresh,
  onStartNow,
  onClose,
}: AgentPickerProps) {
  const t = useT();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [fillTargetCount, setFillTargetCount] = useState(() =>
    Math.max(6, activePlayerCount + 1)
  );
  const [filling, setFilling] = useState(false);
  const [fillMenuOpen, setFillMenuOpen] = useState(false);
  const fillOptions = useMemo(() => {
    const firstTarget = Math.max(6, activePlayerCount + 1);
    if (firstTarget > targetPlayerCount) return [];
    return Array.from(
      { length: targetPlayerCount - firstTarget + 1 },
      (_, index) => firstTarget + index
    );
  }, [activePlayerCount, targetPlayerCount]);

  useEffect(() => {
    if (!open) {
      setPendingId(null);
      setFilling(false);
      setFillMenuOpen(false);
    }
  }, [open]);

  useEffect(() => {
    if (open) {
      setFillTargetCount(fillOptions[0] ?? targetPlayerCount);
      setFillMenuOpen(false);
    }
  }, [fillOptions, open, targetPlayerCount]);

  const handleAdd = useCallback(
    async (agent: AgentCandidate) => {
      setPendingId(agent.userId);
      try {
        await onAdd(agent);
      } finally {
        setPendingId(null);
      }
    },
    [onAdd]
  );

  const handleRemove = useCallback(
    async (agent: AgentCandidate) => {
      setPendingId(agent.userId);
      try {
        await onRemove(agent);
      } finally {
        setPendingId(null);
      }
    },
    [onRemove]
  );

  if (!open) return null;

  const normalizedFillTarget = fillOptions.includes(fillTargetCount)
    ? fillTargetCount
    : fillOptions[0] ?? targetPlayerCount;
  const fillMissingCount = Math.max(normalizedFillTarget - activePlayerCount, 0);

  const handleFill = async () => {
    if (!onFill || fillOptions.length === 0) return;
    setFilling(true);
    try {
      await onFill(normalizedFillTarget);
    } finally {
      setFilling(false);
      setFillMenuOpen(false);
    }
  };

  return (
    <>
      <div
        className="sheet-backdrop show"
        onClick={onClose}
        aria-hidden
      />
      <UiPanelFrame
        as="section"
        className="agent-picker open"
        contentClassName="agent-picker-content"
        role="dialog"
        aria-modal="true"
        tone="filled"
        size="medium"
        ornament
      >
        <div className="agent-picker-head">
          <div>
            <div className="agent-picker-title">{t("agentPicker.title")}</div>
          </div>
          <GameIconButton
            className="profile-close"
            onClick={onClose}
            aria-label={t("user.close")}
            label="×"
            size="sm"
          />
        </div>

        {errorMessage ? (
          <div className="agent-picker-error-toast" role="alert" aria-live="polite">
            {t("agentPicker.error", { message: errorMessage })}
          </div>
        ) : null}

        <div className="agent-picker-list">
          {loading && agents.length === 0 ? (
            <div className="agent-picker-empty">{t("common.loadingRoom")}</div>
          ) : agents.length === 0 ? (
            <div className="agent-picker-empty">{t("agentPicker.empty")}</div>
          ) : (
            agents.map((agent) => (
              <div className="agent-row" key={agent.userId}>
                <div className="agent-avatar">
                  {agent.avatarUrl ? (
                    <img src={agent.avatarUrl} alt="" draggable={false} />
                  ) : (
                    agent.displayName.slice(0, 2).toUpperCase()
                  )}
                </div>
                <div className="agent-meta">
                  <div className="agent-name">{agent.displayName}</div>
                  <div className="agent-id">{agent.userId}</div>
                </div>
                <GameIconButton
                  className={`agent-add-button ${agent.alreadyJoined ? "added" : ""}`}
                  disabled={
                    pendingId === agent.userId ||
                    (!agent.alreadyJoined && remainingSeats <= 0)
                  }
                  onClick={() =>
                    agent.alreadyJoined ? handleRemove(agent) : handleAdd(agent)
                  }
                  label={agent.alreadyJoined
                    ? pendingId === agent.userId
                      ? "..."
                      : "-"
                    : pendingId === agent.userId
                      ? "..."
                      : "+"}
                  size="lg"
                />
              </div>
            ))
          )}
        </div>

        <div className="agent-picker-actions">
          <GameButton
            variant="secondary"
            size="sm"
            label={t("agentPicker.refresh")}
            onClick={onRefresh}
          />
          {onStartNow ? (
            <GameButton
              variant="primary"
              size="sm"
              label={t("agentPicker.startNow")}
              onClick={onStartNow}
              disabled={!canStartNow}
            />
          ) : null}
          {onFill && fillOptions.length > 0 ? (
            <div className="agent-fill-control">
              <label className="agent-fill-label" htmlFor="agent-fill-target">
                {t("agentPicker.fillTo")}
              </label>
              <div className="agent-fill-select-wrap">
                <button
                  id="agent-fill-target"
                  type="button"
                  className="agent-fill-select"
                  aria-haspopup="listbox"
                  aria-expanded={fillMenuOpen}
                  onClick={() => setFillMenuOpen((value) => !value)}
                >
                  <span>{normalizedFillTarget}</span>
                  <span className="agent-fill-select-caret" aria-hidden>
                    ▾
                  </span>
                </button>
                {fillMenuOpen ? (
                  <div className="agent-fill-menu" role="listbox" aria-label={t("agentPicker.fillTo")}>
                    {fillOptions.map((count) => (
                      <button
                        key={count}
                        type="button"
                        className={`agent-fill-option ${
                          count === normalizedFillTarget ? "selected" : ""
                        }`}
                        role="option"
                        aria-selected={count === normalizedFillTarget}
                        onClick={() => {
                          setFillTargetCount(count);
                          setFillMenuOpen(false);
                        }}
                      >
                        {count === normalizedFillTarget ? (
                          <span className="agent-fill-option-check" aria-hidden>
                            ✓
                          </span>
                        ) : null}
                        <span>{count}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="agent-fill-unit">{t("agentPicker.fillUnit")}</div>
              <GameIconButton
                className="agent-fill-submit"
                label={filling ? "..." : "+"}
                size="md"
                aria-label={t("agentPicker.fillNow", { count: fillMissingCount })}
                disabled={filling || fillMissingCount <= 0}
                onClick={handleFill}
              />
            </div>
          ) : null}
        </div>
      </UiPanelFrame>
    </>
  );
}
