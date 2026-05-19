# Runtime-Controlled LiveKit Voice Design

## Goal

Realtime voice should behave like a meeting hosted by the game runtime. Clients join the LiveKit room once and keep that connection. They do not repeatedly fetch publish-capable tokens to gain speaking rights. The server creates or ensures the LiveKit room, and the game runtime controls who may speak and who may hear each track.

The critical privacy rule is wolf night discussion: living wolves can freely talk with each other, while non-wolves cannot hear wolf voices. Non-wolves may still hear GM/system audio.

## Chosen Approach

Use one LiveKit room per game room.

The API server owns LiveKit admin credentials and exposes a runtime-facing controller. The controller translates game state into LiveKit participant permissions and subscriptions:

- participant publish permission controls who may open a microphone
- participant subscription permission controls whose audio each listener may receive
- GM/voice-agent audio remains globally subscribable when the game wants players to hear narration

This avoids multiple LiveKit WebSocket connections, token churn, and client-side privacy filtering.

## Token Model

`/games/:gameRoomId/livekit-token` only grants stable room membership.

Initial player token grants:

- `roomJoin: true`
- `canPublish: false`
- `canSubscribe: false`
- `canPublishData: false` unless the app has a concrete data-channel use

The token may still identify the participant as their Matrix user id. It must not encode whether the player is currently allowed to speak.

The voice agent/server participant is separate. It may publish GM/TTS audio and subscribe to player audio for STT according to server-side behavior.

## Runtime Controller

Add a backend service, tentatively `LivekitMeetingController`, with methods shaped around game concepts:

- `ensureRoom(gameRoomId)`
- `syncForRoom(room)`
- `syncPublicSpeaker(room, speakerPlayerId)`
- `syncWolfDiscussion(room, wolfPlayerIds)`
- `clearPlayerAudio(room)`

The game service depends on this controller through an interface so tests can use a fake implementation and the game engine does not depend directly on LiveKit SDK details.

Implementation uses LiveKit server APIs such as participant permission updates and subscription updates. API keys with admin grants remain server-only.

## Phase Rules

### Day Speak and Tie Speech

- current human speaker may publish
- all alive players may hear the current speaker
- all relevant players may hear GM audio
- previous speaker publish permission is revoked before or during the transition

Agent speakers do not need client publish permission; their TTS is emitted by the voice agent.

### Wolf Night Discussion

- living wolves may publish simultaneously
- living wolves may hear other wolves and GM audio
- non-wolves may hear GM audio only
- non-wolves must not receive wolf player tracks

This is enforced by server-side LiveKit permissions/subscriptions, not by hiding audio in the browser.

### Other Night Phases

- no player may publish by default
- players may hear GM audio
- the active role can still submit actions through normal game APIs

### Voting, Resolution, Game End

- revoke all player publish permissions
- revoke private discussion subscriptions
- keep or clear GM subscription according to narration needs

## Sync Points

The runtime should sync meeting state whenever one of these changes happens:

- game starts
- phase starts
- before GM/system narration is played
- speech queue begins
- current speaker advances
- wolf discussion window opens or closes
- player submits speech complete
- player times out
- player leaves
- player dies
- LiveKit participant joins or reconnects
- LiveKit participant publishes an audio track
- LiveKit participant unpublishes an audio track
- game ends
- process recovers active rooms after restart

Sync should be idempotent and ordered per room. Repeated calls with the same game state should not create new rooms, new tokens, or new client connections. Older, slower sync work must not be able to restore stale publish or subscription permissions after the game moves to a newer phase/version.

LiveKit subscription updates are track-SID based. Because player microphone tracks may be published after the runtime grants permission, the server must resync on track publication instead of relying only on phase transitions.

## Client Behavior

The web client joins LiveKit once per game room and keeps the room connection independent from SSE/game-state reconnects.

Voice UI no longer requests a new token to start speaking. When the user presses the mic:

- if LiveKit allows publish, the microphone starts
- if LiveKit denies publish, show a friendly "还没轮到你发言" state
- do not reconnect LiveKit or refetch token for that denial

The client must not rely on auto-subscribing to every remote track. Audio playback should reflect LiveKit permissions/subscriptions pushed by the server.

## Error Handling

LiveKit controller failures should not crash the game runtime. They should be logged with room id, phase, and intended speaker/listener set.

If permission sync fails:

- game state remains authoritative
- the next phase/turn sync retries naturally
- user-facing voice errors should explain that voice control is temporarily unavailable, not ask users to refresh repeatedly

## Testing

Add tests at three levels:

- API route tests verify player tokens are join-only and do not grant publish by player status.
- game-service tests verify phase transitions call the meeting controller with public-speaker, wolf-discussion, and clear-audio intents.
- web tests verify mic start does not fetch a new LiveKit token and handles insufficient publish permission as a turn-state message.

The highest-risk privacy test is wolf discussion: non-wolves must not be included in the listener set for wolf player tracks.

## Non-Goals

- Do not create a second LiveKit room for wolves.
- Do not solve privacy through frontend mute/hide logic.
- Do not refresh LiveKit tokens on every turn.
- Do not couple SSE reconnects to LiveKit reconnects.
