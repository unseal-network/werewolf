import { useT } from "../i18n/I18nProvider";
import { VoicePanel } from "./VoicePanel";

export interface StageSeat {
  seatNo: number;
  playerId: string;
  displayName: string;
}

export type ActionMode =
  | "lobby"
  | "deal"
  | "night"
  | "day"
  | "speech"
  | "vote"
  | "tie"
  | "end"
  | "waiting";

export type ConfirmMode =
  | "guard"
  | "wolf"
  | "seer"
  | "witch-save"
  | "witch-poison"
  | "vote";

export interface CenterStageProps {
  kicker: string;
  title: string;
  copy: string;
  actionMode: ActionMode;
  confirmMode: ConfirmMode;
  legalTargets: StageSeat[];
  selectedTargetId: string | null;
  isCreator: boolean;
  canStart: boolean;
  canProgress: boolean;
  canCurrentUserAct: boolean;
  /** Can we still add an agent to this lobby? (active count < max). */
  canAddAgent?: boolean;
  winnerText: string;
  statusText: string;
  currentSpeakerSeatNo?: number;
  isMyTurnToSpeak?: boolean;
  speechInput?: string;
  actionLoading?: boolean;
  onStart: () => void;
  /** Open the agent picker. Shown in lobby alongside the start button. */
  onAddAgent?: () => void;
  onRunRuntime?: () => void;
  onTargetSelect: (playerId: string) => void;
  onClearTarget: () => void;
  onConfirmTarget: () => void;
  onSpeak: (speech?: string) => void;
  onSpeechChange?: (text: string) => void;
  onSpeechComplete?: () => void;
  onSkip: () => void;
}

const CONFIRM_KEY: Record<ConfirmMode, string> = {
  guard: "confirm.guard",
  wolf: "confirm.wolf",
  seer: "confirm.seer",
  "witch-save": "confirm.witchSave",
  "witch-poison": "confirm.witchPoison",
  vote: "confirm.vote",
};

const PRIMARY_KEY: Record<ConfirmMode, string> = {
  guard: "stage.primary.guard",
  wolf: "stage.primary.wolf",
  seer: "stage.primary.seer",
  "witch-save": "stage.primary.witchSave",
  "witch-poison": "stage.primary.witchPoison",
  vote: "stage.primary.vote",
};

