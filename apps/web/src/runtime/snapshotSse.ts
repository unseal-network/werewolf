import { useCallback, useEffect, useRef } from "react";
import type {
  GameEventDto,
  GameRoom,
  GameReadSnapshot,
  PlayerPrivateState,
  RoomProjection,
} from "../api/client";
import {
  computeTimelineBaseEventId,
  computeTimelineBaseSeq,
} from "../game/timelineState";

export interface SubscribeSnapshot {
  room: GameRoom;
  projection: RoomProjection | null;
  privateStates: PlayerPrivateState[];
  events: GameEventDto[];
  snapshotEventId?: string;
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
  timelineBaseEventId: string;
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
        snapshot: normalizeSubscribeSnapshot(
          (candidate as { snapshot: SubscribeSnapshot | GameReadSnapshot }).snapshot
        ),
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
  if (timeline.some((candidate) => candidate.id === event.id)) {
    if (event.type !== "stream") return timeline;
    return timeline.map((candidate) =>
      candidate.id === event.id ? event : candidate
    );
  }
  const streamKind = (candidate: GameEventDto) =>
    candidate.payload.kind === undefined ? "speech" : candidate.payload.kind;
  const sameSpeechStream = (candidate: GameEventDto) =>
    (candidate.type === "stream" || candidate.type === "speech_transcript_delta") &&
    candidate.actorId === event.actorId &&
    streamKind(candidate) === (event.payload.kind ?? "speech") &&
    candidate.payload.day === event.payload.day &&
    candidate.payload.phase === event.payload.phase;
  const next =
    event.type === "stream" || event.type === "speech_transcript_delta"
      ? [...timeline.filter((candidate) => !sameSpeechStream(candidate)), event]
      : event.type === "speech_submitted"
        ? [
            ...timeline.filter(
              (candidate) =>
                !(
                  (candidate.type === "stream" ||
                    candidate.type === "speech_transcript_delta") &&
                  (candidate.payload.kind === undefined ||
                    candidate.payload.kind === "speech") &&
                  candidate.actorId === event.actorId &&
                  candidate.payload.day === event.payload.day
                )
            ),
            event,
          ]
        : [...timeline, event];
  return next.length <= 260 ? next : next.slice(-260);
}

export function collapseStreamingTimelineEvents(
  events: GameEventDto[]
): GameEventDto[] {
  return events.reduce(
    (timeline, event) => appendTimelineEvent(timeline, event),
    [] as GameEventDto[]
  );
}

export function applySubscribeMessage(
  state: SnapshotSseState,
  message: SubscribeMessage | undefined
): SnapshotSseState {
  if (!message) return state;
  if (message.kind === "snapshot") {
    const timeline = collapseStreamingTimelineEvents(message.snapshot.events);
    const timelineBaseEventId =
      message.snapshot.snapshotEventId ?? computeTimelineBaseEventId(timeline);
    return {
      roomSnapshot: message.snapshot.room,
      projectionSnapshot: message.snapshot.projection,
      privateStates: message.snapshot.privateStates,
      timeline,
      timelineBaseSeq: computeTimelineBaseSeq(timeline),
      timelineBaseEventId,
    };
  }
  const timeline = appendTimelineEvent(state.timeline, message.event);
  return {
    ...state,
    timeline,
    timelineBaseSeq: Math.max(state.timelineBaseSeq, message.event.seq ?? 0),
    timelineBaseEventId: computeTimelineBaseEventId(timeline),
  };
}

export { computeTimelineBaseEventId };

function normalizeSubscribeSnapshot(
  snapshot: SubscribeSnapshot | GameReadSnapshot
): SubscribeSnapshot {
  if ("displayState" in snapshot) {
    return {
      room: snapshot.displayState.room,
      projection:
        snapshot.displayState.projection ?? snapshot.displayState.room.projection,
      privateStates: snapshot.displayState.privateStates,
      events: [],
      snapshotEventId: snapshot.snapshotEventId,
    };
  }
  const normalized: SubscribeSnapshot = {
    ...snapshot,
    events: snapshot.events ?? [],
  };
  if (snapshot.snapshotEventId !== undefined) {
    normalized.snapshotEventId = snapshot.snapshotEventId;
  }
  return normalized;
}

export interface UseSnapshotSseOptions {
  subscribeUrl: string;
  onSnapshot(snapshot: SubscribeSnapshot): void;
  onEvent(event: GameEventDto): void;
  onMessage?: (message: SubscribeMessage) => void;
  reconnectDelayMs?: number;
}

const maxSseReconnectDelayMs = 30000;

export function computeSseReconnectDelayMs(
  attempt: number,
  initialDelayMs: number
): number {
  const normalizedAttempt = Math.max(0, attempt);
  const normalizedInitialDelay = Math.max(250, initialDelayMs);
  return Math.min(
    maxSseReconnectDelayMs,
    normalizedInitialDelay * 2 ** normalizedAttempt
  );
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
  const reconnectAttemptRef = useRef(0);
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
    source.onopen = () => {
      reconnectAttemptRef.current = 0;
    };
    source.onmessage = (event) => {
      reconnectAttemptRef.current = 0;
      // un.log('[onmessage]', event.data)
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
      const delayMs = computeSseReconnectDelayMs(
        reconnectAttemptRef.current,
        reconnectDelayMs
      );
      reconnectAttemptRef.current += 1;
      reconnectTimerRef.current = window.setTimeout(connect, delayMs);
    };
    eventSourceRef.current = source;
  }, [close, reconnectDelayMs, subscribeUrl]);

  useEffect(() => {
    reconnectAttemptRef.current = 0;
    connect();
    return close;
  }, [close, connect]);
}
