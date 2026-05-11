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

/**
 * FNV-1a 32-bit hash of the entire string. Used only to derive a 32-bit
 * integer PRNG seed from the user-supplied shuffleSeed — NOT to compute
 * per-seat sort keys. A naive `hash(seed::playerId)` then sort approach
 * carries the seed's low-bit structure into each player's hash, biasing
 * the seer (and other index-1, index-N/2) slot toward / away from certain
 * playerIds. Use a real PRNG + Fisher-Yates instead.
 */
function fnv1aSeed(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Mulberry32 PRNG — well-distributed and fast for non-cryptographic use. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates shuffle in-place using a seeded PRNG. */
function seededShuffle<T>(items: T[], seed: string): T[] {
  const rng = mulberry32(fnv1aSeed(seed));
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

export function assignRoles(
  seats: SeatSnapshot[],
  shuffleSeed: string
): AssignedPlayer[] {
  const roles = buildRolePlan(seats.length);
  // Shuffle the ROLE PLAN with a seeded PRNG, then deal roles to seats in
  // their natural seat-number order — like dealing cards from a shuffled
  // deck. This avoids hash-bias on playerId and gives a uniform random
  // permutation across the role plan.
  const shuffledRoles = seededShuffle(roles, shuffleSeed);
  return seats.map((seat, index) => {
    const role = shuffledRoles[index];
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
