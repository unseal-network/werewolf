import { describe, expect, it } from "vitest";
import {
  getMicToggleIntent,
  getSpeechBubbleLayout,
  shouldCompleteSpeechOnPointerLeave,
  shouldCompleteSpeechOnPointerRelease,
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
