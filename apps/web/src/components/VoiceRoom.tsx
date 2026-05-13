import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ConnectionState,
  Room,
  RoomEvent,
  Track,
  type RemoteTrack,
  type RemoteTrackPublication,
  type RemoteParticipant,
} from "livekit-client";

export type VoiceConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "error"
  | "disconnected";

interface VoiceRoomContextValue {
  state: VoiceConnectionState;
  errorMessage: string | null;
  isMicrophoneEnabled: boolean;
  enableMicrophone: () => Promise<void>;
  disableMicrophone: () => Promise<void>;
  room: Room | null;
}

const DEFAULT_CONTEXT: VoiceRoomContextValue = {
  state: "idle",
  errorMessage: null,
  isMicrophoneEnabled: false,
  enableMicrophone: async () => {},
  disableMicrophone: async () => {},
  room: null,
};

const VoiceRoomContext = createContext<VoiceRoomContextValue | null>(null);

export function useVoiceRoom(): VoiceRoomContextValue {
  return useContext(VoiceRoomContext) ?? DEFAULT_CONTEXT;
}

export interface VoiceRoomProviderProps {
  serverUrl: string | null;
  token: string | null;
  children: ReactNode;
}

function mapConnectionState(state: ConnectionState): VoiceConnectionState {
  switch (state) {
    case ConnectionState.Connecting:
      return "connecting";
    case ConnectionState.Connected:
      return "connected";
    case ConnectionState.Reconnecting:
      return "reconnecting";
    case ConnectionState.Disconnected:
      return "disconnected";
    default:
      return "idle";
  }
}

/**
 * Connects to a LiveKit room and renders incoming audio tracks via hidden
 * <audio> elements. Exposes microphone controls via VoiceRoomContext.
 *
 * The provider tolerates serverUrl/token going null (tears down the room)
 * and re-running with new credentials (creates a fresh room). Effect
 * cleanup uses a cancelled flag so async connect resolutions cannot mutate
 * a torn-down provider — important under React StrictMode double-invocation.
 */
