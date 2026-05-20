import { un } from "@unseal-network/mobile-log";
import type {
  GameEventDto,
  GameRoom,
  RoomPlayer,
  RoomProjection,
} from "../api/client";

export function applyRoomEvent(
  room: GameRoom | null,
  event: GameEventDto
): GameRoom | null {
  if (!room) return room;
  if (
    event.type === "game_started" ||
    event.type === "phase_started" ||
    event.type === "turn_started"
  ) {
    return {
      ...room,
      status: "active",
    };
  }
  if (event.type === "game_ended") {
    return {
      ...room,
      status: "ended",
    };
  }
  if (event.type === "player_joined") {
    const player = roomPlayerPayload(event.payload?.player);
    return player ? upsertRoomPlayers(room, [player]) : room;
  }
  if (event.type === "player_removed") {
    const playerId = String(event.payload?.playerId ?? event.actorId ?? "");
    if (!playerId) return room;
    return {
      ...room,
      players: room.players.map((player) =>
        player.id === playerId
          ? {
              ...player,
              onlineState: "offline",
              leftAt:
                typeof event.createdAt === "string"
                  ? event.createdAt
                  : new Date().toISOString(),
            }
          : player
      ),
    };
  }
  if (event.type !== "player_seat_changed") return room;

  const fromSeatNo = Number(event.payload?.fromSeatNo);
  const toSeatNo = Number(event.payload?.toSeatNo);
  if (!Number.isInteger(fromSeatNo) || !Number.isInteger(toSeatNo)) {
    return room;
  }

  const players = room.players.map((player) => ({ ...player }));
  const fromIndex = players.findIndex(
    (player) => !player.leftAt && player.seatNo === fromSeatNo
  );
  const toIndex = players.findIndex(
    (player) => !player.leftAt && player.seatNo === toSeatNo
  );
  if (fromIndex < 0) return room;

  const moved = players[fromIndex]!;
  const displaced = toIndex >= 0 ? players[toIndex] : undefined;
  if (displaced) {
    const movedIdentity = {
      kind: moved.kind,
      userId: moved.userId,
      agentId: moved.agentId,
      invitedByUserId: moved.invitedByUserId,
      displayName: moved.displayName,
      avatarUrl: moved.avatarUrl,
    };
    moved.kind = displaced.kind;
    moved.displayName = displaced.displayName;
    if (displaced.userId !== undefined) moved.userId = displaced.userId;
    else delete moved.userId;
    if (displaced.agentId !== undefined) moved.agentId = displaced.agentId;
    else delete moved.agentId;
    if (displaced.invitedByUserId !== undefined) {
      moved.invitedByUserId = displaced.invitedByUserId;
    } else delete moved.invitedByUserId;
    if (displaced.avatarUrl !== undefined) moved.avatarUrl = displaced.avatarUrl;
    else delete moved.avatarUrl;

    displaced.kind = movedIdentity.kind;
    displaced.displayName = movedIdentity.displayName;
    if (movedIdentity.userId !== undefined) displaced.userId = movedIdentity.userId;
    else delete displaced.userId;
    if (movedIdentity.agentId !== undefined) displaced.agentId = movedIdentity.agentId;
    else delete displaced.agentId;
    if (movedIdentity.invitedByUserId !== undefined) {
      displaced.invitedByUserId = movedIdentity.invitedByUserId;
    } else delete displaced.invitedByUserId;
    if (movedIdentity.avatarUrl !== undefined) displaced.avatarUrl = movedIdentity.avatarUrl;
    else delete displaced.avatarUrl;
    return { ...room, players };
  }

  moved.id = event.actorId ?? `player_${toSeatNo}`;
  moved.seatNo = toSeatNo;
  return {
    ...room,
    players: players.filter(
      (player, index) => index === fromIndex || player.seatNo !== toSeatNo
    ),
  };
}

