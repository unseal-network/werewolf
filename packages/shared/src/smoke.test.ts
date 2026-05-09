import { describe, expect, it } from "vitest";
import { sharedPackageReady } from ".";

describe("shared package", () => {
  it("loads", () => {
    expect(sharedPackageReady).toBe(true);
  });
});
