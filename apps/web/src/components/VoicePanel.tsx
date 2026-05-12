import { useState } from "react";
import { useVoiceRoom } from "./VoiceRoom";

export interface VoicePanelProps {
  enabled: boolean;
  textDraft: string;
  onTextChange: (value: string) => void;
  onSubmitText: (text: string) => void; // submits {kind:"speech", speech: text}
  onSpeechComplete: () => void; // submits {kind:"speechComplete"}
  onSkip: () => void;
  actionLoading: boolean;
  submitLabel: string;
  skipLabel: string;
  placeholder: string;
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
  onSkip,
  actionLoading,
  submitLabel,
  skipLabel,
  placeholder,
}: VoicePanelProps) {
  const voice = useVoiceRoom();
  const [micError, setMicError] = useState<string | null>(null);

  const canToggleMic =
    enabled && voice.state === "connected" && !actionLoading;
  const isMicOn = voice.isMicrophoneEnabled;
  const hasText = textDraft.trim().length > 0;

  async function toggleMicrophone() {
    if (!canToggleMic) return;
    setMicError(null);
    try {
      if (isMicOn) {
        await voice.disableMicrophone();
      } else {
        await voice.enableMicrophone();
      }
    } catch (err) {
      console.error("[VoicePanel] mic toggle error:", err);
      setMicError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleSubmit() {
    if (hasText) {
      onSubmitText(textDraft);
      return;
    }
    if (isMicOn) {
      try {
        await voice.disableMicrophone();
      } catch {
        // ignore — we still want to flush the transcript buffer
      }
    }
    onSpeechComplete();
  }

  return (
    <div className="voice-panel">
      <div className="voice-panel-head">
        <button
          type="button"
          className={isMicOn ? "voice-mic recording" : "voice-mic"}
          onClick={toggleMicrophone}
          disabled={!canToggleMic}
        >
          {isMicOn ? "🔴 关麦" : "🎤 开麦"}
        </button>
        <span className="voice-state">
          {voice.state === "connected"
            ? "或输入文字"
            : voice.state === "connecting"
              ? "正在连接语音…"
              : voice.state === "reconnecting"
                ? "语音重连中…"
                : voice.state === "error"
                  ? "语音不可用"
                  : "语音未连接"}
        </span>
      </div>

      <textarea
        className="speech-textarea"
        rows={3}
        placeholder={placeholder}
        value={textDraft}
        onChange={(e) => onTextChange(e.target.value)}
      />

      <div className="target-row" style={{ marginTop: 8 }}>
        <button
          type="button"
          className="stage-confirm"
          onClick={handleSubmit}
          disabled={actionLoading || (!hasText && voice.state !== "connected")}
        >
          {actionLoading ? "..." : hasText ? submitLabel : "结束发言"}
        </button>
        <button
          type="button"
          className="stage-skip"
          onClick={onSkip}
          disabled={actionLoading}
        >
          {skipLabel}
        </button>
      </div>

      {(micError || voice.errorMessage) ? (
        <div className="voice-error">
          {micError ?? voice.errorMessage}
        </div>
      ) : null}
    </div>
  );
}
