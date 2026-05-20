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
import { readFile } from "node:fs/promises";
import { AccessToken } from "livekit-server-sdk";
import { MPEGDecoder } from "mpg123-decoder";
import { SttWebSocketClient } from "./stt-client";
import {
  TtsWebSocketClient,
  type TtsClientOptions,
  type TtsOutputFormat,
} from "./tts-client";
import { resamplePcmForPlaybackRate } from "./voice-audio";

const STT_TARGET_SAMPLE_RATE = 16000;
const TTS_OUTPUT_FORMAT: TtsOutputFormat = "pcm_16000";
const TTS_AUDIO_SOURCE_SAMPLE_RATE = 16000;
const TTS_AUDIO_SOURCE_CHANNELS = 1;
const TTS_AUDIO_FRAME_DURATION_MS = 20;
const TTS_AUDIO_SOURCE_QUEUE_MS = 120_000;
const AGENT_VOICE_TRACK_NAME = "agent-voice";
const TTS_CONNECT_TIMEOUT_MS = 5000;
const TTS_SYNTH_TIMEOUT_MS = 30_000;
const LIVEKIT_RECONNECT_INITIAL_DELAY_MS = 1000;
const LIVEKIT_RECONNECT_MAX_DELAY_MS = 30_000;
const LIVEKIT_CONNECT_TIMEOUT_MS = 30_000;
const LIVEKIT_PLAYOUT_TIMEOUT_GRACE_MS = 1000;
const STT_CONNECT_TIMEOUT_MS = 5000;
const STT_CONNECT_ATTEMPTS = 2;
const TTS_ATTEMPTS = 2;

export interface VoiceAgentConfig {
  livekitUrl: string;
  livekitApiKey: string;
  livekitApiSecret: string;
  unsealApiBaseUrl: string;
  unsealApiKey: string;
  unsealAgentId: string; // explicit fallback agent ID for TTS when no Matrix binding exists
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
  /** Transcript preserved after a microphone track has ended but before the
   * player clicks the button that completes the speech turn. */
  completedText: string;
}

export interface VoiceTranscriptUpdate {
  gameRoomId: string;
  playerId: string;
  text: string;
  final: boolean;
}

export interface VoicePlayerTrackUpdate {
  gameRoomId: string;
  playerId: string;
  matrixUserId: string;
  trackSid: string | null;
}

export type VoiceTranscriptHandler = (update: VoiceTranscriptUpdate) => void;
export type VoicePlayerTrackHandler = (update: VoicePlayerTrackUpdate) => void;
export type AgentSpeechProgressHandler = (text: string) => void;

export interface VoiceSpeakOptions {
  onSpeechProgress?: (text: string) => void;
}

interface PlayerVoiceIdentityBinding {
  playerId: string;
  matrixUserId: string;
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
 *  • speak(text) resolves after generated PCM has been framed into the LiveKit
 *    audio track and the local AudioSource playout queue has drained. The
 *    caller can then submit the speech turn without overlapping the next turn.
 */
export class VoiceAgentService {
  private room: Room | null = null;
  private config: VoiceAgentConfig;
  private gameRoomId: string;
  private audioSource: AudioSource | null = null;
  private agentTrack: LocalAudioTrack | null = null;
  private playerSessions = new Map<string, PlayerSttSession>();
  /** Matrix IDs are the external identity for LiveKit/Unseal. Internal
   *  player IDs stay inside game state and transcript attribution only. */
  private playerVoiceIdentityByPlayerId = new Map<string, PlayerVoiceIdentityBinding>();
  private playerVoiceIdentityByMatrixUserId = new Map<
    string,
    PlayerVoiceIdentityBinding
  >();
  private connected = false;
  private connectPromise: Promise<void> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private intentionalDisconnect = false;
  private transcriptHandler: VoiceTranscriptHandler | null = null;
  private playerTrackHandler: VoicePlayerTrackHandler | null = null;
  private activePlayerAudioTrackKeys = new Set<string>();
  /** Serializes speak() so two simultaneous utterances don't interleave
   *  PCM into the shared audio track. */
  private speakQueue: Promise<unknown> = Promise.resolve();
  private mp3Decoder: MPEGDecoder | null = null;

  constructor(gameRoomId: string, config: VoiceAgentConfig) {
    this.gameRoomId = gameRoomId;
    this.config = config;
  }

  setTranscriptHandler(handler: VoiceTranscriptHandler | null): void {
    this.transcriptHandler = handler;
  }

  setPlayerTrackHandler(handler: VoicePlayerTrackHandler | null): void {
    this.playerTrackHandler = handler;
  }

  /**
   * Register the Matrix identity for a player. LiveKit participants and
   * Unseal STT/TTS calls must use this external ID; `playerId` is only for
   * internal game attribution.
   */
  registerPlayerVoiceIdentity(playerId: string, matrixUserId: string): void {
    if (!playerId || !matrixUserId) return;
    const previous = this.playerVoiceIdentityByPlayerId.get(playerId);
    if (previous) {
      this.playerVoiceIdentityByMatrixUserId.delete(previous.matrixUserId);
    }
    const binding = { playerId, matrixUserId };
    this.playerVoiceIdentityByPlayerId.set(playerId, binding);
    this.playerVoiceIdentityByMatrixUserId.set(matrixUserId, binding);
    this.subscribeExistingPlayerAudioTracks();
  }

  unregisterPlayerVoiceIdentity(playerId: string): void {
    const previous = this.playerVoiceIdentityByPlayerId.get(playerId);
    if (previous) {
      this.playerVoiceIdentityByMatrixUserId.delete(previous.matrixUserId);
    }
    this.playerVoiceIdentityByPlayerId.delete(playerId);
  }

