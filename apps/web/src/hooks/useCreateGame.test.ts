import { describe, expect, it } from "vitest";
import { shouldContinueAfterGameCreatedHookError } from "./useCreateGame";

describe("useCreateGame post-create hook", () => {
  it("continues into the game even if optional host room linking fails", () => {
    expect(shouldContinueAfterGameCreatedHookError(new Error("link failed"))).toBe(true);
  });
});
