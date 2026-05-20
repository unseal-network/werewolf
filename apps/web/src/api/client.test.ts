import { afterEach, describe, expect, it, vi } from "vitest";
import { createApiClient } from "./client";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("createApiClient auth refresh", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("refreshes the Matrix token on 401 and retries the request once", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(401, { error: "expired" }))
      .mockResolvedValueOnce(jsonResponse(200, { user_id: "@alice:example.com" }))
      .mockResolvedValueOnce(jsonResponse(200, { user_id: "@alice:example.com" }));
    vi.stubGlobal("fetch", fetchMock);
    const refreshMatrixToken = vi.fn(async () => "fresh-token");

    const client = createApiClient({
      baseUrl: "https://werewolf.example",
      getMatrixToken: () => "stale-token",
      refreshMatrixToken,
    });

    await expect(client.whoAmIAgainstApi()).resolves.toEqual({
      user_id: "@alice:example.com",
    });
    await client.whoAmIAgainstApi();

    expect(refreshMatrixToken).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://werewolf.example/games/me",
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: "Bearer stale-token",
        }),
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://werewolf.example/games/me",
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: "Bearer fresh-token",
        }),
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "https://werewolf.example/games/me",
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: "Bearer fresh-token",
        }),
      })
    );
  });
});
