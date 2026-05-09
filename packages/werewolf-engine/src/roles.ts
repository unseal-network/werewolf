import { type Role, teamForRole } from "@werewolf/shared";
import type { AssignedPlayer, SeatSnapshot } from "./state";

export function buildRolePlan(playerCount: number): Role[] {
  if (playerCount < 6 || playerCount > 12) {
    throw new Error("Werewolf supports 6 to 12 players");
  }
  const wolfCount = playerCount >= 10 ? 3 : playerCount >= 7 ? 2 : 1;
  const roles: Role[] = [];
  for (let index = 0; index < wolfCount; index += 1) {
    roles.push("werewolf");
  }
  roles.push("seer", "witch", "guard");
  while (roles.length < playerCount) {
    roles.push("villager");
  }
  return roles;
}

function seededSortKey(seed: string, value: string): string {
  return `${seed}:${value}`;
}

export function assignRoles(
  seats: SeatSnapshot[],
  shuffleSeed: string
): AssignedPlayer[] {
  const roles = buildRolePlan(seats.length);
  const orderedSeats = [...seats].sort((a, b) =>
    seededSortKey(shuffleSeed, a.playerId).localeCompare(
      seededSortKey(shuffleSeed, b.playerId)
    )
  );
  const roleByPlayerId = new Map<string, Role>();
  for (const [index, seat] of orderedSeats.entries()) {
    const role = roles[index];
    if (!role) {
      throw new Error("role plan missing role");
    }
    roleByPlayerId.set(seat.playerId, role);
  }
  return seats.map((seat) => {
    const role = roleByPlayerId.get(seat.playerId);
    if (!role) {
      throw new Error(`missing role for ${seat.playerId}`);
    }
    return {
      ...seat,
      role,
      team: teamForRole(role),
      alive: true,
      eliminated: false,
    };
  });
}
