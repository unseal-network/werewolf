import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { createTestDeps } from "../test-utils";

const originalEnv = { ...process.env };
let tempDir: string | null = null;

describe("deploy webhook", () => {
  beforeEach(async () => {
    process.env = { ...originalEnv };
    delete process.env.DEPLOY_WEBHOOK_SECRET;
    tempDir = await mkdtemp(path.join(tmpdir(), "werewolf-webhook-"));
    const scriptPath = path.join(tempDir, "noop.mjs");
    await writeFile(scriptPath, "process.exit(0);\n");
    process.env.DEPLOY_ROOT = tempDir;
    process.env.DEPLOY_WEBHOOK_SCRIPT = scriptPath;
    process.env.DEPLOY_WEBHOOK_LOG = path.join(tempDir, "deploy.log");
    process.env.DEPLOY_GITHUB_REPOSITORY = "unseal-network/werewolf";
  });

  afterEach(async () => {
    process.env = { ...originalEnv };
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it("accepts GitHub push events for the configured repository and branch", async () => {
    const app = createApp(createTestDeps());
    const response = await app.request("/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-github-event": "push",
      },
      body: JSON.stringify({
        ref: "refs/heads/main",
        repository: { full_name: "unseal-network/werewolf" },
      }),
    });

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({ accepted: true });
  });

  it("does not deploy unsupported GitHub events", async () => {
    const app = createApp(createTestDeps());
    const response = await app.request("/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-github-event": "issues",
      },
      body: "{}",
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ignored: true });
  });
});
