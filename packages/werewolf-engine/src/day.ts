import type { GameEvent, Role } from "@werewolf/shared";

export interface VoteRecord {
  actorPlayerId: string;
  targetPlayerId: string;
}

export interface ResolveDayVoteInput {
  gameRoomId: string;
  day: number;
  alivePlayerIds: string[];
  votes: VoteRecord[];
  now: Date;
}

export interface ResolveDayVoteResult {
  exiledPlayerId: string | null;
  tally: Record<string, number>;
  events: GameEvent[];
}

export function resolveDayVote(
  input: ResolveDayVoteInput
): ResolveDayVoteResult {
  const tally: Record<string, number> = {};
  for (const vote of input.votes) {
    if (!input.alivePlayerIds.includes(vote.actorPlayerId)) continue;
    if (!input.alivePlayerIds.includes(vote.targetPlayerId)) continue;
    tally[vote.targetPlayerId] = (tally[vote.targetPlayerId] ?? 0) + 1;
  }

  const sorted = Object.entries(tally).sort((a, b) => b[1] - a[1]);
  const top = sorted[0];
  const second = sorted[1];
  const exiledPlayerId = top && (!second || top[1] > second[1]) ? top[0] : null;
  const createdAt = input.now.toISOString();
  const events: GameEvent[] = [
    {
      id: "pending",
      gameRoomId: input.gameRoomId,
      seq: 1,
      type: "phase_closed",
      visibility: "public",
      actorId: "runtime",
      payload: { phase: "day_vote", day: input.day, tally, exiledPlayerId },
      createdAt,
    },
  ];

  if (exiledPlayerId) {
    events.push({
      id: "pending",
      gameRoomId: input.gameRoomId,
      seq: 2,
      type: "player_eliminated",
      visibility: "public",
      actorId: "runtime",
      subjectId: exiledPlayerId,
      payload: { playerId: exiledPlayerId, reason: "vote" },
      createdAt,
    });
  }

  return { exiledPlayerId, tally, events };
}

export interface WinnerPlayerState {
  playerId: string;
  role: Role;
  alive: boolean;
}

export function determineWinner(
  players: WinnerPlayerState[]
): "wolf" | "good" | null {
  const alive = players.filter((player) => player.alive);
  const wolves = alive.filter((player) => player.role === "werewolf").length;
  const good = alive.length - wolves;

  if (wolves === 0) return "good";
  if (wolves >= good) return "wolf";
  return null;
}
