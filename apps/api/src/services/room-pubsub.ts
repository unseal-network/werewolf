import type { RawTimelinePayload } from "./timeline-cache";

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
  private listenersByRoom = new Map<
    string,
    Set<(payload: RawTimelinePayload) => void>
  >();

  async subscribe(
    gameRoomId: string,
    listener: (payload: RawTimelinePayload) => void
  ): Promise<RoomSubscription> {
    const listeners = this.listenersByRoom.get(gameRoomId) ?? new Set();
    listeners.add(listener);
    this.listenersByRoom.set(gameRoomId, listeners);

    return {
      unsubscribe: () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          this.listenersByRoom.delete(gameRoomId);
        }
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
        listener(payload);
      }
    }
  }
}
