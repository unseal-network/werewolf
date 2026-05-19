const CUSTOM_EPOCH_MS = Date.UTC(2026, 0, 1);
const MAX_WORKER_ID = 1023;
const MAX_SEQUENCE = 4095;

export type EventIdFactoryOptions = {
  workerId: number;
};

export function validateWorkerId(workerId: number): number {
  if (!Number.isInteger(workerId) || workerId < 0 || workerId > MAX_WORKER_ID) {
    throw new Error(`workerId must be an integer between 0 and ${MAX_WORKER_ID}`);
  }
  return workerId;
}

export function createEventIdFactory(options: EventIdFactoryOptions) {
  const workerId = validateWorkerId(options.workerId);
  let lastMs = 0;
  let sequence = 0;

  return function createEventId(nowMs = Date.now()): string {
    let timestampMs = Math.max(nowMs, lastMs);
    if (timestampMs === lastMs) {
      sequence += 1;
      if (sequence > MAX_SEQUENCE) {
        timestampMs = lastMs + 1;
        sequence = 0;
      }
    } else {
      sequence = 0;
    }
    lastMs = timestampMs;

    const value =
      (BigInt(timestampMs - CUSTOM_EPOCH_MS) << 22n) |
      (BigInt(workerId) << 12n) |
      BigInt(sequence);
    return value.toString(36).padStart(13, "0");
  };
}

export function readRequiredWorkerIdFromEnv(env = process.env): number {
  const raw = env.EVENT_ID_WORKER_ID;
  if (raw === undefined || !/^(0|[1-9]\d*)$/.test(raw)) {
    throw new Error("EVENT_ID_WORKER_ID is required; assign a unique worker id per API/runtime process");
  }
  return validateWorkerId(Number(raw));
}

let defaultCreateEventId: ReturnType<typeof createEventIdFactory> | undefined;

export function createEventId(nowMs = Date.now()): string {
  defaultCreateEventId ??= createEventIdFactory({
    workerId: readRequiredWorkerIdFromEnv(),
  });
  return defaultCreateEventId(nowMs);
}
