import { useEffect, useRef, useState, type PointerEvent } from "react";
import { useVoiceRoom } from "./VoiceRoom";
import {
  getSpeechBubbleLayout,
  shouldCompleteSpeechOnPointerLeave,
  shouldCompleteSpeechOnPointerRelease,
  shouldStopMicOnPointerCancel,
  shouldStopMicOnPointerRelease,
  shouldToggleMicOnPointerDown,
  type SpeechInputMode,
} from "./voicePanelLogic";
import { StageActionButton } from "./StageActionButton";

export interface VoicePanelProps {
  enabled: boolean;
  textDraft: string;
  onTextChange: (value: string) => void;
  onSubmitText: (text: string) => void; // submits {kind:"speech", speech: text}
  onSpeechComplete: () => void | Promise<void>; // submits {kind:"speechComplete"}
  actionLoading: boolean;
  submitLabel: string;
  placeholder: string;
  holdToSpeakLabel: string;
  releaseToSendLabel: string;
  switchToVoiceLabel: string;
  switchToTextLabel: string;
}

function micStartErrorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (
    message.toLowerCase().includes("insufficient permissions") ||
    message.includes("PublishTrackError")
  ) {
    return "还没轮到你发言";
  }
  return message;
}

/**
 * Speech input panel. Lets a player choose between microphone (voice) and
 * keyboard (text) input. When the player ends voice input, the server flushes
 * the STT buffer and uses that as the speech content.
 */
