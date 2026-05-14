import { describe, expect, it } from "vitest";
import {
  buildGameRoomUrl,
  resolveRuntimeBootstrap,
  updateGameRoomIdParam,
} from "./bootstrap";

describe("runtime bootstrap", () => {
  it("prefers the URL gameRoomId over host bindings", () => {
    expect(
      resolveRuntimeBootstrap({
        urlGameRoomId: "game_from_url",
        hostRoomId: "!host:room",
        hostLinkRoomId: "game_from_host",
        isHostRuntime: true,
        isAdmin: true,
      })
    ).toEqual({ kind: "resume", gameRoomId: "game_from_url", source: "url" });
  });

  it("resumes from the host linkRoomId when the URL has no game room", () => {
    expect(
      resolveRuntimeBootstrap({
        urlGameRoomId: null,
        hostRoomId: "!host:room",
        hostLinkRoomId: "game_linked",
        isHostRuntime: true,
        isAdmin: false,
      })
    ).toEqual({ kind: "resume", gameRoomId: "game_linked", source: "host-link" });
  });

  it("lets admins create and makes non-admins wait when host has no link", () => {
    expect(
      resolveRuntimeBootstrap({
        urlGameRoomId: null,
        hostRoomId: "!host:room",
        hostLinkRoomId: null,
        isHostRuntime: true,
        isAdmin: true,
      })
    ).toEqual({ kind: "create", hostRoomId: "!host:room" });

    expect(
      resolveRuntimeBootstrap({
        urlGameRoomId: null,
        hostRoomId: "!host:room",
        hostLinkRoomId: null,
        isHostRuntime: true,
        isAdmin: false,
      })
    ).toEqual({ kind: "wait-for-host-link", hostRoomId: "!host:room" });
  });

  it("updates only the gameRoomId search param during URL recovery", () => {
    expect(
      updateGameRoomIdParam("?chooseUser=1&foo=bar", "game_123")
    ).toBe("?chooseUser=1&foo=bar&gameRoomId=game_123");
    expect(buildGameRoomUrl("/play", "?foo=bar", "game_456")).toBe(
      "/play?foo=bar&gameRoomId=game_456"
    );
  });
});
