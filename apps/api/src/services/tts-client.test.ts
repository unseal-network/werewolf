import { describe, expect, it, vi } from "vitest";
import { TtsWebSocketClient } from "./tts-client";

function connectedClient() {
  const client = new TtsWebSocketClient({
    apiBaseUrl: "https://unseal.test/api",
    agentId: "@agent:test",
    apiKey: "test-key",
  });
  (client as any).ws = {
    readyState: 1,
    send: vi.fn(),
  };
  return client;
}

describe("TtsWebSocketClient", () => {
  it("rejects synthesize when the final audio event times out", async () => {
    vi.useFakeTimers();
    try {
      const client = connectedClient();
      const synthesize = client.synthesize("天黑请闭眼", { timeoutMs: 25 });
      const assertion = expect(synthesize).rejects.toThrow(
        "TTS synthesize timed out"
      );

      await vi.advanceTimersByTimeAsync(25);

      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects a pending synthesize request when the websocket closes", async () => {
    const client = connectedClient();
    const synthesize = client.synthesize("天黑请闭眼", { timeoutMs: 30_000 });

    (client as any).handleClose();

    await expect(synthesize).rejects.toThrow("TTS websocket closed");
  });
});
