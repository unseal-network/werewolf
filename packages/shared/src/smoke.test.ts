import { describe, expect, it } from "vitest";
import { roleSchema } from ".";

describe("shared package", () => {
  it("loads", () => {
    expect(roleSchema.parse("villager")).toBe("villager");
  });
});
