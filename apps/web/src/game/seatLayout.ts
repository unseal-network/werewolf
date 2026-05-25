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

  // 大厅阶段：始终展示全部 targetPlayerCount 个座位
  // 让玩家看到完整的座位布局，与创建时选择的人数一致
  return Array.from({ length: targetPlayerCount }, (_, index) => index + 1);
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