export function VoicePanel({
  enabled,
  textDraft,
  onTextChange,
  onSubmitText,
  onSpeechComplete,
  actionLoading,
  submitLabel,
  placeholder,
  holdToSpeakLabel,
  releaseToSendLabel,
  switchToVoiceLabel,
  switchToTextLabel,
}: VoicePanelProps) {
  const voice = useVoiceRoom();
  const [micError, setMicError] = useState<string | null>(null);
  const [inputMode, setInputMode] = useState<SpeechInputMode>("voice");
  const [micPressing, setMicPressing] = useState(false);
  const [modePulse, setModePulse] = useState<SpeechInputMode | null>(null);
  const micPressActiveRef = useRef(false);
  const micPressTokenRef = useRef(0);

  const canToggleMic =
    enabled && voice.state === "connected" && Boolean(voice.room) && !actionLoading;
  const isMicOn = voice.isMicrophoneEnabled;
  const hasText = textDraft.trim().length > 0;
  const bubbleLayout = getSpeechBubbleLayout(inputMode);

  useEffect(() => {
    if (!modePulse) return undefined;
    const timer = window.setTimeout(() => setModePulse(null), 220);
    return () => window.clearTimeout(timer);
  }, [modePulse]);

  async function startMicrophone() {
    if (!canToggleMic) return;
    const pressToken = micPressTokenRef.current + 1;
    micPressTokenRef.current = pressToken;
    micPressActiveRef.current = true;
    setMicPressing(true);
    setMicError(null);
    try {
      if (!isMicOn) {
        await voice.enableMicrophone();
      }
      if (!micPressActiveRef.current || micPressTokenRef.current !== pressToken) {
        await voice.disableMicrophone();
      }
    } catch (err) {
      console.error("[VoicePanel] mic start error:", err);
      setMicError(micStartErrorMessage(err));
      if (micPressTokenRef.current === pressToken) {
        micPressActiveRef.current = false;
        setMicPressing(false);
      }
    }
  }

  async function stopMicrophone() {
    micPressActiveRef.current = false;
    setMicPressing(false);
    if (!enabled || actionLoading) return;
    setMicError(null);
    try {
      if (voice.isMicrophoneEnabled) {
        await voice.disableMicrophone();
      }
    } catch (err) {
      console.error("[VoicePanel] mic stop error:", err);
      setMicError(err instanceof Error ? err.message : String(err));
    }
  }

  async function finishVoiceSpeech() {
    micPressActiveRef.current = false;
    setMicPressing(false);
    if (!enabled || actionLoading) return;
    setMicError(null);
    try {
      if (voice.isMicrophoneEnabled) {
        await voice.disableMicrophone();
      }
      await onSpeechComplete();
    } catch (err) {
      console.error("[VoicePanel] speech complete error:", err);
      setMicError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleTextMode() {
    if (isMicOn) {
      await voice.disableMicrophone().catch(() => undefined);
    }
    setInputMode("text");
    setModePulse("text");
  }

  function handleTextSubmit() {
    if (hasText) onSubmitText(textDraft);
  }

  function handleVoiceMode() {
    setInputMode("voice");
    setModePulse("voice");
  }

  function capturePointer(event: PointerEvent<HTMLButtonElement>) {
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // iOS WebViews can reject pointer capture while microphone permission UI is opening.
    }
  }

  function releasePointer(event: PointerEvent<HTMLButtonElement>) {
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Pointer capture can disappear after iOS pointer cancellation.
    }
  }

  return (
    <div
      className="voice-panel"
      data-mode={inputMode}
      data-pulse={modePulse ?? "none"}
      onContextMenuCapture={(event) => {
        if (event.target instanceof HTMLTextAreaElement) return;
        event.preventDefault();
      }}
    >
      <div className="voice-bubble-row" data-mode={inputMode}>
        <button
          type="button"
          className={[
            "voice-bubble",
            "voice-bubble-left",
            bubbleLayout.left === "large-mic" ? "voice-bubble-large" : "voice-bubble-square",
            isMicOn ? "recording" : "",
            micPressing ? "pressing" : "",
            inputMode === "voice" ? "is-active" : "",
          ].filter(Boolean).join(" ")}
          onClick={() => {
            if (inputMode === "text") handleVoiceMode();
          }}
          onPointerDown={
            inputMode === "voice"
              ? (event) => {
                  event.preventDefault();
                  capturePointer(event);
                  const action = shouldToggleMicOnPointerDown(
                    event.pointerType,
                    voice.isMicrophoneEnabled || micPressing || micPressActiveRef.current,
                  );
                  if (action === "stop") {
                    void stopMicrophone();
                  } else {
                    void startMicrophone();
                  }
                }
              : undefined
          }
          onPointerUp={
            inputMode === "voice"
              ? (event) => {
                  releasePointer(event);
                  if (!shouldStopMicOnPointerRelease(event.pointerType)) return;
                  if (shouldCompleteSpeechOnPointerRelease()) {
                    void finishVoiceSpeech();
                  } else {
                    void stopMicrophone();
                  }
                }
              : undefined
          }
          onPointerCancel={
            inputMode === "voice"
              ? (event) => {
                  releasePointer(event);
                  if (!shouldStopMicOnPointerCancel(event.pointerType)) return;
                  void stopMicrophone();
                }
              : undefined
          }
          onPointerLeave={() => {
            if (
              inputMode === "voice" &&
              shouldCompleteSpeechOnPointerLeave() &&
              (voice.isMicrophoneEnabled || micPressing)
            ) {
              void finishVoiceSpeech();
            }
          }}
          disabled={inputMode === "voice" ? !canToggleMic : actionLoading}
          aria-label={inputMode === "text" ? switchToVoiceLabel : holdToSpeakLabel}
          onContextMenu={(event) => event.preventDefault()}
        >
          {inputMode === "text" ? <span className="voice-bubble-icon">🎙</span> : null}
          <strong>{inputMode === "voice" ? (isMicOn ? releaseToSendLabel : holdToSpeakLabel) : ""}</strong>
        </button>

        <div
          className={[
            "voice-bubble",
            "voice-bubble-right",
            bubbleLayout.right === "large-text" ? "voice-bubble-large voice-text-bubble" : "voice-bubble-square",
            inputMode === "text" ? "is-active" : "",
          ].join(" ")}
          role={inputMode === "voice" ? "button" : undefined}
          tabIndex={inputMode === "voice" ? 0 : undefined}
          onClick={inputMode === "voice" ? handleTextMode : undefined}
          onPointerDown={
            inputMode === "voice"
              ? (event) => event.preventDefault()
              : undefined
          }
          onKeyDown={(event) => {
            if (inputMode === "voice" && (event.key === "Enter" || event.key === " ")) {
              event.preventDefault();
              void handleTextMode();
            }
            if (
              inputMode === "text" &&
              event.currentTarget === event.target &&
              event.key === "Escape"
            ) {
              event.preventDefault();
              handleVoiceMode();
            }
          }}
          aria-label={inputMode === "voice" ? switchToTextLabel : undefined}
          onContextMenu={
            inputMode === "voice"
              ? (event) => event.preventDefault()
              : undefined
          }
        >
          {inputMode === "voice" ? (
            <span className="voice-bubble-icon">⌨️</span>
          ) : (
            <textarea
              className="speech-textarea"
              rows={1}
              placeholder={placeholder}
              value={textDraft}
              onChange={(e) => onTextChange(e.target.value)}
              onFocus={() => setModePulse("text")}
              onBlur={() => setModePulse(null)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  event.preventDefault();
                  handleTextSubmit();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  handleVoiceMode();
                }
              }}
            />
          )}
        </div>
      </div>

      <div className="target-row voice-actions">
        {bubbleLayout.action === "submit" ? (
          <StageActionButton
            className="voice-submit-action"
            label={submitLabel}
            variant="primary"
            onClick={handleTextSubmit}
            disabled={!hasText}
            loading={actionLoading}
          />
        ) : (
          <StageActionButton
            className="voice-submit-action"
            label={submitLabel}
            variant="primary"
            onClick={finishVoiceSpeech}
            loading={actionLoading}
          />
        )}
      </div>

      <span className="voice-state">
        {voice.state === "connected"
          ? null
          : voice.state === "connecting"
            ? "正在连接语音..."
            : voice.state === "reconnecting"
              ? "语音重连中..."
              : voice.state === "error"
                ? "语音不可用"
                : "语音未连接"}
      </span>

      {(micError || voice.errorMessage) ? (
        <div className="voice-error">
          {micError ?? voice.errorMessage}
        </div>
      ) : null}
    </div>
  );
}
