import type { GameStore } from "./game-store";
import type { InMemoryGameService } from "./game-service";

const DEFAULT_POLL_INTERVAL_MS = 1000;

/**
 * TickWorker — durable, restart-safe deadline driver for game-room turns.
 *
 * Each room writes its `next_tick_at` deadline to the DB via the GameStore
 * whenever its phase deadline changes. This worker polls the DB on a fixed
 * interval and calls `scheduleAdvance(roomId)` for any room whose deadline
 * has passed. After a process restart, polling alone is enough to resume
 * progression — no in-memory `setTimeout` can carry over a crash, but the
 * `next_tick_at` column does.
 *
 * Idempotent: `scheduleAdvance` is guarded by an internal `advancing` flag
 * per room, so re-firing for the same room while a tick is mid-flight is a
 * no-op.
 */
export class TickWorker {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private readonly intervalMs: number;

  constructor(
    private readonly store: GameStore,
    private readonly games: InMemoryGameService,
    options: { intervalMs?: number } = {}
  ) {
    this.intervalMs = options.intervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  }

  start(): void {
    if (this.timer) return;
    // Kick a tick right away so any deadlines already in the past from a
    // pre-restart state get picked up without waiting for the first interval.
    void this.tick();
    this.timer = setInterval(() => {
      if (this.running) return; // skip if the previous tick is still running
      void this.tick();
    }, this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Public for testing / manual invocation. Claims due rooms from the DB
   * and fires `scheduleAdvance` for each. Errors are caught and logged so
   * one bad room never kills the worker.
   */
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const roomIds = await this.store.claimDueRooms(new Date());
      if (roomIds.length === 0) return;
      // scheduleAdvance is async but we don't need to await — each call has
      // its own lock and runs independently. Letting them run in parallel is
      // fine and avoids one slow room blocking another.
      for (const roomId of roomIds) {
        void this.games
          .scheduleDeadlineAdvance(roomId)
          .catch((err) =>
            console.error(`[TickWorker] scheduleDeadlineAdvance(${roomId}) failed:`, err)
          );
      }
    } catch (err) {
      console.error("[TickWorker] tick failed:", err);
    } finally {
      this.running = false;
    }
  }
}
