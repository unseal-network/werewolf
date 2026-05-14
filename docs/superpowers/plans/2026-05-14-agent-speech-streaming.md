# Agent Speech Streaming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stream public transcript deltas for agent `saySpeech` turns while existing TTS audio streams through LiveKit, then submit the final speech only after TTS completes.

**Architecture:** Keep the LLM and `saySpeech` tool contract unchanged. Add server-side speech chunking and cumulative `speech_transcript_delta` events inside `InMemoryGameService.runCurrentSpeaker`, using the same public event pipeline as human STT. Preserve the existing `voiceAgent.speak()` completion gate before `speech_submitted` and speaker advancement.

**Tech Stack:** TypeScript, Vitest, `@werewolf/shared` game events, existing API `InMemoryGameService`, existing LiveKit/Unseal `VoiceAgentService`.

---

## File Structure

- Modify `apps/api/src/services/game-service.ts`
  - Add `AGENT_SPEECH_DELTA_DELAY_MS`.
  - Add a small `sleep(ms)` helper.
  - Add `splitSpeechForDeltas(speech: string): string[]`.
  - Add `emitAgentSpeechDeltas(...)` as a private method on `InMemoryGameService`.
  - Update `runCurrentSpeaker(...)` so valid agent speech starts transcript streaming before or alongside TTS, but still writes `speech_submitted` only after streaming and TTS settle.
- Modify `apps/api/src/services/game-service.test.ts`
  - Add tests around the existing agent speech tests.
  - Extend one existing invalid-speech test to prove fallback placeholders do not stream deltas.

No frontend code is required for this feature. The frontend already handles `speech_transcript_delta` and `speech_submitted` replacement.

---

### Task 1: Add Failing Tests for Agent Speech Deltas

**Files:**
- Modify: `apps/api/src/services/game-service.test.ts`

- [ ] **Step 1: Add a test that agent speech emits cumulative deltas before final speech**

Append this test inside the existing `describe("InMemoryGameService rules", () => { ... })` block near the current agent speech tests, immediately after `waits for agent TTS completion before completing the speech turn`:

```ts
  it("streams agent speech transcript deltas before final speech submission", async () => {
    const { games, gameRoomId } = createStartedServiceGame();
    const room = games.snapshot(gameRoomId);
    const agentSpeaker = room.players[0]!;
    const humanSpeaker = room.players[1]!;
    let resolveSpeak: () => void = () => undefined;
    const speakDone = new Promise<boolean>((resolve) => {
      resolveSpeak = () => resolve(true);
    });

    games.setVoiceAgents({
      get: () => ({
        speak: () => speakDone,
      }),
    } as unknown as VoiceAgentRegistry);
    agentSpeaker.kind = "agent";
    agentSpeaker.agentId = "@agent-speaker:example.com";
    room.projection = {
      ...room.projection!,
      phase: "day_speak",
      currentSpeakerPlayerId: agentSpeaker.id,
      deadlineAt: new Date(Date.now() + 60_000).toISOString(),
    };
    room.speechQueue = [agentSpeaker.id, humanSpeaker.id];

    const advance = games.advanceGame(gameRoomId, async () => ({
      text: "unused",
      toolName: "saySpeech",
      input: {
        speech: "我先说结论。3号这轮发言偏防守，我今天会先归3号。",
      },
    }));

    await vi.waitFor(() => {
      expect(
        room.events.some(
          (event) =>
            event.type === "speech_transcript_delta" &&
            event.actorId === agentSpeaker.id
        )
      ).toBe(true);
    });

    expect(room.projection.currentSpeakerPlayerId).toBe(agentSpeaker.id);
    expect(
      room.events.some(
        (event) =>
          event.type === "speech_submitted" && event.actorId === agentSpeaker.id
      )
    ).toBe(false);

    resolveSpeak();
    await advance;

    const agentEvents = room.events.filter((event) => event.actorId === agentSpeaker.id);
    const deltaEvents = agentEvents.filter(
      (event) => event.type === "speech_transcript_delta"
    );
    const speechEventIndex = room.events.findIndex(
      (event) =>
        event.type === "speech_submitted" && event.actorId === agentSpeaker.id
    );
    const lastDeltaIndex = room.events.findLastIndex(
      (event) =>
        event.type === "speech_transcript_delta" && event.actorId === agentSpeaker.id
    );

    expect(deltaEvents.length).toBeGreaterThanOrEqual(2);
    expect(deltaEvents[0]).toMatchObject({
      visibility: "public",
      payload: {
        day: room.projection.day,
        phase: "day_speak",
        final: false,
        source: "agent",
      },
    });
    expect(String(deltaEvents[0]!.payload.text)).toBe("我先说结论。");
    expect(String(deltaEvents.at(-1)!.payload.text)).toBe(
      "我先说结论。3号这轮发言偏防守，我今天会先归3号。"
    );
    expect(lastDeltaIndex).toBeGreaterThan(-1);
    expect(speechEventIndex).toBeGreaterThan(lastDeltaIndex);
    expect(room.projection.currentSpeakerPlayerId).toBe(humanSpeaker.id);
  });
```

