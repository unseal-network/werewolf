import { useCallback, useEffect, useState } from "react";
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
  const [fillTargetCount, setFillTargetCount] = useState(targetPlayerCount);
  const [filling, setFilling] = useState(false);

  useEffect(() => {
    if (!open) {
      setPendingId(null);
      setFilling(false);
    }
  }, [open]);

  useEffect(() => {
    if (open) setFillTargetCount(targetPlayerCount);
  }, [open, targetPlayerCount]);

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

  const minFillTarget = Math.max(activePlayerCount, 1);
  const normalizedFillTarget = Math.min(
    targetPlayerCount,
    Math.max(minFillTarget, fillTargetCount)
  );
  const fillMissingCount = Math.max(normalizedFillTarget - activePlayerCount, 0);

  const handleFill = async () => {
    if (!onFill) return;
    setFilling(true);
    try {
      await onFill(normalizedFillTarget);
    } finally {
      setFilling(false);
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

        {onFill ? (
          <div className="agent-fill-control">
            <label className="agent-fill-label" htmlFor="agent-fill-target">
              {t("agentPicker.fillTarget")}
            </label>
            <input
              id="agent-fill-target"
              className="agent-fill-input"
              type="number"
              min={minFillTarget}
              max={targetPlayerCount}
              value={normalizedFillTarget}
              onChange={(event) => {
                const next = Number(event.currentTarget.value);
                if (Number.isFinite(next)) setFillTargetCount(Math.trunc(next));
              }}
            />
            <GameButton
              className="agent-fill-button"
              variant="confirm"
              size="sm"
              label={t("agentPicker.fillNow", { count: fillMissingCount })}
              loading={filling}
              disabled={filling || fillMissingCount <= 0}
              onClick={handleFill}
            />
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
        </div>
      </UiPanelFrame>
    </>
  );
}
