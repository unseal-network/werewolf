import { describe, expect, it } from "vitest";
import { nextUrlAfterUserSelect } from "./user-select";

describe("user select routing", () => {
  it("returns to the create room page after choosing an account", () => {
    expect(nextUrlAfterUserSelect("/", "?chooseUser=1")).toBe("/");
  });

  it("keeps the target room when account selection came from a room link", () => {
    expect(nextUrlAfterUserSelect("/", "?chooseUser=1&gameRoomId=room_123")).toBe(
      "/?gameRoomId=room_123"
    );
  });

  it("preserves unrelated query params while removing the account chooser flag", () => {
    expect(nextUrlAfterUserSelect("/play", "?chooseUser=1&uiDemo=1")).toBe(
      "/play?uiDemo=1"
    );
  });
});
