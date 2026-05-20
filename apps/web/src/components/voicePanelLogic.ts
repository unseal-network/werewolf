export type MicToggleIntent = "enable-mic" | "stop-mic";
export type MicPointerStartAction = "start" | "stop";
export type SpeechInputMode = "voice" | "text";
export type SpeechBubbleSlot = "large-mic" | "small-keyboard" | "small-mic" | "large-text";
export type SpeechActionMode = "complete" | "submit";

export function getMicToggleIntent({
  isMicOn,
}: {
  isMicOn: boolean;
}): MicToggleIntent {
  return isMicOn ? "stop-mic" : "enable-mic";
}

export function shouldShowTextSpeechInput(mode: SpeechInputMode) {
  return mode === "text";
}

export function shouldCompleteSpeechOnPointerLeave() {
  return false;
}

export function shouldCompleteSpeechOnPointerRelease() {
  return false;
}

export function shouldToggleMicOnPointerDown(
  pointerType: string | undefined,
  isMicActive: boolean,
): MicPointerStartAction {
  return pointerType === "touch" && isMicActive ? "stop" : "start";
}

export function shouldStopMicOnPointerRelease(pointerType: string | undefined) {
  return pointerType !== "touch";
}

export function shouldStopMicOnPointerCancel(pointerType: string | undefined) {
  return pointerType !== "touch";
}

export function getSpeechBubbleLayout(mode: SpeechInputMode): {
  left: SpeechBubbleSlot;
  right: SpeechBubbleSlot;
  action: SpeechActionMode;
} {
  return mode === "text"
    ? { left: "small-mic", right: "large-text", action: "submit" }
    : { left: "large-mic", right: "small-keyboard", action: "complete" };
}
