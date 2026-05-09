import { describe, expect, it } from "vitest";
import { createDrizzleEventRepositorySql } from "./drizzle-events";

describe("createDrizzleEventRepositorySql", () => {
  it("uses room scoped max seq before insert", () => {
    const sql = createDrizzleEventRepositorySql("game_1", 2);
    expect(sql.lockKey).toBe("events:game_1");
    expect(sql.insertCount).toBe(2);
  });
});
