# Agent Harness Prompt Design

Date: 2026-05-13

## Goal

Port the full prompt-harness architecture from `oil-oil/wolfcha` into this server-driven Werewolf runtime so agent turns are phase-aware, strategically grounded, and more human-like. The target is not to copy `wolfcha`'s frontend state machine. The target is to reproduce its prompt discipline: each game phase has its own prompt builder, all builders consume structured game context, private information is surfaced first, and every turn has explicit action or speech quality requirements.

## Current Problem

The current API path builds a rich but monolithic context in `apps/api/src/services/agent-context.ts`, then `apps/api/src/services/game-service.ts` appends a short task prompt and sends it as one user message. This causes several quality problems:

- Day speeches can be generic because the prompt does not strongly assign a speaking responsibility.
- Agent behavior is not consistently phase-specific; many phases rely on short one-line instructions.
- Role strategy is basic and mostly static.
- Public speeches lack a per-player perspective, so multiple agents can sound similar.
- `apps/api/src/services/agent-turn.ts` sends a single user message, leaving no stable system layer for identity, role strategy, speech style, and output rules.

## Reference Model

`wolfcha` uses these useful patterns:

- `PromptResult` with separate `system`, `user`, and cacheable system parts.
- One prompt builder per phase, for example day speech, vote, and night actions.
- Reusable game-context sections such as current status, game state, alive players, history, votes, private role info, and action options.
- Role-specific private information appears near the top of context.
- Day speech prompts include speaking order, current transcript, self speech, role know-how, situational tips, and output constraints.
- Strategy hints are advisory, not forced. They guide the model without making all agents choose the same line.

## Architecture

Add a new API-side harness under `apps/api/src/services/agent-harness/`.

Planned files:

- `types.ts`
  Defines `AgentPromptMessage`, `AgentPromptResult`, `AgentPromptPart`, and `BuildAgentPromptInput`.
- `context.ts`
  Builds structured visible game context from `StoredGameRoom`, `StoredPlayer`, and `PlayerPrivateState`.
- `strategy.ts`
  Builds role strategy, situational strategy, focus angles, speaking-order hints, and speech quality rules.
- `phases/day-speech.ts`
  Builds public speech and tie-speech prompts.
- `phases/day-vote.ts`
  Builds public vote and tie-vote prompts.
- `phases/night-wolf.ts`
  Builds wolf private discussion and wolf kill-vote prompts.
- `phases/night-role.ts`
  Builds seer, witch, guard, and pass-action night prompts.
- `index.ts`
  Exports `buildAgentPrompt` and dispatches by phase and requested turn kind.

This keeps prompt code separate from `game-service.ts`, where orchestration and event recording should remain.

## Prompt Contract

`buildAgentPrompt(input)` returns:

```ts
type AgentPromptResult = {
  messages: Array<{ role: "system" | "user"; content: string }>;
  system: string;
  user: string;
  textPrompt: string;
};
```

`textPrompt` is a compatibility fallback containing `system + "\n---\n" + user`.

`RuntimeAgentTurnInput` will gain an optional `messages` field:

```ts
messages?: Array<{ role: "system" | "user"; content: string }>;
```

`agent-turn.ts` will prefer `input.messages` when present and fall back to the existing single user prompt otherwise.

## Context Sections

The harness will build context using stable, tagged sections:

- `<your_private_info>`
  Role-specific private information. Examples: wolf teammates, seer inspections, witch potion state, guard previous target.
- `<current_status>`
  Day, phase, acting player, role, and whether the current turn is speech, vote, or night action.
- `<game_state>`
  Alive/dead counts, alive player list, dead players, current speaker, and allowed targets.
- `<history>`
  Recent public speeches, plus compressed older day summaries once available.
- `<votes>`
  Public vote history and tie-vote candidates when applicable.
- `<wolf_team_history>`
  Only visible to wolves during wolf-private phases.
- `<focus_angle>`
  A player-specific angle for this turn.
- `<action_options>`
  Legal target ids and labels for tool calls.

Visibility rules stay strict:

- Public context includes public events only.
- Wolf team context appears only to wolves during wolf-private phases.
- Runtime events are excluded from agent-visible context.
- Private role facts are shown only to the owning player.

## Phase Designs

### Day Speech

Applies to `day_speak` and `tie_speech`.

System message includes:

- Identity and role.
- Win condition.
- Role strategy.
- Situational strategy.
- Speech style rules.
- Output requirement to call `saySpeech`.

User message includes:

- Structured game context.
- Recent speeches.
- Speaking order.
- Who has spoken and who has not.
- Focus angle.
- Current task.

Speech rules:

- Use natural Chinese table-talk unless room language requires English.
- 2-5 concise sentences.
- Mention players by seat number or display name from context.
- Give at least one concrete suspicion, trust read, or vote direction.
- Do not invent speeches, checks, votes, or deaths.
- Do not say "as an AI".
- Do not reveal hidden role information unless strategically appropriate for that role and phase.

Focus-angle examples:

- If another player mentioned this agent today, suggest responding or reframing.
- If the agent is first speaker, suggest opening with a concrete read instead of referencing nonexistent prior speech.
- If the agent is late speaker, suggest comparing contradictions from earlier speeches.
- If vote history exists, suggest reasoning about aligned or conflicting votes.