  private resolveMatrixUserIdForPlayer(playerId?: string | null): string | null {
    if (playerId) {
      const binding = this.playerVoiceIdentityByPlayerId.get(playerId);
      if (binding) return binding.matrixUserId;
    }
    return null;
  }

  private resolveTtsAgentId(playerId?: string | null): string {
    return this.resolveMatrixUserIdForPlayer(playerId) ?? this.config.unsealAgentId;
  }

  async connect(): Promise<void> {
    if (this.connected && this.room && this.audioSource) return;
    if (this.connectPromise) return this.connectPromise;
    const connectPromise = this.connectInner().finally(() => {
      this.connectPromise = null;
    });
    // Background reconnects must never become process-level unhandled
    // rejections if a caller misses a catch; callers still receive the same
    // rejecting promise returned below.
    connectPromise.catch(() => undefined);
    this.connectPromise = connectPromise;
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
    room.on(RoomEvent.TrackPublished, (publication, participant) => {
      if (publication.kind !== TrackKind.KIND_AUDIO) return;
      const identity = participant.identity;
      if (identity.startsWith("voice-agent:")) return;
      console.info("[VoiceAgent] remote audio published", {
        gameRoomId: this.gameRoomId,
        participantIdentity: identity,
        trackSid: publication.sid ?? null,
      });
      publication.setSubscribed(true);
      if (publication.track) {
        void this.handlePlayerTrack(identity, publication.track as RemoteTrack);
      }
    });
    room.on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
      if (track.kind !== TrackKind.KIND_AUDIO) return;
      const identity = participant.identity;
      if (identity.startsWith("voice-agent:")) return;
      console.info("[VoiceAgent] remote audio subscribed", {
        gameRoomId: this.gameRoomId,
        participantIdentity: identity,
        trackSid: _publication.sid ?? null,
      });
      void this.handlePlayerTrack(identity, track as RemoteTrack);
    });
    try {
      console.info("[VoiceAgent] connecting to LiveKit", {
        gameRoomId: this.gameRoomId,
      });
      await withTimeout(
        room.connect(this.config.livekitUrl, token, {
          autoSubscribe: true,
          dynacast: false,
        }),
        LIVEKIT_CONNECT_TIMEOUT_MS,
        "LiveKit voice-agent connect timed out"
      );
      this.connected = true;
      this.reconnectAttempt = 0;

      const source = new AudioSource(
        TTS_AUDIO_SOURCE_SAMPLE_RATE,
        TTS_AUDIO_SOURCE_CHANNELS,
        TTS_AUDIO_SOURCE_QUEUE_MS
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
      console.info("[VoiceAgent] published agent voice track", {
        gameRoomId: this.gameRoomId,
        participantIdentity: room.localParticipant.identity,
        trackName: AGENT_VOICE_TRACK_NAME,
      });
      this.subscribeExistingPlayerAudioTracks();
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
    this.reconnectAttempt = 0;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    for (const session of this.playerSessions.values()) {
      session.active = false;
      session.client.close();
    }
    this.playerSessions.clear();
    this.activePlayerAudioTrackKeys.clear();
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

    if (!session.active) {
      const text = session.completedText.trim();
      session.completedText = "";
      this.playerSessions.delete(playerId);
      return text;
    }

    if (session.lastSentChunk && session.lastSentChunk.length > 0) {
      try {
        session.client.sendFinalAudio(session.lastSentChunk, STT_TARGET_SAMPLE_RATE);
      } catch (err) {
        console.error("[VoiceAgent] sendFinalAudio failed:", err);
      }
    } else {
      // No audio ever sent — nothing to commit. Skip the grace wait and
      // return whatever (likely empty) transcript we have.
      const text = this.mergeTranscriptText(
        session.completedText,
        session.client.transcriptText || session.client.partialText
      );
      session.completedText = "";
      return text;
    }

    let text = "";
    try {
      text = await session.client.flush(gracePeriodMs);
    } catch (err) {
      console.error("[VoiceAgent] flush failed:", err);
      text = session.client.transcriptText || session.client.partialText;
    }
    text = this.mergeTranscriptText(session.completedText, text);
    session.completedText = "";
    session.client.resetBuffer();
    session.lastSentChunk = null;
    return text;
  }

  resetPlayerTranscript(playerId: string): void {
    const session = this.playerSessions.get(playerId);
    if (!session) return;
    session.client.resetBuffer();
    session.lastSentChunk = null;
    session.completedText = "";
    if (!session.active) {
      this.playerSessions.delete(playerId);
    }
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
    playbackRate = 1,
    options: VoiceSpeakOptions = {}
  ): Promise<boolean> {
    const next = this.speakQueue.then(() =>
      this.speakImpl(text, playerId, playbackRate, options)
    );
    this.speakQueue = next.catch(() => undefined);
    return next;
  }

  async playAudioFiles(filePaths: string[]): Promise<boolean> {
    const playable = filePaths.filter(Boolean);
    if (playable.length === 0) return false;
    const next = this.speakQueue.then(() => this.playAudioFilesWithTimeout(playable));
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

  private async playAudioFilesWithTimeout(filePaths: string[]): Promise<boolean> {
    const inner = this.playAudioFilesImpl(filePaths);
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<boolean>((resolve) => {
      timeoutId = setTimeout(() => {
        console.error(
          `[VoiceAgent] GM audio hard timeout (${VoiceAgentService.SPEAK_HARD_TIMEOUT_MS}ms) — abandoning narration`
        );
        resolve(false);
      }, VoiceAgentService.SPEAK_HARD_TIMEOUT_MS);
    });
    try {
      return await Promise.race([inner, timeout]);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  private async speakImpl(
    text: string,
    playerId?: string | null,
    playbackRate = 1,
    options: VoiceSpeakOptions = {}
  ): Promise<boolean> {
    const inner = this.speakImplInner(text, playerId, playbackRate, options);
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<boolean>((resolve) => {
      timeoutId = setTimeout(() => {
        console.error(
          `[VoiceAgent] speak hard timeout (${VoiceAgentService.SPEAK_HARD_TIMEOUT_MS}ms) — abandoning utterance for ${playerId ?? "unknown"}`
        );
        resolve(false);
      }, VoiceAgentService.SPEAK_HARD_TIMEOUT_MS);
    });
    try {
      return await Promise.race([inner, timeout]);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  private async playAudioFilesImpl(filePaths: string[]): Promise<boolean> {
    try {
      await this.connect();
    } catch (err) {
      console.error("[VoiceAgent] reconnect before GM audio failed:", err);
      this.scheduleReconnect("GM audio connect failed");
      return false;
    }
    if (!this.connected || !this.audioSource) {
      this.scheduleReconnect("GM audio without connected audio source");
      return false;
    }

    let capturedAny = false;
    let sourceNeedsPlayout = false;
    console.info("[VoiceAgent] GM audio start", {
      gameRoomId: this.gameRoomId,
      fileCount: filePaths.length,
    });
    for (const filePath of filePaths) {
      try {
        const pcm = await this.decodeMp3FileToPcm(filePath);
        const captured = await this.captureTtsPcmFrames(
          pcm,
          TTS_AUDIO_SOURCE_SAMPLE_RATE
        );
        if (captured) {
          capturedAny = true;
          sourceNeedsPlayout = true;
        }
      } catch (err) {
        console.error("[VoiceAgent] GM audio file failed:", {
          gameRoomId: this.gameRoomId,
          filePath,
          err,
        });
      }
    }
    if (capturedAny && sourceNeedsPlayout) {
      await this.waitForTtsPlayout();
    }
    console.info("[VoiceAgent] GM audio complete", {
      gameRoomId: this.gameRoomId,
      fileCount: filePaths.length,
      capturedAny,
    });
    return capturedAny;
  }

  private async decodeMp3FileToPcm(filePath: string): Promise<Int16Array> {
    const decoder = await this.getMp3Decoder();
    const data = await readFile(filePath);
    await decoder.reset();
    const decoded = decoder.decode(new Uint8Array(data));
    const mono = mixToMono(decoded.channelData, decoded.samplesDecoded);
    const pcm = floatToInt16(mono);
    return resamplePcmSampleRate(
      pcm,
      decoded.sampleRate,
      TTS_AUDIO_SOURCE_SAMPLE_RATE
    );
  }

  private async getMp3Decoder(): Promise<MPEGDecoder> {
    if (!this.mp3Decoder) {
      this.mp3Decoder = new MPEGDecoder();
      await this.mp3Decoder.ready;
    }
    return this.mp3Decoder;
  }

  private async speakImplInner(
    text: string,
    playerId?: string | null,
    playbackRate = 1,
    options: VoiceSpeakOptions = {}
  ): Promise<boolean> {
    const trimmed = text.trim();
    if (!trimmed) return false;
    const startedAtMs = Date.now();
    let livekitConnectMs = 0;
    let ttsConnectMs = 0;
    let ttsSynthesizeMs = 0;
    let captureDrainMs = 0;
    let playoutMs = 0;
    let firstChunkMs: number | null = null;
    let generatedAudioMs = 0;
    let ttsCaptureStartedAtMs: number | null = null;
    let mergedAlignment: TtsSpeechAlignment | null = null;
    let speechProgressCheckpoints: SpeechProgressCheckpoint[] = [];
    let scheduledSpeechProgressCount = 0;
    let lastSpeechProgressText = "";
    const speechProgressTimers = new Set<ReturnType<typeof setTimeout>>();
    const normalizedPlaybackRate = normalizeSpeechPlaybackRate(playbackRate);
    const clearSpeechProgressTimers = () => {
      for (const timer of speechProgressTimers) clearTimeout(timer);
      speechProgressTimers.clear();
    };
    const emitSpeechProgress = (
      nextText: string,
      targetAudioMs: number | null
    ) => {
      const progressText = nextText.trim();
      if (
        !options.onSpeechProgress ||
        !progressText ||
        progressText === lastSpeechProgressText
      ) {
        return;
      }
      lastSpeechProgressText = progressText;
      console.debug("[VoiceAgent] TTS speech progress", {
        gameRoomId: this.gameRoomId,
        playerId: playerId ?? null,
        matrixUserId: this.resolveMatrixUserIdForPlayer(playerId),
        textLength: progressText.length,
        targetAudioMs,
      });
      options.onSpeechProgress(progressText);
    };
    const scheduleSpeechProgress = () => {
      if (!options.onSpeechProgress || ttsCaptureStartedAtMs === null) return;
      for (
        let index = scheduledSpeechProgressCount;
        index < speechProgressCheckpoints.length;
        index += 1
      ) {
        const checkpoint = speechProgressCheckpoints[index]!;
        const delayMs = Math.max(
          0,
          ttsCaptureStartedAtMs + checkpoint.audioMs - Date.now()
        );
        const timer = setTimeout(() => {
          speechProgressTimers.delete(timer);
          emitSpeechProgress(checkpoint.text, checkpoint.audioMs);
        }, delayMs);
        speechProgressTimers.add(timer);
      }
      scheduledSpeechProgressCount = speechProgressCheckpoints.length;
    };
    console.info("[VoiceAgent] speak start", {
      gameRoomId: this.gameRoomId,
      playerId: playerId ?? null,
      matrixUserId: this.resolveMatrixUserIdForPlayer(playerId),
      textLength: trimmed.length,
      playbackRate,
    });
    try {
      const connectStartedAtMs = Date.now();
      await this.connect();
      livekitConnectMs = Date.now() - connectStartedAtMs;
    } catch (err) {
      console.error("[VoiceAgent] reconnect before speak failed:", err);
      this.scheduleReconnect("speak connect failed");
      return false;
    }
    if (!this.connected || !this.audioSource) {
      this.scheduleReconnect("speak without connected audio source");
      return false;
    }

    const sampleRate = TTS_AUDIO_SOURCE_SAMPLE_RATE; // we always request pcm_16000
    let capturedAny = false;
    let firstChunkLogged = false;
    // Serialize captureFrame calls — the LiveKit rtc-node AudioSource native
    // FFI rejects concurrent captures with "InvalidState - failed to capture
    // frame", so we feed PCM chunks one at a time through a Promise chain.
    let captureChain: Promise<void> = Promise.resolve();

    const ttsClientOptions: TtsClientOptions = {
      apiBaseUrl: this.config.unsealApiBaseUrl,
      agentId: this.resolveTtsAgentId(playerId),
      apiKey: this.config.unsealApiKey,
      connectTimeoutMs: TTS_CONNECT_TIMEOUT_MS,
      onAlignment: (event) => {
        const alignment = parseTtsSpeechAlignment(event);
        if (!alignment) return;
        mergedAlignment = mergeTtsSpeechAlignment(mergedAlignment, alignment);
        speechProgressCheckpoints = buildSpeechProgressCheckpoints(
          mergedAlignment,
          trimmed,
          normalizedPlaybackRate
        );
        console.debug("[VoiceAgent] TTS alignment progress checkpoints", {
          gameRoomId: this.gameRoomId,
          playerId: playerId ?? null,
          matrixUserId: this.resolveMatrixUserIdForPlayer(playerId),
          alignmentChars: mergedAlignment.chars.length,
          checkpointCount: speechProgressCheckpoints.length,
          lastAudioMs:
            speechProgressCheckpoints[speechProgressCheckpoints.length - 1]
              ?.audioMs ?? null,
        });
        scheduleSpeechProgress();
      },
      onAudioChunk: (chunk, frameRate) => {
        const rate = frameRate ?? sampleRate;
        const int16Length = Math.floor(chunk.byteLength / Int16Array.BYTES_PER_ELEMENT);
        if (int16Length <= 0) return;
        if (!firstChunkLogged) {
          firstChunkLogged = true;
          firstChunkMs = Date.now() - startedAtMs;
          console.info("[VoiceAgent] first TTS audio chunk", {
            gameRoomId: this.gameRoomId,
            playerId: playerId ?? null,
            matrixUserId: this.resolveMatrixUserIdForPlayer(playerId),
            firstChunkMs,
            byteLength: chunk.byteLength,
            frameRate: rate,
          });
        }
        // Copy out — chunk.buffer is shared and may be reused.
        const int16 = new Int16Array(int16Length);
        for (let i = 0; i < int16Length; i += 1) {
          int16[i] = chunk.readInt16LE(i * Int16Array.BYTES_PER_ELEMENT);
        }
        const playbackSamples = resamplePcmForPlaybackRate(int16, playbackRate);
        generatedAudioMs += Math.round((playbackSamples.length / rate) * 1000);
        captureChain = captureChain
          .then(async () => {
            ttsCaptureStartedAtMs ??= Date.now();
            scheduleSpeechProgress();
            if (await this.captureTtsPcmFrames(playbackSamples, rate)) {
              capturedAny = true;
            }
          })
          .catch(() => undefined);
      },
      onError: (err) => console.error("[VoiceAgent] TTS error:", err),
    };

    try {
      for (let attempt = 1; attempt <= TTS_ATTEMPTS; attempt += 1) {
        const ttsClient = this.createTtsClient(ttsClientOptions);
        try {
          const ttsConnectStartedAtMs = Date.now();
          await ttsClient.connect();
          ttsConnectMs = Date.now() - ttsConnectStartedAtMs;
          const synthStartedAtMs = Date.now();
          await ttsClient.synthesize(trimmed, {
            outputFormat: TTS_OUTPUT_FORMAT,
            modelId: "eleven_multilingual_v2",
            flush: true,
            timeoutMs: TTS_SYNTH_TIMEOUT_MS,
          });
          ttsSynthesizeMs = Date.now() - synthStartedAtMs;
          // Wait for the serialized capture chain so every PCM frame from the
          // completed TTS WebSocket response is handed to the AudioSource.
          const captureDrainStartedAtMs = Date.now();
          await captureChain;
          captureDrainMs = Date.now() - captureDrainStartedAtMs;
          if (capturedAny) {
            const playoutStartedAtMs = Date.now();
            await this.waitForTtsPlayout(generatedAudioMs, ttsCaptureStartedAtMs);
            playoutMs = Date.now() - playoutStartedAtMs;
            emitSpeechProgress(trimmed, generatedAudioMs);
          }
          break;
        } catch (err) {
          console.error("[VoiceAgent] speak failed:", {
            attempt,
            maxAttempts: TTS_ATTEMPTS,
            err,
          });
          const captureDrainStartedAtMs = Date.now();
          await captureChain;
          captureDrainMs = Date.now() - captureDrainStartedAtMs;
          if (capturedAny) {
            console.warn("[VoiceAgent] TTS failed after audio was captured; skipping retry", {
              gameRoomId: this.gameRoomId,
              playerId: playerId ?? null,
              matrixUserId: this.resolveMatrixUserIdForPlayer(playerId),
              attempt,
            });
            const playoutStartedAtMs = Date.now();
            await this.waitForTtsPlayout(generatedAudioMs, ttsCaptureStartedAtMs);
            playoutMs = Date.now() - playoutStartedAtMs;
            emitSpeechProgress(trimmed, generatedAudioMs);
            break;
          }
        } finally {
          ttsClient.close();
        }
      }
    } finally {
      clearSpeechProgressTimers();
    }

    console.info("[VoiceAgent] speak complete", {
      gameRoomId: this.gameRoomId,
      playerId: playerId ?? null,
      matrixUserId: this.resolveMatrixUserIdForPlayer(playerId),
      capturedAny,
      firstChunkLogged,
      firstChunkMs,
      livekitConnectMs,
      ttsConnectMs,
      ttsSynthesizeMs,
      captureDrainMs,
      playoutMs,
      generatedAudioMs,
      alignmentChars: countTtsSpeechAlignmentChars(mergedAlignment),
      speechProgressCheckpoints: speechProgressCheckpoints.length,
      totalMs: Date.now() - startedAtMs,
    });

    // At this point the generated PCM has drained from the local LiveKit
    // AudioSource queue. The game turn can finish without overlapping the
    // next speaker; no client-side acknowledgement is required.
    void sampleRate;
    return capturedAny;
  }

  private createTtsClient(
    opts: ConstructorParameters<typeof TtsWebSocketClient>[0]
  ): TtsWebSocketClient {
    return new TtsWebSocketClient(opts);
  }

  private async handlePlayerTrack(
    participantIdentity: string,
    track: RemoteTrack
  ): Promise<void> {
    const claim = this.claimPlayerAudioTrack(participantIdentity, track.sid ?? null);
    if (!claim) {
      return;
    }
    const { playerId, matrixUserId, trackKey } = claim;
    this.playerTrackHandler?.({
      gameRoomId: this.gameRoomId,
      playerId,
      matrixUserId,
      trackSid: track.sid ?? null,
    });
    console.info("[VoiceAgent] starting STT for player audio", {
      gameRoomId: this.gameRoomId,
      playerId,
      matrixUserId,
      trackSid: track.sid ?? null,
    });
    const prior = this.playerSessions.get(playerId);
    const completedText = prior?.completedText ?? "";
    if (prior) {
      prior.active = false;
      prior.client.close();
      this.playerSessions.delete(playerId);
    }

    const sttClient = new SttWebSocketClient({
      apiBaseUrl: this.config.unsealApiBaseUrl,
      agentId: matrixUserId,
      apiKey: this.config.unsealApiKey,
      connectTimeoutMs: STT_CONNECT_TIMEOUT_MS,
      maxConnectAttempts: STT_CONNECT_ATTEMPTS,
      onPartialTranscript: (text) => {
        this.transcriptHandler?.({
          gameRoomId: this.gameRoomId,
          playerId,
          text,
          final: false,
        });
      },
      onCommittedTranscript: (text) => {
        this.transcriptHandler?.({
          gameRoomId: this.gameRoomId,
          playerId,
          text,
          final: true,
        });
      },
      onError: (err) =>
        console.error("[VoiceAgent] STT error", {
          gameRoomId: this.gameRoomId,
          playerId,
          matrixUserId,
          err,
        }),
    });
    try {
      await sttClient.connect();
    } catch (err) {
      console.error("[VoiceAgent] STT connect failed", {
        gameRoomId: this.gameRoomId,
        playerId,
        matrixUserId,
        err,
      });
      this.releasePlayerAudioTrack(trackKey);
      return;
    }
    const session: PlayerSttSession = {
      client: sttClient,
      resampler: null,
      resamplerInputRate: 0,
      lastSentChunk: null,
      active: true,
      completedText,
    };
    this.playerSessions.set(playerId, session);

    const stream = new AudioStream(track);
    const reader = stream.getReader();
    let firstFrameLogged = false;
    try {
      while (true) {
        const { value: frame, done } = await reader.read();
        if (done) break;
        if (!frame) continue;
        if (!session.active) continue;
        if (!firstFrameLogged) {
          firstFrameLogged = true;
          console.info("[VoiceAgent] first STT audio frame", {
            gameRoomId: this.gameRoomId,
            playerId,
            matrixUserId,
            sampleRate: frame.sampleRate,
            channels: frame.channels,
            samplesPerChannel: frame.samplesPerChannel,
          });
        }
        const sttFrame = downmixAudioFrameToMonoForStt(frame);
        for (const out of this.resampleToStt(session, sttFrame)) {
          if (out.data.length === 0) continue;
          if (session.client.sendAudio(out.data, STT_TARGET_SAMPLE_RATE)) {
            session.lastSentChunk = out.data;
          }
        }
      }
    } catch (err) {
      console.error("[VoiceAgent] audio stream error", {
        gameRoomId: this.gameRoomId,
        playerId,
        matrixUserId,
        err,
      });
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
          console.error("[VoiceAgent] resampler flush failed", {
            gameRoomId: this.gameRoomId,
            playerId,
            matrixUserId,
            err,
          });
        }
      }
      try {
        await this.finalizePlayerSttSession(session, playerId, matrixUserId);
      } finally {
        session.client.close();
        session.active = false;
        this.releasePlayerAudioTrack(trackKey);
      }
    }
  }

  private claimPlayerAudioTrack(
    participantIdentity: string,
    trackSid: string | null
  ): (PlayerVoiceIdentityBinding & { trackKey: string }) | null {
    const binding = this.playerVoiceIdentityByMatrixUserId.get(participantIdentity);
    if (!binding) {
      console.warn("[VoiceAgent] ignoring audio track without Matrix binding", {
        gameRoomId: this.gameRoomId,
        participantIdentity,
        trackSid,
      });
      return null;
    }
    const trackKey = trackSid ?? `${participantIdentity}:unknown-audio`;
    if (this.activePlayerAudioTrackKeys.has(trackKey)) {
      console.info("[VoiceAgent] ignoring duplicate player audio track callback", {
        gameRoomId: this.gameRoomId,
        participantIdentity,
        trackSid,
      });
      return null;
    }
    this.activePlayerAudioTrackKeys.add(trackKey);
    return { ...binding, trackKey };
  }

  private releasePlayerAudioTrack(trackKey: string): void {
    this.activePlayerAudioTrackKeys.delete(trackKey);
  }

  private async finalizePlayerSttSession(
    session: PlayerSttSession,
    playerId: string,
    matrixUserId: string,
    gracePeriodMs = 3000
  ): Promise<string> {
    if (!session.lastSentChunk || session.lastSentChunk.length === 0) {
      session.completedText = this.mergeTranscriptText(
        session.completedText,
        session.client.transcriptText || session.client.partialText
      );
      return session.completedText;
    }

    try {
      session.client.sendFinalAudio(session.lastSentChunk, STT_TARGET_SAMPLE_RATE);
    } catch (err) {
      console.error("[VoiceAgent] sendFinalAudio on track end failed:", {
        gameRoomId: this.gameRoomId,
        playerId,
        matrixUserId,
        err,
      });
    }

    let text = "";
    try {
      text = await session.client.flush(gracePeriodMs);
    } catch (err) {
      console.error("[VoiceAgent] track-end flush failed:", {
        gameRoomId: this.gameRoomId,
        playerId,
        matrixUserId,
        err,
      });
      text = session.client.transcriptText || session.client.partialText;
    }

    session.completedText = this.mergeTranscriptText(session.completedText, text);
    session.client.resetBuffer();
    session.lastSentChunk = null;
    console.info("[VoiceAgent] finalized player STT track", {
      gameRoomId: this.gameRoomId,
      playerId,
      matrixUserId,
      textLength: session.completedText.length,
    });
    return session.completedText;
  }

  private mergeTranscriptText(existing: string, next: string): string {
    const previous = existing.trim();
    const incoming = next.trim();
    if (!previous) return incoming;
    if (!incoming) return previous;
    if (previous === incoming) return previous;
    if (incoming.startsWith(previous)) return incoming;
    return `${previous} ${incoming}`;
  }

  private subscribeExistingPlayerAudioTracks(): void {
    const room = this.room;
    if (!room) return;
    for (const participant of room.remoteParticipants.values()) {
      const identity = participant.identity;
      if (identity.startsWith("voice-agent:")) continue;
      for (const publication of participant.trackPublications.values()) {
        if (publication.kind !== TrackKind.KIND_AUDIO) continue;
        publication.setSubscribed(true);
        if (!publication.track) continue;
        console.info("[VoiceAgent] found existing player audio track", {
          gameRoomId: this.gameRoomId,
          participantIdentity: identity,
          trackSid: publication.sid ?? null,
        });
        void this.handlePlayerTrack(identity, publication.track as RemoteTrack);
      }
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

  private async publishTtsPcm(
    samples: Int16Array,
    sampleRate: number
  ): Promise<boolean> {
    const captured = await this.captureTtsPcmFrames(samples, sampleRate);
    if (!captured) return false;
    await this.waitForTtsPlayout();
    return true;
  }

  private async captureTtsPcmFrames(
    samples: Int16Array,
    sampleRate: number
  ): Promise<boolean> {
    const source = this.audioSource;
    if (!source || samples.length === 0) return false;
    const frameSamples = Math.max(
      1,
      Math.floor((sampleRate * TTS_AUDIO_FRAME_DURATION_MS) / 1000)
    );
    for (const chunk of chunkInt16(samples, frameSamples)) {
      const frame = new AudioFrame(
        chunk,
        sampleRate,
        TTS_AUDIO_SOURCE_CHANNELS,
        chunk.length
      );
      try {
        await source.captureFrame(frame);
      } catch (err) {
        console.error("[VoiceAgent] captureFrame error:", err);
        this.connected = false;
        this.audioSource = null;
        this.scheduleReconnect("TTS captureFrame failed");
        return false;
      }
    }
    return true;
  }

  private async waitForTtsPlayout(
    generatedAudioMs = 0,
    captureStartedAtMs: number | null = null
  ): Promise<void> {
    const source = this.audioSource;
    if (!source) return;
    const localRemainingMs =
      captureStartedAtMs === null
        ? 0
        : Math.max(0, generatedAudioMs - (Date.now() - captureStartedAtMs));
    const timeoutMs =
      Math.max(0, Math.ceil(source.queuedDuration), localRemainingMs) +
      LIVEKIT_PLAYOUT_TIMEOUT_GRACE_MS;
    try {
      const nativePlayout = withTimeout(
        source.waitForPlayout(),
        timeoutMs,
        "LiveKit TTS playout timed out"
      );
      if (localRemainingMs > 0) {
        console.debug("[VoiceAgent] waiting for local TTS playout duration", {
          gameRoomId: this.gameRoomId,
          generatedAudioMs,
          localRemainingMs,
          livekitQueuedDurationMs: Math.ceil(source.queuedDuration),
        });
        await Promise.all([nativePlayout, sleep(localRemainingMs)]);
      } else {
        await nativePlayout;
      }
    } catch (err) {
      console.error("[VoiceAgent] waitForPlayout failed:", err);
      this.connected = false;
      this.audioSource = null;
      this.scheduleReconnect("TTS playout wait failed");
    }
  }

  private scheduleReconnect(reason: string): void {
    if (this.intentionalDisconnect || this.reconnectTimer) return;
    const delayMs = Math.min(
      LIVEKIT_RECONNECT_INITIAL_DELAY_MS * 2 ** this.reconnectAttempt,
      LIVEKIT_RECONNECT_MAX_DELAY_MS
    );
    this.reconnectAttempt += 1;
    console.error(`[VoiceAgent] scheduling reconnect: ${reason}`, {
      delayMs,
      reconnectAttempt: this.reconnectAttempt,
    });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch((err) => {
        console.error("[VoiceAgent] reconnect failed:", err);
        this.scheduleReconnect("reconnect failed");
      });
    }, delayMs);
  }
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const guardedPromise = promise.catch((err) => {
    if (timedOut) {
      return new Promise<T>(() => undefined);
    }
    throw err;
  });
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      timedOut = true;
      reject(new Error(message));
    }, timeoutMs);
  });
  timeout.catch(() => undefined);
  guardedPromise.catch(() => undefined);
  const raced = Promise.race([guardedPromise, timeout]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
  raced.catch(() => undefined);
  return raced;
}

function mixToMono(channels: Float32Array[], samplesDecoded: number): Float32Array {
  const mono = new Float32Array(samplesDecoded);
  if (channels.length === 0) return mono;
  for (let sample = 0; sample < samplesDecoded; sample += 1) {
    let sum = 0;
    for (const channel of channels) {
      sum += channel[sample] ?? 0;
    }
    mono[sample] = sum / channels.length;
  }
  return mono;
}

function floatToInt16(samples: Float32Array): Int16Array {
  const pcm = new Int16Array(samples.length);
  for (let index = 0; index < samples.length; index += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[index] ?? 0));
    pcm[index] = Math.round(clamped * 32767);
  }
  return pcm;
}

