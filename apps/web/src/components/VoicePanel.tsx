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
    <div className="voice-panel" style={{ width: "100%", maxWidth: 420 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 8,
        }}
      >
        <button
          type="button"
          className={isMicOn ? "voice-mic recording" : "voice-mic"}
          onClick={toggleMicrophone}
          disabled={!canToggleMic}
          style={{
            padding: "10px 16px",
            borderRadius: 14,
            border: "1px solid rgba(216,224,238,0.9)",
            background: isMicOn
              ? "rgba(196, 61, 77, 0.18)"
              : "rgba(255,255,255,0.94)",
            color: isMicOn ? "#c43d4d" : "inherit",
            font: "inherit",
            fontSize: 14,
            cursor: canToggleMic ? "pointer" : "not-allowed",
            opacity: canToggleMic ? 1 : 0.6,
          }}
        >
          {isMicOn ? "🔴 关麦" : "🎤 开麦"}
        </button>
        <span style={{ fontSize: 12, color: "#7e8693" }}>
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
        style={{
          width: "100%",
          padding: "10px 14px",
          borderRadius: 14,
          border: "1px solid rgba(216,224,238,0.9)",
          background: "rgba(255,255,255,0.94)",
          color: "inherit",
          font: "inherit",
          fontSize: 14,
          resize: "vertical",
          outline: 0,
          lineHeight: 1.5,
        }}
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
        <div
          style={{
            marginTop: 6,
            fontSize: 12,
            color: "#c43d4d",
            wordBreak: "break-word",
          }}
        >
          {micError ?? voice.errorMessage}
        </div>
      ) : null}
    </div>
  );
}