export function VoiceRoomProvider({
  serverUrl,
  token,
  children,
}: VoiceRoomProviderProps) {
  const [room, setRoom] = useState<Room | null>(null);
  const [state, setState] = useState<VoiceConnectionState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isMicrophoneEnabled, setIsMicrophoneEnabled] = useState(false);
  const audioContainerRef = useRef<HTMLDivElement | null>(null);
  const audioUnlockCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!serverUrl || !token) {
      audioUnlockCleanupRef.current?.();
      audioUnlockCleanupRef.current = null;
      setRoom((current) => {
        if (current) {
          void current.disconnect().catch(() => {});
        }
        return null;
      });
      setState("idle");
      setErrorMessage(null);
      setIsMicrophoneEnabled(false);
      return;
    }

    let cancelled = false;
    const lkRoom = new Room({
      adaptiveStream: true,
      dynacast: true,
    });

    const clearUnlockListener = () => {
      audioUnlockCleanupRef.current?.();
      audioUnlockCleanupRef.current = null;
    };

    const ensureAudioUnlocked = () => {
      if (cancelled || lkRoom.canPlaybackAudio) {
        clearUnlockListener();
        return;
      }
      if (audioUnlockCleanupRef.current) return;
      const unlock = () => {
        void lkRoom.startAudio().catch(() => {});
      };
      const cleanup = () => {
        window.removeEventListener("pointerdown", unlock);
        window.removeEventListener("keydown", unlock);
      };
      audioUnlockCleanupRef.current = cleanup;
      window.addEventListener("pointerdown", unlock, { once: true });
      window.addEventListener("keydown", unlock, { once: true });
    };

    const eagerStartAudio = () => {
      void lkRoom.startAudio().catch(() => {
        console.warn("[VoiceRoom] startAudio blocked; waiting for user gesture");
        ensureAudioUnlocked();
      });
    };

    const attachAudio = (
      track: RemoteTrack,
      _publication: RemoteTrackPublication,
      _participant: RemoteParticipant
    ) => {
      if (track.kind !== Track.Kind.Audio) return;
      if (
        track.sid &&
        Array.from(audioContainerRef.current?.children ?? []).some(
          (child) => child instanceof HTMLElement && child.dataset.lkSid === track.sid
        )
      ) {
        return;
      }
      console.info("[VoiceRoom] attaching remote audio", {
        trackSid: track.sid ?? "",
        participantIdentity: _participant.identity,
      });
      const el = track.attach() as HTMLAudioElement;
      el.autoplay = true;
      el.setAttribute("playsinline", "true");
      el.dataset.lkSid = track.sid ?? "";
      const host = audioContainerRef.current ?? document.body;
      host.appendChild(el);
      void el
        .play()
        .then(() => {
          console.info("[VoiceRoom] remote audio playing", {
            trackSid: track.sid ?? "",
            participantIdentity: _participant.identity,
          });
        })
        .catch((err) => {
          console.warn("[VoiceRoom] remote audio play blocked", {
            trackSid: track.sid ?? "",
            participantIdentity: _participant.identity,
            error: err instanceof Error ? err.message : String(err),
          });
          ensureAudioUnlocked();
        });
    };

    const detachAudio = (track: RemoteTrack) => {
      if (track.kind !== Track.Kind.Audio) return;
      for (const el of track.detach()) {
        el.remove();
      }
    };

    const updateMicState = () => {
      if (cancelled) return;
      setIsMicrophoneEnabled(lkRoom.localParticipant.isMicrophoneEnabled);
    };

    lkRoom
      .on(RoomEvent.TrackPublished, (publication, participant) => {
        if (publication.kind === Track.Kind.Audio) {
          console.info("[VoiceRoom] remote audio published", {
            trackSid: publication.trackSid,
            participantIdentity: participant.identity,
          });
          publication.setSubscribed(true);
        }
      })
      .on(RoomEvent.TrackSubscribed, attachAudio)
      .on(RoomEvent.TrackSubscriptionFailed, (trackSid, participant) => {
        console.error("[VoiceRoom] track subscription failed", {
          trackSid,
          participantIdentity: participant.identity,
        });
      })
      .on(RoomEvent.TrackUnsubscribed, detachAudio)
      .on(RoomEvent.ConnectionStateChanged, (lkState) => {
        if (cancelled) return;
        console.info("[VoiceRoom] connection state", { state: lkState });
        setState(mapConnectionState(lkState));
      })
      .on(RoomEvent.AudioPlaybackStatusChanged, () => {
        if (cancelled) return;
        if (lkRoom.canPlaybackAudio) {
          console.info("[VoiceRoom] playback audio enabled");
          clearUnlockListener();
          return;
        }
        console.warn("[VoiceRoom] playback audio blocked");
        ensureAudioUnlocked();
      })
      .on(RoomEvent.Disconnected, () => {
        if (cancelled) return;
        console.warn("[VoiceRoom] disconnected");
        setState("disconnected");
        setIsMicrophoneEnabled(false);
        clearUnlockListener();
      })
      .on(RoomEvent.LocalTrackPublished, updateMicState)
      .on(RoomEvent.LocalTrackUnpublished, updateMicState)
      .on(RoomEvent.TrackMuted, updateMicState)
      .on(RoomEvent.TrackUnmuted, updateMicState);

    setState("connecting");
    setErrorMessage(null);
    console.info("[VoiceRoom] preparing connection", {
      hasServerUrl: Boolean(serverUrl),
      hasToken: Boolean(token),
    });
    void lkRoom.prepareConnection(serverUrl, token).catch(() => {});
    eagerStartAudio();

    void lkRoom
      .connect(serverUrl, token, { autoSubscribe: true })
      .then(() => {
        if (cancelled) {
          void lkRoom.disconnect().catch(() => {});
          return;
        }
        console.info("[VoiceRoom] connected", {
          remoteParticipantCount: lkRoom.remoteParticipants.size,
        });
        setRoom(lkRoom);
        for (const participant of lkRoom.remoteParticipants.values()) {
          for (const publication of participant.trackPublications.values()) {
            if (publication.kind === Track.Kind.Audio) {
              publication.setSubscribed(true);
            }
            if (publication.track && publication.isSubscribed) {
              attachAudio(publication.track, publication, participant);
            }
          }
        }
        updateMicState();
        eagerStartAudio();
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error("[VoiceRoom] connect failed", err);
        setState("error");
        setErrorMessage(err instanceof Error ? err.message : String(err));
      });

    return () => {
      cancelled = true;
      // Detach lingering audio elements before tearing down the room.
      const host = audioContainerRef.current;
      if (host) {
        while (host.firstChild) host.removeChild(host.firstChild);
      }
      clearUnlockListener();
      void lkRoom.disconnect().catch(() => {});
      setRoom((current) => (current === lkRoom ? null : current));
    };
  }, [serverUrl, token]);

  const enableMicrophone = useCallback(async () => {
    if (!room) return;
    try {
      await room.localParticipant.setMicrophoneEnabled(true);
      setIsMicrophoneEnabled(true);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
      throw err;
    }
  }, [room]);

  const disableMicrophone = useCallback(async () => {
    if (!room) return;
    try {
      await room.localParticipant.setMicrophoneEnabled(false);
      setIsMicrophoneEnabled(false);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    }
  }, [room]);

  const value = useMemo<VoiceRoomContextValue>(
    () => ({
      state,
      errorMessage,
      isMicrophoneEnabled,
      enableMicrophone,
      disableMicrophone,
      room,
    }),
    [
      state,
      errorMessage,
      isMicrophoneEnabled,
      enableMicrophone,
      disableMicrophone,
      room,
    ]
  );

  return (
    <VoiceRoomContext.Provider value={value}>
      <div
        ref={audioContainerRef}
        style={{
          position: "fixed",
          width: 0,
          height: 0,
          overflow: "hidden",
          opacity: 0,
          pointerEvents: "none",
        }}
        aria-hidden
      />
      {children}
    </VoiceRoomContext.Provider>
  );
}
