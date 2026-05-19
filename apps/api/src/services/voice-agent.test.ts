import { describe, expect, it, vi } from "vitest";
import { VoiceAgentService, type VoiceAgentConfig } from "./voice-agent";
import { resamplePcmForPlaybackRate } from "./voice-audio";

const config: VoiceAgentConfig = {
  livekitUrl: "ws://livekit.test",
  livekitApiKey: "key",
  livekitApiSecret: "secret",
  unsealApiBaseUrl: "https://unseal.test/api",
  unsealApiKey: "api-key",
  unsealAgentId: "@agent:test",
};

function createSession(overrides: Record<string, unknown> = {}) {
  return {
    client: {
      transcriptText: "",
      partialText: "",
      sendFinalAudio: vi.fn(() => true),
      flush: vi.fn(async () => ""),
      resetBuffer: vi.fn(),
      close: vi.fn(),
    },
    resampler: null,
    resamplerInputRate: 0,
    lastSentChunk: null,
    active: false,
    completedText: "",
    ...overrides,
  };
}

describe("VoiceAgentService STT buffering", () => {
  it("deduplicates repeated LiveKit callbacks for the same player track", () => {
    const agent = new VoiceAgentService("game_1", config);
    agent.registerPlayerVoiceIdentity("player_6", "@raysonx:keepsecret.io");

    expect(
      (agent as any).claimPlayerAudioTrack("@raysonx:keepsecret.io", "track_1")
    ).toEqual({
      playerId: "player_6",
      matrixUserId: "@raysonx:keepsecret.io",
      trackKey: "track_1",
    });
    expect(
      (agent as any).claimPlayerAudioTrack("@raysonx:keepsecret.io", "track_1")
    ).toBeNull();

    (agent as any).releasePlayerAudioTrack("track_1");

    expect(
      (agent as any).claimPlayerAudioTrack("@raysonx:keepsecret.io", "track_1")
    ).toEqual({
      playerId: "player_6",
      matrixUserId: "@raysonx:keepsecret.io",
      trackKey: "track_1",
    });
  });

  it("preserves a finished microphone track transcript until speech submit", async () => {
    const agent = new VoiceAgentService("game_1", config);
    const session = createSession({
      completedText: "我是预言家，今天归票5号。",
    });
    (agent as any).playerSessions.set("player_6", session);

    await expect(agent.flushPlayerTranscript("player_6")).resolves.toBe(
      "我是预言家，今天归票5号。"
    );

    expect((agent as any).playerSessions.has("player_6")).toBe(false);
  });

  it("commits the last audio chunk when a microphone track ends", async () => {
    const agent = new VoiceAgentService("game_1", config);
    const client = {
      transcriptText: "",
      partialText: "",
      sendFinalAudio: vi.fn(() => true),
      flush: vi.fn(async () => "我查验了5号，是狼人。"),
      resetBuffer: vi.fn(),
      close: vi.fn(),
    };
    const session = createSession({
      client,
      lastSentChunk: new Int16Array([1, 2, 3]),
      active: true,
    });

    await (agent as any).finalizePlayerSttSession(
      session,
      "player_6",
      "@raysonx:keepsecret.io",
      1
    );

    expect(client.sendFinalAudio).toHaveBeenCalledWith(
      new Int16Array([1, 2, 3]),
      16000
    );
    expect(session.completedText).toBe("我查验了5号，是狼人。");
    expect(session.lastSentChunk).toBeNull();
  });
});

describe("TTS playback rate resampling", () => {
  it("shortens PCM samples for faster agent speech", () => {
    const input = Int16Array.from([0, 1000, 2000, 3000, 4000, 5000]);
    const output = resamplePcmForPlaybackRate(input, 1.5);

    expect(output.length).toBe(4);
    expect(Array.from(output)).toEqual([0, 1500, 3000, 4500]);
  });

  it("keeps invalid rates within supported bounds", () => {
    const input = Int16Array.from([0, 1000, 2000, 3000]);

    expect(resamplePcmForPlaybackRate(input, 20).length).toBe(2);
    expect(resamplePcmForPlaybackRate(input, Number.NaN)).toBe(input);
  });
});

