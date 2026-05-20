import { describe, expect, it } from "vitest";
import { isActionStateConflictError } from "./actionConflict";

describe("isActionStateConflictError", () => {
  it("detects stale action conflicts from the API error payload", () => {
    const error = new Error(
      '{"error":"Action phase has changed","code":"conflict"}'
    );

    expect(isActionStateConflictError(error)).toBe(true);
  });

  it("ignores unrelated errors", () => {
    expect(isActionStateConflictError(new Error("Target is missing"))).toBe(
      false
    );
  });
});
