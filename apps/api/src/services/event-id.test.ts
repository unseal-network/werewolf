import { describe, expect, it } from "vitest";
import {
  createEventIdFactory,
  readRequiredWorkerIdFromEnv,
  validateWorkerId,
} from "./event-id";

describe("snowflake event ids", () => {
  it("are unique and sortable within one worker", () => {
    const createEventId = createEventIdFactory({ workerId: 7 });
    const ids = Array.from({ length: 1000 }, () => createEventId(1_800_000_000_000));
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort((a, b) => a.localeCompare(b))).toEqual(ids);
  });

  it("are unique across workers with different worker ids", () => {
    const a = createEventIdFactory({ workerId: 1 });
    const b = createEventIdFactory({ workerId: 2 });
    const ids = new Set<string>();
    for (let index = 0; index < 1000; index += 1) {
      ids.add(a(1_800_000_000_000));
      ids.add(b(1_800_000_000_000));
    }
    expect(ids.size).toBe(2000);
  });

  it("advances logical milliseconds on sequence overflow without waiting for wall clock", () => {
    const createEventId = createEventIdFactory({ workerId: 1 });
    const ids = Array.from({ length: 4098 }, () => createEventId(1_900_000_000_000));

    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort((a, b) => a.localeCompare(b))).toEqual(ids);
  });

  it("survives clock rollback by preserving monotonic order", () => {
    const createEventId = createEventIdFactory({ workerId: 3 });
    const first = createEventId(1_900_000_000_010);
    const second = createEventId(1_900_000_000_000);
    expect(first < second).toBe(true);
  });

  it("rejects invalid worker ids loudly", () => {
    expect(() => validateWorkerId(-1)).toThrow("workerId");
    expect(() => validateWorkerId(1024)).toThrow("workerId");
    expect(() => validateWorkerId(Number.NaN)).toThrow("workerId");
  });

  it("parses worker id env as strict decimal integers", () => {
    expect(readRequiredWorkerIdFromEnv({ EVENT_ID_WORKER_ID: "0" })).toBe(0);
    expect(readRequiredWorkerIdFromEnv({ EVENT_ID_WORKER_ID: "1023" })).toBe(1023);
    expect(() => readRequiredWorkerIdFromEnv({})).toThrow("EVENT_ID_WORKER_ID");
    expect(() => readRequiredWorkerIdFromEnv({ EVENT_ID_WORKER_ID: "" })).toThrow("EVENT_ID_WORKER_ID");
    expect(() => readRequiredWorkerIdFromEnv({ EVENT_ID_WORKER_ID: " " })).toThrow("EVENT_ID_WORKER_ID");
    expect(() => readRequiredWorkerIdFromEnv({ EVENT_ID_WORKER_ID: "1.0" })).toThrow("EVENT_ID_WORKER_ID");
    expect(() => readRequiredWorkerIdFromEnv({ EVENT_ID_WORKER_ID: "0x1" })).toThrow("EVENT_ID_WORKER_ID");
  });
});
