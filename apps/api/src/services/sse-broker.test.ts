import { describe, expect, it } from "vitest";
import { SseBroker } from "./sse-broker";

describe("SseBroker", () => {
  it("replays events after the opaque event id cursor", () => {
    const broker = new SseBroker();
    broker.publish("game_1", "game_1_1", { id: "game_1_1", type: "first" });
    broker.publish("game_1", "game_1_2", { id: "game_1_2", type: "second" });

    const { replay, unsubscribe } = broker.subscribe(
      "game_1",
      "game_1_1",
      () => {}
    );
    unsubscribe();

    expect(replay).toHaveLength(1);
    expect(replay[0]?.id).toBe("game_1_2");
    expect(replay[0]?.payload).toContain("id: game_1_2\n");
  });

  it("replays numeric legacy event ids after the cursor without lexicographic gaps", () => {
    const broker = new SseBroker();
    broker.publish("game_1", "game_1_2", { id: "game_1_2", type: "second" });
    broker.publish("game_1", "game_1_10", { id: "game_1_10", type: "tenth" });
    broker.publish("game_1", "game_1_11", {
      id: "game_1_11",
      type: "eleventh",
    });

    const { replay, unsubscribe } = broker.subscribe(
      "game_1",
      "game_1_2",
      () => {}
    );
    unsubscribe();

    expect(replay.map((event) => event.id)).toEqual(["game_1_10", "game_1_11"]);
    expect(replay[0]?.payload).toContain("id: game_1_10\n");
    expect(replay[1]?.payload).toContain("id: game_1_11\n");
  });
});
