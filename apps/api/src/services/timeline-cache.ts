import { compareEventIds } from "./event-id-cursor";

export interface RawTimelinePayload {
  eventId: string;
  rawSsePayload: string;
  visibility?: string;
  visibleToPlayerIds?: readonly string[];
}

export function createNoGapReplayPlan({
  snapshotEventId,
  replayPayloads,
  bufferedPayloads,
}: {
  snapshotEventId: string;
  replayPayloads: readonly RawTimelinePayload[];
  bufferedPayloads: readonly RawTimelinePayload[];
}): RawTimelinePayload[] {
  const byId = new Map<string, RawTimelinePayload>();

  for (const payload of replayPayloads) {
    if (
      compareEventIds(payload.eventId, snapshotEventId) > 0 &&
      !byId.has(payload.eventId)
    ) {
      byId.set(payload.eventId, payload);
    }
  }

  for (const payload of bufferedPayloads) {
    if (
      compareEventIds(payload.eventId, snapshotEventId) > 0 &&
      !byId.has(payload.eventId)
    ) {
      byId.set(payload.eventId, payload);
    }
  }

  return [...byId.values()].sort((a, b) =>
    compareEventIds(a.eventId, b.eventId)
  );
}
