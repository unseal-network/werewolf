import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { LOGO_IMG, normalizeDisplayRole, ROLE_COLOR, ROLE_IMG, ROLE_LABEL } from "../constants/roles";
import { useT } from "../i18n/I18nProvider";
import { PlayerRadialPicker } from "./PlayerRadialPicker";
import { StageActionButton } from "./StageActionButton";
import { VoicePanel } from "./VoicePanel";

export interface StageSeat {
  seatNo: number;
  playerId: string;
  displayName: string;
  userId?: string | undefined;
  agentId?: string | undefined;
  avatarUrl?: string | undefined;
  visibleRole?: string | undefined;
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
  currentSpeakerName?: string | undefined;
  myRoleId?: string | undefined;
  aliveCount?: number | undefined;
  totalCount?: number | undefined;
  isMyTurnToSpeak?: boolean;
  speechInput?: string;
  actionLoading?: boolean;
  onStart: () => void;
  /** Open the agent picker. Shown in lobby alongside the start button. */
  onAddAgent?: () => void;
  onRunRuntime?: () => void;
  onTargetSelect: (playerId: string) => void;
  onClearTarget: () => void;
  onConfirmTarget: (playerId?: string) => void;
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

export function shouldShowCenterPhaseSummary({
  actionMode,
  isConfirmingTarget,
}: {
  actionMode: ActionMode;
  isConfirmingTarget: boolean;
}) {
  if (isConfirmingTarget) return false;
  return actionMode === "lobby" || actionMode === "end";
}

export function shouldStartActionBubbleCollapsed(actionMode: ActionMode) {
  return actionMode !== "lobby" && actionMode !== "deal" && actionMode !== "end";
}

export function shouldAutoOpenActionBubble({
  actionMode,
  canCurrentUserAct,
}: {
  actionMode: ActionMode;
  canCurrentUserAct: boolean;
}) {
  return shouldStartActionBubbleCollapsed(actionMode) && canCurrentUserAct;
}

export function getActionBubbleTriggerVisibility({ isOpen }: { isOpen: boolean }) {
  return isOpen ? "hidden" : "visible";
}

export function shouldShowActionBubbleCopy({
  actionMode,
  copy,
}: {
  actionMode: ActionMode;
  copy: string;
}) {
  return shouldStartActionBubbleCollapsed(actionMode) && copy.trim().length > 0;
}

export function shouldPinActionBubbleOpen({
  actionMode,
  canCurrentUserAct,
}: {
  actionMode: ActionMode;
  canCurrentUserAct: boolean;
}) {
  if (!shouldStartActionBubbleCollapsed(actionMode) || !canCurrentUserAct) {
    return false;
  }
  return true;
}

const ACTION_DRAWER_OPEN_DRAG_PX = 18;

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
  currentSpeakerName,
  myRoleId,
  aliveCount,
  totalCount,
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
  const actionBubbleRef = useRef<HTMLElement | null>(null);
  const actionBubbleDragStartRef = useRef<{ pointerId: number; y: number } | null>(
    null
  );
  const [actionBubbleOpen, setActionBubbleOpen] = useState(
    () => !shouldStartActionBubbleCollapsed(actionMode)
  );
  const [wolfActionMode, setWolfActionMode] = useState<"target" | "speech">("target");
  const selectedTarget = legalTargets.find((s) => s.playerId === selectedTargetId);
  const displayRole = myRoleId ? normalizeDisplayRole(myRoleId) : undefined;
  const roleImg = displayRole ? ROLE_IMG[displayRole] : LOGO_IMG;
  const roleColor = displayRole ? ROLE_COLOR[displayRole] : "var(--accent)";
  const roleLabel = displayRole ? ROLE_LABEL[displayRole] : t("role.unknown");
  const liveAliveCount = aliveCount ?? 0;
  const liveTotalCount = Math.max(totalCount ?? liveAliveCount, liveAliveCount);
  const showIdentity = actionMode !== "lobby" || Boolean(myRoleId);
  const identity = showIdentity ? (
    <div className="stage-identity">
      <div
        className="stage-role-token"
        style={{ ["--stage-role-color" as string]: roleColor }}
      >
        <img src={roleImg} alt="" draggable={false} />
      </div>
      <div className="stage-identity-copy">
        <span>{roleLabel}</span>
        {currentSpeakerName ? <strong>{currentSpeakerName}</strong> : null}
      </div>
      {liveTotalCount > 0 ? (
        <div className="stage-alive-dots" aria-label={`${liveAliveCount}/${liveTotalCount}`}>
          {Array.from({ length: liveTotalCount }).map((_, index) => (
            <span key={index} className={index < liveAliveCount ? "alive" : ""} />
          ))}
        </div>
      ) : null}
    </div>
  ) : null;