function resamplePcmSampleRate(
  samples: Int16Array,
  fromSampleRate: number,
  toSampleRate: number
): Int16Array {
  if (fromSampleRate === toSampleRate || samples.length === 0) return samples;
  const ratio = fromSampleRate / toSampleRate;
  const outputLength = Math.max(1, Math.floor(samples.length / ratio));
  const output = new Int16Array(outputLength);
  for (let index = 0; index < outputLength; index += 1) {
    const sourceIndex = index * ratio;
    const leftIndex = Math.floor(sourceIndex);
    const rightIndex = Math.min(samples.length - 1, leftIndex + 1);
    const t = sourceIndex - leftIndex;
    output[index] = Math.round(
      (samples[leftIndex] ?? 0) * (1 - t) + (samples[rightIndex] ?? 0) * t
    );
  }
  return output;
}

function chunkInt16(samples: Int16Array, chunkSize: number): Int16Array[] {
  const chunks: Int16Array[] = [];
  const size = Math.max(1, Math.floor(chunkSize));
  for (let offset = 0; offset < samples.length; offset += size) {
    chunks.push(samples.slice(offset, offset + size));
  }
  return chunks;
}

interface TtsSpeechAlignment {
  chars: string[];
  charStartTimesMs: number[];
  charDurationsMs: number[];
}

