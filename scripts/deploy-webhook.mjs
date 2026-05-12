import { mkdir, open } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";

const root = process.env.DEPLOY_ROOT ?? process.cwd();
const remote = process.env.DEPLOY_REMOTE ?? "origin";
const branch = process.env.DEPLOY_BRANCH ?? "main";
const lockPath = process.env.DEPLOY_LOCK_PATH ?? "/tmp/werewolf-deploy.lock";
const webBasePath = process.env.WEB_BASE_PATH ?? "/werewolf/";

async function run(command, args, options = {}) {
  console.log(`[deploy] $ ${command} ${args.join(" ")}`);
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env: { ...process.env, ...options.env },
      shell: false,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} exited with ${code ?? signal}`));
    });
  });
}

async function withLock(fn) {
  await mkdir(path.dirname(lockPath), { recursive: true });
  const lock = await open(lockPath, "wx").catch((error) => {
    if (error?.code === "EEXIST") {
      throw new Error(`deployment already running; lock exists at ${lockPath}`);
    }
    throw error;
  });

  try {
    await lock.writeFile(`${process.pid}\n${new Date().toISOString()}\n`);
    await fn();
  } finally {
    await lock.close().catch(() => {});
    await import("node:fs/promises").then((fs) => fs.rm(lockPath, { force: true }));
  }
}

await withLock(async () => {
  console.log(`[deploy] Starting ${new Date().toISOString()} in ${root}`);
  await run("git", ["pull", "--ff-only", remote, branch]);
  await run("pnpm", ["install", "--frozen-lockfile"]).catch(async (error) => {
    console.warn(`[deploy] frozen install failed: ${error.message}`);
    await run("pnpm", ["install", "--no-frozen-lockfile"]);
    await run("git", ["checkout", "--", "package.json", "pnpm-lock.yaml"]);
  });
  await run("pnpm", ["migrate"]);
  await run("pnpm", ["--filter", "@werewolf/api", "build"]);
  await run("pnpm", ["--filter", "@werewolf/web", "build"], {
    env: { VITE_APP_BASE_PATH: webBasePath },
  });
  await run("pm2", ["restart", "werewolf-api", "--update-env"]);
  await run("pm2", ["restart", "werewolf-web", "--update-env"]);
  await run("pm2", ["save"]);
  console.log(`[deploy] Completed ${new Date().toISOString()}`);
});
