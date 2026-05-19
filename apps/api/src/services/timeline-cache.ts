import { compareEventIds } from "./event-id-cursor";

export interface RawTimelinePayload {
  id: string;
  rawSsePayload: string;
}

export function createNoGapReplayPlan({
  snapshotEventId,
  replay,
  buffer,
}: {
  snapshotEventId: string;
  replay: RawTimelinePayload[];
  buffer: RawTimelinePayload[];
}): RawTimelinePayload[] {
  const byId = new Map<string, RawTimelinePayload>();

  for (const payload of replay) {
    if (compareEventIds(payload.id, snapshotEventId) > 0 && !byId.has(payload.id)) {
      byId.set(payload.id, payload);
    }
  }

  for (const payload of buffer) {
    if (compareEventIds(payload.id, snapshotEventId) > 0 && !byId.has(payload.id)) {
      byId.set(payload.id, payload);
    }
  }

  return [...byId.values()].sort((a, b) => compareEventIds(a.id, b.id));
}
