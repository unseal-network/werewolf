import { describe, expect, it, vi } from "vitest";
import {
  authenticateRequest,
  clearAuthTokenCacheForTests,
  type CachedMatrixProfile,
  type MatrixProfileCache,
} from "./auth";

function request(token = "matrix-token") {
  return new Request("https://api.example/games", {
    headers: { authorization: `Bearer ${token}` },
  });
}

function memoryCache(profile: CachedMatrixProfile | null): MatrixProfileCache {
  let cached = profile;
  return {
    async get() {
      return cached;
    },
    async upsert(next) {
      cached = next;
    },
  };
}

describe("authenticateRequest profile cache", () => {
  it("reuses recently authenticated Matrix tokens without repeating whoami", async () => {
    clearAuthTokenCacheForTests();
    const whoami = vi.fn(async () => ({ user_id: "@alice:example.com" }));

    const first = await authenticateRequest(request(), { whoami });
    const second = await authenticateRequest(request(), { whoami });

    expect(first.id).toBe("@alice:example.com");
    expect(second.id).toBe("@alice:example.com");
    expect(whoami).toHaveBeenCalledTimes(1);
  });

  it("uses cached Matrix profile data when it was synced within three days", async () => {
    clearAuthTokenCacheForTests();
    const profile = vi.fn();
    const user = await authenticateRequest(
      request(),
      {
        async whoami() {
          return { user_id: "@alice:example.com" };
        },
        profile,
      },
      memoryCache({
        matrixUserId: "@alice:example.com",
        displayName: "Cached Alice",
        avatarUrl: "https://example.com/alice.png",
        profileSyncedAt: new Date(Date.now() - 60_000),
      })
    );

    expect(profile).not.toHaveBeenCalled();
    expect(user.displayName).toBe("Cached Alice");
    expect(user.avatarUrl).toBe("https://example.com/alice.png");
  });

  it("refreshes Matrix profile data when the cache is older than three days", async () => {
    clearAuthTokenCacheForTests();
    const upsert = vi.fn();
    const user = await authenticateRequest(
      request(),
      {
        async whoami() {
          return { user_id: "@alice:example.com" };
        },
        async profile() {
          return {
            displayname: "Fresh Alice",
            avatarUrl: "https://example.com/fresh.png",
          };
        },
      },
      {
        async get() {
          return {
            matrixUserId: "@alice:example.com",
            displayName: "Cached Alice",
            profileSyncedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
          };
        },
        upsert,
      }
    );

    expect(user.displayName).toBe("Fresh Alice");
    expect(user.avatarUrl).toBe("https://example.com/fresh.png");
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        matrixUserId: "@alice:example.com",
        displayName: "Fresh Alice",
        avatarUrl: "https://example.com/fresh.png",
      })
    );
  });
});
