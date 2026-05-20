import { describe, expect, it } from "vitest";
import {
  getMicToggleIntent,
  getSpeechBubbleLayout,
  shouldCompleteSpeechOnPointerLeave,
  shouldCompleteSpeechOnPointerRelease,
  shouldStopMicOnPointerCancel,
  shouldStopMicOnPointerRelease,
  shouldToggleMicOnPointerDown,
  shouldShowTextSpeechInput,
} from "./voicePanelLogic";

describe("voice panel mic toggle", () => {
  it("only stops recording when the current speaker releases the mic", () => {
    expect(getMicToggleIntent({ isMicOn: true })).toBe("stop-mic");
  });

  it("only toggles the mic on when the current speaker turns the mic on", () => {
    expect(getMicToggleIntent({ isMicOn: false })).toBe("enable-mic");
  });

  it("does not complete speech just because the pointer leaves the mic button", () => {
    expect(shouldCompleteSpeechOnPointerLeave()).toBe(false);
  });

  it("does not complete speech just because the pointer is released", () => {
    expect(shouldCompleteSpeechOnPointerRelease()).toBe(false);
  });

  it("keeps touch microphone recording alive after release so iOS can finish async mic startup", () => {
    expect(shouldToggleMicOnPointerDown("touch", false)).toBe("start");
    expect(shouldStopMicOnPointerRelease("touch")).toBe(false);
    expect(shouldStopMicOnPointerCancel("touch")).toBe(false);
  });

  it("keeps mouse hold-to-speak release semantics unchanged", () => {
    expect(shouldToggleMicOnPointerDown("mouse", false)).toBe("start");
    expect(shouldToggleMicOnPointerDown("mouse", true)).toBe("start");
    expect(shouldStopMicOnPointerRelease("mouse")).toBe(true);
    expect(shouldStopMicOnPointerCancel("mouse")).toBe(true);
  });

  it("only shows text input in text mode", () => {
    expect(shouldShowTextSpeechInput("voice")).toBe(false);
    expect(shouldShowTextSpeechInput("text")).toBe(true);
  });

  it("swaps the large and small speech bubbles by input mode", () => {
    expect(getSpeechBubbleLayout("voice")).toEqual({
      left: "large-mic",
      right: "small-keyboard",
      action: "complete",
    });
    expect(getSpeechBubbleLayout("text")).toEqual({
      left: "small-mic",
      right: "large-text",
      action: "submit",
    });
  });
});
