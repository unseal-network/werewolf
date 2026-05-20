const LEGACY_EVENT_ID_PATTERN = /^(.*)_(\d+)$/;

interface LegacyEventIdParts {
  prefix: string;
  suffix: bigint;
}

export function compareEventIds(a: string, b: string): number {
  const parsedA = parseLegacyEventId(a);
  const parsedB = parseLegacyEventId(b);

  if (parsedA && parsedB && parsedA.prefix === parsedB.prefix) {
    if (parsedA.suffix < parsedB.suffix) return -1;
    if (parsedA.suffix > parsedB.suffix) return 1;
  }

  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export function isEventIdAfter(id: string, cursor: string): boolean {
  return compareEventIds(id, cursor) > 0;
}

function parseLegacyEventId(id: string): LegacyEventIdParts | null {
  const match = LEGACY_EVENT_ID_PATTERN.exec(id);
  if (!match) return null;
  return {
    prefix: match[1]!,
    suffix: BigInt(match[2]!),
  };
}