  const shouldLockActionBubbleOpen = shouldPinActionBubbleOpen({
    actionMode,
    canCurrentUserAct,
  });

  useEffect(() => {
    setActionBubbleOpen(
      !shouldStartActionBubbleCollapsed(actionMode) ||
        shouldAutoOpenActionBubble({ actionMode, canCurrentUserAct }) ||
        shouldLockActionBubbleOpen
    );
  }, [actionMode, canCurrentUserAct, confirmMode, shouldLockActionBubbleOpen]);

  useEffect(() => {
    setWolfActionMode("target");
  }, [actionMode, confirmMode]);

  useEffect(() => {
    if (
      !actionBubbleOpen ||
      shouldLockActionBubbleOpen ||
      !shouldStartActionBubbleCollapsed(actionMode)
    ) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const root = actionBubbleRef.current;
      if (!root || root.contains(event.target as Node)) return;
      setActionBubbleOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [actionBubbleOpen, actionMode, shouldLockActionBubbleOpen]);

  // Lobby: only the start button + status copy
  if (actionMode === "lobby") {
    const primaryLabel = isCreator ? t("stage.startButton") : t("stage.readyButton");
    return (
      <article className="phase-card phase-card-lobby">
        {identity}
        <div className="phase-title">{title}</div>
        {statusText ? <div className="phase-copy">{statusText}</div> : null}
        <div className="target-row">
          <StageActionButton
            className="stage-start"
            label={primaryLabel}
            variant="primary"
            onClick={isCreator ? onStart : undefined}
            disabled={!isCreator}
          />
          {onAddAgent && canAddAgent ? (
            <StageActionButton
              className="stage-skip stage-add-player"
              label="+"
              variant="secondary"
              onClick={onAddAgent}
              aria-label={t("stage.addAgentButton")}
            />
          ) : null}
        </div>
      </article>
    );
  }

  // Deal: ceremony only, no actions
  if (actionMode === "deal") {
    return (
      <article className="phase-card">
        {identity}
        <div className="phase-kicker">{kicker}</div>
        <div className="phase-title">{title}</div>
        <div className="phase-copy">{copy || t("stage.prompt.deal")}</div>
      </article>
    );
  }

  // End
  if (actionMode === "end") {
    return (
      <article className="phase-card endgame-phase-card" role="dialog" aria-live="polite">
        {identity}
        <div className="endgame-kicker">GAME OVER</div>
        <div className="endgame-title">{title}</div>
        {winnerText ? <div className="endgame-winner">{winnerText}</div> : null}
        {copy ? <div className="endgame-copy">{copy}</div> : null}
      </article>
    );
  }

  // Waiting / public phases the local user cannot act in
  const hasTargets = legalTargets.length > 0;
  const isWitchSave = confirmMode === "witch-save";
  const showSelect = canCurrentUserAct && hasTargets && !selectedTarget && !isWitchSave;
  const showConfirm = canCurrentUserAct && Boolean(selectedTarget) && !isWitchSave;
  const witchSaveTarget =
    canCurrentUserAct && isWitchSave ? legalTargets[0] : undefined;
  const showWitchSaveChoice = Boolean(witchSaveTarget);
  const showSpeechInput = isMyTurnToSpeak;
  const showPassOnlyAction = canCurrentUserAct && !hasTargets && !showSpeechInput;
  const showLockedDrawer = !canCurrentUserAct;
  const showWolfCombinedActions =
    canCurrentUserAct && confirmMode === "wolf" && hasTargets && showSpeechInput;
  const containsRadialPicker =
    !showLockedDrawer &&
    (((showSelect || showConfirm) && !showWitchSaveChoice && !showWolfCombinedActions) ||
      (showWolfCombinedActions && wolfActionMode === "target"));
  const containsVoicePanel = !showLockedDrawer && showSpeechInput && !showWolfCombinedActions;
  const hasPrivateCopy = shouldShowActionBubbleCopy({ actionMode, copy });

  const headerVisible = shouldShowCenterPhaseSummary({
    actionMode,
    isConfirmingTarget: showConfirm,
  });
  const isActionBubble = shouldStartActionBubbleCollapsed(actionMode);
  const actionBubbleLabel = showLockedDrawer
    ? t("stage.actionPanel")
    : showSpeechInput
      ? t("stage.speakButton")
      : showSelect
        ? t("stage.selectPlayer")
      : showConfirm
          ? t(PRIMARY_KEY[confirmMode])
          : showWitchSaveChoice
            ? t("stage.primary.witchSave")
            : showPassOnlyAction
              ? t("stage.skipButton")
              : t("stage.actionPanel");

  const voiceControl = (
    <VoicePanel
      enabled={Boolean(showSpeechInput)}
      textDraft={speechInput ?? ""}
      onTextChange={(value) => onSpeechChange?.(value)}
      onSubmitText={(text) => onSpeak(text)}
      onSpeechComplete={() => (onSpeechComplete ? onSpeechComplete() : onSpeak())}
      actionLoading={Boolean(actionLoading)}
      submitLabel={t("stage.submitSpeech")}
      placeholder={t("stage.speakPlaceholder")}
      holdToSpeakLabel={t("stage.holdToSpeak")}
      releaseToSendLabel={t("stage.releaseToSend")}
      switchToVoiceLabel={t("stage.switchToVoice")}
      switchToTextLabel={t("stage.switchToText")}
    />
  );

  const pickerControl = (
    <PlayerRadialPicker
      targets={legalTargets}
      selectedTargetId={selectedTargetId}
      confirmLabel={t(PRIMARY_KEY[confirmMode])}
      skipLabel={t("stage.skipButton")}
      actionLoading={Boolean(actionLoading)}
      onSelect={onTargetSelect}
      onClear={onClearTarget}
      onConfirm={() => onConfirmTarget()}
      onSkip={onSkip}
    />
  );

  const actionControls = (
    <>
      <div className="target-row action-control-stack">
        {!showLockedDrawer && (showWitchSaveChoice || (canCurrentUserAct && isWitchSave)) ? (
          <div className="binary-action">
            {witchSaveTarget ? (
              <StageActionButton
                className="stage-confirm"
                label={t("stage.primary.witchSave")}
                variant="primary"
                onClick={() => onConfirmTarget(witchSaveTarget.playerId)}
                loading={Boolean(actionLoading)}
              />
            ) : null}
            <StageActionButton
              className="stage-skip"
              label={witchSaveTarget ? t("stage.primary.witchPass") : t("stage.skipButton")}
              variant="secondary"
              onClick={onSkip}
              loading={Boolean(actionLoading)}
            />
          </div>
        ) : null}

        {!showLockedDrawer && showWolfCombinedActions ? (
          <>
            <div className="action-mode-switch" role="group" aria-label="wolf-actions">
              <button
                type="button"
                className={wolfActionMode === "target" ? "active" : ""}
                onClick={() => setWolfActionMode("target")}
              >
                {t("stage.selectPlayer")}
              </button>
              <button
                type="button"
                className={wolfActionMode === "speech" ? "active" : ""}
                onClick={() => setWolfActionMode("speech")}
              >
                {t("stage.speakButton")}
              </button>
            </div>
            {wolfActionMode === "target" ? pickerControl : voiceControl}
          </>
        ) : null}

        {!showLockedDrawer && (showSelect || showConfirm) && !showWitchSaveChoice && !showWolfCombinedActions ? pickerControl : null}

        {!showLockedDrawer && showSpeechInput && !showWolfCombinedActions ? voiceControl : null}

        {!showLockedDrawer && showPassOnlyAction ? (
          <StageActionButton
            className="stage-confirm"
            label={t("stage.skipButton")}
            variant="primary"
            onClick={onSkip}
            loading={Boolean(actionLoading)}
          />
        ) : null}

        {showLockedDrawer ? (
          <div className="action-drawer-locked" aria-disabled="true">
            <strong>{t("stage.actionPanelLocked")}</strong>
            {currentSpeakerSeatNo ? (
              <span>{t("stage.currentSpeaker", { seat: currentSpeakerSeatNo })}</span>
            ) : statusText ? (
              <span>{statusText}</span>
            ) : null}
          </div>
        ) : null}
      </div>

    </>
  );

  if (isActionBubble) {
    const triggerVisibility = getActionBubbleTriggerVisibility({ isOpen: actionBubbleOpen });

    function openActionBubble() {
      setActionBubbleOpen(true);
      actionBubbleDragStartRef.current = null;
    }

    function onTriggerPointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
      actionBubbleDragStartRef.current = {
        pointerId: event.pointerId,
        y: event.clientY,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    }

    function onTriggerPointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
      const drag = actionBubbleDragStartRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      if (drag.y - event.clientY >= ACTION_DRAWER_OPEN_DRAG_PX) {
        openActionBubble();
      }
    }

    function onTriggerPointerEnd(event: ReactPointerEvent<HTMLButtonElement>) {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      actionBubbleDragStartRef.current = null;
    }

    return (
      <article
        ref={actionBubbleRef}
        className={`phase-card action-bubble ${actionBubbleOpen ? "is-open" : "is-collapsed"}`}
        data-radial={containsRadialPicker ? "true" : "false"}
        data-voice={containsVoicePanel ? "true" : "false"}
        data-private-copy={hasPrivateCopy ? "true" : "false"}
        data-locked={showLockedDrawer ? "true" : "false"}
      >
        {triggerVisibility === "visible" && !shouldLockActionBubbleOpen ? (
          <button
            type="button"
            className="action-bubble-trigger"
            aria-expanded={false}
            aria-label={actionBubbleLabel}
            onClick={openActionBubble}
            onPointerDown={onTriggerPointerDown}
            onPointerMove={onTriggerPointerMove}
            onPointerUp={onTriggerPointerEnd}
            onPointerCancel={onTriggerPointerEnd}
          >
            <span className="action-bubble-grip" aria-hidden />
            <span className="action-bubble-label">{actionBubbleLabel}</span>
          </button>
        ) : null}
        <div className="action-bubble-panel" aria-hidden={!actionBubbleOpen}>
          {shouldShowActionBubbleCopy({ actionMode, copy }) ? (
            <div className="phase-copy phase-action-copy phase-private-result">{copy}</div>
          ) : null}
          {actionControls}
        </div>
      </article>
    );
  }

  return (
    <article className="phase-card">
      {headerVisible ? (
        <>
          {identity}
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
      {!headerVisible ? (
        <>
          {identity}
          {copy ? <div className="phase-copy phase-action-copy">{copy}</div> : null}
          {currentSpeakerSeatNo ? (
            <div className="phase-copy phase-action-copy">
              {t("stage.currentSpeaker", { seat: currentSpeakerSeatNo })}
            </div>
          ) : null}
        </>
      ) : null}

      {actionControls}
    </article>
  );
}
