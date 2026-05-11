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

  useEffect(() => {
    if (!serverUrl || !token) {
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

    const attachAudio = (
      track: RemoteTrack,
      _publication: RemoteTrackPublication,
      _participant: RemoteParticipant
    ) => {
      if (track.kind !== Track.Kind.Audio) return;
      const el = track.attach() as HTMLAudioElement;
      el.autoplay = true;
      el.dataset.lkSid = track.sid ?? "";
      const host = audioContainerRef.current ?? document.body;
      host.appendChild(el);
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
      .on(RoomEvent.TrackSubscribed, attachAudio)
      .on(RoomEvent.TrackUnsubscribed, detachAudio)
      .on(RoomEvent.ConnectionStateChanged, (lkState) => {
        if (cancelled) return;
        setState(mapConnectionState(lkState));
      })
      .on(RoomEvent.Disconnected, () => {
        if (cancelled) return;
        setState("disconnected");
        setIsMicrophoneEnabled(false);
      })
      .on(RoomEvent.LocalTrackPublished, updateMicState)
      .on(RoomEvent.LocalTrackUnpublished, updateMicState)
      .on(RoomEvent.TrackMuted, updateMicState)
      .on(RoomEvent.TrackUnmuted, updateMicState);

    setState("connecting");
    setErrorMessage(null);

    void lkRoom
      .connect(serverUrl, token, { autoSubscribe: true })
      .then(() => {
        if (cancelled) {
          void lkRoom.disconnect().catch(() => {});
          return;
        }
        setRoom(lkRoom);
        updateMicState();
      })
      .catch((err: unknown) => {
        if (cancelled) return;
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
      <div ref={audioContainerRef} style={{ display: "none" }} aria-hidden />
      {children}
    </VoiceRoomContext.Provider>
  );
}
