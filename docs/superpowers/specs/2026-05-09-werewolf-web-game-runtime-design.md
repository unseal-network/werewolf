# Werewolf Web Game Runtime Design

## Status

Draft for user review.

## Context

The current Werewolf flow across `unseal-cli` and `unseal-agents` depends too much on agent or GM wake-up behavior to infer whether a room is full, whether a phase should advance, and which action should happen next. That makes the game slow and fragile.

This project creates a new independent Web game room system. Matrix remains an identity and entry surface, but Matrix rooms no longer host game state, public discussion, or phase progression. The game runtime is the only GM.

## Goals

- Build an independent Werewolf Web game room with a backend API and separate Web client.
- Keep APIs stable enough for a future mobile client.
- Use Matrix access tokens on every API request; do not create a separate game auth session.
- Let users enter from Matrix game cards with `sourceMatrixRoomId` and `gameRoomId`.
- Allow multiple Matrix rooms to link into the same game room.
- Let the creator configure the game before start, then act only as a normal player with pause, resume, and end controls.
- Make the deterministic game runtime own all rules, hidden state, phase progression, timing, settlement, and win checks.
- Store user, room, seat, and online state as relational state.
- Store only game content as an append-only timeline for replay, audit, and post-game summaries.
- Support 6-12 players with dynamic role distributions based on existing Werewolf logic.
- Let creator add AI players from agents discovered through a configurable Matrix room.
- Run AI turns through a lightweight tool-based agent harness, with LLM calls routed through Unseal agent `llm/generate`.

## Non-Goals

- Do not run the game inside Matrix room messages.
- Do not reuse the old `unseal-cli` workflow runtime or Matrix scoped-state game flow.
- Do not let creator, GM agents, or player agents decide phase progression or rules.
- Do not expose hidden state through public events or projections.
- Do not implement sheriff, last words, complex custom boards, voice rooms, or advanced replay analytics in the first version.
- Do not require agents to hand-write backend action JSON.

## Product Model

Game creation happens from a Matrix room context. The creator provides a Matrix token and `sourceMatrixRoomId`, configures title, target player count, timing, allowed entry rooms, and AI source room, then creates a game. The backend returns a `gameRoomId` and game card payload or URL. That card is sent to the Matrix room.

Players click the Matrix card to open the Web game. The URL carries `gameRoomId` and the current `sourceMatrixRoomId`. Every API request includes `Authorization: Bearer <matrix_access_token>`. The backend calls Matrix `whoami` or uses a short TTL identity cache, then upserts the corresponding game user.

`sourceMatrixRoomId` is an entry context, not the game container. It can differ per player and can change over time. `gameRoomId` is the actual game room. Multiple Matrix rooms may link to one game room. By default, any Matrix room entry may join; creator can optionally restrict allowed source Matrix rooms.

Creator is not GM. Creator is a normal player plus room setup powers. Before the game starts, creator may edit configuration, manage seats, choose the agent source room, add or remove AI players, and start. After start, creator may only pause, resume, or end the game. Creator sees only their player perspective.

## Architecture

The project is a TypeScript monorepo with separated backend and frontend:

- `apps/api`: HTTP API, realtime subscriptions, Matrix token authentication, room management, and external Unseal/Synapse client orchestration.
- `apps/web`: Web client. It calls only the new backend API and never calls Synapse or Unseal agent internals directly.
- `apps/runtime-worker`: deterministic game runtime worker and scheduler.
- `packages/shared`: DTOs, Zod schemas, error codes, event types, role and phase enums.
- `packages/werewolf-engine`: pure rules engine. It has no DB, network, Matrix, or LLM dependencies.
- `packages/agent-client`: clients for Synapse room agents and Unseal agent LLM generate.
- `packages/db`: schema, migrations, repositories, transactions, and projection persistence.

The API handles user commands and room setup. The runtime worker is the only GM. It uses DB leases to own active rooms, advances deadlines, calls the pure engine, writes game events, updates projections, and invokes AI turns when needed.

## Authentication

There is no `/auth/matrix/session` endpoint.

All API requests use:

```http
Authorization: Bearer <matrix_access_token>
```

The backend validates the token by calling Matrix `whoami`, then maps the Matrix user to a local `game_users` row. The backend may cache identity for a short TTL, but Matrix token semantics remain the source of truth. This keeps the Web client compatible with Matrix Web App embedding and gives future mobile clients the same contract.

## Data Model

