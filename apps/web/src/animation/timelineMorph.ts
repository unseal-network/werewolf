export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type TimelineMorphStatus =
  | "hidden"
  | "capsule"
  | "opening"
  | "panel"
  | "closing";

export type TimelineMorphEvent = "open" | "close" | "drag" | "tick";

export interface TimelineMorphState {
  status: TimelineMorphStatus;
  lastCapsuleRect: Rect | null;
}

const DEFAULT_CAPSULE_RECT: Rect = {
  x: 24,
  y: 24,
  width: 128,
  height: 40,
};

const PANEL_RECT: Rect = {
  x: 0,
  y: 0,
  width: Math.min(720, 900),
  height: 420,
};

function clamp01(value: number) {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function rectFromBounds(bounds: DOMRectReadOnly): Rect {
  return {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
  };
}

export function interpolateRect(from: Rect, to: Rect, progress: number): Rect {
  const t = clamp01(progress);
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
    width: from.width + (to.width - from.width) * t,
    height: from.height + (to.height - from.height) * t,
  };
}

export function getPanelRect(viewport: Pick<Rect, "width" | "height">): Rect {
  const width = Math.min(760, viewport.width - 32);
  const height = Math.min(460, Math.max(280, viewport.height - 160));
  return {
    x: (viewport.width - width) / 2,
    y: (viewport.height - height) / 2,
    width,
    height,
  };
}

export function resolveTimelineMorphState(
  current: TimelineMorphState,
  event: TimelineMorphEvent,
  options?: { draggedRect?: Rect | null }
): TimelineMorphState {
  switch (event) {
    case "drag":
      if (!options?.draggedRect) return current;
      return {
        ...current,
        status: "capsule",
        lastCapsuleRect: options.draggedRect,
      };
    case "open":
      if (current.status === "panel" || current.status === "opening") {
        return current;
      }
      return {
        ...current,
        status: "opening",
      };
    case "close":
      if (current.status === "capsule" || current.status === "closing") {
        return current;
      }
      return {
        ...current,
        status: "closing",
      };
    case "tick": {
      if (current.status === "opening") {
        return {
          ...current,
          status: "panel",
        };
      }
      if (current.status === "closing") {
        return {
          ...current,
          status: "capsule",
        };
      }
      return current;
    }
    default:
      return current;
  }
}

export function getCapsuleDefaultRect(): Rect {
  return { ...DEFAULT_CAPSULE_RECT };
}

export function resolveBaseRect(state: TimelineMorphState): Rect {
  return state.lastCapsuleRect ?? getCapsuleDefaultRect();
}

export { PANEL_RECT };
