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
  it("sends a finalize control message after the text chunk", async () => {
    const client = connectedClient();
    const ws = (client as any).ws;
    const synthesize = client.synthesize("天黑请闭眼", { timeoutMs: 30_000 });

    expect(ws.send).toHaveBeenCalledTimes(2);
    expect(JSON.parse(ws.send.mock.calls[0][0])).toMatchObject({
      text: "天黑请闭眼",
      output_format: "pcm_16000",
    });
    expect(JSON.parse(ws.send.mock.calls[1][0])).toEqual({
      message_type: "finalize",
    });

    (client as any).handleMessage(JSON.stringify({ isFinal: true }));
    await expect(synthesize).resolves.toBeUndefined();
  });

  it("rejects upstream error frames that omit type=error", async () => {
    const client = connectedClient();
    const onError = vi.fn();
    (client as any).opts.onError = onError;
    const synthesize = client.synthesize("天黑请闭眼", { timeoutMs: 30_000 });

    (client as any).handleMessage(
      JSON.stringify({
        message: "Input timeout exceeded",
        error: "input_timeout_exceeded",
        code: 1008,
      })
    );

    await expect(synthesize).rejects.toThrow("input_timeout_exceeded");
    expect(onError).toHaveBeenCalledWith("input_timeout_exceeded");
  });

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
