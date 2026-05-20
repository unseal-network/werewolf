import WebSocket from "ws";

export interface SttClientOptions {
  apiBaseUrl: string; // e.g. https://un-server.dev-excel-alt.pagepeek.org/api
  agentId: string;
  apiKey: string;
  /** @default 5000 */
  connectTimeoutMs?: number;
  /** @default 1 */
  maxConnectAttempts?: number;
  webSocketFactory?: (
    url: string,
    opts: { headers: Record<string, string> }
  ) => WebSocket;
  onCommittedTranscript?: (text: string) => void;
  onPartialTranscript?: (text: string) => void;
  onError?: (error: string) => void;
}

/**
 * STT WebSocket client for the Unseal agent gateway.
 *
 * Strict contract (per docs/agent-stt-tts-integration.md):
 *   - Only text frames containing JSON; binary frames rejected.
 *   - audio_base_64 must be non-empty base64 PCM s16le (no data URI, no whitespace).
 *   - sample_rate defaults to 16000 when omitted.
 *   - commit=true ONLY on the final non-empty audio chunk.
 *   - Empty-audio commit control frames are NOT supported by the server.
 *
 * Server -> Client events (JSON text frames):
 *   { message_type: "session_started", session_id, config }
 *   { message_type: "partial_transcript", text }
 *   { message_type: "committed_transcript", text }
 *   { message_type: "committed_transcript_with_timestamps", text, ... }
 *   { type: "error", error }
 *
 * Usage:
 *   await client.connect();
 *   client.sendAudio(int16, 16000);              // intermediate, commit=false
 *   ...
 *   client.sendFinalAudio(lastInt16, 16000);     // final non-empty chunk, commit=true
 *   const text = await client.flush();           // wait for transcript drain
 *   client.close();
 */
export class SttWebSocketClient {
  private ws: WebSocket | null = null;
  private opts: SttClientOptions;
  private committedSegments: string[] = [];
  private latestPartial = "";
  private pendingFlush: {
    resolve: (value: string) => void;
    timer: NodeJS.Timeout | null;
  } | null = null;

  constructor(opts: SttClientOptions) {
    this.opts = opts;
  }

  get transcriptText(): string {
    return this.committedSegments
      .map((segment) => segment.trim())
      .filter(Boolean)
      .join(" ");
  }

  get partialText(): string {
    return this.latestPartial;
  }

