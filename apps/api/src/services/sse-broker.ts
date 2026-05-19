import { isEventIdAfter } from "./event-id-cursor";

export class SseBroker {
  private listeners = new Map<string, Set<(payload: string) => void>>();
  private histories = new Map<
    string,
    Array<{ id: string; payload: string }>
  >();

  subscribe(
    gameRoomId: string,
    lastEventId: string,
    listener: (payload: string) => void
  ): { replay: Array<{ id: string; payload: string }>; unsubscribe: () => void } {
    const history = this.histories.get(gameRoomId) ?? [];
    const replay = lastEventId
      ? history.filter((event) => isEventIdAfter(event.id, lastEventId))
      : history;

    const set = this.listeners.get(gameRoomId) ?? new Set();
    set.add(listener);
    this.listeners.set(gameRoomId, set);

    return {
      replay,
      unsubscribe: () => {
        set.delete(listener);
        if (set.size === 0) {
          this.listeners.delete(gameRoomId);
        }
      },
    };
  }

  publish(gameRoomId: string, eventId: string, payload: unknown): void {
    const serialized = `id: ${eventId}\ndata: ${JSON.stringify(payload)}\n\n`;

    const history = this.histories.get(gameRoomId) ?? [];
    history.push({ id: eventId, payload: serialized });
    if (history.length > 500) history.shift();
    this.histories.set(gameRoomId, history);

    for (const listener of this.listeners.get(gameRoomId) ?? []) {
      listener(serialized);
    }
  }
}
