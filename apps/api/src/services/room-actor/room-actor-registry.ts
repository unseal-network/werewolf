import type { RoomCommandBus } from "../room-command-bus";
import type { RoomCommitStore } from "../room-commit-store";
import type { RoomOwnership } from "../room-ownership";
import type { RoomPubSub } from "../room-pubsub";
import type { RawTimelinePayload } from "../timeline-cache";
import { RoomActor } from "./room-actor";
import { RoomRuntime } from "./room-runtime";
import type { RoomCommand } from "./types";

export type RoomActorRegistryDeps = {
  ownerId: string;
  ownership: RoomOwnership;
  commitStore: RoomCommitStore;
  pubsub: RoomPubSub;
  commandBus?: RoomCommandBus;
  loadInitialRoom(gameRoomId: string): Promise<unknown> | unknown;
  createEventId(): string;
  leaseTtlMs?: number;
};

export class RoomActorOwnedByOtherError extends Error {
  readonly currentOwnerId: string;

  constructor(gameRoomId: string, currentOwnerId: string) {
    super(`Room ${gameRoomId} is owned by ${currentOwnerId}`);
    this.name = "RoomActorOwnedByOtherError";
    this.currentOwnerId = currentOwnerId;
  }
}

type LocalActor = {
  actor: RoomActor;
  fencingToken: bigint;
};

export class RoomActorRegistry {
  private readonly actors = new Map<string, LocalActor>();
  private readonly leaseTtlMs: number;

  constructor(private readonly deps: RoomActorRegistryDeps) {
    this.leaseTtlMs = deps.leaseTtlMs ?? 30_000;
    this.deps.commandBus?.register(this.deps.ownerId, (command) =>
      this.dispatch(command)
    );
  }

  async get(gameRoomId: string): Promise<RoomActor> {
    const existing = this.actors.get(gameRoomId);
    if (existing) return existing.actor;

    const lease = await this.deps.ownership.acquire(
      gameRoomId,
      this.deps.ownerId,
      this.leaseTtlMs
    );
    if (!lease.acquired) {
      throw new RoomActorOwnedByOtherError(gameRoomId, lease.currentOwnerId);
    }

    seedCommitStoreOwnershipIfAvailable(
      this.deps.commitStore,
      gameRoomId,
      lease.fencingToken,
      lease.leaseExpiresAt
    );

    const snapshot = await this.deps.commitStore.loadSnapshot(gameRoomId);
    const initialState =
      snapshot?.canonicalState ?? (await this.deps.loadInitialRoom(gameRoomId));
    const runtime = new RoomRuntime(initialState, this.deps.createEventId);
    const actor = new RoomActor({
      gameRoomId,
      fencingToken: lease.fencingToken,
      runtime,
      commitStore: this.deps.commitStore,
      publishRaw: async (roomId, rawSsePayloads) => {
        await this.deps.pubsub.publish(
          roomId,
          rawSsePayloads.map((rawSsePayload) => ({
            eventId: extractEventId(rawSsePayload),
            rawSsePayload,
          }) satisfies RawTimelinePayload)
        );
      },
    });

    this.actors.set(gameRoomId, { actor, fencingToken: lease.fencingToken });
    return actor;
  }

  async dispatch(command: RoomCommand): Promise<unknown> {
    const local = this.actors.get(command.gameRoomId);
    if (local) {
      return local.actor.dispatch(command);
    }

    try {
      return await (await this.get(command.gameRoomId)).dispatch(command);
    } catch (error) {
      if (
        error instanceof RoomActorOwnedByOtherError &&
        this.deps.commandBus
      ) {
        return this.deps.commandBus.forward(error.currentOwnerId, command);
      }
      throw error;
    }
  }

  dropLocal(gameRoomId: string): void {
    this.actors.delete(gameRoomId);
  }

  async renewLocalLeasesOnce(): Promise<void> {
    await Promise.all(
      [...this.actors.entries()].map(async ([gameRoomId, local]) => {
        const renewed = await this.deps.ownership.renew(
          gameRoomId,
          this.deps.ownerId,
          local.fencingToken,
          this.leaseTtlMs
        );
        if (!renewed) {
          this.actors.delete(gameRoomId);
        }
      })
    );
  }

  close(): void {
    this.actors.clear();
  }
}

function extractEventId(rawSsePayload: string): string {
  const idLine = rawSsePayload
    .split(/\r?\n/)
    .find((line) => line.startsWith("id:"));
  const idFromLine = idLine?.slice(3).trim();
  if (idFromLine) return idFromLine;

  const dataLine = rawSsePayload
    .split(/\r?\n/)
    .find((line) => line.startsWith("data:"));
  const rawData = dataLine?.slice(5).trim();
  if (!rawData) return "";

  try {
    const data = JSON.parse(rawData) as unknown;
    if (
      typeof data === "object" &&
      data !== null &&
      "id" in data &&
      typeof data.id === "string"
    ) {
      return data.id;
    }
  } catch {
    return "";
  }

  return "";
}

function seedCommitStoreOwnershipIfAvailable(
  commitStore: RoomCommitStore,
  gameRoomId: string,
  fencingToken: bigint,
  leaseExpiresAt: Date
): void {
  const maybeSeedable = commitStore as RoomCommitStore & {
    seedOwnership?: (
      gameRoomId: string,
      fencingToken: bigint,
      leaseExpiresAt?: Date
    ) => void;
  };

  maybeSeedable.seedOwnership?.(gameRoomId, fencingToken, leaseExpiresAt);
}
