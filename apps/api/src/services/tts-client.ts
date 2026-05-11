import WebSocket from "ws";

export type TtsOutputFormat =
  | "mp3_44100_128"
  | "mp3_22050_64"
  | "opus_48k_128"
  | "pcm_16000";

export interface TtsClientOptions {
  apiBaseUrl: string; // e.g. https://un-server.dev-excel-alt.pagepeek.org/api
  agentId: string;
  apiKey: string;
  /**
   * Invoked for each non-empty audio chunk, decoded from the `audio` base64
   * field. The first argument is the raw audio bytes in the requested
   * `outputFormat`; the second is the inferred sample rate where one is
   * implied by the format (e.g. 16000 for pcm_16000). For non-PCM formats
   * sampleRate is `null` and callers must decode the codec themselves.
   */
  onAudioChunk?: (chunk: Buffer, sampleRate: number | null) => void;
  onAlignment?: (event: Record<string, unknown>) => void;
  onError?: (error: string) => void;
}

export interface TtsSynthesizeOptions {
  /** @default "pcm_16000" — request raw PCM 16kHz mono s16le so we can
   *  pipe directly into a LiveKit AudioSource without an MP3 decoder. */
  outputFormat?: TtsOutputFormat;
  modelId?: string;
  voiceId?: string;
  voiceSettings?: Record<string, unknown>;
  generationConfig?: { chunk_length_schedule?: number[] };
  flush?: boolean;
  /** @default 30_000 */
  timeoutMs?: number;
}

const DEFAULT_OUTPUT_FORMAT: TtsOutputFormat = "pcm_16000";

function sampleRateFor(format: TtsOutputFormat): number | null {
  switch (format) {
    case "pcm_16000":
      return 16000;
    case "mp3_22050_64":
      return 22050;
    case "mp3_44100_128":
      return 44100;
    case "opus_48k_128":
      return 48000;
    default:
      return null;
  }
}

/**
 * TTS WebSocket client for the Unseal agent gateway.
 *
 * Strict contract (per docs/agent-stt-tts-integration.md):
 *   - Frames must be JSON text; plain text and binary frames are rejected.
 *   - `text` must be non-empty.
 *   - `output_format` defaults to pcm_16000 server-side; we request it
 *     explicitly so the response is plain PCM rather than encoded audio.
 *   - Unknown fields are rejected — only send the documented options.
 *
 * Server -> Client:
 *   { audio: "<base64>", isFinal: bool, alignment, normalizedAlignment }
 *   { type: "error", error }
 */
export class TtsWebSocketClient {
  private ws: WebSocket | null = null;
  private opts: TtsClientOptions;
  private currentRequest: {
    resolve: () => void;
    reject: (err: Error) => void;
    timer: NodeJS.Timeout | null;
    sampleRate: number | null;
  } | null = null;

  constructor(opts: TtsClientOptions) {
    this.opts = opts;
  }

  get isOpen(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  async connect(): Promise<void> {
    const wsUrl = this.buildWsUrl();
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl, {
        headers: { "x-api-key": this.opts.apiKey },
      });
      this.ws = ws;

      const onOpen = () => {
        cleanupHandshake();
        resolve();
      };
      const onError = (err: Error) => {
        cleanupHandshake();
        reject(err);
      };
      const cleanupHandshake = () => {
        ws.off("open", onOpen);
        ws.off("error", onError);
      };

      ws.once("open", onOpen);
      ws.once("error", onError);

      ws.on("message", (data) => this.handleMessage(data));
      ws.on("close", () => this.handleClose());
    });
  }

  /**
   * Send a `{ text, output_format, ... }` payload and resolve once a final
   * audio event (isFinal=true) arrives or the timeout elapses. Audio chunks
   * stream in via `onAudioChunk` before resolution.
   */
  synthesize(text: string, opts: TtsSynthesizeOptions = {}): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) return Promise.resolve();
    if (!this.isOpen) {
      return Promise.reject(new Error("TTS websocket is not connected"));
    }
    if (this.currentRequest) {
      return Promise.reject(
        new Error("TTS websocket already has a pending synthesize request")
      );
    }

    const outputFormat = opts.outputFormat ?? DEFAULT_OUTPUT_FORMAT;
    const timeoutMs = opts.timeoutMs ?? 30_000;
    const sampleRate = sampleRateFor(outputFormat);

    const payload: Record<string, unknown> = {
      text: trimmed,
      output_format: outputFormat,
    };
    if (opts.modelId) payload.model_id = opts.modelId;
    if (opts.voiceId) payload.voice_id = opts.voiceId;
    if (opts.voiceSettings) payload.voice_settings = opts.voiceSettings;
    if (opts.generationConfig) payload.generation_config = opts.generationConfig;
    if (opts.flush !== undefined) payload.flush = opts.flush;

    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (!this.currentRequest) return;
        const req = this.currentRequest;
        this.currentRequest = null;
        req.resolve();
      }, timeoutMs);
      this.currentRequest = { resolve, reject, timer, sampleRate };
      this.send(payload);
    });
  }

  close(): void {
    if (this.currentRequest) {
      if (this.currentRequest.timer) clearTimeout(this.currentRequest.timer);
      this.currentRequest.resolve();
      this.currentRequest = null;
    }
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close();
    }
    this.ws = null;
  }

  private buildWsUrl(): string {
    const httpUrl = `${this.opts.apiBaseUrl}/agents/${encodeURIComponent(
      this.opts.agentId
    )}/tts/synthesize/ws`;
    return toWsUrl(httpUrl);
  }

  private send(obj: unknown): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(obj));
  }

  private handleMessage(raw: WebSocket.RawData): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (!parsed || typeof parsed !== "object") return;
    const msg = parsed as Record<string, unknown>;

    if (msg.type === "error") {
      const err = String(msg.error ?? "unknown");
      if (this.opts.onError) this.opts.onError(err);
      if (this.currentRequest) {
        if (this.currentRequest.timer) clearTimeout(this.currentRequest.timer);
        const req = this.currentRequest;
        this.currentRequest = null;
        req.reject(new Error(err));
      }
      return;
    }

    if (typeof msg.audio === "string" && msg.audio.length > 0) {
      const chunk = Buffer.from(msg.audio, "base64");
      if (chunk.byteLength > 0 && this.opts.onAudioChunk) {
        const rate = this.currentRequest?.sampleRate ?? null;
        this.opts.onAudioChunk(chunk, rate);
      }
    }

    if (
      (typeof msg.alignment === "object" && msg.alignment !== null) ||
      (typeof msg.normalizedAlignment === "object" &&
        msg.normalizedAlignment !== null)
    ) {
      if (this.opts.onAlignment) this.opts.onAlignment(msg);
    }

    if (msg.isFinal === true || msg.is_final === true) {
      if (this.currentRequest) {
        if (this.currentRequest.timer) clearTimeout(this.currentRequest.timer);
        const req = this.currentRequest;
        this.currentRequest = null;
        req.resolve();
      }
    }
  }

  private handleClose(): void {
    if (this.currentRequest) {
      if (this.currentRequest.timer) clearTimeout(this.currentRequest.timer);
      const req = this.currentRequest;
      this.currentRequest = null;
      req.resolve();
    }
  }
}

function toWsUrl(httpUrl: string): string {
  if (httpUrl.startsWith("https://")) {
    return "wss://" + httpUrl.slice("https://".length);
  }
  if (httpUrl.startsWith("http://")) {
    return "ws://" + httpUrl.slice("http://".length);
  }
  return httpUrl;
}
