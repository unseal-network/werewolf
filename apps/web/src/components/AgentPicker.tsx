import { useCallback, useEffect, useState } from "react";
import { useT } from "../i18n/I18nProvider";
import type { AgentCandidate } from "../api/client";

interface AgentPickerProps {
  open: boolean;
  loading: boolean;
  agents: AgentCandidate[];
  errorMessage?: string | undefined;
  sourceRoomId?: string | undefined;
  remainingSeats: number;
  canStartNow: boolean;
  onAdd: (agent: AgentCandidate) => Promise<void>;
  onRefresh: () => void;
  onStartNow?: () => void;
  onClose: () => void;
}

export function AgentPicker({
  open,
  loading,
  agents,
  errorMessage,
  sourceRoomId,
  remainingSeats,
  canStartNow,
  onAdd,
  onRefresh,
  onStartNow,
  onClose,
}: AgentPickerProps) {
  const t = useT();
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) setPendingId(null);
  }, [open]);

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

  return (
    <>
      <div
        className={`sheet-backdrop ${open ? "show" : ""}`}
        onClick={onClose}
        aria-hidden
      />
      <section
        className={`agent-picker ${open ? "open" : ""}`}
        role="dialog"
        aria-modal="true"
      >
        <div className="agent-picker-head">
          <div>
            <div className="agent-picker-title">{t("agentPicker.title")}</div>
            <div className="agent-picker-sub">
              {sourceRoomId
                ? t("agentPicker.empty.help", { room: sourceRoomId })
                : ""}
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

        {errorMessage ? (
          <p className="create-error">
            {t("agentPicker.error", { message: errorMessage })}
          </p>
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
                  {agent.displayName.slice(0, 2).toUpperCase()}
                </div>
                <div className="agent-meta">
                  <div className="agent-name">{agent.displayName}</div>
                  <div className="agent-id">{agent.userId}</div>
                </div>
                <button
                  type="button"
                  className={`stage-skip ${agent.alreadyJoined ? "added" : ""}`}
                  disabled={
                    agent.alreadyJoined ||
                    pendingId === agent.userId ||
                    remainingSeats <= 0
                  }
                  onClick={() => handleAdd(agent)}
                >
                  {agent.alreadyJoined
                    ? t("agentPicker.added")
                    : pendingId === agent.userId
                      ? "..."
                      : t("agentPicker.add")}
                </button>
              </div>
            ))
          )}
        </div>

        <div className="agent-picker-actions">
          <button type="button" className="action secondary" onClick={onRefresh}>
            {t("agentPicker.refresh")}
          </button>
          {onStartNow ? (
            <button
              type="button"
              className="action primary"
              onClick={onStartNow}
              disabled={!canStartNow}
            >
              {t("agentPicker.startNow")}
            </button>
          ) : null}
        </div>
      </section>
    </>
  );
}
