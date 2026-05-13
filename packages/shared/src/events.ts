import { z } from "zod";

export const eventTypeSchema = z.enum([
  "game_started",
  "roles_assigned",
  "phase_started",
  "turn_started",
  "speech_transcript_delta",
  "speech_submitted",
  "wolf_vote_submitted",
  "wolf_vote_resolved",
  "night_action_submitted",
  "seer_result_revealed",
  "witch_kill_revealed",
  "vote_submitted",
  "phase_closed",
  "night_resolved",
  "player_eliminated",
  "player_seat_changed",
  "player_removed",
  "game_ended",
  "agent_turn_started",
  "agent_llm_requested",
  "agent_llm_completed",
  "agent_turn_failed",
  "post_game_summary_created",
]);
export type GameEventType = z.infer<typeof eventTypeSchema>;

export const visibilitySchema = z.union([
  z.literal("public"),
  z.literal("runtime"),
  z.string().regex(/^private:user:[A-Za-z0-9_.:-]+$/),
  z.literal("private:team:wolf"),
]);
export type EventVisibility = z.infer<typeof visibilitySchema>;

export const gameEventSchema = z.object({
  id: z.string().min(1),
  gameRoomId: z.string().min(1),
  seq: z.number().int().positive(),
  type: eventTypeSchema,
  visibility: visibilitySchema,
  actorId: z.string().min(1).optional(),
  subjectId: z.string().min(1).optional(),
  payload: z.record(z.string(), z.unknown()),
  createdAt: z.string().datetime(),
});
export type GameEvent = z.infer<typeof gameEventSchema>;
