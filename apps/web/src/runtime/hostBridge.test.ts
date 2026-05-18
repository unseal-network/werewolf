import { describe, expect, it, vi } from "vitest";
import { createIframeHostBridge } from "./hostBridge";

type Listener = (event: { data: unknown }) => void;

function installWindowHarness(
  responder: (message: Record<string, unknown>) => unknown
) {
  const listeners = new Set<Listener>();
  const postMessage = vi.fn((message: Record<string, unknown>) => {
    const response = responder(message);
    if (!response) return;
    queueMicrotask(() => {
      for (const listener of listeners) listener({ data: response });
    });
  });
  vi.stubGlobal("window", {
    self: {},
    top: {},
    parent: { postMessage },
    addEventListener: (type: string, listener: Listener) => {
      if (type === "message") listeners.add(listener);
    },
    removeEventListener: (type: string, listener: Listener) => {
      if (type === "message") listeners.delete(listener);
    },
  });
  return { postMessage };
}

describe("iframe host bridge", () => {
  it("gets the Matrix token and host identity through the unseal iframe protocol", async () => {
    const { postMessage } = installWindowHarness((message) => {
      if (message.op === "game-get-token") {
        return { op: message.op, id: message.id, data: "matrix-token" };
      }
      if (message.op === "game-info") {
        return {
          op: message.op,
          id: message.id,
          data: {
            roomId: "!room:example.com",
            gameRoomId: "game_123",
            userId: "@alice:example.com",
            displayName: "Alice",
            avatarUrl: "https://example.com/alice.png",
            powerLevel: 100,
            config: { streamURL: "https://keepsecret.io/app-mgr/stream" },
          },
        };
      }
      return null;
    });

    const bridge = createIframeHostBridge({ timeoutMs: 1000 });

    await expect(bridge.getToken()).resolves.toBe("matrix-token");
    await expect(bridge.getInfo()).resolves.toMatchObject({
      roomId: "!room:example.com",
      gameRoomId: "game_123",
      userId: "@alice:example.com",
      displayName: "Alice",
      avatarUrl: "https://example.com/alice.png",
      powerLevel: 100,
    });
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ op: "game-get-token" }),
      "*"
    );
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ op: "game-info" }),
      "*"
    );
  });
});