describe("VoiceAgentService TTS LiveKit framing", () => {
  it("backs off repeated LiveKit reconnect failures instead of retrying every second", async () => {
    vi.useFakeTimers();
    try {
      const agent = new VoiceAgentService("game_1", config);
      const connect = vi
        .spyOn(agent, "connect")
        .mockRejectedValue(new Error("rate limited"));

      (agent as any).scheduleReconnect("first failure");
      await vi.advanceTimersByTimeAsync(1_000);
      expect(connect).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1_000);
      expect(connect).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1_000);
      expect(connect).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("abandons GM audio playback when the audio source hangs", async () => {
    vi.useFakeTimers();
    try {
      const agent = new VoiceAgentService("game_1", config);
      (agent as any).playAudioFilesImpl = vi.fn(
        () => new Promise<boolean>(() => undefined)
      );
      const completed = vi.fn();

      void agent.playAudioFiles(["/tmp/narration.mp3"]).then(completed);
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(90_000);

      expect(completed).toHaveBeenCalledWith(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("writes TTS PCM as small audio frames before waiting for playout", async () => {
    const agent = new VoiceAgentService("game_1", config);
    const calls: string[] = [];
    const frames: Array<{ samplesPerChannel: number; sampleRate: number }> = [];
    (agent as any).audioSource = {
      captureFrame: vi.fn(async (frame) => {
        calls.push("capture");
        frames.push({
          samplesPerChannel: frame.samplesPerChannel,
          sampleRate: frame.sampleRate,
        });
      }),
      waitForPlayout: vi.fn(async () => {
        calls.push("playout");
      }),
      queuedDuration: 0,
    };

    await expect(
      (agent as any).publishTtsPcm(
        Int16Array.from({ length: 1000 }, (_, index) => index),
        16000
      )
    ).resolves.toBe(true);

    expect(frames).toHaveLength(4);
    expect(frames.map((frame) => frame.samplesPerChannel)).toEqual([
      320, 320, 320, 40,
    ]);
    expect(frames.every((frame) => frame.sampleRate === 16000)).toBe(true);
    expect(calls).toEqual(["capture", "capture", "capture", "capture", "playout"]);
  });

  it("reports speech progress from TTS alignment after matching audio is captured", async () => {
    const agent = new VoiceAgentService("game_1", config);
    const progress: string[] = [];
    (agent as any).connect = vi.fn(async () => {
      (agent as any).connected = true;
    });
    (agent as any).audioSource = {
      captureFrame: vi.fn(async () => undefined),
      waitForPlayout: vi.fn(async () => undefined),
      queuedDuration: 0,
    };
    (agent as any).createTtsClient = vi.fn((opts) => ({
      connect: vi.fn(async () => undefined),
      synthesize: vi.fn(async () => {
        opts.onAlignment?.({
          normalizedAlignment: {
            chars: ["我", "先", "说"],
            charStartTimesMs: [0, 180, 360],
            charDurationsMs: [120, 120, 120],
          },
        });
        opts.onAudioChunk?.(Buffer.alloc(16_000), 16_000);
        opts.onAlignment?.({
          normalizedAlignment: {
            chars: ["结", "论"],
            charStartTimesMs: [0, 120],
            charDurationsMs: [120, 120],
          },
        });
        opts.onAudioChunk?.(Buffer.alloc(8_000), 16_000);
      }),
      close: vi.fn(),
    }));

    await expect(
      agent.speak("我先说结论", "player_1", 1, {
        onSpeechProgress: (text) => progress.push(text),
      })
    ).resolves.toBe(true);

    expect(progress).toEqual(["我先说", "我先说结论"]);
  });

  it("retries TTS synthesis once after a transient websocket failure", async () => {
    const agent = new VoiceAgentService("game_1", config);
    const attempts: Array<{ connect: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> }> = [];
    (agent as any).connect = vi.fn(async () => {
      (agent as any).connected = true;
    });
    (agent as any).audioSource = {
      captureFrame: vi.fn(async () => undefined),
      waitForPlayout: vi.fn(async () => undefined),
      queuedDuration: 0,
    };
    (agent as any).createTtsClient = vi.fn(() => {
      const attempt = {
        connect: vi.fn(async () => undefined),
        synthesize: attempts.length === 0
          ? vi.fn(async () => {
              throw new Error("temporary tts failure");
            })
          : vi.fn(async () => undefined),
        close: vi.fn(),
      };
      attempts.push(attempt);
      return attempt;
    });

    await expect((agent as any).speakImplInner("天黑请闭眼")).resolves.toBe(false);

    expect(attempts).toHaveLength(2);
    expect(attempts[0]!.close).toHaveBeenCalled();
    expect(attempts[1]!.close).toHaveBeenCalled();
  });
});
