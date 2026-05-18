import { describe, expect, it, vi } from "vitest";
import { SttWebSocketClient } from "./stt-client";

describe("SttWebSocketClient", () => {
  it("returns the latest partial transcript when a pending flush closes before commit", async () => {
    const client = new SttWebSocketClient({
      apiBaseUrl: "https://unseal.test/api",
      agentId: "@raysonx:keepsecret.io",
      apiKey: "test-key",
    });

    const flush = client.flush(30_000);
    (client as any).handleMessage(
      Buffer.from(
        JSON.stringify({
          message_type: "partial_transcript",
          text: "我是预言家，昨晚查验了5号。",
        })
      )
    );
    client.close();

    await expect(flush).resolves.toBe("我是预言家，昨晚查验了5号。");
  });

  it("times out websocket connect attempts", async () => {
    vi.useFakeTimers();
    try {
      const client = new SttWebSocketClient({
        apiBaseUrl: "https://unseal.test/api",
        agentId: "@raysonx:keepsecret.io",
        apiKey: "test-key",
        connectTimeoutMs: 25,
        webSocketFactory: () =>
          ({
            readyState: 0,
            once: vi.fn(),
            on: vi.fn(),
            off: vi.fn(),
            terminate: vi.fn(),
          }) as any,
      } as any);

      const connect = client.connect();
      const assertion = expect(connect).rejects.toThrow(
        "STT websocket connect timed out"
      );
      await vi.advanceTimersByTimeAsync(25);

      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it("retries failed websocket connect attempts", async () => {
    const sockets: Array<{
      readyState: number;
      once: ReturnType<typeof vi.fn>;
      on: ReturnType<typeof vi.fn>;
      off: ReturnType<typeof vi.fn>;
      terminate: ReturnType<typeof vi.fn>;
    }> = [];
    const client = new SttWebSocketClient({
      apiBaseUrl: "https://unseal.test/api",
      agentId: "@raysonx:keepsecret.io",
      apiKey: "test-key",
      maxConnectAttempts: 2,
      webSocketFactory: () => {
        const socket = {
          readyState: 0,
          once: vi.fn(),
          on: vi.fn(),
          off: vi.fn(),
          terminate: vi.fn(),
        };
        sockets.push(socket);
        return socket as any;
      },
    } as any);

    const connect = client.connect();
    sockets[0]!.once.mock.calls.find(([event]) => event === "error")?.[1](
      new Error("first failure")
    );
    await vi.waitFor(() => expect(sockets).toHaveLength(2));
    sockets[1]!.readyState = 1;
    sockets[1]!.once.mock.calls.find(([event]) => event === "open")?.[1]();

    await expect(connect).resolves.toBeUndefined();
    expect(sockets).toHaveLength(2);
  });
});
