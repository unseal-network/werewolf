# SSE Timeline Contract

Game read and SSE subscribe are snapshot-first. They return
`snapshot.displayState`, `snapshot.snapshotEventId`, and cursor metadata only.
They never return the full timeline in the initial snapshot.

Timeline history is loaded from `GET /games/:gameRoomId/timeline` using
event-id cursors:

- `after=<eventId>` returns newer visible events in ascending id order.
- `before=<eventId>` returns the previous visible page in ascending id order.
- `limit` defaults to `100` and is capped at `500`.

Realtime delivery uses event ids as the only ordering cursor. Clients must
dedupe by event id on reconnect and use the timeline cursor endpoint to fill
any gaps.
