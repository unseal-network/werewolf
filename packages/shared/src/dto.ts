import { z } from "zod";
import { playerKindSchema, roomStatusSchema } from "./domain";

export const createGameRequestSchema = z.object({
  sourceMatrixRoomId: z.string().min(1),
  title: z.string().min(1).max(80),
  targetPlayerCount: z.number().int().min(6).max(12).optional(),
  language: z.enum(["zh-CN", "en"]).default("zh-CN"),
  timing: z.object({
    nightActionSeconds: z.number().int().min(10).max(300).default(45),
    speechSeconds: z.number().int().min(10).max(300).default(60),
    voteSeconds: z.number().int().min(10).max(300).default(30),
    agentSpeechRate: z.number().min(0.75).max(2).default(1.5),
  }),
  allowedSourceMatrixRoomIds: z.array(z.string().min(1)).default([]),
  agentSourceMatrixRoomId: z.string().min(1).optional(),
});
export type CreateGameRequest = z.infer<typeof createGameRequestSchema>;

export const gameRoomSnapshotSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  status: roomStatusSchema,
  targetPlayerCount: z.number().int().min(6).max(12),
  sourceMatrixRoomId: z.string().optional(),
  agentSourceMatrixRoomId: z.string(),
  currentUserId: z.string(),
  creatorUserId: z.string(),
  players: z.array(
    z.object({
      id: z.string(),
      kind: playerKindSchema,
      displayName: z.string(),
      seatNo: z.number().int().positive(),
      onlineState: z.enum(["online", "offline"]),
      ready: z.boolean(),
      alive: z.boolean().optional(),
    })
  ),
  projection: z.record(z.string(), z.unknown()),
});
export type GameRoomSnapshot = z.infer<typeof gameRoomSnapshotSchema>;
