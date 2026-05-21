import { execFileSync } from "node:child_process";

const roomId = "!FWTlpFYoOXfndnfReT:keepsecret.io";
const apiBaseUrl = process.env.WEREWOLF_API_BASE_URL ?? "http://localhost:3000";

function ssh(host, command) {
  return execFileSync("ssh", [host, command], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function loadRemoteSecrets() {
  const tokens = ssh(
    "topsecret-test",
    `PGPASSWORD='Hvy60/28roQ3I7jtTZ' psql -h 127.0.0.1 -p 6432 -U keepsecret -d synapse -Atc "select access_token from olm_accounts where bot_user_id in ('@kimigame1:keepsecret.io','@kimigame2:keepsecret.io','@kimigame3:keepsecret.io','@kimigame4:keepsecret.io','@kimigame5:keepsecret.io','@kimigame6:keepsecret.io') order by bot_user_id;"`
  )
    .split("\n")
    .filter(Boolean);
  if (tokens.length !== 6) throw new Error(`Expected 6 tokens, got ${tokens.length}`);
  return { tokens };
}

async function request(path, token, init = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${init.method ?? "GET"} ${path} failed: ${response.status} ${text}`);
  }
  return body;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const { tokens } = loadRemoteSecrets();
const whoami = await fetch("https://keepsecret.io/_matrix/client/v3/account/whoami", {
  headers: { authorization: `Bearer ${tokens[0]}` },
});
const whoamiBody = await whoami.json();
console.log("whoami", whoami.status, whoamiBody.user_id);

const create = await request("/games", tokens[0], {
  method: "POST",
  body: JSON.stringify({
    sourceMatrixRoomId: roomId,
    title: "Real Runtime Verification",
    targetPlayerCount: 6,
    timing: { nightActionSeconds: 45, speechSeconds: 60, voteSeconds: 30 },
    allowedSourceMatrixRoomIds: [],
    agentSourceMatrixRoomId: roomId,
  }),
});
console.log("create", create.gameRoomId, create.card.sourceMatrixRoomId);

for (const [index, token] of tokens.entries()) {
  const joined = await request(`/games/${create.gameRoomId}/join`, token, {
    method: "POST",
  });
  console.log("join", index + 1, joined.player.displayName, joined.player.id);
}

const started = await request(`/games/${create.gameRoomId}/start`, tokens[0], {
  method: "POST",
});
console.log("start", started.status, started.projection.phase);

const eventTypes = [];
const nightActionKinds = [];
const agentToolNames = [];
let timelineAfter = started.events?.at(-1)?.id ?? "";
let finalProjection = started.projection;
eventTypes.push(...(started.events ?? []).map((event) => event.type));
for (let index = 0; index < 180; index += 1) {
  await sleep(1000);
  const snapshot = await request(`/games/${create.gameRoomId}`, tokens[0]);
  finalProjection = snapshot.snapshot.displayState.projection;
  const page = await request(
    `/games/${create.gameRoomId}/timeline?after=${encodeURIComponent(timelineAfter)}&limit=500`,
    tokens[0]
  );
  const events = page.events ?? [];
  if (page.cursor?.after) timelineAfter = page.cursor.after;
  eventTypes.push(...events.map((event) => event.type));
  nightActionKinds.push(
    ...events
      .filter((event) => event.type === "night_action_submitted")
      .map((event) => event.payload?.action?.kind)
      .filter(Boolean)
  );
  agentToolNames.push(
    ...events
      .filter((event) => event.type === "agent_llm_completed")
      .map((event) => event.payload?.toolName)
      .filter(Boolean)
  );
  console.log(
    "poll",
    index + 1,
    finalProjection?.phase,
    events.map((event) => event.type).join(",")
  );
  if (finalProjection?.phase === "post_game" || finalProjection?.status === "ended") break;
}

if (finalProjection.phase !== "post_game" || !finalProjection.winner) {
  throw new Error(`Game did not finish: ${JSON.stringify(finalProjection)}`);
}
for (const required of [
  "night_action_submitted",
  "night_resolved",
  "speech_submitted",
  "vote_submitted",
  "player_eliminated",
  "game_ended",
  "agent_llm_requested",
  "agent_llm_completed",
]) {
  if (!eventTypes.includes(required)) {
    throw new Error(`Missing event type ${required}`);
  }
}
for (const requiredAction of ["guardProtect", "wolfKill", "seerInspect"]) {
  if (!nightActionKinds.includes(requiredAction)) {
    throw new Error(`Missing night action from agent tool-call ${requiredAction}`);
  }
}
for (const requiredTool of ["guardProtect", "wolfKill", "seerInspect", "submitVote"]) {
  if (!agentToolNames.includes(requiredTool)) {
    throw new Error(`Missing completed agent tool-call ${requiredTool}`);
  }
}
console.log("verified", finalProjection.phase, finalProjection.winner);
