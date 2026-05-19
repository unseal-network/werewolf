import type { RawTimelinePayload } from "./timeline-cache";
import type { RoomActorMetrics } from "./room-actor/room-actor-metrics";

export interface RoomSubscription {
  unsubscribe(): Promise<void> | void;
}

export interface RoomPubSub {
  subscribe(
    gameRoomId: string,
    listener: (payload: RawTimelinePayload) => void
  ): Promise<RoomSubscription>;
  publish(
    gameRoomId: string,
    payloads: readonly RawTimelinePayload[]
  ): Promise<void>;
}

export class InMemoryRoomPubSub implements RoomPubSub {
  private readonly listenersByRoom = new Map<string, Set<QueuedRoomListener>>();

  constructor(
    private readonly options: {
      metrics?: RoomActorMetrics;
      maxQueueLength?: number;
    } = {}
  ) {}

  async subscribe(
    gameRoomId: string,
    listener: (payload: RawTimelinePayload) => void
  ): Promise<RoomSubscription> {
    const listeners = this.listenersByRoom.get(gameRoomId) ?? new Set();
    const queued = new QueuedRoomListener(
      gameRoomId,
      listener,
      () => this.removeListener(gameRoomId, queued),
      this.options.metrics,
      this.options.maxQueueLength ?? 256
    );
    listeners.add(queued);
    this.listenersByRoom.set(gameRoomId, listeners);

    return {
      unsubscribe: () => {
        queued.close();
        this.removeListener(gameRoomId, queued);
      },
    };
  }

  async publish(
    gameRoomId: string,
    payloads: readonly RawTimelinePayload[]
  ): Promise<void> {
    const listeners = this.listenersByRoom.get(gameRoomId);
    if (!listeners) return;

    for (const payload of payloads) {
      for (const listener of listeners) {
        listener.enqueue(payload);
      }
    }
  }

  private removeListener(gameRoomId: string, listener: QueuedRoomListener): void {
    const listeners = this.listenersByRoom.get(gameRoomId);
    if (!listeners) return;
    listeners.delete(listener);
    if (listeners.size === 0) {
      this.listenersByRoom.delete(gameRoomId);
    }
  }
}

class QueuedRoomListener {
  private readonly queue: RawTimelinePayload[] = [];
  private draining = false;
  private closed = false;

  constructor(
    private readonly gameRoomId: string,
    private readonly listener: (payload: RawTimelinePayload) => void,
    private readonly onClose: () => void,
    private readonly metrics: RoomActorMetrics | undefined,
    private readonly maxQueueLength: number
  ) {}

  enqueue(payload: RawTimelinePayload): void {
    if (this.closed) return;
    this.queue.push(payload);
    if (this.queue.length > this.maxQueueLength) {
      this.metrics?.recordDroppedListener(this.gameRoomId);
      this.close();
      this.onClose();
      return;
    }
    void this.drain();
  }

  close(): void {
    this.closed = true;
    this.queue.length = 0;
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      while (!this.closed) {
        const payload = this.queue.shift();
        if (!payload) return;
        this.listener(payload);
        await Promise.resolve();
      }
    } finally {
      this.draining = false;
    }
  }
}
