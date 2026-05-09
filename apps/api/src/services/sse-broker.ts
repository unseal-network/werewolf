export class SseBroker {
  private readonly listeners = new Map<string, Set<(payload: string) => void>>();

  subscribe(gameRoomId: string, listener: (payload: string) => void): () => void {
    const set = this.listeners.get(gameRoomId) ?? new Set();
    set.add(listener);
    this.listeners.set(gameRoomId, set);

    return () => {
      set.delete(listener);
      if (set.size === 0) {
        this.listeners.delete(gameRoomId);
      }
    };
  }

  publish(gameRoomId: string, payload: unknown): void {
    const serialized = `data: ${JSON.stringify(payload)}\n\n`;
    for (const listener of this.listeners.get(gameRoomId) ?? []) {
      listener(serialized);
    }
  }
}