export function upsertRoomPlayers(
  room: GameRoom | null,
  incoming: RoomPlayer[]
): GameRoom | null {
  if (!room) return room;
  let players = [...room.players];
  for (const next of incoming) {
    players = players.filter((player) => {
      if (player.id === next.id) return false;
      if (player.seatNo === next.seatNo) return false;
      if (next.userId && player.userId === next.userId && !player.leftAt) return false;
      if (next.agentId && player.agentId === next.agentId && !player.leftAt) return false;
      return true;
    });
    players.push(next);
  }
  return { ...room, players };
}

export function applyProjectionEvent(
  projection: RoomProjection | null,
  event: GameEventDto
): RoomProjection | null {
  if (event.type === "game_started") {
    const playerIds = Array.isArray(event.payload?.playerIds)
      ? event.payload.playerIds.filter(
          (playerId): playerId is string => typeof playerId === "string"
        )
      : [];
    return {
      ...projectionBaseForEvent(projection, event),
      status: "active",
      alivePlayerIds: playerIds,
      version: eventVersion(event),
    };
  }
  if (event.type === "phase_started") {
    const baseProjection = projectionBaseForEvent(projection, event);
    return {
      ...baseProjection,
      status: "active",
      phase: String(event.payload.phase ?? baseProjection.phase),
      day: Number(event.payload.day ?? baseProjection.day),
      deadlineAt:
        typeof event.payload.deadlineAt === "string"
          ? event.payload.deadlineAt
          : null,
      currentSpeakerPlayerId: null,
      version: eventVersion(event),
    };
  }
  if (event.type === "turn_started") {
    const baseProjection = projectionBaseForEvent(projection, event);
    return {
      ...baseProjection,
      status: "active",
      phase: String(event.payload.phase ?? baseProjection.phase),
      day: Number(event.payload.day ?? baseProjection.day),
      deadlineAt:
        typeof event.payload.deadlineAt === "string"
          ? event.payload.deadlineAt
          : baseProjection.deadlineAt,
      currentSpeakerPlayerId:
        typeof event.payload.currentSpeakerPlayerId === "string"
          ? event.payload.currentSpeakerPlayerId
          : event.subjectId ?? baseProjection.currentSpeakerPlayerId,
      version: eventVersion(event),
    };
  }
  if (!projection) return projection;
  if (event.type === "speech_submitted") {
    return {
      ...projection,
      currentSpeakerPlayerId:
        event.actorId && event.actorId === projection.currentSpeakerPlayerId
          ? null
          : projection.currentSpeakerPlayerId,
      version: eventVersion(event),
    };
  }
  if (event.type === "phase_closed") {
    const nextPhase =
      typeof event.payload.nextPhase === "string"
        ? event.payload.nextPhase
        : projection.phase;
    return {
      ...projection,
      phase: nextPhase,
      deadlineAt: null,
      currentSpeakerPlayerId: null,
      version: eventVersion(event),
    };
  }
  if (event.type === "player_eliminated") {
    const playerId = String(event.payload.playerId ?? event.subjectId ?? "");
    if (!playerId) return projection;
    return {
      ...projection,
      alivePlayerIds: projection.alivePlayerIds.filter((id) => id !== playerId),
      version: eventVersion(event),
    };
  }
  if (event.type === "game_ended") {
    return {
      ...projection,
      status: "ended",
      phase: "post_game",
      winner:
        event.payload.winner === "wolf" || event.payload.winner === "good"
          ? event.payload.winner
          : projection.winner,
      deadlineAt: null,
      currentSpeakerPlayerId: null,
      version: eventVersion(event),
    };
  }
  return projection;
}

function projectionBaseForEvent(
  projection: RoomProjection | null,
  event: GameEventDto
): RoomProjection {
  if (projection) return projection;
  const eventWithRoom = event as GameEventDto & { gameRoomId?: unknown };
  const gameRoomId =
    typeof eventWithRoom.gameRoomId === "string"
      ? eventWithRoom.gameRoomId
      : stringPayload(event.payload?.gameRoomId);
  return {
    gameRoomId,
    status: "active",
    phase: null,
    day: 1,
    deadlineAt: null,
    currentSpeakerPlayerId: null,
    winner: null,
    alivePlayerIds: [],
    version: eventVersion(event),
  };
}

