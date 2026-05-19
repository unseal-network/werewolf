import { describe, expect, it } from "vitest";
import { InMemoryRoomOwnership } from "./room-ownership";

describe("RoomOwnership", () => {
  it("allows only one active owner and increments fencing on takeover", async () => {
    const ownership = new InMemoryRoomOwnership();

    const first = await ownership.acquire("game_1", "worker_a", 1000);
    const second = await ownership.acquire("game_1", "worker_b", 1000);
    ownership.expire("game_1");
    const third = await ownership.acquire("game_1", "worker_b", 1000);

    expect(first).toMatchObject({ acquired: true, fencingToken: 1n });
    expect(second).toMatchObject({
      acquired: false,
      currentOwnerId: "worker_a",
    });
    expect(third).toMatchObject({ acquired: true, fencingToken: 2n });
  });

  it("keeps the fencing token and refreshes the lease for active reacquire by the same owner", async () => {
    const ownership = new InMemoryRoomOwnership();

    const first = await ownership.acquire("game_1", "worker_a", 1000);
    const second = await ownership.acquire("game_1", "worker_a", 2000);

    expect(first).toMatchObject({ acquired: true, fencingToken: 1n });
    expect(second).toMatchObject({ acquired: true, fencingToken: 1n });
    expect(second.leaseExpiresAt.getTime()).toBeGreaterThan(
      first.leaseExpiresAt.getTime()
    );
  });

  it("does not let stale tokens renew or release the current owner", async () => {
    const ownership = new InMemoryRoomOwnership();

    const first = await ownership.acquire("game_1", "worker_a", 1000);
    expect(first).toMatchObject({ acquired: true, fencingToken: 1n });
    ownership.expire("game_1");
    const second = await ownership.acquire("game_1", "worker_b", 1000);
    expect(second).toMatchObject({ acquired: true, fencingToken: 2n });

    await expect(
      ownership.renew("game_1", "worker_a", 1n, 1000)
    ).resolves.toBe(false);
    await ownership.release("game_1", "worker_a", 1n);

    await expect(
      ownership.acquire("game_1", "worker_c", 1000)
    ).resolves.toMatchObject({
      acquired: false,
      currentOwnerId: "worker_b",
    });
  });

  it("preserves fencing across release and ignores stale released tokens", async () => {
    const ownership = new InMemoryRoomOwnership();

    const first = await ownership.acquire("game_1", "worker_a", 1000);
    expect(first).toMatchObject({ acquired: true, fencingToken: 1n });

    await ownership.release("game_1", "worker_a", 1n);
    const second = await ownership.acquire("game_1", "worker_b", 1000);
    expect(second).toMatchObject({ acquired: true, fencingToken: 2n });

    await expect(
      ownership.renew("game_1", "worker_a", 1n, 1000)
    ).resolves.toBe(false);
    await ownership.release("game_1", "worker_a", 1n);

    await expect(
      ownership.acquire("game_1", "worker_c", 1000)
    ).resolves.toMatchObject({
      acquired: false,
      currentOwnerId: "worker_b",
    });
  });

  it("returns copied dates that cannot mutate internal ownership state", async () => {
    const ownership = new InMemoryRoomOwnership();

    const first = await ownership.acquire("game_1", "worker_a", 1000);
    first.leaseExpiresAt.setTime(0);

    const second = await ownership.acquire("game_1", "worker_b", 1000);
    expect(second).toMatchObject({
      acquired: false,
      currentOwnerId: "worker_a",
    });
    expect(second.leaseExpiresAt.getTime()).toBeGreaterThan(0);
  });
});
