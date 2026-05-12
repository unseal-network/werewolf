import {
  AudioFrame,
  AudioResampler,
  AudioResamplerQuality,
  AudioSource,
  AudioStream,
  LocalAudioTrack,
  RemoteTrack,
  Room,
  RoomEvent,
  TrackKind,
  TrackPublishOptions,
  TrackSource,
} from "@livekit/rtc-node";
import { AccessToken } from "livekit-server-sdk";
import { SttWebSocketClient } from "./stt-client";
import { TtsWebSocketClient, type TtsOutputFormat } from "./tts-client";
import { resamplePcmForPlaybackRate } from "./voice-audio";

const STT_TARGET_SAMPLE_RATE = 16000;
const TTS_OUTPUT_FORMAT: TtsOutputFormat = "pcm_16000";
const TTS_AUDIO_SOURCE_SAMPLE_RATE = 16000;
const TTS_AUDIO_SOURCE_CHANNELS = 1;
const AGENT_VOICE_TRACK_NAME = "agent-voice";
const TTS_CONNECT_TIMEOUT_MS = 5000;
const TTS_SYNTH_TIMEOUT_MS = 30_000;
const LIVEKIT_RECONNECT_DELAY_MS = 1000;
const LIVEKIT_CONNECT_TIMEOUT_MS = 7000;

export interface VoiceAgentConfig {
  livekitUrl: string;
  livekitApiKey: string;
  livekitApiSecret: string;
  unsealApiBaseUrl: string;
  unsealApiKey: string;
  unsealAgentId: string; // fallback agent ID for STT/TTS when a player has no registered agent ID
}

interface PlayerSttSession {
  client: SttWebSocketClient;
  resampler: AudioResampler | null;
  resamplerInputRate: number;
  /** Last successfully sent PCM chunk; we reuse it to send the
   *  required non-empty `commit=true` final chunk when the speech turn
   *  ends. The server rejects empty commit control frames. */
  lastSentChunk: Int16Array | null;
  active: boolean;
}

/**
 * VoiceAgentService bridges a LiveKit room (audio I/O) with the Unseal
 * STT/TTS WebSocket endpoints. One instance per game room.
 *
 *  • Subscribes to every human player's microphone track
 *  • Streams their audio to STT WS (resampled to 16 kHz mono PCM s16le)
 *  • Accumulates committed transcripts per playerId in an internal buffer
 *  • Exposes flushPlayerTranscript(playerId) to send the final commit chunk
 *    and drain the buffer at speech end
 *  • Publishes a single shared "agent voice" track at 16 kHz mono — TTS
 *    chunks (requested as pcm_16000) are pushed straight into it without
 *    any decoding
 *  • speak(text) waits until the audio has had time to play out before
 *    resolving, so the caller can advance to the next speaker only after
 *    the agent has finished speaking
 */
export class VoiceAgentService {
  private room: Room | null = null;
  private config: VoiceAgentConfig;
  private gameRoomId: string;
  private audioSource: AudioSource | null = null;
  private agentTrack: LocalAudioTrack | null = null;
  private playerSessions = new Map<string, PlayerSttSession>();
  /** Per-player agent ID lookup. STT for player X and TTS when agent X speaks
   *  should hit the same agent_id we already use for the LLM (typically the
   *  player's matrix ID). Falls back to config.unsealAgentId when missing. */
  private playerAgentIds = new Map<string, string>();
  private connected = false;
  private connectPromise: Promise<void> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalDisconnect = false;
  /** Serializes speak() so two simultaneous utterances don't interleave
   *  PCM into the shared audio track. */
  private speakQueue: Promise<void> = Promise.resolve();

  constructor(gameRoomId: string, config: VoiceAgentConfig) {
    this.gameRoomId = gameRoomId;
    this.config = config;
  }

  /**
   * Register the Unseal agent_id for a player. STT calls for this player's
   * audio and TTS calls when this player speaks will both use this id. Should
   * be set to the same id we pass to the LLM `generate` endpoint (typically
   * `player.userId ?? player.agentId ?? player.displayName`).
   */
  registerPlayerAgentId(playerId: string, agentId: string): void {
    if (!playerId || !agentId) return;
    this.playerAgentIds.set(playerId, agentId);
  }

  unregisterPlayerAgentId(playerId: string): void {
    this.playerAgentIds.delete(playerId);
  }

  private resolveAgentId(playerId?: string | null): string {
    if (playerId) {
      const registered = this.playerAgentIds.get(playerId);
      if (registered) return registered;
    }
    return this.config.unsealAgentId;
  }

