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

export function visibleSeatNumbersForRoom({
  targetPlayerCount,
  occupiedSeatNos,
  isGameStarted,
}: {
  targetPlayerCount: number;
  occupiedSeatNos: number[];
  isGameStarted: boolean;
}): number[] {
  const occupied = Array.from(
    new Set(
      occupiedSeatNos.filter(
        (seatNo) =>
          Number.isInteger(seatNo) &&
          seatNo > 0 &&
          seatNo <= targetPlayerCount
      )
    )
  ).sort((left, right) => left - right);

  if (isGameStarted) {
    return occupied;
  }

  const visibleCount = computeVisibleSeatCount({
    seatCount: targetPlayerCount,
    playerCount: occupied.length,
    occupiedSeatCount: occupied.length,
  });
  return Array.from({ length: visibleCount }, (_, index) => index + 1);
}

export function splitSeatsIntoRails<T>(seats: readonly T[]): { left: T[]; right: T[] } {
  return seats.reduce<{ left: T[]; right: T[] }>(
    (rails, seat, index) => {
      if (index % 2 === 0) {
        rails.left.push(seat);
      } else {
        rails.right.push(seat);
      }
      return rails;
    },
    { left: [], right: [] }
  );
}