- [ ] **Step 2: Add a test that TTS failure still finalizes speech**

Append this test immediately after the test from Step 1:

```ts
  it("submits final agent speech even when TTS fails after deltas", async () => {
    const { games, gameRoomId } = createStartedServiceGame();
    const room = games.snapshot(gameRoomId);
    const agentSpeaker = room.players[0]!;
    const humanSpeaker = room.players[1]!;

    games.setVoiceAgents({
      get: () => ({
        speak: () => Promise.reject(new Error("tts unavailable")),
      }),
    } as unknown as VoiceAgentRegistry);
    agentSpeaker.kind = "agent";
    agentSpeaker.agentId = "@agent-speaker:example.com";
    room.projection = {
      ...room.projection!,
      phase: "day_speak",
      currentSpeakerPlayerId: agentSpeaker.id,
      deadlineAt: new Date(Date.now() + 60_000).toISOString(),
    };
    room.speechQueue = [agentSpeaker.id, humanSpeaker.id];

    await games.advanceGame(gameRoomId, async () => ({
      text: "unused",
      toolName: "saySpeech",
      input: { speech: "我怀疑2号。今天先归2号。" },
    }));

    expect(
      room.events.some(
        (event) =>
          event.type === "speech_transcript_delta" &&
          event.actorId === agentSpeaker.id
      )
    ).toBe(true);
    const speechEvent = [...room.events]
      .reverse()
      .find(
        (event) =>
          event.type === "speech_submitted" && event.actorId === agentSpeaker.id
      );
    expect(speechEvent?.payload.speech).toBe("我怀疑2号。今天先归2号。");
    expect(room.projection.currentSpeakerPlayerId).toBe(humanSpeaker.id);
  });
```

- [ ] **Step 3: Extend the invalid raw agent text test**

In the existing test named `does not treat unstructured raw agent text as completed speech`, add this assertion before the final `expect(speechEvent?.payload.speech)...` assertion:

```ts
    expect(
      room.events.some(
        (event) =>
          event.type === "speech_transcript_delta" &&
          event.actorId === agentSpeaker.id
      )
    ).toBe(false);
```

- [ ] **Step 4: Run the target tests and verify they fail**

Run:

```bash
pnpm vitest run apps/api/src/services/game-service.test.ts
```

Expected: at least the two new tests fail because agent speech currently writes only `speech_submitted` and no agent `speech_transcript_delta` events.

- [ ] **Step 5: Commit the failing tests**

```bash
git add apps/api/src/services/game-service.test.ts
git commit -m "test: cover agent speech transcript streaming"
```

---

### Task 2: Implement Speech Chunking and Delta Emission

**Files:**
- Modify: `apps/api/src/services/game-service.ts`