function eventVersion(event: GameEventDto): number | string {
  return event.seq ?? event.id;
}

function roomPlayerPayload(value: unknown): RoomPlayer | null {
  if (!value || typeof value !== "object") return null;
  const player = value as Partial<RoomPlayer>;
  if (
    typeof player.id !== "string" ||
    typeof player.displayName !== "string" ||
    typeof player.seatNo !== "number" ||
    (player.kind !== "user" && player.kind !== "agent") ||
    typeof player.ready !== "boolean" ||
    (player.onlineState !== "online" && player.onlineState !== "offline") ||
    !("leftAt" in player)
  ) {
    return null;
  }
  return {
    id: player.id,
    displayName: player.displayName,
    seatNo: player.seatNo,
    kind: player.kind,
    ready: player.ready,
    onlineState: player.onlineState,
    leftAt: typeof player.leftAt === "string" ? player.leftAt : null,
    ...(typeof player.userId === "string" ? { userId: player.userId } : {}),
    ...(typeof player.agentId === "string" ? { agentId: player.agentId } : {}),
    ...(typeof player.invitedByUserId === "string"
      ? { invitedByUserId: player.invitedByUserId }
      : {}),
    ...(typeof player.avatarUrl === "string" ? { avatarUrl: player.avatarUrl } : {}),
  };
}

function deriveRoomFromTimeline(
  snapshot: GameRoom | null,
  timeline: GameEventDto[],
  baseEventId: string
): GameRoom | null {
  return timeline
    .filter((event) => isEventIdAfter(event.id, baseEventId))
    .reduce(applyRoomEvent, snapshot);
}

function deriveProjectionFromTimeline(
  snapshot: RoomProjection | null,
  timeline: GameEventDto[],
  baseEventId: string
): RoomProjection | null {
  return timeline
    .filter((event) => isEventIdAfter(event.id, baseEventId))
    .reduce(applyProjectionEvent, snapshot);
}

export interface SeerResultFact {
  day: number;
  seerPlayerId: string;
  inspectedPlayerId: string;
  alignment: string;
}

export interface TimelineDisplayFacts {
  tieCandidateIds: string[];
  seerCheckedTargetIdsBySeerId: Map<string, Set<string>>;
  latestSeerResultBySeerDay: Map<string, SeerResultFact>;
  witchKillTargetIdByDay: Map<number, string>;
  guardProtectTargetIdByActorDay: Map<string, string>;
  voteSubmittedByActorDay: Set<string>;
  nightActionSubmittedByActorPhaseDay: Set<string>;
}

export interface TimelineViewerPerspective {
  userId: string | null;
  playerId: string | null;
  seatNo: number | null;
}

export interface TimelineDisplayState {
  room: GameRoom | null;
  projection: RoomProjection | null;
  facts: TimelineDisplayFacts;
  perspective: TimelineViewerPerspective;
}

export function actorDayKey(actorId: string, day: number): string {
  return `${actorId}:${day}`;
}

export function actorPhaseDayKey(
  actorId: string,
  phase: string,
  day: number
): string {
  return `${actorId}:${phase}:${day}`;
}

export function seerDayKey(seerPlayerId: string, day: number): string {
  return `${seerPlayerId}:${day}`;
}

function createTimelineDisplayFacts(): TimelineDisplayFacts {
  return {
    tieCandidateIds: [],
    seerCheckedTargetIdsBySeerId: new Map(),
    latestSeerResultBySeerDay: new Map(),
    witchKillTargetIdByDay: new Map(),
    guardProtectTargetIdByActorDay: new Map(),
    voteSubmittedByActorDay: new Set(),
    nightActionSubmittedByActorPhaseDay: new Set(),
  };
}

