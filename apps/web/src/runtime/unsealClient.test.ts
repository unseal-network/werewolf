import { afterEach, describe, expect, it, vi } from "vitest";
import { createUnsealClient } from "./unsealClient";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("createUnsealClient auth refresh", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("refreshes the Unseal room JWT on 401 and retries once", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse(401, { code: "UNAUTHORIZED", message: "expired" })
      )
      .mockResolvedValueOnce(
        jsonResponse(200, { data: { roomId: "room_1", linkRoomId: null } })
      )
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const refreshJwt = vi.fn(async () => "fresh-jwt");

    const client = createUnsealClient("https://unseal.example", {
      refreshJwt,
    });

    await expect(client.getRoom("room_1", "stale-jwt")).resolves.toEqual({
      roomId: "room_1",
      linkRoomId: null,
    });
    await client.linkRoom("room_1", "game_1", "stale-jwt");

    expect(refreshJwt).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://unseal.example/api/rooms/room_1",
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: "Bearer stale-jwt",
        }),
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://unseal.example/api/rooms/room_1",
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: "Bearer fresh-jwt",
        }),
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "https://unseal.example/api/rooms/room_1/link",
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: "Bearer fresh-jwt",
        }),
      })
    );
  });
});
