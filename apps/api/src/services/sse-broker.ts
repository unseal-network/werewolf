export class SseBroker {
  private listeners = new Map<string, Set<(payload: string) => void>>();
  private histories = new Map<
    string,
    Array<{ seq: number; payload: string }>
  >();

  subscribe(
    gameRoomId: string,
    lastSeq: number,
    listener: (payload: string) => void
  ): { replay: Array<{ seq: number; payload: string }>; unsubscribe: () => void } {
    const history = this.histories.get(gameRoomId) ?? [];
    const replay = history.filter((e) => e.seq > lastSeq);

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

  publish(gameRoomId: string, seq: number, payload: unknown): void {
    const serialized = `id: ${seq}\ndata: ${JSON.stringify(payload)}\n\n`;

    const history = this.histories.get(gameRoomId) ?? [];
    history.push({ seq, payload: serialized });
    if (history.length > 500) history.shift();
    this.histories.set(gameRoomId, history);

    for (const listener of this.listeners.get(gameRoomId) ?? []) {
      listener(serialized);
    }
  }

  lastSeq(gameRoomId: string): number {
    const history = this.histories.get(gameRoomId);
    if (!history || history.length === 0) return 0;
    const last = history[history.length - 1];
    return last?.seq ?? 0;
  }
}
