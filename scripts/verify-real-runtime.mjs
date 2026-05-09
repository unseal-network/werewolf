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
  const agentApiKey = ssh(
    "unseal-agent-dev",
    `cd /home/ubuntu/unseal-agents && set -a && . apps/server/.env && set +a && printf %s "$ADMIN_TOKEN"`
  );
  if (tokens.length !== 6) throw new Error(`Expected 6 tokens, got ${tokens.length}`);
  if (!agentApiKey) throw new Error("Missing agent API key");
  return { tokens, agentApiKey };
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

const { tokens, agentApiKey } = loadRemoteSecrets();
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
let finalProjection = started.projection;
for (let index = 0; index < 30; index += 1) {
  const tick = await request(`/games/${create.gameRoomId}/runtime/tick`, tokens[0], {
    method: "POST",
    body: JSON.stringify({
      agentApiKey,
      agentApiBaseUrl:
        process.env.UNSEAL_AGENT_API_BASE_URL ??
        "https://un-server.dev-excel-alt.pagepeek.org/api",
    }),
  });
  finalProjection = tick.projection;
  eventTypes.push(...tick.events.map((event) => event.type));
  console.log("tick", index + 1, tick.projection.phase, tick.events.map((event) => event.type).join(","));
  if (tick.done) break;
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
]) {
  if (!eventTypes.includes(required)) {
    throw new Error(`Missing event type ${required}`);
  }
}
console.log("verified", finalProjection.phase, finalProjection.winner);
