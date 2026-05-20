import { describe, expect, it, vi } from "vitest";
import {
  clearLivekitCredential,
  clearLivekitCredentialCacheForTests,
  getStableLivekitCredentials,
} from "./livekitCredentials";

describe("getStableLivekitCredentials", () => {
  it("shares one credential request for the same game and user", async () => {
    clearLivekitCredentialCacheForTests();
    const fetcher = vi.fn(async () => ({
      token: "join-token",
      serverUrl: "wss://livekit.test",
    }));

    const first = getStableLivekitCredentials("game_1:@alice:test", fetcher);
    const second = getStableLivekitCredentials("game_1:@alice:test", fetcher);

    await expect(first).resolves.toEqual({
      token: "join-token",
      serverUrl: "wss://livekit.test",
    });
    await expect(second).resolves.toEqual({
      token: "join-token",
      serverUrl: "wss://livekit.test",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("allows retry after a failed credential request", async () => {
    clearLivekitCredentialCacheForTests();
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({
        token: "join-token",
        serverUrl: "wss://livekit.test",
      });

    await expect(
      getStableLivekitCredentials("game_1:@alice:test", fetcher)
    ).rejects.toThrow("network");
    await expect(
      getStableLivekitCredentials("game_1:@alice:test", fetcher)
    ).resolves.toEqual({
      token: "join-token",
      serverUrl: "wss://livekit.test",
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("can clear one cached credential so a 401 can fetch a fresh LiveKit token", async () => {
    clearLivekitCredentialCacheForTests();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({
        token: "stale-token",
        serverUrl: "wss://livekit.test",
      })
      .mockResolvedValueOnce({
        token: "fresh-token",
        serverUrl: "wss://livekit.test",
      });

    await expect(
      getStableLivekitCredentials("game_1:@alice:test", fetcher)
    ).resolves.toMatchObject({ token: "stale-token" });
    clearLivekitCredential("game_1:@alice:test");
    await expect(
      getStableLivekitCredentials("game_1:@alice:test", fetcher)
    ).resolves.toMatchObject({ token: "fresh-token" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
