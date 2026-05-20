import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("api package env loading", () => {
  it("loads only the repository root .env for runtime scripts", () => {
    const pkg = JSON.parse(readFileSync("apps/api/package.json", "utf8")) as {
      scripts: Record<string, string>;
    };

    expect(pkg.scripts.dev).toContain("--env-file=../../.env");
    expect(pkg.scripts.start).toContain("--env-file=../../.env");
    expect(pkg.scripts.dev).not.toContain("--env-file=./.env");
    expect(pkg.scripts.start).not.toContain("--env-file=./.env");
  });
});