Relational state stores current identity, room, seat, and projection data. These records are updateable and are not part of the append-only game timeline.

Core relational tables:

- `game_users`: local user id, Matrix user id, display name, avatar, and last seen time.
- `game_rooms`: room id, creator id, status, title, target player count, timing config, created-from Matrix room id, allowed source Matrix room ids, agent source Matrix room id, started/paused/ended timestamps, next tick time, runtime lease fields.
- `game_room_players`: room id, player id, seat number, player kind `user|agent`, linked user or agent id, display name, ready state, online state, joined and left timestamps.
- `player_private_state`: cached current private view for a player, including role, team, alive state, legal private hints, and private results.
- `room_projection`: cached public room state, including phase, day, current speaker, deadline, alive players, public vote status, winner, and projection version.

The append-only timeline records only game content:

- `game_events`: room id, sequence, type, visibility, actor id, subject id, payload, and created timestamp.

Visibility values include:

- `public`
- `private:user:<playerId>`
- `private:team:wolf`
- `runtime`

Typical events:

- `game_started`
- `roles_assigned`
- `phase_started`
- `turn_started`
- `speech_submitted`
- `night_action_submitted`
- `vote_submitted`
- `phase_closed`
- `night_resolved`
- `player_eliminated`
- `game_ended`
- `agent_turn_started`
- `agent_llm_requested`
- `agent_llm_completed`
- `agent_turn_failed`
- `post_game_summary_created`

Timeline is used for replay, audit, settlement explanation, and post-game summaries. Projection is used for fast snapshots and client rendering. Public events and public projections must never leak hidden roles, night targets, wolf-private discussion, witch medication causes, or other private facts before they are public by rule.

## Game Flow

The room lifecycle is:

1. `created`: creator made a game from Matrix room context.
2. `waiting`: players join, creator edits settings, AI players are added, and seats are prepared.
3. `active`: runtime owns the game loop.
4. `paused`: deadlines and ticks are suspended.
5. `ended`: game no longer advances; timeline and summaries remain available.

The game supports 6-12 players. At start, runtime validates player count and seat state, snapshots the current seats, writes `game_started`, assigns roles using dynamic role distributions based on the existing Werewolf logic, writes private role events, and initializes projections.

First-version roles are werewolf, seer, witch, guard, and villager.

Runtime-controlled phases:

- night role stages collect legal night actions with deadlines.
- night resolution settles wolf kill, guard protection, witch heal and poison, seer result visibility, and public dawn result.
- day speech assigns one current speaker at a time and accepts only that player's speech.
- day vote accepts living player votes until all have voted or deadline expires.
- day resolution settles exile and win checks.
- the cycle repeats until `game_ended`.

Default timing is configurable at creation and editable before start. Initial defaults are 45 seconds for night role action windows, 60 seconds per speaker, and 30 seconds for voting. AI turns have stricter internal timeouts so the game never waits indefinitely.

## API Shape

All endpoints require Matrix bearer auth unless explicitly documented otherwise.

Core endpoints:

- `POST /games`: create a game from Matrix room context and return `gameRoomId` plus game card payload or URL.
- `PATCH /games/{gameRoomId}`: update title, player count, timing, source policy, allowed source room ids, and agent source room before start.
- `GET /games/{gameRoomId}?sourceMatrixRoomId=...`: return a perspective-filtered room snapshot.
- `POST /games/{gameRoomId}/join`: join a waiting game.
- `POST /games/{gameRoomId}/leave`: leave a waiting game.
- `GET /games/{gameRoomId}/agent-candidates`: creator searches agents from `agentSourceMatrixRoomId`.
- `POST /games/{gameRoomId}/agents`: creator adds an AI agent as a player before start.
- `DELETE /games/{gameRoomId}/players/{playerId}`: creator removes a player before start.
- `POST /games/{gameRoomId}/start`: creator starts the game.
- `POST /games/{gameRoomId}/pause`: creator pauses an active game.
- `POST /games/{gameRoomId}/resume`: creator resumes a paused game.
- `POST /games/{gameRoomId}/end`: creator ends the game.
- `POST /games/{gameRoomId}/actions`: submit speech, vote, night action, or pass.
- `GET /games/{gameRoomId}/events`: paginated perspective-filtered timeline.
- `GET /games/{gameRoomId}/subscribe`: WebSocket or SSE stream for projection and event deltas.

State-changing endpoints accept an idempotency key so Web and mobile clients can retry safely.

## Web Client

The Web client is the first API consumer, not a privileged runtime component.