### Day Vote

Applies to `day_vote` and `tie_vote`.

System message includes:

- Identity and role.
- Win condition.
- Role strategy for voting.
- Requirement to call exactly one voting tool.

User message includes:

- Current game context.
- Today's transcript.
- Agent's own speech summary.
- Allowed vote targets.
- Tie-vote restriction when applicable.

Voting rules:

- Vote consistently with public reasoning when possible.
- Consider all current-day speeches, not only the most recent message.
- Do not blindly follow a suggested target.
- Do not vote self.
- In tie vote, choose only from the allowed tied candidates or abstain if the tool supports it.

### Night Wolf

Applies to wolf discussion and wolf kill voting.

System message includes:

- Wolf identity and win condition.
- Teammates.
- Wolf strategy library.
- Anti-leak self-check.
- Tool requirement for the current step.

User message includes:

- Wolf-private context.
- Prior wolf discussion and wolf votes for this phase.
- Public day history.
- Candidate targets.
- Current requested action: private speech or kill vote.

Strategy hints:

- Prioritize strong village roles when inferred.
- Coordinate with teammates without overfitting to a fallback target.
- Consider self-kill only if future rules support it; current engine validation may reject invalid targets.
- For public day speech, avoid exposing wolf-only knowledge.

### Night Role Actions

Applies to guard, witch, and seer.

System message includes:

- Role identity and win condition.
- Role-specific action strategy.
- Tool requirement for the current phase.

User message includes:

- Private role records.
- Public history.
- Legal target ids.
- Constraints such as guard no-consecutive-target and witch potion availability.

Action rules:

- Use the phase's tool or pass tool.
- Prefer legal target ids from `<action_options>`.
- Do not output explanatory prose as the action result.

## Integration Plan

`game-service.ts` will call `buildAgentPrompt` inside `runAgentToolTurn`. Existing callers can keep passing a short phase/task instruction, but the harness becomes responsible for turning that into phase-aware messages.

The existing `buildAgentContext` can either:

- become a compatibility wrapper around the new context builder, or
- remain as a low-level helper during the first implementation step.

The preferred end state is that new prompt code lives in `agent-harness`, while `buildAgentContext` is kept only for tests or deprecated compatibility.

`agent-turn.ts` will send:

```ts
messages: input.messages ?? [{ role: "user", content: input.prompt }]
```

This preserves the old API path while enabling the new harness.

## Test Plan

Use TDD. Write failing tests before production code.

Tests:

- `apps/api/src/services/agent-harness/context.test.ts`
  Verifies visibility boundaries, role private information, legal targets, and speech history formatting.
- `apps/api/src/services/agent-harness/strategy.test.ts`
  Verifies role strategy, speaking-order hints, and focus angles.
- `apps/api/src/services/agent-harness/index.test.ts`
  Verifies phase dispatch returns distinct system/user prompts for day speech, day vote, wolf night, and role night.
- `apps/api/src/services/agent-turn.test.ts`
  Verifies `buildRunAgentTurn` passes multi-message prompts when provided and keeps fallback behavior.
- Existing `agent-context.test.ts`
  Either remains green through compatibility or is updated to the new harness context.

Targeted regression assertions:

- A wolf during public day speech does not see private wolf discussion.
- A wolf during wolf night does see wolf team history.
- Day speech prompt includes speaking order and focus angle.
- Day vote prompt includes allowed targets and tool-call requirement.
- Seer prompt includes previous inspections.
- Witch prompt includes potion state.
- Guard prompt includes previous guard target.

## Rollout

Implement in small slices:

1. Add harness types and context builder with visibility tests.
2. Add strategy helpers with tests.
3. Add phase builders and dispatch tests.
4. Update `RuntimeAgentTurnInput` and `agent-turn.ts` message handling.
5. Integrate `buildAgentPrompt` in `runAgentToolTurn`.
6. Run API service tests and typecheck.

## Non-Goals

- Do not copy `wolfcha`'s frontend `PhaseManager`.
- Do not change core game rules.
- Do not change engine validation semantics.
- Do not require LLM reasoning text to be stored.
- Do not add long-term summary generation in this pass, although the context format leaves room for it.

## Risks

- Prompt length can grow. Mitigation: cap speech history and keep strategy sections concise.
- More structured prompts may conflict with tool-only phases. Mitigation: phase builders explicitly state tool-call-only behavior for actions.
- Multi-message support depends on the Unseal agent endpoint accepting OpenAI-style chat messages. Mitigation: keep `textPrompt` fallback and only prefer `messages` when present.
- Role strategy could make agents too similar if over-prescriptive. Mitigation: focus angles are player-specific and strategies are advisory.

## Acceptance Criteria

- Agent prompt generation is phase-aware and covered by tests.
- `buildRunAgentTurn` supports multi-message prompts.
- Existing agent tool calls still work.
- Public contexts do not leak wolf-private information.
- Day speeches include stronger human-like structure: speaking order, focus angle, and concrete judgment requirements.
- Night actions include role-specific private facts and legal target options.