  get isOpen(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  async connect(): Promise<void> {
    const attempts = Math.max(1, this.opts.maxConnectAttempts ?? 1);
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        await this.connectOnce();
        return;
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  private async connectOnce(): Promise<void> {
    const wsUrl = this.buildWsUrl();
    return new Promise((resolve, reject) => {
      const factory =
        this.opts.webSocketFactory ??
        ((url: string, opts: { headers: Record<string, string> }) =>
          new WebSocket(url, opts));
      const ws = factory(wsUrl, {
        headers: { "x-api-key": this.opts.apiKey },
      });
      this.ws = ws;
      const timer = setTimeout(() => {
        cleanupHandshake();
        try {
          ws.terminate();
        } catch {
          // ignore
        }
        if (this.ws === ws) this.ws = null;
        reject(new Error("STT websocket connect timed out"));
      }, this.opts.connectTimeoutMs ?? 5000);

      const onOpen = () => {
        cleanupHandshake();
        resolve();
      };
      const onError = (err: Error) => {
        cleanupHandshake();
        if (this.ws === ws) this.ws = null;
        reject(err);
      };
      const cleanupHandshake = () => {
        clearTimeout(timer);
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
   * Send an intermediate PCM s16le chunk. Returns false if the WS is closed
   * or the chunk is empty (the server rejects empty chunks). The chunk must
   * be at the caller-declared `sampleRate` — no resampling happens here.
   */
  sendAudio(pcm: Int16Array, sampleRate = 16000): boolean {
    if (!this.isOpen) return false;
    if (pcm.length === 0) return false;
    this.send({
      message_type: "input_audio_chunk",
      audio_base_64: encodePcm(pcm),
      sample_rate: sampleRate,
      commit: false,
    });
    return true;
  }

  /**
   * Send the final non-empty PCM chunk with commit=true to ask the server
   * to commit the transcript. The chunk must be non-empty; empty commit
   * control frames are not supported by the server.
   *
   * Returns false if the chunk is empty or WS is closed.
   */
  sendFinalAudio(pcm: Int16Array, sampleRate = 16000): boolean {
    if (!this.isOpen) return false;
    if (pcm.length === 0) return false;
    this.send({
      message_type: "input_audio_chunk",
      audio_base_64: encodePcm(pcm),
      sample_rate: sampleRate,
      commit: true,
    });
    return true;
  }

  /**
   * Wait briefly for any pending committed transcripts to arrive. Resolves
   * with the latest concatenated transcript text. Falls back to the latest
   * partial if nothing was committed within the grace window.
   *
   * NOTE: This does NOT send any audio frame. The caller should send a
   * `sendFinalAudio(...)` first so the server has a non-empty chunk to
   * commit on.
   */
  flush(gracePeriodMs = 3000): Promise<string> {
    return new Promise((resolve) => {
      if (this.pendingFlush) {
        if (this.pendingFlush.timer) clearTimeout(this.pendingFlush.timer);
        this.pendingFlush.resolve(this.transcriptText || this.latestPartial.trim());
        this.pendingFlush = null;
      }
      const finish = () => {
        if (!this.pendingFlush) return;
        if (this.pendingFlush.timer) clearTimeout(this.pendingFlush.timer);
        const text = this.transcriptText || this.latestPartial.trim();
        this.pendingFlush.resolve(text);
        this.pendingFlush = null;
      };
      const timer = setTimeout(finish, gracePeriodMs);
      this.pendingFlush = { resolve, timer };
    });
  }

  resetBuffer(): void {
    this.committedSegments = [];
    this.latestPartial = "";
  }

  close(): void {
    if (this.pendingFlush) {
      if (this.pendingFlush.timer) clearTimeout(this.pendingFlush.timer);
      this.pendingFlush.resolve(this.transcriptText || this.latestPartial.trim());
      this.pendingFlush = null;
    }
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close();
    }
    this.ws = null;
  }

  private buildWsUrl(): string {
    const httpUrl = `${this.opts.apiBaseUrl}/agents/${encodeURIComponent(
      this.opts.agentId
    )}/stt/transcribe/ws`;
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
      return;
    }

    const messageType =
      typeof msg.message_type === "string" ? msg.message_type : "";
    const text = typeof msg.text === "string" ? msg.text.trim() : "";

    switch (messageType) {
      case "partial_transcript": {
        this.latestPartial = text;
        if (text && this.opts.onPartialTranscript) {
          this.opts.onPartialTranscript(text);
        }
        break;
      }
      case "committed_transcript":
      case "committed_transcript_with_timestamps": {
        if (text) {
          this.recordCommittedTranscript(text);
          this.latestPartial = "";
          if (this.opts.onCommittedTranscript) {
            this.opts.onCommittedTranscript(text);
          }
        }
        if (this.pendingFlush) {
          if (this.pendingFlush.timer) clearTimeout(this.pendingFlush.timer);
          this.pendingFlush.resolve(this.transcriptText);
          this.pendingFlush = null;
        }
        break;
      }
      default:
        break;
    }
  }

  private recordCommittedTranscript(text: string): void {
    const incoming = text.trim();
    if (!incoming) return;
    const existing = this.transcriptText.trim();
    if (!existing) {
      this.committedSegments = [incoming];
      return;
    }
    if (incoming === existing || existing.endsWith(incoming)) {
      return;
    }
    if (incoming.startsWith(existing)) {
      this.committedSegments = [incoming];
      return;
    }
    this.committedSegments.push(incoming);
  }

  private handleClose(): void {
    if (this.pendingFlush) {
      if (this.pendingFlush.timer) clearTimeout(this.pendingFlush.timer);
      this.pendingFlush.resolve(this.transcriptText || this.latestPartial.trim());
      this.pendingFlush = null;
    }
  }
}

function encodePcm(pcm: Int16Array): string {
  return Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength).toString(
    "base64"
  );
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