- [ ] **Step 1: Add constants and helpers near existing top-level helpers**

Near the other module-level constants and helper functions in `apps/api/src/services/game-service.ts`, add:

```ts
const AGENT_SPEECH_DELTA_DELAY_MS = 300;

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

Near the bottom helper functions, before `speechTextFromAgentOutput`, add:

```ts
function splitSpeechForDeltas(speech: string): string[] {
  const normalized = speech.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const pieces: string[] = [];
  let buffer = "";
  for (const char of normalized) {
    buffer += char;
    if (/[。！？!?；;，,、\n]/u.test(char)) {
      const piece = buffer.trim();
      if (piece) pieces.push(piece);
      buffer = "";
    }
  }
  const tail = buffer.trim();
  if (tail) pieces.push(tail);

  if (pieces.length <= 1) return [normalized];
  const targetCount = Math.min(5, Math.max(3, pieces.length));
  const grouped: string[] = [];
  for (let index = 0; index < targetCount; index += 1) {
    const start = Math.floor((index * pieces.length) / targetCount);
    const end = Math.floor(((index + 1) * pieces.length) / targetCount);
    const group = pieces.slice(start, end).join("").trim();
    if (group) grouped.push(group);
  }

  const cumulative: string[] = [];
  let current = "";
  for (const group of grouped) {
    current = `${current}${group}`.trim();
    if (current && cumulative[cumulative.length - 1] !== current) {
      cumulative.push(current);
    }
  }
  return cumulative.length > 0 ? cumulative : [normalized];
}
```

- [ ] **Step 2: Add the private delta emission method to `InMemoryGameService`**

Add this method inside the `InMemoryGameService` class, immediately before `runCurrentSpeaker(...)`:

```ts
  private async emitAgentSpeechDeltas(
    room: StoredGameRoom,
    playerId: string,
    speech: string,
    expectedSpeechTurn: {
      phase: GamePhase;
      day: number;
      version: number;
      currentSpeakerPlayerId: string | null;
    },
    delayMs: number
  ): Promise<void> {
    const deltas = splitSpeechForDeltas(speech);
    for (let index = 0; index < deltas.length; index += 1) {
      if (
        !room.projection ||
        room.projection.phase !== expectedSpeechTurn.phase ||
        room.projection.day !== expectedSpeechTurn.day ||
        room.projection.version !== expectedSpeechTurn.version ||
        room.projection.currentSpeakerPlayerId !==
          expectedSpeechTurn.currentSpeakerPlayerId
      ) {
        return;
      }
      this.assignAndAppendEvents(room, [
        {
          ...this.baseEvent(room, playerId, "public"),
          type: "speech_transcript_delta",
          payload: {
            day: expectedSpeechTurn.day,
            phase: expectedSpeechTurn.phase,
            text: deltas[index],
            final: false,
            source: "agent",
            stream: true,
          },
        },
      ]);
      if (index < deltas.length - 1) {
        await sleep(delayMs);
      }
    }
  }
```

- [ ] **Step 3: Update `runCurrentSpeaker` to stream deltas and preserve TTS gating**

In `runCurrentSpeaker(...)`, after computing `speech`, add a turn snapshot and `hasValidAgentSpeech`:

```ts
    const expectedSpeechTurn = {
      phase: room.projection.phase,
      day: room.projection.day,
      version: room.projection.version,
      currentSpeakerPlayerId: room.projection.currentSpeakerPlayerId,
    };
    const hasValidAgentSpeech =
      (toolSpeech !== undefined || textSpeech !== undefined) &&
      speech.trim() &&
      !result.fallback;