function numberPayload(value: unknown): number | null {
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function stringPayload(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function addCheckedTarget(
  checked: Map<string, Set<string>>,
  seerPlayerId: string,
  targetPlayerId: string
) {
  const current = checked.get(seerPlayerId) ?? new Set<string>();
  current.add(targetPlayerId);
  checked.set(seerPlayerId, current);
}

function applyTimelineFactEvent(
  facts: TimelineDisplayFacts,
  event: GameEventDto
): TimelineDisplayFacts {
  if (event.type === "phase_closed") {
    const tiedPlayerIds = event.payload?.tiedPlayerIds;
    if (Array.isArray(tiedPlayerIds)) {
      facts.tieCandidateIds = tiedPlayerIds.filter(
        (value): value is string => typeof value === "string"
      );
    }
    return facts;
  }

  if (event.type === "seer_result_revealed") {
    const day = numberPayload(event.payload?.day);
    const seerPlayerId = stringPayload(event.payload?.seerPlayerId);
    const inspectedPlayerId = stringPayload(event.payload?.inspectedPlayerId);
    if (day !== null && seerPlayerId && inspectedPlayerId) {
      addCheckedTarget(
        facts.seerCheckedTargetIdsBySeerId,
        seerPlayerId,
        inspectedPlayerId
      );
      facts.latestSeerResultBySeerDay.set(seerDayKey(seerPlayerId, day), {
        day,
        seerPlayerId,
        inspectedPlayerId,
        alignment: stringPayload(event.payload?.alignment) || "good",
      });
    }
    return facts;
  }

  if (event.type === "witch_kill_revealed") {
    const day = numberPayload(event.payload?.day);
    const targetPlayerId = stringPayload(event.payload?.targetPlayerId);
    if (day !== null && targetPlayerId) {
      facts.witchKillTargetIdByDay.set(day, targetPlayerId);
    }
    return facts;
  }

  if (event.type === "vote_submitted" && event.actorId) {
    const day = numberPayload(event.payload?.day);
    if (day !== null) {
      facts.voteSubmittedByActorDay.add(actorDayKey(event.actorId, day));
    }
    return facts;
  }

  if (event.type === "night_action_submitted" && event.actorId) {
    const day = numberPayload(event.payload?.day);
    const phase = stringPayload(event.payload?.phase);
    const action = (event.payload?.action ?? {}) as Record<string, unknown>;
    if (day !== null && phase) {
      facts.nightActionSubmittedByActorPhaseDay.add(
        actorPhaseDayKey(event.actorId, phase, day)
      );
      if (action.kind === "guardProtect") {
        const targetPlayerId = stringPayload(action.targetPlayerId);
        if (targetPlayerId) {
          facts.guardProtectTargetIdByActorDay.set(
            actorDayKey(event.actorId, day),
            targetPlayerId
          );
        }
      }
    }
  }

  return facts;
}

export function deriveTimelineDisplayFacts(
  timeline: GameEventDto[]
): TimelineDisplayFacts {
  return [...timeline]
    .sort(compareGameEventIds)
    .reduce(applyTimelineFactEvent, createTimelineDisplayFacts());
}

function deriveTimelineViewerPerspective(
  roomSnapshot: GameRoom | null,
  room: GameRoom | null,
  liveEvents: GameEventDto[],
  viewerUserId?: string
): TimelineViewerPerspective {
  if (!viewerUserId) {
    return {
      userId: null,
      playerId: null,
      seatNo: null,
    };
  }

  const initialPlayer = roomSnapshot?.players.find(
    (player) => player.userId === viewerUserId && !player.leftAt
  );
  let playerId = initialPlayer?.id ?? null;
  let seatNo = initialPlayer?.seatNo ?? null;

  for (const event of liveEvents) {
    if (event.type === "player_joined") {
      const joined = roomPlayerPayload(event.payload?.player);
      if (joined?.userId === viewerUserId && !joined.leftAt) {
        playerId = joined.id;
        seatNo = joined.seatNo;
      }
      continue;
    }

    if (event.type === "player_removed") {
      const removedPlayerId = stringPayload(event.payload?.playerId || event.actorId);
      if (removedPlayerId && removedPlayerId === playerId) {
        playerId = null;
        seatNo = null;
      }
      continue;
    }

    if (event.type !== "player_seat_changed") {
      continue;
    }

    const movedUserId = stringPayload(event.payload?.movedUserId);
    if (movedUserId !== viewerUserId) {
      continue;
    }

    const movedSeatNo = numberPayload(event.payload?.toSeatNo);
    playerId =
      typeof event.actorId === "string" && event.actorId
        ? event.actorId
        : movedSeatNo !== null
          ? `player_${movedSeatNo}`
          : playerId;
    if (movedSeatNo !== null) {
      seatNo = movedSeatNo;
    }
  }

  const resolvedPlayer =
    (playerId
      ? room?.players.find((player) => player.id === playerId && !player.leftAt)
      : undefined) ??
    room?.players.find((player) => player.userId === viewerUserId && !player.leftAt);

  return {
    userId: viewerUserId,
    playerId: resolvedPlayer?.id ?? playerId,
    seatNo: resolvedPlayer?.seatNo ?? seatNo,
  };
}

export function deriveTimelineDisplayState(
  roomSnapshot: GameRoom | null,
  projectionSnapshot: RoomProjection | null,
  timeline: GameEventDto[],
  baseCursor: number | string,
  viewerUserId?: string
): TimelineDisplayState {
  const baseEventId =
    typeof baseCursor === "string" ? baseCursor : legacyBaseEventId(timeline, baseCursor);
  const orderedTimeline = [...timeline].sort(compareGameEventIds);
  const liveEvents = orderedTimeline.filter((event) =>
    isEventIdAfter(event.id, baseEventId)
  );
  const projectionBase = projectionSnapshot ?? roomSnapshot?.projection ?? null;
  const projection = deriveProjectionFromTimeline(
    projectionBase,
    liveEvents,
    ""
  );
  const room = deriveRoomFromTimeline(roomSnapshot, liveEvents, "");

  // un.log('room', room)
  return {
    room: room
      ? {
          ...room,
          projection,
        }
      : null,
    projection,
    facts: deriveTimelineDisplayFacts(orderedTimeline),
    perspective: deriveTimelineViewerPerspective(
      roomSnapshot,
      room,
      liveEvents,
      viewerUserId
    ),
  };
}

export function computeTimelineBaseSeq(events: GameEventDto[]): number {
  return events.reduce((maxSeq, event) => Math.max(maxSeq, event.seq ?? 0), 0);
}

export function computeTimelineBaseEventId(events: GameEventDto[]): string {
  return events.reduce(
    (maxEventId, event) =>
      compareEventIds(event.id, maxEventId) > 0 ? event.id : maxEventId,
    ""
  );
}

export function compareGameEventIds(a: GameEventDto, b: GameEventDto): number {
  return compareEventIds(a.id, b.id);
}

export function compareGameEventIdStrings(a: string, b: string): number {
  return compareEventIds(a, b);
}

function legacyBaseEventId(events: GameEventDto[], baseSeq: number): string {
  return computeTimelineBaseEventId(
    events.filter((event) => (event.seq ?? 0) <= baseSeq)
  );
}

function isEventIdAfter(eventId: string, baseEventId: string): boolean {
  return !baseEventId || compareEventIds(eventId, baseEventId) > 0;
}

function compareEventIds(a: string, b: string): number {
  if (a === b) return 0;
  if (!a) return b ? -1 : 0;
  if (!b) return 1;
  const aParts = splitNumericSuffix(a);
  const bParts = splitNumericSuffix(b);
  if (aParts && bParts && aParts.prefix === bParts.prefix) {
    return aParts.value - bParts.value;
  }
  return a.localeCompare(b);
}

function splitNumericSuffix(value: string): { prefix: string; value: number } | null {
  const match = value.match(/^(.*?)(\d+)$/);
  if (!match) return null;
  return { prefix: match[1]!, value: Number(match[2]) };
}
