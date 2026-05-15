import { useCallback, useEffect, useRef } from "react";
import type {
  GameEventDto,
  GameRoom,
  PlayerPrivateState,
  RoomProjection,
} from "../api/client";
import { computeTimelineBaseSeq } from "../game/timelineState";

export interface SubscribeSnapshot {
  room: GameRoom;
  projection: RoomProjection | null;
  privateStates: PlayerPrivateState[];
  events: GameEventDto[];
}

export type SubscribeMessage =
  | { kind: "snapshot"; snapshot: SubscribeSnapshot }
  | { kind: "event"; event: GameEventDto };

export interface SnapshotSseState {
  roomSnapshot: GameRoom | null;
  projectionSnapshot: RoomProjection | null;
  privateStates: PlayerPrivateState[];
  timeline: GameEventDto[];
  timelineBaseSeq: number;
}

export function stripPayloadFromEvent(raw: string): string {
  if (raw.startsWith("data:")) {
    return raw.slice(5).trim();
  }
  return raw;
}

export function parseSseEvent(raw: string): GameEventDto | undefined {
  if (!raw.trim()) return undefined;
  try {
    const candidate = JSON.parse(raw) as unknown;
    if (!candidate || typeof candidate !== "object") {
      return undefined;
    }
    if ("event" in candidate) {
      const wrapped = (candidate as { event?: unknown }).event;
      if (
        wrapped &&
        typeof wrapped === "object" &&
        "id" in wrapped &&
        "type" in wrapped
      ) {
        return wrapped as GameEventDto;
      }
    }
    if ("id" in candidate && "type" in candidate) {
      return candidate as GameEventDto;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export function parseSubscribeMessage(raw: string): SubscribeMessage | undefined {
  const payload = stripPayloadFromEvent(raw);
  if (!payload.trim()) return undefined;
  try {
    const candidate = JSON.parse(payload) as unknown;
    if (!candidate || typeof candidate !== "object") return undefined;
    if ("snapshot" in candidate) {
      return {
        kind: "snapshot",
        snapshot: (candidate as { snapshot: SubscribeSnapshot }).snapshot,
      };
    }
    const event = parseSseEvent(payload);
    return event ? { kind: "event", event } : undefined;
  } catch {
    return undefined;
  }
}

export function appendTimelineEvent(
  timeline: GameEventDto[],
  event: GameEventDto
): GameEventDto[] {
  if (timeline.some((candidate) => candidate.id === event.id)) return timeline;
  const sameSpeechStream = (candidate: GameEventDto) =>
    candidate.type === "speech_transcript_delta" &&
    candidate.actorId === event.actorId &&
    candidate.payload.day === event.payload.day &&
    candidate.payload.phase === event.payload.phase;
  const next =
    event.type === "speech_transcript_delta"
      ? [...timeline.filter((candidate) => !sameSpeechStream(candidate)), event]
      : event.type === "speech_submitted"
        ? [
            ...timeline.filter(
              (candidate) =>
                !(
                  candidate.type === "speech_transcript_delta" &&
                  candidate.actorId === event.actorId &&
                  candidate.payload.day === event.payload.day
                )
            ),
            event,
          ]
        : [...timeline, event];
  return next.length <= 260 ? next : next.slice(-260);
}

export function applySubscribeMessage(
  state: SnapshotSseState,
  message: SubscribeMessage | undefined
): SnapshotSseState {
  if (!message) return state;
  if (message.kind === "snapshot") {
    return {
      roomSnapshot: message.snapshot.room,
      projectionSnapshot: message.snapshot.projection,
      privateStates: message.snapshot.privateStates,
      timeline: message.snapshot.events,
      timelineBaseSeq: computeTimelineBaseSeq(message.snapshot.events),
    };
  }
  const timeline = appendTimelineEvent(state.timeline, message.event);
  return {
    ...state,
    timeline,
    timelineBaseSeq: Math.max(state.timelineBaseSeq, message.event.seq),
  };
}

export interface UseSnapshotSseOptions {
  subscribeUrl: string;
  onSnapshot(snapshot: SubscribeSnapshot): void;
  onEvent(event: GameEventDto): void;
  onMessage?: (message: SubscribeMessage) => void;
  reconnectDelayMs?: number;
}

export function useSnapshotSse({
  subscribeUrl,
  onSnapshot,
  onEvent,
  onMessage,
  reconnectDelayMs = 1000,
}: UseSnapshotSseOptions) {
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const onSnapshotRef = useRef(onSnapshot);
  const onEventRef = useRef(onEvent);
  const onMessageRef = useRef(onMessage);
  onSnapshotRef.current = onSnapshot;
  onEventRef.current = onEvent;
  onMessageRef.current = onMessage;

  const close = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    close();
    const source = new EventSource(subscribeUrl);
    source.onmessage = (event) => {
      const parsed = parseSubscribeMessage(event.data);
      if (!parsed) return;
      onMessageRef.current?.(parsed);
      if (parsed.kind === "snapshot") {
        onSnapshotRef.current(parsed.snapshot);
      } else {
        onEventRef.current(parsed.event);
      }
    };
    source.onerror = () => {
      source.close();
      eventSourceRef.current = null;
      reconnectTimerRef.current = window.setTimeout(connect, reconnectDelayMs);
    };
    eventSourceRef.current = source;
  }, [close, reconnectDelayMs, subscribeUrl]);

  useEffect(() => {
    connect();
    return close;
  }, [close, connect]);
}
