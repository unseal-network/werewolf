import { describe, expect, it } from "vitest";
import {
  getCapsuleDefaultRect,
  interpolateRect,
  resolveTimelineMorphState,
  type TimelineMorphState,
} from "./timelineMorph";

describe("timeline morph", () => {
  it("interpolates rectangles by progress", () => {
    const start = {
      x: 0,
      y: 0,
      width: 120,
      height: 40,
    };
    const end = {
      x: 100,
      y: 200,
      width: 300,
      height: 500,
    };

    expect(interpolateRect(start, end, 0)).toEqual(start);
    expect(interpolateRect(start, end, 0.5)).toEqual({
      x: 50,
      y: 100,
      width: 210,
      height: 270,
    });
    expect(interpolateRect(start, end, 1)).toEqual(end);
    expect(interpolateRect(start, end, 2)).toEqual(end);
    expect(interpolateRect(start, end, -1)).toEqual(start);
  });

  it("enters opening/panel flow and restores to capsule", () => {
    const initial: TimelineMorphState = {
      status: "capsule",
      lastCapsuleRect: getCapsuleDefaultRect(),
    };
    const opening = resolveTimelineMorphState(initial, "open");
    expect(opening.status).toBe("opening");

    const panel = resolveTimelineMorphState(opening, "tick");
    expect(panel.status).toBe("panel");

    const closing = resolveTimelineMorphState(panel, "close");
    expect(closing.status).toBe("closing");

    const capsule = resolveTimelineMorphState(closing, "tick");
    expect(capsule.status).toBe("capsule");
  });

  it("keeps dragged capsule as restore point", () => {
    const initial: TimelineMorphState = {
      status: "capsule",
      lastCapsuleRect: null,
    };

    const dragged = resolveTimelineMorphState(initial, "drag", {
      draggedRect: {
        x: 200,
        y: 300,
        width: 140,
        height: 42,
      },
    });

    expect(dragged.lastCapsuleRect).toEqual({
      x: 200,
      y: 300,
      width: 140,
      height: 42,
    });
  });
});
