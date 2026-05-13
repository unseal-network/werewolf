export function computeVisibleSeatCount({
  seatCount,
  playerCount,
  occupiedSeatCount,
}: {
  seatCount: number;
  playerCount: number;
  occupiedSeatCount: number;
}): number {
  const occupied = Math.max(playerCount, occupiedSeatCount);
  const desired = occupied < seatCount ? occupied + 1 : occupied;
  return Math.min(seatCount, Math.max(6, desired));
}