interface SpeechProgressCheckpoint {
  text: string;
  audioMs: number;
}

function parseTtsSpeechAlignment(
  event: Record<string, unknown>
): TtsSpeechAlignment | null {
  const rawAlignment =
    objectValue(event.alignment) ?? objectValue(event.normalizedAlignment);
  if (!rawAlignment) return null;
  const chars = rawAlignment.chars;
  const starts =
    rawAlignment.charStartTimesMs ?? rawAlignment.char_start_times_ms;
  const durations =
    rawAlignment.charDurationsMs ?? rawAlignment.char_durations_ms;
  if (!Array.isArray(chars) || !Array.isArray(starts) || !Array.isArray(durations)) {
    return null;
  }
  if (chars.length === 0 || chars.length !== starts.length || chars.length !== durations.length) {
    return null;
  }
  const parsedChars: string[] = [];
  const parsedStarts: number[] = [];
  const parsedDurations: number[] = [];
  for (let index = 0; index < chars.length; index += 1) {
    const char = chars[index];
    const start = starts[index];
    const duration = durations[index];
    if (
      typeof char !== "string" ||
      typeof start !== "number" ||
      typeof duration !== "number" ||
      !Number.isFinite(start) ||
      !Number.isFinite(duration)
    ) {
      return null;
    }
    parsedChars.push(char);
    parsedStarts.push(Math.max(0, start));
    parsedDurations.push(Math.max(0, duration));
  }
  return {
    chars: parsedChars,
    charStartTimesMs: parsedStarts,
    charDurationsMs: parsedDurations,
  };
}