export function CenterStage({
  kicker,
  title,
  copy,
  actionMode,
  confirmMode,
  legalTargets,
  selectedTargetId,
  isCreator,
  canStart,
  canProgress,
  canCurrentUserAct,
  canAddAgent,
  winnerText,
  statusText,
  currentSpeakerSeatNo,
  isMyTurnToSpeak,
  speechInput,
  actionLoading,
  onStart,
  onAddAgent,
  onRunRuntime,
  onTargetSelect,
  onClearTarget,
  onConfirmTarget,
  onSpeak,
  onSpeechChange,
  onSpeechComplete,
  onSkip,
}: CenterStageProps) {
  const t = useT();
  const selectedTarget = legalTargets.find((s) => s.playerId === selectedTargetId);

  // Lobby: only the start button + status copy
  if (actionMode === "lobby") {
    return (
      <article className="phase-card">
        <div className="phase-title">{title}</div>
        {statusText ? <div className="phase-copy">{statusText}</div> : null}
        <div className="target-row">
          {canStart ? (
            <button type="button" className="stage-start" onClick={onStart}>
              {t("stage.startButton")}
            </button>
          ) : (
            <div className="target-chip">{t("stage.prompt.lobby")}</div>
          )}
          {isCreator && onAddAgent && canAddAgent ? (
            <button
              type="button"
              className="stage-skip"
              onClick={onAddAgent}
            >
              {t("stage.addAgentButton")}
            </button>
          ) : null}
        </div>
      </article>
    );
  }

  // Deal: ceremony only, no actions
  if (actionMode === "deal") {
    return (
      <article className="phase-card">
        <div className="phase-kicker">{kicker}</div>
        <div className="phase-title">{title}</div>
        <div className="phase-copy">{copy || t("stage.prompt.deal")}</div>
        {isCreator && canProgress ? (
          <div className="target-row">
            <button type="button" className="stage-skip" onClick={onRunRuntime}>
              {t("stage.runtimeButton")}
            </button>
          </div>
        ) : null}
      </article>
    );
  }

  // End
  if (actionMode === "end") {
    return (
      <article className="phase-card">
        <div className="phase-kicker">{kicker}</div>
        <div className="phase-title">{title}</div>
        {winnerText ? <div className="phase-copy" style={{ color: "var(--accent)" }}>{winnerText}</div> : null}
        {copy ? <div className="phase-copy">{copy}</div> : null}
      </article>
    );
  }

  // Waiting / public phases the local user cannot act in
  const hasTargets = legalTargets.length > 0;
  const showSelect = canCurrentUserAct && hasTargets && !selectedTarget;
  const showConfirm = canCurrentUserAct && Boolean(selectedTarget);
  const showSpeechInput = isMyTurnToSpeak;
  const showPrimarySkip = canCurrentUserAct && !hasTargets && !showSpeechInput;
  const showWaitingChip = !canCurrentUserAct;

  // While in confirm state, hide kicker/title/copy per spec
  const headerVisible = !showConfirm;

  return (
    <article className="phase-card">
      {headerVisible ? (
        <>
          <div className="phase-kicker">{kicker}</div>
          <div className="phase-title">{title}</div>
          {copy ? <div className="phase-copy">{copy}</div> : null}
          {currentSpeakerSeatNo ? (
            <div className="phase-copy">
              {t("stage.currentSpeaker", { seat: currentSpeakerSeatNo })}
            </div>
          ) : null}
          {statusText ? <div className="phase-copy">{statusText}</div> : null}
        </>
      ) : null}

      <div className="target-row">
        {showWaitingChip ? (
          <div className="target-chip">{t("stage.waiting")}</div>
        ) : null}

        {showSelect ? (
          <select
            className="target-select"
            value=""
            onChange={(event) => {
              const value = event.target.value;
              if (value) onTargetSelect(value);
            }}
          >
            <option value="">{t("stage.selectPlayer")}</option>
            {legalTargets.map((option) => (
              <option key={option.playerId} value={option.playerId}>
                {t("seat.numberLabel", { n: option.seatNo })} · {option.displayName}
              </option>
            ))}
          </select>
        ) : null}

        {showConfirm && selectedTarget ? (
          <div className="target-confirm">
            <button
              type="button"
              className="target-confirm-avatar"
              onClick={onClearTarget}
              aria-label={t("confirm.cancel")}
            >
              {selectedTarget.seatNo}
            </button>
            <div className="target-confirm-name">
              {t("seat.numberLabel", { n: selectedTarget.seatNo })}
            </div>
            <div className="target-confirm-copy">
              {t(CONFIRM_KEY[confirmMode], { n: selectedTarget.seatNo })}
            </div>
            <button
              type="button"
              className="stage-confirm"
              onClick={onConfirmTarget}
              disabled={actionLoading}
            >
              {actionLoading ? "..." : t(PRIMARY_KEY[confirmMode])}
            </button>
          </div>
        ) : null}

        {showSpeechInput ? (
          <VoicePanel
            enabled={Boolean(showSpeechInput)}
            textDraft={speechInput ?? ""}
            onTextChange={(value) => onSpeechChange?.(value)}
            onSubmitText={(text) => onSpeak(text)}
            onSpeechComplete={() => (onSpeechComplete ? onSpeechComplete() : onSpeak())}
            onSkip={onSkip}
            actionLoading={Boolean(actionLoading)}
            submitLabel={t("stage.submitSpeech")}
            skipLabel={t("stage.skipButton")}
            placeholder={t("stage.speakPlaceholder")}
          />
        ) : null}

        {showPrimarySkip ? (
          <>
            <button type="button" className="stage-confirm" onClick={() => onSpeak()}>
              {t("stage.speakButton")}
            </button>
            <button type="button" className="stage-skip" onClick={onSkip}>
              {t("stage.skipButton")}
            </button>
          </>
        ) : null}
      </div>

      {isCreator && canProgress ? (
        <div className="target-row" style={{ marginTop: 4 }}>
          <button type="button" className="stage-skip" onClick={onRunRuntime}>
            {t("stage.runtimeButton")}
          </button>
        </div>
      ) : null}
    </article>
  );
}
