import { describe, expect, it } from "vitest";
import { InMemoryRoomPubSub } from "../room-pubsub";
import { RoomActorMetrics } from "./room-actor-metrics";

describe("RoomActorMetrics", () => {
  it("records write and fanout bottlenecks", () => {
    const metrics = new RoomActorMetrics();
    metrics.recordCommandLatency("game_1", 12);
    metrics.recordCommitLatency("game_1", 5);
    metrics.recordFanoutLatency("game_1", 20);
    metrics.recordDroppedListener("game_1");

    expect(metrics.snapshot()).toMatchObject({
      commandLatencyMs: { count: 1 },
      commitLatencyMs: { count: 1 },
      fanoutLatencyMs: { count: 1 },
      droppedListeners: { game_1: 1 },
    });
  });

  it("drops slow local pubsub listeners when their queue overflows", async () => {
    const metrics = new RoomActorMetrics();
    const pubsub = new InMemoryRoomPubSub({ metrics, maxQueueLength: 0 });
    const received: string[] = [];
    await pubsub.subscribe("game_1", (payload) => {
      received.push(payload.eventId);
    });

    await pubsub.publish("game_1", [
      { eventId: "1", rawSsePayload: "id: 1\ndata: {}\n\n" },
      { eventId: "2", rawSsePayload: "id: 2\ndata: {}\n\n" },
    ]);
    await Promise.resolve();

    expect(metrics.snapshot()).toMatchObject({
      droppedListeners: { game_1: 1 },
    });
  });
});