```

Then replace the existing `if (...) { const voiceAgent = ... await voiceAgent.speak(...) }` block with this structure:

```ts
    const voiceAgent =
      this.voiceAgents && player.kind === "agent"
        ? this.voiceAgents.get(room.id)
        : null;
    const deltaDelayMs = voiceAgent ? AGENT_SPEECH_DELTA_DELAY_MS : 0;
    const deltaStream = hasValidAgentSpeech
      ? this.emitAgentSpeechDeltas(
          room,
          playerId,
          speech,
          expectedSpeechTurn,
          deltaDelayMs
        )
      : Promise.resolve();

    const ttsStream =
      hasValidAgentSpeech && voiceAgent
        ? voiceAgent
            .speak(speech, playerId, room.timing.agentSpeechRate ?? 1.5)
            .then((captured) => {
              if (!captured) {
                console.error(
                  `[VoiceAgent] no TTS audio captured for ${room.id}/${playerId}`
                );
              }
            })
            .catch((err) => {
              console.error("[VoiceAgent] speak failed:", err);
            })
        : Promise.resolve();

    await Promise.all([deltaStream, ttsStream]);
```

Immediately before assigning `speech_submitted`, add the stale-turn guard:

```ts
    if (
      !room.projection ||
      room.projection.phase !== expectedSpeechTurn.phase ||
      room.projection.day !== expectedSpeechTurn.day ||
      room.projection.version !== expectedSpeechTurn.version ||
      room.projection.currentSpeakerPlayerId !==
        expectedSpeechTurn.currentSpeakerPlayerId
    ) {
      return;
    }
```

Keep the existing final `speech_submitted`, `advanceSpeechSpeaker`, and `emitSpeechTurnStarted` code after this guard.

- [ ] **Step 4: Run the target tests**

Run:

```bash
pnpm vitest run apps/api/src/services/game-service.test.ts
```

Expected: all tests in `game-service.test.ts` pass.

- [ ] **Step 5: Run API typecheck**

Run:

```bash
pnpm --filter @werewolf/api typecheck
```

Expected: command exits with code 0.

- [ ] **Step 6: Commit the implementation**

```bash
git add apps/api/src/services/game-service.ts apps/api/src/services/game-service.test.ts
git commit -m "feat: stream agent speech transcripts"
```

---

### Task 3: Verify Runtime Contract and No Frontend Regression

**Files:**
- Test only: `apps/api/src/routes/runtime-tick.test.ts`
- Test only: `apps/web/src/game/timelineState.test.ts`

- [ ] **Step 1: Run runtime tick route tests**

Run:

```bash
pnpm vitest run apps/api/src/routes/runtime-tick.test.ts
```

Expected: all tests pass without modifying runtime route behavior. Runtime-only `agent_llm_*` events remain hidden, while public `speech_transcript_delta` events are allowed through the normal event pipeline.

- [ ] **Step 2: Run timeline state tests**

Run:

```bash
pnpm vitest run apps/web/src/game/timelineState.test.ts
```

Expected: all tests pass, proving existing frontend event handling still accepts transcript deltas and final speech events.

- [ ] **Step 3: Run full targeted verification**

Run:

```bash
pnpm vitest run apps/api/src/services/game-service.test.ts apps/api/src/routes/runtime-tick.test.ts apps/web/src/game/timelineState.test.ts
pnpm --filter @werewolf/api typecheck
pnpm --filter @werewolf/web typecheck
```

Expected: all commands exit with code 0.

---

## Self-Review Checklist

- Spec coverage:
  - Agent deltas before final speech: Task 1 and Task 2.
  - Audio still streams through existing LiveKit path: Task 2 keeps `voiceAgent.speak`.
  - Final speech waits for TTS: Task 1 pending speak test and Task 2 `Promise.all`.
  - Existing frontend delta handling reused: Task 3 timeline verification.
  - TTS failure finalizes speech: Task 1 and Task 2 catch path.
- Placeholder scan: no banned placeholder markers or incomplete implementation steps.
- Type consistency:
  - Event type remains `speech_transcript_delta`.
  - Delta payload uses `text`, `final`, `source`, `stream`, `day`, and `phase`.
  - Final event remains `speech_submitted` with `payload.speech`.
