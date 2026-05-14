# Agent Speech Streaming Design

## Goal

Agent speech should feel like human voice turns: players see live transcript text while the agent is speaking, hear TTS audio through the existing LiveKit voice room, and only move to the next turn after speech playback has been handed to LiveKit.

This design uses the existing `saySpeech` tool contract. The agent still submits one complete utterance, and the server converts that utterance into public transcript deltas before writing the final speech event.

## Non-Goals

- Do not implement true LLM token streaming.
- Do not change the `saySpeech` prompt contract or tool name.
- Do not introduce a new frontend transcript UI if the existing `speech_transcript_delta` handling can be reused.
- Do not advance the speech turn before TTS completes.

## Current Behavior

Human speech uses STT:

- Microphone audio streams to STT.
- `speech_transcript_delta` events show live text.
- `speechComplete` flushes STT.
- `speech_submitted` writes the final public speech and advances the turn.

Agent speech currently works differently:

- The server calls `runAgentToolTurn`.
- The LLM returns a complete `saySpeech` result.
- The server calls `voiceAgent.speak(...)`, which streams TTS audio chunks to LiveKit.
- After `speak()` completes, the server writes one `speech_submitted` event and advances the turn.

The audio is already streamed, but the text appears only at the end.

## Proposed Behavior

For an agent speaker in `day_speak` or `tie_speech`:

1. Run the agent turn normally and extract the final `speech`.
2. Split the final speech into natural chunks.
3. Broadcast public `speech_transcript_delta` events for those chunks.
4. Start TTS using the existing `voiceAgent.speak(speech, playerId, rate)` path.
5. Wait for `speak()` to finish or fail.
6. Write the final `speech_submitted` event.
7. Advance the speech queue and emit the next turn event.

The important invariant is that transcript deltas may appear before audio finishes, but final submission and turn advancement must happen after the TTS call resolves.

## Event Contract

Reuse the existing public transcript event type:

```ts
{
  type: "speech_transcript_delta",
  visibility: "public",
  actorId: agentPlayerId,
  payload: {
    day,
    phase,
    text,
    final: false,
    source: "agent"
  }
}
```

`payload.text` should use the same semantics as human STT deltas: cumulative transcript text for that actor/day/phase. This lets the existing frontend replacement logic continue to work.

The final event remains:

```ts
{
  type: "speech_submitted",
  visibility: "public",
  actorId: agentPlayerId,
  payload: {
    day,
    speech
  }
}
```

The frontend should continue replacing/removing the transient delta once `speech_submitted` arrives, matching current human STT behavior.

## Chunking

The server should split `speech` with a deterministic helper:

- Strong breaks: `。`, `！`, `？`, `!`, `?`, newline.
- Soft breaks: `；`, `;`, `，`, `,`, `、`.
- Prefer 3-5 chunks for normal agent speech.
- Avoid empty chunks.
- If the text is short, emit a single delta.

Each delta should contain the cumulative text through that chunk. For example:

1. `我先说结论。`
2. `我先说结论。3号这轮发言偏防守，`
3. `我先说结论。3号这轮发言偏防守，我今天会先归3号。`

## Timing

The first delta should be emitted immediately after valid speech is extracted. Later deltas can be emitted with a small fixed delay, such as 250-400 ms, to make the UI visibly stream.

This delay must not control the turn. Turn completion is controlled only by final speech submission after TTS returns.

If TTS is unavailable, the server can still emit deltas and then submit the final speech immediately. This preserves text gameplay.

## Error Handling

- If the agent does not provide valid speech, keep the current fallback behavior and do not emit streaming deltas for the placeholder unless it is intentionally submitted as speech.
- If TTS fails after deltas have been emitted, log the failure and still write `speech_submitted` with the same speech text.
- If the phase or current speaker changes while waiting, do not write stale final speech. Preserve the same stale-turn guard pattern used by human STT finalization.
- If SSE has no subscribers, events should still be appended normally so reconnecting clients can see the final speech. Deltas may be transient, but using normal events keeps behavior simple and consistent with human STT.

## Components

### `game-service`

Add a helper around the agent speech path:

- `emitAgentSpeechDeltas(room, playerId, speech, phase, day, now)`
- `splitSpeechForDeltas(speech)`

The helper appends public `speech_transcript_delta` events via the existing event pipeline so SSE and persistence behavior remain consistent.

### `voice-agent`

No architectural change is required. `voiceAgent.speak()` already streams PCM chunks to LiveKit. The design keeps the existing call and completion semantics.

### Frontend Timeline

No new UI should be required if existing handling for `speech_transcript_delta` and `speech_submitted` is source-agnostic. The frontend may optionally use `payload.source === "agent"` later for styling, but this design does not require it.

## Tests

Add focused tests for:

- Agent speech emits one or more `speech_transcript_delta` events before `speech_submitted`.
- The final `speech_submitted` event appears only after mocked `voiceAgent.speak()` resolves.
- Deltas use cumulative text and include `{ source: "agent", final: false }`.
- The existing human STT flow remains unchanged.
- A TTS failure still produces final `speech_submitted`.

## Rollout

This is a server-first change. Existing clients already know how to show transcript deltas, so deployment can happen without a coordinated frontend release as long as the delta payload shape remains compatible.

