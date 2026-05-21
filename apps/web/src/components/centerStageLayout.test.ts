import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  getActionBubbleTriggerVisibility,
  shouldPinActionBubbleOpen,
  shouldShowActionBubbleCopy,
  shouldAutoOpenActionBubble,
  shouldStartActionBubbleCollapsed,
  shouldShowCenterPhaseSummary,
  getLobbyPrimaryAction,
  getClockwiseSeatTargets,
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

  it("keeps an explicit exit affordance in the terminal game dialog", () => {
    const endBranch = readCenterStageSource().match(
      /if \(actionMode === "end"\) \{[\s\S]*?\/\/ Waiting/
    )?.[0] ?? "";

    expect(endBranch).toContain("onExitGame");
    expect(endBranch).toContain("stage.exitGame");
    expect(endBranch).toContain('variant="primary"');
    expect(endBranch).not.toContain('variant="secondary"');
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

  it("maps non-creator lobby primary to the join action", () => {
    expect(
      getLobbyPrimaryAction({
        isCreator: false,
      })
    ).toBe("join");
  });

  it("orders radial picker targets clockwise by seat number", () => {
    expect(
      getClockwiseSeatTargets([
        { seatNo: 7, playerId: "p7" },
        { seatNo: 2, playerId: "p2" },
        { seatNo: 10, playerId: "p10" },
        { seatNo: 3, playerId: "p3" },
      ]).map((target) => target.seatNo)
    ).toEqual([2, 3, 7, 10]);
  });

});

function readCenterStageSource(): string {
  // Keep this as a source-shape assertion because the repo does not currently
  // carry a React render-test dependency for this component.
  return readFileSync(new URL("./CenterStage.tsx", import.meta.url), "utf8");
}
