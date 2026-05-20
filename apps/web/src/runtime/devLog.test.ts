import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("dev log wrapper", () => {
  it("keeps the mobile dev console disabled unless explicitly enabled", () => {
    const source = readFileSync(
      resolve(process.cwd(), "apps/web/src/runtime/devLog.ts"),
      "utf8"
    );

    expect(source).toContain('export const DEV_LOG_STORAGE_KEY = "werewolfDevLog"');
    expect(source).toContain('export const DEV_LOG_QUERY_KEY = "devLog"');
    expect(source).toContain('if (typeof window === "undefined") return false');
    expect(source).toContain('if (!readDevLogFlag()) return;');
  });

  it("routes app log calls through the local wrapper instead of mounting mobile-log directly", () => {
    const files = [
      "apps/web/src/main.tsx",
      "apps/web/src/runtime/unsealClient.ts",
      "apps/web/src/game/timelineState.ts",
    ].map((file) => readFileSync(resolve(process.cwd(), file), "utf8"));

    expect(files[0]).toContain('import { un } from "./runtime/devLog";');
    expect(files[1]).toContain('import { un } from "./devLog";');
    expect(files[2]).toContain('import { un } from "../runtime/devLog";');
    expect(files.join("\n")).not.toContain('@unseal-network/mobile-log');
  });
});

