import type { RoomActorEvent, RoomCommand, StagedRoomChange } from "./types";

export class RoomRuntime {
  private state: unknown;
  private snapshotEventId = "";

  constructor(
    initialState: unknown,
    private readonly createEventId: () => string
  ) {
    this.state = stripTimeline(cloneJsonLike(initialState));
  }

  snapshot(): unknown {
    return cloneJsonLike(this.state);
  }

  stage(command: RoomCommand): StagedRoomChange {
    const next = cloneJsonLike(this.state);
    const events = applyCommand(next, command, this.createEventId);
    const canonicalState = stripTimeline(next);
    const displayState = buildDisplayState(canonicalState);

    return {
      commandId: command.commandId,
      kind: command.kind,
      actorUserId: command.actorUserId,
      baseSnapshotEventId: this.snapshotEventId,
      events,
      rawSsePayloads: events.map(
        (event) => `id: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`
      ),
      canonicalState,
      displayState,
      result: { kind: `${command.kind}Accepted` },
    };
  }

  commit(change: StagedRoomChange): void {
    this.state = stripTimeline(cloneJsonLike(change.canonicalState));
    this.snapshotEventId =
      change.events.at(-1)?.id ?? change.baseSnapshotEventId;
  }
}

function applyCommand(
  state: unknown,
  command: RoomCommand,
  createEventId: () => string
): RoomActorEvent[] {
  switch (command.kind) {
    case "join":
    case "leave":
    case "swapSeat":
    case "addAgent":
    case "removePlayer":
    case "start":
    case "submitAction":
    case "runtimeTick":
    case "agentTurn":
      break;
    default:
      assertNever(command);
  }

  if (isRecord(state)) {
    state.lastCommandKind = command.kind;
  }

  return [
    {
      id: createEventId(),
      gameRoomId: command.gameRoomId,
      type: "stream",
      visibility: "public",
      actorId: command.actorUserId,
      payload: { command },
      createdAt: new Date().toISOString(),
    },
  ];
}

function buildDisplayState(state: unknown): unknown {
  return stripTimeline({ room: state });
}

function stripTimeline<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripTimeline(item)) as T;
  }

  if (!isRecord(value)) {
    return value;
  }

  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === "events") {
      continue;
    }
    next[key] = stripTimeline(child);
  }
  return next as T;
}

function cloneJsonLike<T>(value: T): T {
  return structuredClone(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertNever(value: never): never {
  throw new Error(`Unhandled room command kind: ${JSON.stringify(value)}`);
}
