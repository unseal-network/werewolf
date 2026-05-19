const staleActionMessages = new Set([
  "Action phase has changed",
  "Action day has changed",
  "Action turn has changed",
]);

export function isActionStateConflictError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  try {
    const payload = JSON.parse(error.message) as {
      code?: unknown;
      error?: unknown;
    };
    return (
      payload.code === "conflict" &&
      typeof payload.error === "string" &&
      staleActionMessages.has(payload.error)
    );
  } catch {
    return false;
  }
}