function mergeTtsSpeechAlignment(
  previous: TtsSpeechAlignment | null,
  next: TtsSpeechAlignment
): TtsSpeechAlignment {
  if (!previous) return next;
  const previousText = previous.chars.join("");
  const nextText = next.chars.join("");
  if (!nextText) return previous;
  if (nextText.startsWith(previousText)) return next;
  if (previousText.includes(nextText)) return previous;

  const previousEndMs = alignmentEndMs(previous);
  const nextFirstMs = next.charStartTimesMs[0] ?? 0;
  const offsetMs = nextFirstMs >= previousEndMs - 100 ? 0 : previousEndMs;
  return {
    chars: [...previous.chars, ...next.chars],
    charStartTimesMs: [
      ...previous.charStartTimesMs,
      ...next.charStartTimesMs.map((timeMs) => timeMs + offsetMs),
    ],
    charDurationsMs: [...previous.charDurationsMs, ...next.charDurationsMs],
  };
}

function buildSpeechProgressCheckpoints(
  alignment: TtsSpeechAlignment,
  originalText: string,
  playbackRate: number
): SpeechProgressCheckpoint[] {
  const checkpoints: SpeechProgressCheckpoint[] = [];
  let lastCheckpointIndex = -1;
  let lastCheckpointAudioMs = 0;
  for (let index = 0; index < alignment.chars.length; index += 1) {
    const char = alignment.chars[index] ?? "";
    const endMs =
      alignment.charStartTimesMs[index]! + alignment.charDurationsMs[index]!;
    const elapsedSinceLast = endMs - lastCheckpointAudioMs;
    const charsSinceLast = index - lastCheckpointIndex;
    const isPunctuation = /[。！？!?；;，,、\n]/u.test(char);
    const isLongEnough = elapsedSinceLast >= 900 && charsSinceLast >= 4;
    if (!isPunctuation && !isLongEnough) continue;
    const text = alignment.chars.slice(0, index + 1).join("").trim();
    if (!text) continue;
    checkpoints.push({
      text,
      audioMs: Math.round(endMs / playbackRate),
    });
    lastCheckpointIndex = index;
    lastCheckpointAudioMs = endMs;
  }

  const finalText = originalText.trim();
  const finalAudioMs = Math.round(alignmentEndMs(alignment) / playbackRate);
  const alignmentCoversFinalText =
    compactSpeechText(alignment.chars.join("")) === compactSpeechText(finalText);
  if (
    alignmentCoversFinalText &&
    finalText &&
    checkpoints[checkpoints.length - 1]?.text.trim() !== finalText
  ) {
    checkpoints.push({ text: finalText, audioMs: finalAudioMs });
  }
  return dedupeSpeechProgressCheckpoints(checkpoints);
}

