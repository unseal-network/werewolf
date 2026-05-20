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
      replayPayloads: replay,
      bufferedPayloads: buffer,
    });

    expect(plan).toEqual([
      payload("game_1_0003", "replay"),
      payload("game_1_0004", "replay"),
      payload("game_1_0005", "buffer"),
    ]);
  });

  it("fans out only to listeners in the published room", async () => {
    const pubsub = new InMemoryRoomPubSub();
    const roomA: string[] = [];
    const roomB: string[] = [];

    const subscriptionA = await pubsub.subscribe("room-a", (payload) =>
      roomA.push(payload.rawSsePayload)
    );
    const subscriptionB = await pubsub.subscribe("room-b", (payload) =>
      roomB.push(payload.rawSsePayload)
    );

    await pubsub.publish("room-a", [payload("event-a", "replay")]);

    subscriptionA.unsubscribe();
    subscriptionB.unsubscribe();

    expect(roomA).toEqual(["id: event-a\ndata: replay\n\n"]);
    expect(roomB).toEqual([]);
  });
});

function payload(id: string, source: "replay" | "buffer") {
  return {
    eventId: id,
    rawSsePayload: `id: ${id}\ndata: ${source}\n\n`,
  };
}
