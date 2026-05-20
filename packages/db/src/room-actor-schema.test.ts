import { describe, expect, it } from "vitest";
import { gameCommands, gameEvents, roomOwnership, roomSnapshots } from "./schema";

describe("room actor authority schema", () => {
  it("defines command idempotency separately from event rows", () => {
    expect(gameCommands.gameRoomId.name).toBe("game_room_id");
    expect(gameCommands.commandId.name).toBe("command_id");
    expect(gameEvents.commandId.name).toBe("command_id");
    expect(gameEvents.commandEventIndex.name).toBe("command_event_index");
  });

  it("stores snapshots and ownership fencing", () => {
    expect(roomSnapshots.snapshotEventId.name).toBe("snapshot_event_id");
    expect(roomOwnership.fencingToken.name).toBe("fencing_token");
    expect(roomOwnership.leaseExpiresAt.name).toBe("lease_expires_at");
  });
});
