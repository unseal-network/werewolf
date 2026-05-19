export interface RoomSubscription {
  unsubscribe(): void;
}

export interface RoomPubSub<TPayload = unknown> {
  subscribe(
    gameRoomId: string,
    listener: (payload: TPayload) => void
  ): RoomSubscription;
  publish(gameRoomId: string, payload: TPayload): void;
}

export class InMemoryRoomPubSub<TPayload = unknown>
  implements RoomPubSub<TPayload>
{
  private listenersByRoom = new Map<string, Set<(payload: TPayload) => void>>();

  subscribe(
    gameRoomId: string,
    listener: (payload: TPayload) => void
  ): RoomSubscription {
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

  publish(gameRoomId: string, payload: TPayload): void {
    const listeners = this.listenersByRoom.get(gameRoomId);
    if (!listeners) return;

    for (const listener of listeners) {
      listener(payload);
    }
  }
}
