import { describe, expect, it } from "vitest";
import { InMemoryRoomPubSub } from "../services/room-pubsub";
import { createNoGapReplayPlan } from "../services/timeline-cache";

describe("events no-gap replay", () => {
  it("dedupes buffered events behind durable replay without losing later events", () => {
    const replay = [
      payload("game_1_0003", "replay"),
      payload("game_1_0004", "replay"),
    ];
    const buffer = [
      payload("game_1_0004", "buffer"),
      payload("game_1_0005", "buffer"),
    ];

    const plan = createNoGapReplayPlan({
      snapshotEventId: "game_1_0002",
      replay,
      buffer,
    });

    expect(plan).toEqual([
      payload("game_1_0003", "replay"),
      payload("game_1_0004", "replay"),
      payload("game_1_0005", "buffer"),
    ]);
  });

  it("fans out only to listeners in the published room", () => {
    const pubsub = new InMemoryRoomPubSub<string>();
    const roomA: string[] = [];
    const roomB: string[] = [];

    const subscriptionA = pubsub.subscribe("room-a", (payload) => roomA.push(payload));
    const subscriptionB = pubsub.subscribe("room-b", (payload) => roomB.push(payload));

    pubsub.publish("room-a", "event-a");

    subscriptionA.unsubscribe();
    subscriptionB.unsubscribe();

    expect(roomA).toEqual(["event-a"]);
    expect(roomB).toEqual([]);
  });
});

function payload(id: string, source: "replay" | "buffer") {
  return {
    id,
    rawSsePayload: `id: ${id}\ndata: ${source}\n\n`,
  };
}
