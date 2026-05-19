import { z } from "zod";
import type { GameEvent } from "@werewolf/shared";

const base = z.object({
  commandId: z.string().min(1),
  gameRoomId: z.string().min(1),
  actorUserId: z.string().min(1),
});

export const roomCommandSchema = z.discriminatedUnion("kind", [
  base.extend({
    kind: z.literal("join"),
    displayName: z.string().min(1),
    avatarUrl: z.string().optional(),
    seatNo: z.number().int().positive().optional(),
  }),
  base.extend({ kind: z.literal("leave") }),
  base.extend({
    kind: z.literal("swapSeat"),
    seatNo: z.number().int().positive(),
  }),
  base.extend({
    kind: z.literal("addAgent"),
    agentUserId: z.string().min(1),
    displayName: z.string().min(1),
    avatarUrl: z.string().optional(),
  }),
  base.extend({
    kind: z.literal("removePlayer"),
    playerId: z.string().min(1),
  }),
  base.extend({ kind: z.literal("start") }),
  base.extend({
    kind: z.literal("submitAction"),
    action: z.record(z.string(), z.unknown()),
  }),
  base.extend({ kind: z.literal("runtimeTick") }),
  base.extend({ kind: z.literal("agentTurn") }),
]);

export type RoomCommand = z.infer<typeof roomCommandSchema>;

export type StagedRoomChange = {
  commandId: string;
  kind: RoomCommand["kind"];
  actorUserId: string;
  baseSnapshotEventId: string;
  events: GameEvent[];
  rawSsePayloads: string[];
  canonicalState: unknown;
  displayState: unknown;
  result: unknown;
};
