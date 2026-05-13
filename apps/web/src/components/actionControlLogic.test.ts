import { describe, expect, it } from "vitest";
import {
  PLAYER_PICKER_INNER_HIT_RATIO,
  PLAYER_PICKER_LONG_PRESS_MS,
  PLAYER_PICKER_OUTER_HIT_RATIO,
  getCssConicSegment,
  getRadialAvatarRadius,
  getRadialAvatarSize,
  getRadialItemStyle,
  getRadialSelectionIndex,
  getRadialSelectionState,
  getRadialSegmentAngles,
  getRadialSliceStyle,
} from "./actionControlLogic";

describe("radial player picker", () => {
  it("uses a short press delay for radial drag selection", () => {
    expect(PLAYER_PICKER_LONG_PRESS_MS).toBeGreaterThanOrEqual(80);
    expect(PLAYER_PICKER_LONG_PRESS_MS).toBeLessThanOrEqual(130);
  });

  it("keeps the outside-click radius inside the visual wheel bounds", () => {
    expect(PLAYER_PICKER_INNER_HIT_RATIO).toBe(0.30);
    expect(PLAYER_PICKER_OUTER_HIT_RATIO).toBeGreaterThan(0.80);
    expect(PLAYER_PICKER_OUTER_HIT_RATIO).toBeLessThan(0.90);
  });

  it("maps pointer direction to a pizza-slice index starting at the top", () => {
    const center = { x: 100, y: 100 };
    expect(getRadialSelectionIndex({ point: { x: 100, y: 20 }, center, count: 4 })).toBe(0);
    expect(getRadialSelectionIndex({ point: { x: 180, y: 100 }, center, count: 4 })).toBe(1);
    expect(getRadialSelectionIndex({ point: { x: 100, y: 180 }, center, count: 4 })).toBe(2);
    expect(getRadialSelectionIndex({ point: { x: 20, y: 100 }, center, count: 4 })).toBe(3);
  });

  it("keeps eleven-player hit testing centered on each avatar", () => {
    const center = { x: 100, y: 100 };
    const radius = 80;
    for (let index = 0; index < 11; index += 1) {
      const { midDeg } = getRadialSegmentAngles(index, 11);
      const angle = (midDeg * Math.PI) / 180;
      expect(
        getRadialSelectionIndex({
          point: {
            x: center.x + Math.cos(angle) * radius,
            y: center.y + Math.sin(angle) * radius,
          },
          center,
          count: 11,
        })
      ).toBe(index);
    }
  });

  it("returns -1 when no player can be selected", () => {
    expect(
      getRadialSelectionIndex({
        point: { x: 100, y: 20 },
        center: { x: 100, y: 100 },
        count: 0,
      })
    ).toBe(-1);
  });

  it("allows press-drag-release to ignore the center hub and select the dragged sector", () => {
    const center = { x: 100, y: 100 };
    expect(
      getRadialSelectionState({
        point: { x: 100, y: 100 },
        center,
        count: 10,
        minRadius: 32,
        maxRadius: 100,
      })
    ).toEqual({ index: -1, isInsideRing: false });

    expect(
      getRadialSelectionState({
        point: { x: 100, y: 20 },
        center,
        count: 10,
        minRadius: 32,
        maxRadius: 100,
      })
    ).toEqual({ index: 0, isInsideRing: true });
  });

  it("lets long-press drag selection use direction after leaving the visible wheel", () => {
    expect(
      getRadialSelectionState({
        point: { x: 100, y: -900 },
        center: { x: 100, y: 100 },
        count: 10,
        minRadius: 32,
      })
    ).toEqual({ index: 0, isInsideRing: true });
  });

  it("creates real conic sectors from the same angles used by hit testing", () => {
    const angles = getRadialSegmentAngles(2, 11);
    expect(angles.startDeg).toBeCloseTo(-40.9090909091);
    expect(angles.midDeg).toBeCloseTo(-24.5454545455);
    expect(angles.endDeg).toBeCloseTo(-8.1818181818);

    const style = getRadialSliceStyle(2, 11);
    expect("transform" in style).toBe(false);
    expect("clipPath" in style).toBe(false);
    expect(style.background).toContain("conic-gradient");
    expect(style.background).toMatch(/from 49\.090909090909\d+deg/);
    expect(style.background).toContain("32.72727272727273deg");
    expect(style.background).toContain("rgba(143, 33, 49");
  });

  it("uses CSS conic coordinates that align with pointer hit testing", () => {
    expect(getCssConicSegment(0, 11).startDeg).toBeCloseTo(343.6363636364);
    expect(getCssConicSegment(0, 11).midDeg).toBeCloseTo(0);
    expect(getCssConicSegment(10, 11).midDeg).toBeCloseTo(327.2727272727);
  });

  it("places player avatars at slice centers instead of split lines", () => {
    const angles = getRadialSegmentAngles(0, 11);
    const style = getRadialItemStyle(0, 11);
    const x = Number.parseFloat(style.left) - 50;
    const y = Number.parseFloat(style.top) - 50;
    const pointDeg = (Math.atan2(y, x) * 180) / Math.PI;

    expect(pointDeg).toBeCloseTo(angles.midDeg);
  });

  it("tightens and pulls in avatars for dense player wheels", () => {
    expect(getRadialAvatarSize(6)).toBe(58);
    expect(getRadialAvatarSize(12)).toBe(42);
    expect(getRadialAvatarRadius(10)).toBeLessThan(getRadialAvatarRadius(6));
    expect(getRadialAvatarRadius(12)).toBeLessThan(getRadialAvatarRadius(6));
  });

  it("keeps adjacent twelve player avatars separated on the outer track", () => {
    const a = getRadialItemStyle(0, 12);
    const b = getRadialItemStyle(1, 12);
    const distance = Math.hypot(
      Number.parseFloat(a.left) - Number.parseFloat(b.left),
      Number.parseFloat(a.top) - Number.parseFloat(b.top)
    );

    expect(distance).toBeGreaterThan(18);
  });
});