  async connect(): Promise<void> {
    if (this.connected && this.room && this.audioSource) return;
    if (this.connectPromise) return this.connectPromise;
    this.connectPromise = this.connectInner().finally(() => {
      this.connectPromise = null;
    });
    return this.connectPromise;
  }

  private async connectInner(): Promise<void> {
    this.intentionalDisconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    const at = new AccessToken(this.config.livekitApiKey, this.config.livekitApiSecret, {
      identity: `voice-agent:${this.gameRoomId}`,
      name: "Voice Agent",
      ttl: "24h",
    });
    at.addGrant({
      room: this.gameRoomId,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });
    const token = await at.toJwt();
    const room = new Room();
    this.room = room;
    room.on(RoomEvent.Disconnected, () => {
      this.connected = false;
      this.audioSource = null;
      this.agentTrack = null;
      if (!this.intentionalDisconnect) {
        this.scheduleReconnect("LiveKit room disconnected");
      }
    });
    room.on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
      if (track.kind !== TrackKind.KIND_AUDIO) return;
      const identity = participant.identity;
      if (identity.startsWith("voice-agent:")) return;
      void this.handlePlayerTrack(identity, track as RemoteTrack);
    });
    try {
      await withTimeout(
        room.connect(this.config.livekitUrl, token, {
          autoSubscribe: true,
          dynacast: false,
        }),
        LIVEKIT_CONNECT_TIMEOUT_MS,
        "LiveKit voice-agent connect timed out"
      );
      this.connected = true;

      const source = new AudioSource(
        TTS_AUDIO_SOURCE_SAMPLE_RATE,
        TTS_AUDIO_SOURCE_CHANNELS
      );
      this.audioSource = source;
      const track = LocalAudioTrack.createAudioTrack(AGENT_VOICE_TRACK_NAME, source);
      this.agentTrack = track;
      const opts = new TrackPublishOptions();
      opts.source = TrackSource.SOURCE_MICROPHONE;
      if (!room.localParticipant) {
        throw new Error("LiveKit local participant unavailable after connect");
      }
      await room.localParticipant.publishTrack(track, opts);
    } catch (err) {
      this.connected = false;
      this.audioSource = null;
      this.agentTrack = null;
      try {
        await room.disconnect();
      } catch {
        // ignore
      }
      if (this.room === room) this.room = null;
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    this.intentionalDisconnect = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    for (const session of this.playerSessions.values()) {
      session.active = false;
      session.client.close();
    }
    this.playerSessions.clear();
    if (this.agentTrack) {
      await this.agentTrack.close();
      this.agentTrack = null;
    }
    this.audioSource = null;
    if (this.room) {
      await this.room.disconnect();
      this.room = null;
    }
    this.connected = false;
    this.connectPromise = null;
  }

  /**
   * Send the required final non-empty audio chunk with commit=true, then
   * wait for the server's last committed_transcript event. Returns the
   * concatenated text and resets the buffer.
   */
  async flushPlayerTranscript(playerId: string, gracePeriodMs = 3000): Promise<string> {
    const session = this.playerSessions.get(playerId);
    if (!session) return "";

    if (session.lastSentChunk && session.lastSentChunk.length > 0) {
      try {
        session.client.sendFinalAudio(session.lastSentChunk, STT_TARGET_SAMPLE_RATE);
      } catch (err) {
        console.error("[VoiceAgent] sendFinalAudio failed:", err);
      }
    } else {
      // No audio ever sent — nothing to commit. Skip the grace wait and
      // return whatever (likely empty) transcript we have.
      return session.client.transcriptText;
    }

    let text = "";
    try {
      text = await session.client.flush(gracePeriodMs);
    } catch (err) {
      console.error("[VoiceAgent] flush failed:", err);
      text = session.client.transcriptText;
    }
    session.client.resetBuffer();
    session.lastSentChunk = null;
    return text;
  }

  resetPlayerTranscript(playerId: string): void {
    const session = this.playerSessions.get(playerId);
    if (!session) return;
    session.client.resetBuffer();
    session.lastSentChunk = null;
  }

  /**
   * Synthesize speech, stream PCM into the shared agent voice track, and
   * resolve only after the audio has had enough time to play out.
   *
   * Concurrent calls are queued so the shared track plays one utterance
   * at a time.
   *
   * `playerId` selects the Unseal agent_id for TTS (per-player voice); when
   * omitted the registry's fallback agent_id is used.
   */
  async speak(
    text: string,
    playerId?: string | null,
    playbackRate = 1
  ): Promise<void> {
    const next = this.speakQueue.then(() =>
      this.speakImpl(text, playerId, playbackRate)
    );
    this.speakQueue = next.catch(() => undefined);
    return next;
  }

  /**
   * Hard ceiling on a single speak() call. The TTS WebSocket has its own short
   * timeout, but the LiveKit native AudioSource can occasionally hang on
   * captureFrame (e.g., transient SFU connection issues), and we MUST NOT let
   * a single stuck utterance block the speakQueue forever — every subsequent
   * agent turn chains off speakQueue and would stall the whole game.
   */
  private static readonly SPEAK_HARD_TIMEOUT_MS = 90_000;

  private async speakImpl(
    text: string,
    playerId?: string | null,
    playbackRate = 1
  ): Promise<void> {
    const inner = this.speakImplInner(text, playerId, playbackRate);
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<void>((resolve) => {
      timeoutId = setTimeout(() => {
        console.error(
          `[VoiceAgent] speak hard timeout (${VoiceAgentService.SPEAK_HARD_TIMEOUT_MS}ms) — abandoning utterance for ${playerId ?? "unknown"}`
        );
        resolve();
      }, VoiceAgentService.SPEAK_HARD_TIMEOUT_MS);
    });
    try {
      await Promise.race([inner, timeout]);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  private async speakImplInner(
    text: string,
    playerId?: string | null,
    playbackRate = 1
  ): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) return;
    try {
      await this.connect();
    } catch (err) {
      console.error("[VoiceAgent] reconnect before speak failed:", err);
      this.scheduleReconnect("speak connect failed");
      return;
    }
    if (!this.connected || !this.audioSource) {
      this.scheduleReconnect("speak without connected audio source");
      return;
    }

    let publishedSamples = 0;
    const sampleRate = TTS_AUDIO_SOURCE_SAMPLE_RATE; // we always request pcm_16000
    // Serialize captureFrame calls — the LiveKit rtc-node AudioSource native
    // FFI rejects concurrent captures with "InvalidState - failed to capture
    // frame", so we feed PCM chunks one at a time through a Promise chain.
    let captureChain: Promise<void> = Promise.resolve();

    const ttsClient = new TtsWebSocketClient({
      apiBaseUrl: this.config.unsealApiBaseUrl,
      agentId: this.resolveAgentId(playerId),
      apiKey: this.config.unsealApiKey,
      connectTimeoutMs: TTS_CONNECT_TIMEOUT_MS,
      onAudioChunk: (chunk, frameRate) => {
        const rate = frameRate ?? sampleRate;
        const int16Length = Math.floor(chunk.byteLength / Int16Array.BYTES_PER_ELEMENT);
        if (int16Length <= 0) return;
        // Copy out — chunk.buffer is shared and may be reused.
        const int16 = new Int16Array(int16Length);
        for (let i = 0; i < int16Length; i += 1) {
          int16[i] = chunk.readInt16LE(i * Int16Array.BYTES_PER_ELEMENT);
        }
        const playbackSamples = resamplePcmForPlaybackRate(int16, playbackRate);
        captureChain = captureChain
          .then(async () => {
            const cap = this.publishTtsPcm(playbackSamples, rate);
            if (cap && (await cap)) {
              publishedSamples += playbackSamples.length;
            }
          })
          .catch(() => undefined);
      },
      onError: (err) => console.error("[VoiceAgent] TTS error:", err),
    });

    try {
      await ttsClient.connect();
      await ttsClient.synthesize(trimmed, {
        outputFormat: TTS_OUTPUT_FORMAT,
        modelId: "eleven_multilingual_v2",
        flush: true,
        timeoutMs: TTS_SYNTH_TIMEOUT_MS,
      });
      // Wait for the serialized capture chain so every PCM frame is queued in
      // the AudioSource before we begin the duration wait below.
      await captureChain;
    } catch (err) {
      console.error("[VoiceAgent] speak failed:", err);
    } finally {
      ttsClient.close();
    }

    // Block the queue until the audio has had time to play out so that
    // the game-service caller doesn't advance to the next speaker while
    // the previous agent is still speaking.
    if (publishedSamples > 0) {
      const audioMs = (publishedSamples / sampleRate) * 1000;
      // `captureFrame` only tells us the frame was accepted by LiveKit; it
      // does not prove remote clients have played the queued PCM. Drain from
      // the end of capture instead of subtracting TTS generation time, or the
      // game can advance to voting while the final utterance is still audible.
      const tailMs = 500;
      const waitMs = audioMs + tailMs;
      if (waitMs > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
      }
    }
  }

  private async handlePlayerTrack(playerId: string, track: RemoteTrack): Promise<void> {
    const prior = this.playerSessions.get(playerId);
    if (prior) {
      prior.active = false;
      prior.client.close();
      this.playerSessions.delete(playerId);
    }

    const sttClient = new SttWebSocketClient({
      apiBaseUrl: this.config.unsealApiBaseUrl,
      agentId: this.resolveAgentId(playerId),
      apiKey: this.config.unsealApiKey,
      onError: (err) => console.error(`[VoiceAgent] STT error for ${playerId}:`, err),
    });
    try {
      await sttClient.connect();
    } catch (err) {
      console.error(`[VoiceAgent] STT connect failed for ${playerId}:`, err);
      return;
    }
    const session: PlayerSttSession = {
      client: sttClient,
      resampler: null,
      resamplerInputRate: 0,
      lastSentChunk: null,
      active: true,
    };
    this.playerSessions.set(playerId, session);

    const stream = new AudioStream(track);
    const reader = stream.getReader();
    try {
      while (true) {
        const { value: frame, done } = await reader.read();
        if (done) break;
        if (!frame) continue;
        if (!session.active) continue;
        if (frame.channels !== 1) continue;
        for (const out of this.resampleToStt(session, frame)) {
          if (out.data.length === 0) continue;
          if (session.client.sendAudio(out.data, STT_TARGET_SAMPLE_RATE)) {
            session.lastSentChunk = out.data;
          }
        }
      }
    } catch (err) {
      console.error(`[VoiceAgent] audio stream error for ${playerId}:`, err);
    } finally {
      try {
        reader.releaseLock();
      } catch {
        // ignore
      }
      if (session.resampler) {
        try {
          for (const out of session.resampler.flush()) {
            if (out.data.length === 0) continue;
            if (session.client.sendAudio(out.data, STT_TARGET_SAMPLE_RATE)) {
              session.lastSentChunk = out.data;
            }
          }
        } catch (err) {
          console.error(`[VoiceAgent] resampler flush failed for ${playerId}:`, err);
        }
      }
      session.client.close();
      this.playerSessions.delete(playerId);
    }
  }

  private resampleToStt(
    session: PlayerSttSession,
    frame: AudioFrame
  ): AudioFrame[] {
    if (frame.sampleRate === STT_TARGET_SAMPLE_RATE) {
      return [frame];
    }
    if (!session.resampler || session.resamplerInputRate !== frame.sampleRate) {
      session.resampler = new AudioResampler(
        frame.sampleRate,
        STT_TARGET_SAMPLE_RATE,
        1,
        AudioResamplerQuality.MEDIUM
      );
      session.resamplerInputRate = frame.sampleRate;
    }
    return session.resampler.push(frame);
  }

  private publishTtsPcm(
    samples: Int16Array,
    sampleRate: number
  ): Promise<boolean> | null {
    if (!this.audioSource || samples.length === 0) return null;
    const frame = new AudioFrame(
      samples,
      sampleRate,
      TTS_AUDIO_SOURCE_CHANNELS,
      samples.length
    );
    return this.audioSource
      .captureFrame(frame)
      .then(() => true)
      .catch((err) => {
        console.error("[VoiceAgent] captureFrame error:", err);
        this.connected = false;
        this.audioSource = null;
        this.scheduleReconnect("TTS captureFrame failed");
        return false;
      });
  }

  private scheduleReconnect(reason: string): void {
    if (this.intentionalDisconnect || this.reconnectTimer) return;
    console.error(`[VoiceAgent] scheduling reconnect: ${reason}`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch((err) => {
        console.error("[VoiceAgent] reconnect failed:", err);
        this.scheduleReconnect("reconnect failed");
      });
    }, LIVEKIT_RECONNECT_DELAY_MS);
  }
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

/** One VoiceAgentService per game room. */
export class VoiceAgentRegistry {
  private agents = new Map<string, VoiceAgentService>();

  constructor(private config: VoiceAgentConfig) {}

  async getOrCreate(gameRoomId: string): Promise<VoiceAgentService> {
    let agent = this.agents.get(gameRoomId);
    if (!agent) {
      agent = new VoiceAgentService(gameRoomId, this.config);
      this.agents.set(gameRoomId, agent);
      try {
        await agent.connect();
      } catch (err) {
        this.agents.delete(gameRoomId);
        throw err;
      }
    }
    return agent;
  }

  async destroy(gameRoomId: string): Promise<void> {
    const agent = this.agents.get(gameRoomId);
    if (!agent) return;
    this.agents.delete(gameRoomId);
    await agent.disconnect();
  }

  get(gameRoomId: string): VoiceAgentService | null {
    return this.agents.get(gameRoomId) ?? null;
  }
}
