import { z } from "zod";

export const roleSchema = z.enum([
  "werewolf",
  "seer",
  "witch",
  "guard",
  "villager",
]);
export type Role = z.infer<typeof roleSchema>;

export const teamSchema = z.enum(["wolf", "good"]);
export type Team = z.infer<typeof teamSchema>;

export const roomStatusSchema = z.enum([
  "created",
  "waiting",
  "active",
  "paused",
  "ended",
]);
export type RoomStatus = z.infer<typeof roomStatusSchema>;

export const playerKindSchema = z.enum(["user", "agent"]);
export type PlayerKind = z.infer<typeof playerKindSchema>;

export const gamePhaseSchema = z.enum([
  "role_assignment",
  "night_guard",
  "night_wolf",
  "night_witch_heal",
  "night_witch_poison",
  "night_seer",
  "night_resolution",
  "day_speak",
  "day_vote",
  "day_resolution",
  "post_game",
]);
export type GamePhase = z.infer<typeof gamePhaseSchema>;

export function teamForRole(role: Role): Team {
  return role === "werewolf" ? "wolf" : "good";
}
