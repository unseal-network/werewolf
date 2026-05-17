export interface RadialPoint {
  x: number;
  y: number;
}

export const PLAYER_PICKER_LONG_PRESS_MS = 100;
export const PLAYER_PICKER_INNER_HIT_RATIO = 0.30;
export const PLAYER_PICKER_OUTER_HIT_RATIO = 0.86;

export function getRadialSegmentAngles(index: number, count: number) {
  const safeCount = Math.max(count, 1);
  const sliceDeg = 360 / safeCount;
  const midDeg = -90 + index * sliceDeg;
  const startDeg = midDeg - sliceDeg / 2;
  const endDeg = midDeg + sliceDeg / 2;
  return { startDeg, midDeg, endDeg, sliceDeg };
}

export function getCssConicSegment(index: number, count: number) {
  const safeCount = Math.max(count, 1);
  const sliceDeg = 360 / safeCount;
  const midDeg = index * sliceDeg;
  const startDeg = (midDeg - sliceDeg / 2 + 360) % 360;
  const endDeg = startDeg + sliceDeg;
  return { startDeg, midDeg, endDeg, sliceDeg };
}

export function getRadialSelectionIndex({
  point,
  center,
  count,
}: {
  point: RadialPoint;
  center: RadialPoint;
  count: number;
}) {
  if (count <= 0) return -1;
  const angle = Math.atan2(point.y - center.y, point.x - center.x);
  const topBasedAngle = (angle + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2);
  const sliceRad = (Math.PI * 2) / count;
  return Math.floor(((topBasedAngle + sliceRad / 2) % (Math.PI * 2)) / sliceRad);
}

export function getRadialSelectionState({
  point,
  center,
  count,
  minRadius = 0,
  maxRadius = Number.POSITIVE_INFINITY,
}: {
  point: RadialPoint;
  center: RadialPoint;
  count: number;
  minRadius?: number;
  maxRadius?: number;
}) {
  const distance = Math.hypot(point.x - center.x, point.y - center.y);
  const isInsideRing = distance >= minRadius && distance <= maxRadius;
  return {
    index: isInsideRing ? getRadialSelectionIndex({ point, center, count }) : -1,
    isInsideRing,
  };
}

export function getRadialItemStyle(index: number, count: number) {
  const safeCount = Math.max(count, 1);
  const { midDeg } = getRadialSegmentAngles(index, safeCount);
  const angle = (midDeg * Math.PI) / 180;
  const radius = getRadialAvatarRadius(safeCount);
  return {
    left: `${50 + Math.cos(angle) * radius}%`,
    top: `${50 + Math.sin(angle) * radius}%`,
  };
}

export function getRadialAvatarSize(count: number) {
  if (count >= 12) return 36;
  if (count >= 10) return 40;
  if (count >= 8) return 44;
  return 50;
}

export function getRadialAvatarRadius(count: number) {
  if (count >= 12) return 35;
  if (count >= 10) return 36;
  if (count >= 8) return 37;
  return 39;
}

export function getRadialSliceStyle(index: number, count: number) {
  const { startDeg, sliceDeg } = getCssConicSegment(index, count);
  const featherDeg = 0.45;
  const fillStartDeg = featherDeg;
  const fillEndDeg = sliceDeg - featherDeg;
  return {
    background: `conic-gradient(from ${startDeg}deg, rgba(143, 33, 49, 0.08) 0deg, rgba(207, 64, 86, 0.34) ${fillStartDeg}deg, rgba(143, 33, 49, 0.30) ${fillEndDeg}deg, rgba(242, 228, 196, 0.08) ${sliceDeg}deg, transparent ${sliceDeg}deg, transparent 360deg)`,
  };
}

export function getRadialWheelLayout({
  center,
  viewport,
  count,
  margin = 18,
}: {
  center: RadialPoint;
  viewport: { width: number; height: number };
  count: number;
  margin?: number;
}) {
  const avatarSize = getRadialAvatarSize(count);
  const visualCap = Math.min(304, viewport.width * 0.76, viewport.height * 0.42);
  const horizontalCap = Math.max(0, (Math.min(center.x, viewport.width - center.x) - margin) * 2);
  const maxSize = Math.max(220, Math.min(visualCap, horizontalCap));
  const size = Math.round(Math.max(220, Math.min(304, maxSize)));
  const radius = size / 2;
  const minCenterY = margin + radius;
  const maxCenterY = viewport.height - margin - radius;
  const fittedCenterY =
    minCenterY > maxCenterY
      ? viewport.height / 2
      : Math.min(maxCenterY, Math.max(minCenterY, center.y));
  return {
    size,
    avatarSize,
    offsetY: Math.round(fittedCenterY - center.y),
  };
}