function dedupeSpeechProgressCheckpoints(
  checkpoints: SpeechProgressCheckpoint[]
): SpeechProgressCheckpoint[] {
  const deduped: SpeechProgressCheckpoint[] = [];
  let lastText = "";
  for (const checkpoint of checkpoints) {
    if (!checkpoint.text || checkpoint.text === lastText) continue;
    deduped.push(checkpoint);
    lastText = checkpoint.text;
  }
  return deduped;
}

function alignmentEndMs(alignment: TtsSpeechAlignment): number {
  let endMs = 0;
  for (let index = 0; index < alignment.chars.length; index += 1) {
    endMs = Math.max(
      endMs,
      (alignment.charStartTimesMs[index] ?? 0) +
        (alignment.charDurationsMs[index] ?? 0)
    );
  }
  return endMs;
}

function countTtsSpeechAlignmentChars(
  alignment: TtsSpeechAlignment | null
): number {
  return alignment?.chars.length ?? 0;
}

function normalizeSpeechPlaybackRate(playbackRate: number): number {
  return Number.isFinite(playbackRate)
    ? Math.min(2, Math.max(0.75, playbackRate))
    : 1;
}

function compactSpeechText(text: string): string {
  return text.replace(/\s+/gu, "");
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function downmixAudioFrameToMonoForStt(frame: AudioFrame): AudioFrame {
  if (frame.channels === 1) return frame;
  const channelCount = Math.max(1, frame.channels);
  const sampleCount = frame.samplesPerChannel;
  const mono = new Int16Array(sampleCount);
  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
    let mixed = 0;
    for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
      mixed += frame.data[sampleIndex * channelCount + channelIndex] ?? 0;
    }
    mono[sampleIndex] = clampPcm16(Math.round(mixed / channelCount));
  }
  return new AudioFrame(mono, frame.sampleRate, 1, sampleCount);
}

function clampPcm16(value: number): number {
  if (value > 32767) return 32767;
  if (value < -32768) return -32768;
  return value;
}

/** One VoiceAgentService per game room. */
export class VoiceAgentRegistry {
  private agents = new Map<string, VoiceAgentService>();
  private transcriptHandler: VoiceTranscriptHandler | null = null;
  private playerTrackHandler: VoicePlayerTrackHandler | null = null;

  constructor(private config: VoiceAgentConfig) {}

  setTranscriptHandler(handler: VoiceTranscriptHandler | null): void {
    this.transcriptHandler = handler;
    for (const agent of this.agents.values()) {
      agent.setTranscriptHandler(handler);
    }
  }

  setPlayerTrackHandler(handler: VoicePlayerTrackHandler | null): void {
    this.playerTrackHandler = handler;
    for (const agent of this.agents.values()) {
      agent.setPlayerTrackHandler(handler);
    }
  }

  async getOrCreate(gameRoomId: string): Promise<VoiceAgentService> {
    let agent = this.agents.get(gameRoomId);
    if (!agent) {
      agent = new VoiceAgentService(gameRoomId, this.config);
      agent.setTranscriptHandler(this.transcriptHandler);
      agent.setPlayerTrackHandler(this.playerTrackHandler);
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
