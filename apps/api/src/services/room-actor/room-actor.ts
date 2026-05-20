import type { RoomCommittedEvent, RoomCommitStore } from "../room-commit-store";
import type { RoomRuntime } from "./room-runtime";
import type { RoomCommand } from "./types";

export type RoomActorDeps = {
  gameRoomId: string;
  fencingToken: bigint;
  runtime: RoomRuntime;
  commitStore: RoomCommitStore;
  publishRaw(
    gameRoomId: string,
    rawSsePayloads: readonly string[]
  ): Promise<void>;
};

export class RoomActor {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly deps: RoomActorDeps) {}

  dispatch(command: RoomCommand): Promise<unknown> {
    const next = this.queue
      .catch(() => undefined)
      .then(() => this.process(command));
    this.queue = next;
    return next;
  }

  private async process(command: RoomCommand): Promise<unknown> {
    if (command.gameRoomId !== this.deps.gameRoomId) {
      throw new Error("command gameRoomId does not match actor room");
    }

    const duplicate = await this.deps.commitStore.findCommand(
      this.deps.gameRoomId,
      command.commandId
    );
    if (duplicate) {
      return duplicate.result;
    }

    const staged = this.deps.runtime.stage(command);
    const committed = await this.deps.commitStore.commit({
      gameRoomId: this.deps.gameRoomId,
      commandId: command.commandId,
      kind: command.kind,
      actorUserId: command.actorUserId,
      fencingToken: this.deps.fencingToken,
      baseSnapshotEventId: staged.baseSnapshotEventId,
      events: staged.events.map(toCommittedEvent),
      rawSsePayloads: staged.rawSsePayloads,
      canonicalState: staged.canonicalState,
      displayState: staged.displayState,
      result: staged.result,
    });

    if (committed.status === "duplicate") {
      return committed.result;
    }

    this.deps.runtime.commit(staged);
    await this.deps.publishRaw(this.deps.gameRoomId, committed.rawSsePayloads);
    return committed.result;
  }
}

function toCommittedEvent(event: {
  id: string;
  gameRoomId: string;
  type: string;
  visibility: string;
  actorId?: string | undefined;
  subjectId?: string | undefined;
  payload: Record<string, unknown>;
  createdAt: string;
}): RoomCommittedEvent {
  return {
    id: event.id,
    gameRoomId: event.gameRoomId,
    type: event.type,
    visibility: event.visibility,
    ...(event.actorId !== undefined ? { actorId: event.actorId } : {}),
    ...(event.subjectId !== undefined ? { subjectId: event.subjectId } : {}),
    payload: event.payload,
    createdAt: event.createdAt,
  };
}
