import { describe, expect, it } from "vitest";
import {
  getActionBubbleTriggerVisibility,
  shouldPinActionBubbleOpen,
  shouldShowActionBubbleCopy,
  shouldAutoOpenActionBubble,
  shouldStartActionBubbleCollapsed,
  shouldShowCenterPhaseSummary,
} from "./CenterStage";

describe("center stage layout", () => {
  it("keeps phase and countdown copy out of the center card after the game starts", () => {
    expect(
      shouldShowCenterPhaseSummary({
        actionMode: "night",
        isConfirmingTarget: false,
      })
    ).toBe(false);
  });

  it("keeps lobby and end phase summaries visible", () => {
    expect(
      shouldShowCenterPhaseSummary({
        actionMode: "lobby",
        isConfirmingTarget: false,
      })
    ).toBe(true);
    expect(
      shouldShowCenterPhaseSummary({
        actionMode: "end",
        isConfirmingTarget: false,
      })
    ).toBe(true);
  });

  it("starts the in-game action bubble collapsed", () => {
    expect(shouldStartActionBubbleCollapsed("night")).toBe(true);
    expect(shouldStartActionBubbleCollapsed("day")).toBe(true);
    expect(shouldStartActionBubbleCollapsed("vote")).toBe(true);
  });

  it("does not collapse ceremony or terminal panels", () => {
    expect(shouldStartActionBubbleCollapsed("lobby")).toBe(false);
    expect(shouldStartActionBubbleCollapsed("deal")).toBe(false);
    expect(shouldStartActionBubbleCollapsed("end")).toBe(false);
  });

  it("auto-opens the bubble only when the current user has an available action", () => {
    expect(
      shouldAutoOpenActionBubble({
        actionMode: "night",
        canCurrentUserAct: true,
      })
    ).toBe(true);
    expect(
      shouldAutoOpenActionBubble({
        actionMode: "night",
        canCurrentUserAct: false,
      })
    ).toBe(false);
  });

  it("hides the trigger while the action panel is open", () => {
    expect(getActionBubbleTriggerVisibility({ isOpen: false })).toBe("visible");
    expect(getActionBubbleTriggerVisibility({ isOpen: true })).toBe("hidden");
  });

  it("shows private result copy inside the in-game action bubble", () => {
    expect(
      shouldShowActionBubbleCopy({
        actionMode: "night",
        copy: "查验结果：3 号玩家是狼人",
      })
    ).toBe(true);
  });

  it("does not pin the action drawer open when the local user cannot act", () => {
    expect(
      shouldPinActionBubbleOpen({
        actionMode: "night",
        canCurrentUserAct: true,
      })
    ).toBe(true);
    expect(
      shouldPinActionBubbleOpen({
        actionMode: "night",
        canCurrentUserAct: false,
      })
    ).toBe(false);
  });

  it("pins the action drawer open for active local action rounds", () => {
    expect(
      shouldPinActionBubbleOpen({
        actionMode: "night",
        canCurrentUserAct: true,
      })
    ).toBe(true);
    expect(
      shouldPinActionBubbleOpen({
        actionMode: "vote",
        canCurrentUserAct: true,
      })
    ).toBe(true);
  });

});
