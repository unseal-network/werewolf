export class RoomActorMetrics {
  private readonly commandLatencyMs: number[] = [];
  private readonly commitLatencyMs: number[] = [];
  private readonly fanoutLatencyMs: number[] = [];
  private readonly droppedListeners = new Map<string, number>();

  recordCommandLatency(_roomId: string, value: number): void {
    this.commandLatencyMs.push(value);
  }

  recordCommitLatency(_roomId: string, value: number): void {
    this.commitLatencyMs.push(value);
  }

  recordFanoutLatency(_roomId: string, value: number): void {
    this.fanoutLatencyMs.push(value);
  }

  recordDroppedListener(roomId: string): void {
    this.droppedListeners.set(
      roomId,
      (this.droppedListeners.get(roomId) ?? 0) + 1
    );
  }

  snapshot() {
    return {
      commandLatencyMs: summarize(this.commandLatencyMs),
      commitLatencyMs: summarize(this.commitLatencyMs),
      fanoutLatencyMs: summarize(this.fanoutLatencyMs),
      droppedListeners: Object.fromEntries(this.droppedListeners),
    };
  }
}

function summarize(values: number[]) {
  if (values.length === 0) {
    return { count: 0, p50: null, p95: null, p99: null };
  }
  const sorted = [...values].sort((a, b) => a - b);
  return {
    count: values.length,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
  };
}

function percentile(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]!;
}
