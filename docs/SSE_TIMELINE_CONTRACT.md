# SSE Timeline Contract

The web client must treat `GET /games/:gameRoomId/subscribe` as the only
read-side data source for a game room.

- On connection, `/subscribe` sends the current room snapshot, private state
  visible to the caller, and the visible event timeline.
- After that, `/subscribe` streams replayed and live events.
- The client maintains one local timeline and derives render state from
  `snapshot + timeline`.
- The subscribe snapshot is already current at the moment it is sent. The
  client must record that snapshot's `baseSeq` and only replay events with
  `seq > baseSeq` when deriving current render state. Older events remain in
  the timeline for logs/history only; replaying them over the current snapshot
  corrupts phase and current-speaker state.
- UI actions may optimistically patch the local snapshot from their direct
  response, but they must not call a room refresh endpoint.
- The web client must not know or call `GET /games/:gameRoomId`.
- The subscribe connection is page-scoped: open once on page entry, reconnect
  only after transport error/disconnect, and never reconnect because seats,
  actions, dialogs, or other UI state changed.