Main views:

- create game: Matrix entry context, title, player count, time settings, source restrictions, and AI source room.
- waiting room: seats, ready status, creator configuration, agent search, AI add/remove, and start.
- game table: phase, countdown, public timeline, seats, current speaker, legal action panel.
- private panel: role, team, private role results, legal private actions, and wolf-team visibility where applicable.
- post-game: result, role reveal, public timeline, and generated summaries.

The UI should be dense and operational rather than a marketing page. It should expose the actual table as the first screen once a player opens a game card.

## Agent Source And AI Turns

AI player discovery:

- `agentSourceMatrixRoomId` defaults to the room that created the game.
- Creator may change it before start.
- The backend calls Synapse with the creator's Matrix token:

```http
GET /chatbot/v1/rooms/{room_id}/agents?membership=join
```

The response provides agent user ids, display names, avatars, memberships, and user types. Selected agents become `game_room_players` with kind `agent`.

AI turn execution uses a new lightweight harness, not the old `unseal-agents` game harness implementation. The retained idea is precise tool exposure:

- runtime creates an `AgentTurn` only when the game needs that AI player to act.
- the turn input contains the player's perspective, phase, public context, private context, task, and the smallest legal tool set.
- tools are domain-level actions such as `saySpeech`, `submitVote`, `abstain`, `wolfKill`, `seerInspect`, `witchHeal`, `witchPoison`, `guardProtect`, and `passAction`.
- the agent never constructs backend API JSON.
- tool calls route back through the runtime command gateway.
- runtime validates legality before writing events.

The agent loop itself remains normal. Only its LLM request path is replaced with Unseal agent generate:

```http
POST /agents/{agentId}/llm/generate
```

The request uses the existing Unseal generate schema with system/messages or prompt plus generation settings. This reuses the selected agent's model configuration, provider credentials, and accounting. Illegal tool calls, invalid arguments, missing tool calls, LLM errors, or timeouts produce `agent_turn_failed` and a pass/default action.

## Consistency And Error Handling

All state-changing API handlers use transactions and version checks. Player actions validate game status, phase, actor, target, deadline, duplicate submissions, and legal action rules before writing events.

Runtime workers use DB leases per room. A worker tick loads the latest projection and event sequence, computes decisions through the pure engine, appends runtime events, updates projections, and schedules the next tick in one transaction where possible.

Pause stores remaining deadline time or equivalent timing metadata. Resume recalculates deadlines. End writes `game_ended` and prevents further ticks.

External calls have strict timeouts:

- Matrix `whoami` and agent discovery fail fast with user-facing API errors.
- Agent LLM generation failures never block game progress.
- Post-game summaries can fail without changing the game result.

## Testing Plan

Rule engine tests:

- 6-12 player role distribution.
- night settlement interactions.
- vote resolution and ties.
- win-condition checks.
- phase legality and default actions.

API tests:

- Matrix bearer auth and `whoami` mapping.
- create, update, join, leave, start, pause, resume, end.
- creator permissions before and after start.
- source room restriction behavior.
- start validation for player count and seats.

Event and projection tests:

- append order and sequence uniqueness.
- projection rebuild from events.
- perspective filtering.
- public timeline hidden-information safety.

Runtime tests:

- deadline advancement.
- pause and resume timing.
- DB lease behavior.
- duplicate tick prevention.
- AI timeout default behavior.

Agent harness tests:

- phase-specific precise tool exposure.
- valid tool call creates the expected command.
- invalid tool call is rejected.
- generated action goes through runtime validation.

Web E2E tests:

- create game from Matrix card context.
- enter waiting room from card.
- configure game.
- add AI from agent source room.
- start and complete a smoke-test game.

## Initial Implementation Defaults

- Use Hono for the API server unless implementation planning finds a strong reason to use another TypeScript HTTP framework.
- Use React with TanStack Router for the Web client unless implementation planning finds a better fit.
- Use Postgres as the durable store.
- Prefer Drizzle for schema and migrations unless implementation planning finds a repo-local reason to choose another migration tool.
- Use SSE for first-version realtime projection/event deltas. Add WebSocket later only if bidirectional realtime transport becomes necessary.
- Define the Matrix card payload as a stable JSON object containing `gameRoomId`, `sourceMatrixRoomId`, `title`, `targetPlayerCount`, `webUrl`, and optional `expiresAt`.

These defaults keep the implementation concrete while preserving the product and runtime boundaries above.
