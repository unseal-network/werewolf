import { Hono } from "hono";
import { closeSync, openSync, writeSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createHmac, timingSafeEqual } from "node:crypto";
import path from "node:path";

function timingSafeEqualText(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function readPresentedSecret(request: Request): string | null {
  const headerSecret = request.headers.get("x-webhook-secret");
  if (headerSecret) return headerSecret;

  const authorization = request.headers.get("authorization");
  if (authorization?.toLowerCase().startsWith("bearer ")) {
    return authorization.slice("bearer ".length).trim();
  }

  return null;
}

function validateGitHubSignature(rawBody: string, request: Request, secret: string): boolean {
  const signature = request.headers.get("x-hub-signature-256");
  if (!signature?.startsWith("sha256=")) return false;
  const expected =
    "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
  return timingSafeEqualText(signature, expected);
}

export function createWebhookRoutes(): Hono {
  const app = new Hono();

  app.post("/webhook", async (c) => {
    const rawBody = await c.req.text();
    const githubEvent = c.req.header("x-github-event") ?? "";
    const payload = rawBody
      ? await Promise.resolve()
          .then(() => JSON.parse(rawBody))
          .catch(() => null)
      : {};
    if (!payload) {
      return c.json({ error: "invalid JSON payload" }, 400);
    }
    const targetBranch = process.env.DEPLOY_BRANCH ?? "main";
    const expectedRepository =
      process.env.DEPLOY_GITHUB_REPOSITORY ?? "unseal-network/werewolf";

    if (githubEvent === "ping") {
      return c.json({ ok: true, event: "ping" });
    }

    if (!githubEvent) {
      return c.json({ error: "missing GitHub event header" }, 400);
    }

    if (githubEvent && githubEvent !== "push") {
      return c.json({ ignored: true, reason: `unsupported GitHub event ${githubEvent}` });
    }

    if (payload?.repository?.full_name !== expectedRepository) {
      return c.json({
        ignored: true,
        reason: `repository is not ${expectedRepository}`,
      });
    }

    if (payload?.ref && payload.ref !== `refs/heads/${targetBranch}`) {
      return c.json({ ignored: true, reason: `ref ${payload.ref} is not ${targetBranch}` });
    }

    const secret = process.env.DEPLOY_WEBHOOK_SECRET;
    if (secret) {
      const presentedSecret = readPresentedSecret(c.req.raw);
      const githubSignatureValid = validateGitHubSignature(rawBody, c.req.raw, secret);
      if (
        !githubSignatureValid &&
        (!presentedSecret || !timingSafeEqualText(presentedSecret, secret))
      ) {
        return c.json({ error: "unauthorized" }, 401);
      }
    }

    const root = process.env.DEPLOY_ROOT ?? process.cwd();
    const script =
      process.env.DEPLOY_WEBHOOK_SCRIPT ??
      path.join(root, "scripts", "deploy-webhook.mjs");
    const logPath =
      process.env.DEPLOY_WEBHOOK_LOG ?? "/tmp/werewolf-deploy-webhook.log";

    await mkdir(path.dirname(logPath), { recursive: true });
    const logFd = openSync(logPath, "a");
    writeSync(logFd, `\n[webhook] accepted ${new Date().toISOString()}\n`);

    const child = spawn(process.execPath, [script], {
      cwd: root,
      detached: true,
      env: process.env,
      stdio: ["ignore", logFd, logFd],
    });
    child.unref();
    closeSync(logFd);

    return c.json({ accepted: true, pid: child.pid, logPath }, 202);
  });

  return app;
}
