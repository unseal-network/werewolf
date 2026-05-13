import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createApiClient, defaultApiBaseUrl, type GameEventDto, type GameRoom, type RoomPlayer, type PlayerPrivateState, type RoomProjection } from "../api/client";
import { GameRoomShell } from "../components/GameRoomShell";
import { CenterStage, type ActionMode, type ConfirmMode } from "../components/CenterStage";
import { TimelineCapsule } from "../components/TimelineCapsule";
import { RoleCardLayer } from "../components/RoleCardLayer";
import { UserInfoPanel } from "../components/UserInfoPanel";
import { StartDialog } from "../components/StartDialog";
import { AgentPicker } from "../components/AgentPicker";
import { SeerResultDialog } from "../components/SeerResultDialog";
import { VoiceRoomProvider } from "../components/VoiceRoom";
import type { AgentCandidate } from "../api/client";
import { getPhaseAnimationCue } from "../animation/phaseCatalog";
import { useT } from "../i18n/I18nProvider";
import type { SceneId } from "../components/GameRoomShell";
import type { EngineGameState } from "../engine/GameEngine";
import {
  actorDayKey,
  actorPhaseDayKey,
  deriveTimelineDisplayState,
  computeTimelineBaseSeq,
  seerDayKey,
  upsertRoomPlayers,
} from "../game/timelineState";
import { canUseActionPanel } from "../game/actionAvailability";
import {
  DEMO_DISPLAY_NAME,
  DEMO_USER_ID,
  matrixServerBaseFromToken,
  readStoredMatrixDisplayName,
  readStoredMatrixUserId,
  readMatrixToken,
  writeMatrixIdentity,
} from "../matrix/session";

interface PhaseDressing {
  scene: SceneId;
  accent: string;
  kickerKey: string;
  copyKey: string;
  confirmMode: ConfirmMode;
}

const PHASE_DRESSING: Record<string, PhaseDressing> = {
  lobby: { scene: "lobby", accent: "#435cff", kickerKey: "stage.kicker.lobby", copyKey: "", confirmMode: "vote" },
  deal: { scene: "deal", accent: "#7357d9", kickerKey: "stage.kicker.deal", copyKey: "", confirmMode: "vote" },
  guard: { scene: "night", accent: "#2c8cff", kickerKey: "stage.kicker.guard", copyKey: "", confirmMode: "guard" },
  wolf: { scene: "night", accent: "#c43d4d", kickerKey: "stage.kicker.wolf", copyKey: "", confirmMode: "wolf" },
  "witch-save": { scene: "night", accent: "#28a86d", kickerKey: "stage.kicker.witchHeal", copyKey: "", confirmMode: "witch-save" },
  "witch-poison": { scene: "night", accent: "#7751d9", kickerKey: "stage.kicker.witchPoison", copyKey: "", confirmMode: "witch-poison" },
  seer: { scene: "night", accent: "#1d95b8", kickerKey: "stage.kicker.seer", copyKey: "", confirmMode: "seer" },
  night: { scene: "night", accent: "#2c8cff", kickerKey: "stage.kicker.nightResolution", copyKey: "", confirmMode: "vote" },
  day: { scene: "day", accent: "#d58b21", kickerKey: "stage.kicker.daySpeak", copyKey: "", confirmMode: "vote" },
  dayResolution: { scene: "day", accent: "#d58b21", kickerKey: "stage.kicker.dayResolution", copyKey: "", confirmMode: "vote" },
  vote: { scene: "vote", accent: "#d84848", kickerKey: "stage.kicker.dayVote", copyKey: "", confirmMode: "vote" },
  tie: { scene: "tie", accent: "#b554d9", kickerKey: "stage.kicker.tieVote", copyKey: "", confirmMode: "vote" },
  end: { scene: "end", accent: "#13a36c", kickerKey: "stage.kicker.end", copyKey: "", confirmMode: "vote" },
};

interface UserSeatState {
  seatNo: number;
  playerId: string | undefined;
  userId: string | undefined;
  agentId: string | undefined;
  invitedByUserId: string | undefined;
  displayName: string | undefined;
  avatarUrl: string | undefined;
  isEmpty: boolean;
  kind: RoomPlayer["kind"] | undefined;
  isDead: boolean;
  isCurrentUser: boolean;
  isActionTarget: boolean;
  isSelected: boolean;
  isCurrentSpeaker?: boolean;
  isWolfTeammate?: boolean;
  visibleRole?: string | undefined;
}

const apiBaseUrl = defaultApiBaseUrl();
const appBasePath = import.meta.env.BASE_URL ?? "/";
const roleAssetBase = `${appBasePath.replace(/\/?$/, "/")}assets/role-cards`;

function normalizeRoleId(roleId: string | undefined): string {
  switch (roleId) {
    case "werewolf":
    case "seer":
    case "witch":
    case "guard":
    case "villager":
      return roleId;
    default:
      return "villager";
  }
}

function roleCardFrontUrl(roleId: string | undefined): string {
  return `${roleAssetBase}/${normalizeRoleId(roleId)}.png`;
}

function roleCardBackUrl(): string {
  return `${roleAssetBase}/card-back.png`;
}

function stripPayloadFromEvent(raw: string): string {
  if (raw.startsWith("data:")) {
    return raw.slice(5).trim();
  }
  return raw;
}

function parseSseEvent(raw: string): GameEventDto | undefined {
  if (!raw.trim()) return undefined;
  try {
    const candidate = JSON.parse(raw) as unknown;
    if (!candidate || typeof candidate !== "object") {
      return undefined;
    }
    if ("event" in candidate) {
      const wrapped = (candidate as { event?: unknown }).event;
      if (
        wrapped &&
        typeof wrapped === "object" &&
        "id" in wrapped &&
        "type" in wrapped
      ) {
        return wrapped as GameEventDto;
      }
    }
    if ("id" in candidate && "type" in candidate) {
      return candidate as GameEventDto;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

interface SubscribeSnapshot {
  room: GameRoom;
  projection: RoomProjection | null;
  privateStates: PlayerPrivateState[];
  events: GameEventDto[];
}

type SubscribeMessage =
  | { kind: "snapshot"; snapshot: SubscribeSnapshot }
  | { kind: "event"; event: GameEventDto };

function parseSubscribeMessage(raw: string): SubscribeMessage | undefined {
  if (!raw.trim()) return undefined;
  try {
    const candidate = JSON.parse(raw) as unknown;
    if (!candidate || typeof candidate !== "object") return undefined;
    if ("snapshot" in candidate) {
      return {
        kind: "snapshot",
        snapshot: (candidate as { snapshot: SubscribeSnapshot }).snapshot,
      };
    }
    const event = parseSseEvent(raw);
    return event ? { kind: "event", event } : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Defensive mirror of server-side filterEventsForUser. The SSE route already
 * filters events, but the client keeps this guard for optimistic action
 * responses and future transport changes.
 */
function sseEventVisibleToMe(
  event: GameEventDto,
  myPrivateState: PlayerPrivateState | undefined
): boolean {
  if (event.visibility === "public") return true;
  if (event.visibility === "runtime") return false;
  if (event.visibility === "private:team:wolf") {
    return myPrivateState?.team === "wolf";
  }
  if (event.visibility.startsWith("private:user:")) {
    return event.visibility === `private:user:${myPrivateState?.playerId}`;
  }
  return false;
}

interface PhaseUiSpec {
  phaseId: ReturnType<typeof getPhaseAnimationCue>["phaseId"];
  labelKey: string;
  rawLabel?: string;
  actionMode: ActionMode;
  canRunRuntime: boolean;
  canProgress: boolean;
  showTimeline: boolean;
  showRoleCard: boolean;
}

function mapServerPhaseToUi(phase: string | null): PhaseUiSpec {
  if (!phase) {
    const cue = getPhaseAnimationCue("lobby");
    return {
      phaseId: cue.phaseId,
      labelKey: "phase.lobby",
      actionMode: "lobby",
      canRunRuntime: false,
      canProgress: false,
      showTimeline: cue.allowTimeline,
      showRoleCard: cue.showRoleCard,
    };
  }

  switch (phase) {
    case "role_assignment":
      return {
        phaseId: "deal",
        labelKey: "phase.deal",
        actionMode: "deal",
        canRunRuntime: true,
        canProgress: true,
        showTimeline: getPhaseAnimationCue("deal").allowTimeline,
        showRoleCard: getPhaseAnimationCue("deal").showRoleCard,
      };
    case "night_guard":
      return {
        phaseId: "guard",
        labelKey: "phase.guard",
        actionMode: "night",
        canRunRuntime: true,
        canProgress: true,
        showTimeline: getPhaseAnimationCue("guard").allowTimeline,
        showRoleCard: getPhaseAnimationCue("guard").showRoleCard,
      };
    case "night_wolf":
      return {
        phaseId: "wolf",
        labelKey: "phase.wolf",
        actionMode: "night",
        canRunRuntime: true,
        canProgress: true,
        showTimeline: getPhaseAnimationCue("wolf").allowTimeline,
        showRoleCard: getPhaseAnimationCue("wolf").showRoleCard,
      };
    case "night_witch_heal":
      return {
        phaseId: "witch-save",
        labelKey: "phase.witchHeal",
        actionMode: "night",
        canRunRuntime: true,
        canProgress: true,
        showTimeline: getPhaseAnimationCue("witch-save").allowTimeline,
        showRoleCard: getPhaseAnimationCue("witch-save").showRoleCard,
      };
    case "night_witch_poison":
      return {
        phaseId: "witch-poison",
        labelKey: "phase.witchPoison",
        actionMode: "night",
        canRunRuntime: true,
        canProgress: true,
        showTimeline: getPhaseAnimationCue("witch-poison").allowTimeline,
        showRoleCard: getPhaseAnimationCue("witch-poison").showRoleCard,
      };
    case "night_seer":
      return {
        phaseId: "seer",
        labelKey: "phase.seer",
        actionMode: "night",
        canRunRuntime: true,
        canProgress: true,
        showTimeline: getPhaseAnimationCue("seer").allowTimeline,
        showRoleCard: getPhaseAnimationCue("seer").showRoleCard,
      };
    case "night_resolution":
      return {
        phaseId: "night",
        labelKey: "phase.nightResolution",
        actionMode: "night",
        canRunRuntime: true,
        canProgress: true,
        showTimeline: getPhaseAnimationCue("night").allowTimeline,
        showRoleCard: getPhaseAnimationCue("night").showRoleCard,
      };
    case "day_speak":
      return {
        phaseId: "day",
        labelKey: "phase.daySpeak",
        actionMode: "day",
        canRunRuntime: true,
        canProgress: true,
        showTimeline: getPhaseAnimationCue("day").allowTimeline,
        showRoleCard: getPhaseAnimationCue("day").showRoleCard,
      };
    case "day_vote":
      return {
        phaseId: "vote",
        labelKey: "phase.dayVote",
        actionMode: "vote",
        canRunRuntime: true,
        canProgress: true,
        showTimeline: getPhaseAnimationCue("vote").allowTimeline,
        showRoleCard: getPhaseAnimationCue("vote").showRoleCard,
      };
    case "tie_speech":
      return {
        phaseId: "day",
        labelKey: "phase.tieSpeech",
        actionMode: "day",
        canRunRuntime: true,
        canProgress: true,
        showTimeline: getPhaseAnimationCue("day").allowTimeline,
        showRoleCard: getPhaseAnimationCue("day").showRoleCard,
      };
    case "tie_vote":
      return {
        phaseId: "tie",
        labelKey: "phase.tieVote",
        actionMode: "tie",
        canRunRuntime: true,
        canProgress: true,
        showTimeline: getPhaseAnimationCue("tie").allowTimeline,
        showRoleCard: getPhaseAnimationCue("tie").showRoleCard,
      };
    case "day_resolution":
      return {
        phaseId: "dayResolution",
        labelKey: "phase.dayResolution",
        actionMode: "waiting",
        canRunRuntime: true,
        canProgress: false,
        showTimeline: getPhaseAnimationCue("dayResolution").allowTimeline,
        showRoleCard: getPhaseAnimationCue("dayResolution").showRoleCard,
      };
    case "post_game":
      return {
        phaseId: "end",
        labelKey: "phase.end",
        actionMode: "end",
        canRunRuntime: false,
        canProgress: false,
        showTimeline: getPhaseAnimationCue("end").allowTimeline,
        showRoleCard: getPhaseAnimationCue("end").showRoleCard,
      };
    default:
      return {
        phaseId: "lobby",
        labelKey: "phase.lobby",
        rawLabel: phase,
        actionMode: "waiting",
        canRunRuntime: false,
        canProgress: false,
        showTimeline: getPhaseAnimationCue("lobby").allowTimeline,
        showRoleCard: getPhaseAnimationCue("lobby").showRoleCard,
      };
  }
}

function uniqueSeatOrder(players: RoomPlayer[]): RoomPlayer[] {
  const bySeat = new Map<number, RoomPlayer>();
  for (const player of players) {
    if (player.leftAt) {
      continue;
    }
    if (!bySeat.has(player.seatNo)) {
      bySeat.set(player.seatNo, player);
    }
  }
  return Array.from(bySeat.values());
}

function buildSeatView(
  room: GameRoom | null,
  targetPlayerCount: number,
  currentPlayerId: string | undefined,
  selectedTargetId: string | null,
  legalTargetIds: Set<string>,
  currentSpeakerPlayerId: string | undefined,
  knownTeammatePlayerIds: Set<string> = new Set(),
  visibleRolesByPlayerId: Map<string, string> = new Map()
): UserSeatState[] {
  if (!room) {
    return Array.from({ length: targetPlayerCount }, (_, index) => ({
      seatNo: index + 1,
      isEmpty: true,
      isDead: false,
      isCurrentUser: false,
      isActionTarget: false,
      isSelected: false,
      isCurrentSpeaker: false,
      isWolfTeammate: false,
      visibleRole: undefined,
      playerId: undefined,
      userId: undefined,
      agentId: undefined,
      invitedByUserId: undefined,
      displayName: undefined,
      avatarUrl: undefined,
      kind: undefined,
    }));
  }

  const alive = new Set(room.projection?.alivePlayerIds ?? []);
  const isGameActive = room.projection !== null;
  const active = uniqueSeatOrder(room.players);
  const seats: UserSeatState[] = [];

  for (let seatNo = 1; seatNo <= targetPlayerCount; seatNo += 1) {
    const player = active.find((candidate) => candidate.seatNo === seatNo);
    const playerId = player?.id;
    seats.push({
      seatNo,
      playerId,
      userId: player?.userId,
      agentId: player?.agentId,
      invitedByUserId: player?.invitedByUserId,
      displayName: player?.displayName,
      avatarUrl: player?.avatarUrl,
      kind: player?.kind,
      isEmpty: !player,
      isDead: isGameActive && player ? !alive.has(player.id) : false,
      isCurrentUser: player?.id === currentPlayerId,
      isActionTarget: Boolean(playerId && legalTargetIds.has(playerId)),
      isSelected: playerId === selectedTargetId,
      isCurrentSpeaker: Boolean(playerId && currentSpeakerPlayerId && playerId === currentSpeakerPlayerId),
      isWolfTeammate: Boolean(playerId && knownTeammatePlayerIds.has(playerId)),
      visibleRole: playerId ? visibleRolesByPlayerId.get(playerId) : undefined,
    });
  }

  return seats;
}

function parseCurrentSpeakerSeat(
  players: RoomPlayer[],
  projection: RoomProjection | null
): number | undefined {
  const speaker = projection?.currentSpeakerPlayerId;
  if (!speaker) return undefined;
  const player = players.find((candidate) => candidate.id === speaker);
  return player?.seatNo;
}

export function GameRoomPage({ gameRoomId }: { gameRoomId: string }) {
  const t = useT();
  const [matrixToken] = useState(() => readMatrixToken());
  const [matrixUserId, setMatrixUserId] = useState(
    () => readStoredMatrixUserId() ?? DEMO_USER_ID
  );
  const [matrixDisplayName, setMatrixDisplayName] = useState(
    () => readStoredMatrixDisplayName() ?? DEMO_DISPLAY_NAME
  );
  const [roomSnapshot, setRoomSnapshot] = useState<GameRoom | null>(null);
  const [projectionSnapshot, setProjectionSnapshot] =
    useState<RoomProjection | null>(null);
  const [privateStates, setPrivateStates] = useState<PlayerPrivateState[]>([]);
  const [timeline, setTimeline] = useState<GameEventDto[]>([]);
  const [timelineBaseSeq, setTimelineBaseSeq] = useState(0);
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [runtimeInProgress, setRuntimeInProgress] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [showFillPrompt, setShowFillPrompt] = useState(false);
  const [showAgentPicker, setShowAgentPicker] = useState(false);
  const [seerResultOpen, setSeerResultOpen] = useState(false);
  const [agentCandidates, setAgentCandidates] = useState<AgentCandidate[]>([]);
  const [agentLoading, setAgentLoading] = useState(false);
  const [agentError, setAgentError] = useState<string | undefined>(undefined);
  const [agentSourceRoomId, setAgentSourceRoomId] = useState<string | undefined>(undefined);
  const [viewingSeatNo, setViewingSeatNo] = useState<number | null>(null);
  const [speechDraft, setSpeechDraft] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [livekitToken, setLivekitToken] = useState<string | null>(null);
  const [livekitServerUrl, setLivekitServerUrl] = useState<string | null>(null);
  const [roleRevealNonce, setRoleRevealNonce] = useState(0);
  const [roleRevealOpen, setRoleRevealOpen] = useState(false);
  // Tick once per second so countdown text re-renders smoothly between SSE
  // events. The projection's deadlineAt is absolute, so we just need to
  // recompute (now - deadlineAt) on a steady cadence.
  const [nowTick, setNowTick] = useState(0);
  const eventSourceRef = useRef<EventSource | null>(null);
  const sseReconnectTimerRef = useRef<number | null>(null);
  const autoTickPhaseRef = useRef<string>("");
  const seerResultTimeoutRef = useRef<number | null>(null);
  const lastShownSeerResultKeyRef = useRef<string | null>(null);
  const timelineDisplayState = useMemo(
    () =>
      deriveTimelineDisplayState(
        roomSnapshot,
        projectionSnapshot,
        timeline,
        timelineBaseSeq,
        matrixUserId
      ),
    [roomSnapshot, projectionSnapshot, timeline, timelineBaseSeq, matrixUserId]
  );
  const room = timelineDisplayState.room;
  const projection = timelineDisplayState.projection;
  const events = timeline;
  const isDevMode = useMemo(
    () => new URLSearchParams(window.location.search).get("dev") === "1",
    []
  );

  const client = useMemo(
    () =>
      createApiClient({
        baseUrl: apiBaseUrl,
        getMatrixToken: () => matrixToken,
      }),
    [matrixToken]
  );

  useEffect(() => {
    let cancelled = false;
    void client
      .whoAmI(matrixServerBaseFromToken(matrixToken))
      .then((whoami) => {
        if (cancelled || !whoami.user_id) return;
        writeMatrixIdentity(
          whoami.user_id,
          whoami.display_name ?? whoami.user_id
        );
        setMatrixUserId(whoami.user_id);
        setMatrixDisplayName(whoami.display_name ?? whoami.user_id);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [client, matrixToken]);

  const applyServerEvent = useCallback(
    (event: GameEventDto) => {
      setTimeline((current) => {
        if (current.some((candidate) => candidate.id === event.id)) return current;
        const sameSpeechStream = (candidate: GameEventDto) =>
          candidate.type === "speech_transcript_delta" &&
          candidate.actorId === event.actorId &&
          candidate.payload.day === event.payload.day &&
          candidate.payload.phase === event.payload.phase;
        const next =
          event.type === "speech_transcript_delta"
            ? [...current.filter((candidate) => !sameSpeechStream(candidate)), event]
            : event.type === "speech_submitted"
              ? [
                  ...current.filter(
                    (candidate) =>
                      !(
                        candidate.type === "speech_transcript_delta" &&
                        candidate.actorId === event.actorId &&
                        candidate.payload.day === event.payload.day
                      )
                  ),
                  event,
                ]
              : [...current, event];
        return next.length <= 260 ? next : next.slice(-260);
      });
    },
    []
  );

  const connectSSE = useCallback(() => {
    if (sseReconnectTimerRef.current !== null) {
      window.clearTimeout(sseReconnectTimerRef.current);
      sseReconnectTimerRef.current = null;
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    // Page-scoped read model: /subscribe is the only game-room read source.
    // Do not add GET /games/:id refresh calls or state-driven reconnects here.
    const source = new EventSource(client.subscribeUrl(gameRoomId));
    source.onmessage = (event) => {
      const parsed = parseSubscribeMessage(stripPayloadFromEvent(event.data));
      if (!parsed) return;
      if (parsed.kind === "snapshot") {
        setRoomSnapshot(parsed.snapshot.room);
        setProjectionSnapshot(parsed.snapshot.projection);
        setPrivateStates(parsed.snapshot.privateStates);
        setTimeline(parsed.snapshot.events);
        setTimelineBaseSeq(computeTimelineBaseSeq(parsed.snapshot.events));
        return;
      }
      if (sseEventVisibleToMe(parsed.event, myPrivateStateRef.current)) {
        applyServerEvent(parsed.event);
      }
    };
    source.onerror = () => {
      source.close();
      eventSourceRef.current = null;
      sseReconnectTimerRef.current = window.setTimeout(() => {
        sseReconnectTimerRef.current = null;
        connectSSE();
      }, 1000);
    };
    eventSourceRef.current = source;
  }, [applyServerEvent, client, gameRoomId]);

  useEffect(() => {
    autoTickPhaseRef.current = "";
  }, [gameRoomId]);

  useEffect(() => {
    let mounted = true;
    if (mounted) connectSSE();
    return () => {
      mounted = false;
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (sseReconnectTimerRef.current !== null) {
        window.clearTimeout(sseReconnectTimerRef.current);
      }
    };
  }, [connectSSE]);

  // Seat layout grows from 6 (lobby default) up to the room's max as more
  // players join. Capped at targetPlayerCount (12) so we never show more
  // seats than the room allows.
  const activeSeatCount =
    room?.players.filter((player) => !player.leftAt).length ?? 0;
  const targetCount = Math.min(
    Math.max(6, activeSeatCount),
    room?.targetPlayerCount ?? 12
  );
  const currentViewerPlayerId =
    timelineDisplayState.perspective.playerId ?? undefined;
  const currentViewerSeatNo =
    timelineDisplayState.perspective.seatNo ?? undefined;
  const myPlayer = useMemo(
    () =>
      room?.players.find(
        (player) =>
          !player.leftAt &&
          ((currentViewerPlayerId && player.id === currentViewerPlayerId) ||
            (currentViewerSeatNo !== undefined &&
              player.seatNo === currentViewerSeatNo) ||
            player.userId === matrixUserId)
      ),
    [currentViewerPlayerId, currentViewerSeatNo, room, matrixUserId]
  );
  const myPrivateState = useMemo(
    () => privateStates.find((state) => state.playerId === myPlayer?.id),
    [myPlayer?.id, privateStates]
  );
  const myIsAlive = Boolean(
    myPlayer &&
      myPrivateState?.alive !== false &&
      (projection?.alivePlayerIds.includes(myPlayer.id) ?? true)
  );
  // Mirror myPrivateState into a ref so the long-lived SSE handler (created
  // once per gameRoomId) can read it without forcing a reconnect every time
  // the value changes.
  const myPrivateStateRef = useRef<PlayerPrivateState | undefined>(undefined);
  useEffect(() => {
    myPrivateStateRef.current = myPrivateState;
  }, [myPrivateState]);
  const isCreator = room?.creatorUserId === matrixUserId;

  // Fetch LiveKit token once the player is in the room. Token is reused for
  // the whole session; the VoiceRoomProvider handles connect/disconnect.
  //
  // Keying the effect on `myPlayer?.id` (a stable string) rather than the
  // whole `myPlayer` object is critical — `myPlayer` is recomputed via
  // useMemo whenever `room` changes (which happens on every SSE-triggered
  // refresh), and re-fetching would create a new JWT every time, which in
  // turn would cause VoiceRoomProvider to tear down and re-establish the
  // LiveKit connection. With the stable id, we fetch once per game session.
  const myPlayerId = myPlayer?.id;
  const roomIdForVoice = room?.id;
  const voiceIdentityMode = roomIdForVoice
    ? `${roomIdForVoice}:${myPlayerId ?? "spectator"}`
    : "";
  useEffect(() => {
    if (!room || !matrixUserId) {
      setLivekitToken(null);
      setLivekitServerUrl(null);
      return;
    }
    let cancelled = false;
    void client
      .getLivekitToken(gameRoomId)
      .then((res) => {
        if (cancelled) return;
        setLivekitToken(res.token);
        setLivekitServerUrl(res.serverUrl);
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn("[LiveKit] token fetch failed:", err);
        setLivekitToken(null);
        setLivekitServerUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [voiceIdentityMode, matrixUserId, client, gameRoomId, roomIdForVoice]);

  useEffect(() => {
    return () => {
      if (seerResultTimeoutRef.current !== null) {
        window.clearTimeout(seerResultTimeoutRef.current);
      }
    };
  }, []);

  // Drive a 1Hz tick so the countdown re-renders even when no SSE event
  // arrives. Only active when a deadline exists, to avoid useless renders
  // in the lobby / end states.
  useEffect(() => {
    if (!projection?.deadlineAt) return;
    const id = window.setInterval(() => setNowTick((v) => v + 1), 1000);
    return () => window.clearInterval(id);
  }, [projection?.deadlineAt]);

  useEffect(() => {
    setSelectedTargetId(null);
  }, [projection?.phase, projection?.day]);

  useEffect(() => {
    if (!projection?.deadlineAt || projection.status === "ended") return;
    const deadlineMs = new Date(projection.deadlineAt).getTime();
    if (!Number.isFinite(deadlineMs)) return;
    const delayMs = Math.max(0, deadlineMs - Date.now() + 750);
    const id = window.setTimeout(() => setNowTick((v) => v + 1), delayMs);
    return () => window.clearTimeout(id);
  }, [
    projection?.deadlineAt,
    projection?.phase,
    projection?.status,
  ]);

  const uiProjection = useMemo(() => {
    const spec = mapServerPhaseToUi(projection?.phase ?? null);
    const label = spec.rawLabel ?? t(spec.labelKey, { day: projection?.day ?? 1 });
    return { ...spec, label };
  }, [projection?.phase, projection?.day, t]);

  const tieCandidates = timelineDisplayState.facts.tieCandidateIds;
  const seerChecked = useMemo(
    () =>
      myPlayer?.id
        ? (timelineDisplayState.facts.seerCheckedTargetIdsBySeerId.get(
            myPlayer.id
          ) ?? new Set<string>())
        : new Set<string>(),
    [myPlayer?.id, timelineDisplayState.facts]
  );
  const currentSpeakerSeatNo = useMemo(
    () => parseCurrentSpeakerSeat(room?.players ?? [], projection),
    [projection, room?.players]
  );
  const currentSpeakerName = useMemo(() => {
    const speakerId = projection?.currentSpeakerPlayerId;
    if (!speakerId) return undefined;
    return room?.players.find((player) => player.id === speakerId)?.displayName;
  }, [projection?.currentSpeakerPlayerId, room?.players]);
  const witchHealTargetId = useMemo(() => {
    if (projection?.phase !== "night_witch_heal" || myPrivateState?.role !== "witch") {
      return null;
    }
    return (
      timelineDisplayState.facts.witchKillTargetIdByDay.get(projection.day) ??
      null
    );
  }, [
    myPrivateState?.role,
    projection?.day,
    projection?.phase,
    timelineDisplayState.facts,
  ]);

  const legalTargetIds = useMemo(() => {
    const alive = new Set(projection?.alivePlayerIds ?? []);
    const out = new Set<string>();
    const isCreatorRunning = projection?.status === "active" || projection?.status === "paused";
    if (!room || !isCreatorRunning || !myPlayer || !myIsAlive) {
      return out;
    }
    if (projection?.phase === "day_vote") {
      for (const playerId of alive) {
        if (playerId !== myPlayer.id) {
          out.add(playerId);
        }
      }
      return out;
    }
    if (projection?.phase === "tie_vote") {
      for (const playerId of tieCandidates) {
        out.add(playerId);
      }
      return out;
    }
    if (projection?.phase === "night_guard" && myPrivateState?.role === "guard") {
      for (const player of room.players) {
        if (!player.leftAt && alive.has(player.id)) {
          out.add(player.id);
        }
      }
      return out;
    }
    if (projection?.phase === "night_wolf" && myPrivateState?.role === "werewolf") {
      for (const player of room.players) {
        if (!player.leftAt && alive.has(player.id)) {
          out.add(player.id);
        }
      }
      return out;
    }
    if (projection?.phase === "night_witch_heal" && myPrivateState?.role === "witch") {
      // The witch heal phase is a yes/no decision against the revealed wolf
      // target, not a free target selection interaction.
      return out;
    }
    if (projection?.phase === "night_witch_poison" && myPrivateState?.role === "witch") {
      if (!myPrivateState.witchItems?.poisonAvailable) {
        return out;
      }
      for (const player of room.players) {
        if (!player.leftAt && alive.has(player.id) && player.id !== myPlayer.id) {
          out.add(player.id);
        }
      }
      return out;
    }
    if (projection?.phase === "night_seer" && myPrivateState?.role === "seer") {
      for (const player of room.players) {
        if (!player.leftAt && alive.has(player.id) && player.id !== myPlayer.id && !seerChecked.has(player.id)) {
          out.add(player.id);
        }
      }
      return out;
    }
    return out;
  }, [
    myPlayer,
    myIsAlive,
    room,
    projection,
    seerChecked,
    myPrivateState,
    tieCandidates,
  ]);

  const centerActionTargetIds = useMemo(() => {
    const out = new Set(legalTargetIds);
    if (
      projection?.phase === "night_witch_heal" &&
      myPrivateState?.role === "witch" &&
      myPrivateState.witchItems?.healAvailable &&
      witchHealTargetId &&
      projection.alivePlayerIds.includes(witchHealTargetId)
    ) {
      out.add(witchHealTargetId);
    }
    return out;
  }, [
    legalTargetIds,
    myPrivateState?.role,
    myPrivateState?.witchItems?.healAvailable,
    projection?.alivePlayerIds,
    projection?.phase,
    witchHealTargetId,
  ]);

  const knownTeammateIds = useMemo(() => {
    const ids = myPrivateState?.knownTeammatePlayerIds ?? [];
    return new Set(ids.filter((id): id is string => typeof id === "string"));
  }, [myPrivateState?.knownTeammatePlayerIds]);
  const visibleRolesByPlayerId = useMemo(() => {
    const out = new Map<string, string>();
    if (myPlayer?.id && myPrivateState?.role) {
      out.set(myPlayer.id, myPrivateState.role);
    }
    for (const teammateId of knownTeammateIds) {
      out.set(teammateId, "werewolf");
    }
    return out;
  }, [knownTeammateIds, myPlayer?.id, myPrivateState?.role]);

  const seatView = useMemo(
    () =>
      buildSeatView(
        room,
        targetCount,
        myPlayer?.id,
        selectedTargetId,
        legalTargetIds,
        projection?.currentSpeakerPlayerId ?? undefined,
        knownTeammateIds,
        visibleRolesByPlayerId
      ),
    [
      myPlayer?.id,
      targetCount,
      room,
      legalTargetIds,
      selectedTargetId,
      projection?.currentSpeakerPlayerId,
      knownTeammateIds,
      visibleRolesByPlayerId,
    ]
  );
  const viewingSeat = useMemo(
    () => seatView.find((seat) => seat.seatNo === viewingSeatNo) ?? null,
    [seatView, viewingSeatNo]
  );
  const canRemoveViewingSeat = useMemo(() => {
    if (!viewingSeat || viewingSeat.isEmpty || !room || !matrixUserId) return false;
    const isLobby =
      (room.status === "waiting" || room.status === "created") &&
      (projection === null ||
        projection.status === "waiting" ||
        projection.status === "created");
    if (!isLobby) return false;
    if (isCreator) return true;
    return (
      viewingSeat.kind === "agent" &&
      viewingSeat.invitedByUserId === matrixUserId
    );
  }, [isCreator, matrixUserId, projection, room, viewingSeat]);

  const hasEnoughPlayers = activeSeatCount >= 6;

  const candidateSeats = useMemo(
    () =>
      Array.from(centerActionTargetIds)
        .map((playerId) => room?.players.find((player) => player.id === playerId))
        .filter((player): player is RoomPlayer => Boolean(player))
        .map((player) => ({
          seatNo: player.seatNo,
          playerId: player.id,
          userId: player.userId,
          agentId: player.agentId,
          displayName: player.displayName,
          avatarUrl: player.avatarUrl,
          visibleRole: visibleRolesByPlayerId.get(player.id),
        })),
    [centerActionTargetIds, room?.players, visibleRolesByPlayerId]
  );

  const actionCanRun = isCreator && uiProjection.canProgress;
  const statusText = useMemo(() => {
    if (!room) return t("common.loadingRoom");
    if (uiProjection.phaseId === "lobby" && !isCreator) {
      return t("stage.statusWaiting", { phase: projection?.phase ?? "waiting" });
    }
    if (projection?.deadlineAt) {
      const leftMs = new Date(projection.deadlineAt).getTime() - Date.now();
      if (Number.isFinite(leftMs) && leftMs > 0) {
        return t("stage.statusCountdown", { seconds: Math.floor(leftMs / 1000) });
      }
    }
    return uiProjection.label;
  }, [isCreator, projection, room, uiProjection.label, uiProjection.phaseId, t, nowTick]);

  const showRuntimeProgress = uiProjection.canRunRuntime && actionCanRun && isDevMode;

  // Auto-advance is now handled server-side. Frontend just polls for state updates.

  const canStart =
    Boolean(isCreator) &&
    uiProjection.actionMode === "lobby" &&
    (projection?.status === "waiting" ||
      projection?.status === "created" ||
      projection === null);

  const dressing = useMemo<PhaseDressing>(() => {
    return PHASE_DRESSING[uiProjection.phaseId] ?? PHASE_DRESSING.lobby!;
  }, [uiProjection.phaseId]);

  const isMyTurnToSpeak = useMemo(() => {
    if (!myPlayer) return false;
    if (!myIsAlive) return false;
    if (uiProjection.phaseId !== "day") return false;
    return projection?.currentSpeakerPlayerId === myPlayer.id;
  }, [myPlayer, myIsAlive, uiProjection.phaseId, projection?.currentSpeakerPlayerId]);
  const isWolfNightDiscussion = useMemo(
    () =>
      Boolean(
        myPlayer &&
          myIsAlive &&
          projection?.phase === "night_wolf" &&
          myPrivateState?.role === "werewolf"
      ),
    [myPlayer, myIsAlive, myPrivateState?.role, projection?.phase]
  );

  const hasActedThisPhase = useMemo(() => {
    if (!myPlayer || !projection || !projection.phase) return false;
    const phase = projection.phase ?? "";
    const day = projection.day;
    if (phase === "day_speak" || phase === "tie_speech") {
      return projection.currentSpeakerPlayerId !== myPlayer.id;
    }
    if (phase === "day_vote" || phase === "tie_vote") {
      return timelineDisplayState.facts.voteSubmittedByActorDay.has(
        actorDayKey(myPlayer.id, day)
      );
    }
    const nightPhases = [
      "night_guard",
      "night_wolf",
      "night_witch_heal",
      "night_witch_poison",
      "night_seer",
    ];
    if (nightPhases.includes(phase)) {
      return timelineDisplayState.facts.nightActionSubmittedByActorPhaseDay.has(
        actorPhaseDayKey(myPlayer.id, phase, day)
      );
    }
    return false;
  }, [myPlayer, projection, timelineDisplayState.facts]);

  const canCurrentUserAct = useMemo(() => {
    return canUseActionPanel({
      hasPlayer: Boolean(myPlayer),
      isAlive: myIsAlive,
      actionMode: uiProjection.actionMode,
      hasActedThisPhase,
      hasActionTargets: centerActionTargetIds.size > 0,
      isMyTurnToSpeak,
      phase: projection?.phase,
      role: myPrivateState?.role,
    });
  }, [
    myPlayer,
    myIsAlive,
    uiProjection.actionMode,
    hasActedThisPhase,
    centerActionTargetIds.size,
    isMyTurnToSpeak,
    projection?.phase,
    myPrivateState?.role,
  ]);

  const latestSeerResult = useMemo(() => {
    if (!myPlayer || !myPrivateState || !projection) return null;
    if (myPrivateState.role !== "seer") return null;

    const seerResult = timelineDisplayState.facts.latestSeerResultBySeerDay.get(
      seerDayKey(myPlayer.id, projection.day)
    );
    if (!seerResult) return null;

    const seatNo =
      room?.players.find((player) => player.id === seerResult.inspectedPlayerId)
        ?.seatNo ?? 0;
    const alignment = seerResult.alignment === "wolf" ? "wolf" : "good";

    return {
      key: `${seerResult.seerPlayerId}:${seerResult.day}:${seerResult.inspectedPlayerId}:${alignment}`,
      seatNo,
      alignment,
    } as const;
  }, [myPlayer, myPrivateState, projection, room?.players, timelineDisplayState.facts]);

  useEffect(() => {
    if (!latestSeerResult) return;
    if (lastShownSeerResultKeyRef.current === latestSeerResult.key) return;

    lastShownSeerResultKeyRef.current = latestSeerResult.key;
    setSeerResultOpen(true);
    if (seerResultTimeoutRef.current !== null) {
      window.clearTimeout(seerResultTimeoutRef.current);
    }
    seerResultTimeoutRef.current = window.setTimeout(() => {
      setSeerResultOpen(false);
      seerResultTimeoutRef.current = null;
    }, 4200);
  }, [latestSeerResult]);

  const closeSeerResult = useCallback(() => {
    setSeerResultOpen(false);
    if (seerResultTimeoutRef.current !== null) {
      window.clearTimeout(seerResultTimeoutRef.current);
      seerResultTimeoutRef.current = null;
    }
  }, []);

  const privateResultCopy = useMemo(() => {
    if (!myPlayer || !myPrivateState || !projection) return "";
    const phase = projection.phase ?? "";
    const currentDay = projection.day;

    // Find witch_kill_revealed for witch
    if (phase === "night_witch_heal" && myPrivateState.role === "witch") {
      const targetId = timelineDisplayState.facts.witchKillTargetIdByDay.get(
        currentDay
      );
      if (targetId) {
        const targetSeat = room?.players.find((p) => p.id === targetId)?.seatNo ?? 0;
        return t("stage.privateResult.witch", { seat: targetSeat });
      }
      return t("stage.privateResult.witchNone");
    }

    // Find guardProtect from night_action_submitted (now private:user)
    if (phase === "night_guard" && myPrivateState.role === "guard") {
      const targetId = timelineDisplayState.facts.guardProtectTargetIdByActorDay.get(
        actorDayKey(myPlayer.id, currentDay)
      );
      if (targetId) {
        const targetSeat = room?.players.find((p) => p.id === targetId)?.seatNo ?? 0;
        return t("stage.privateResult.guard", { seat: targetSeat });
      }
    }

    return "";
  }, [myPlayer, myPrivateState, projection, room?.players, t, timelineDisplayState.facts]);

  async function joinGame(seatNo?: number) {
    setErrorMessage("");
    try {
      const joined = await client.joinGame(gameRoomId, seatNo);
      setRoomSnapshot((current) => upsertRoomPlayers(current, [joined.player]));
      return joined;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
      return null;
    }
  }

  async function leaveCurrentSeat() {
    if (!myPlayer) return;
    try {
      const left = await client.leaveGame(gameRoomId);
      setRoomSnapshot((current) => upsertRoomPlayers(current, [left.player]));
      setSelectedTargetId(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function removeViewingSeat() {
    if (!viewingSeat?.playerId) return;
    setErrorMessage("");
    try {
      const removed = await client.removePlayer(gameRoomId, viewingSeat.playerId);
      setRoomSnapshot((current) => upsertRoomPlayers(current, [removed.player]));
      setViewingSeatNo(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function swapToSeat(seatNo: number) {
    if (!myPlayer) return;
    const canSwapSeats =
      !!room &&
      (room.status === "waiting" || room.status === "created") &&
      (projection === null ||
        projection.status === "waiting" ||
        projection.status === "created");
    if (!canSwapSeats) return;
    setErrorMessage("");
    try {
      const result = await client.swapSeat(gameRoomId, seatNo);
      setRoomSnapshot((current) =>
        upsertRoomPlayers(
          current,
          [result.player, result.swappedWith].filter(
            (player): player is RoomPlayer => Boolean(player)
          )
        )
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function startGameNow() {
    setErrorMessage("");
    try {
      const started = await client.startGame(gameRoomId);
      setProjectionSnapshot(started.projection);
      setPrivateStates(started.privateStates);
      setTimeline((current) => {
        const byId = new Map(current.map((event) => [event.id, event]));
        for (const event of started.events) {
          byId.set(event.id, event);
        }
        return Array.from(byId.values()).slice(-260);
      });
      setTimelineBaseSeq((current) =>
        Math.max(
          current,
          started.events.reduce(
            (maxSeq, event) => Math.max(maxSeq, event.seq),
            started.projection.version
          )
        )
      );
      setShowFillPrompt(false);
      setShowAgentPicker(false);
      return started;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
      return null;
    }
  }

  const refreshAgentCandidates = useCallback(async () => {
    setAgentLoading(true);
    setAgentError(undefined);
    try {
      const result = await client.listAgentCandidates(gameRoomId);
      setAgentCandidates(result.agents);
      setAgentSourceRoomId(result.roomId);
    } catch (error) {
      setAgentError(error instanceof Error ? error.message : String(error));
    } finally {
      setAgentLoading(false);
    }
  }, [client, gameRoomId]);

  async function addAgentToSeat(agent: AgentCandidate) {
    try {
      const added = await client.addAgentPlayer(
        gameRoomId,
        agent.userId,
        agent.displayName,
        agent.avatarUrl
      );
      setRoomSnapshot((current) => upsertRoomPlayers(current, [added.player]));
      await refreshAgentCandidates();
    } catch (error) {
      setAgentError(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleStartIntent() {
    if (!room) return;
    if (hasEnoughPlayers) {
      await startGameNow();
      return;
    }
    setShowFillPrompt(true);
    void refreshAgentCandidates();
  }

  // Game advancement is now handled server-side after each action.

  function onSeatClick(seatNo: number) {
    const seat = seatView.find((candidate) => candidate.seatNo === seatNo);
    if (!seat) return;
    if (viewingSeatNo === seatNo) {
      setViewingSeatNo(null);
      return;
    }

    if (!seat.isEmpty && seat.isActionTarget && myPlayer) {
      if (!seat.playerId) return;
      const targetId = seat.playerId;
      setSelectedTargetId((previous) => (previous === targetId ? null : targetId));
      setViewingSeatNo(null);
      return;
    }

    // Lobby = room exists and game hasn't started. Use room.status (not
    // projection?.status) because projection is null until startGame runs,
    // but require projection to still be lobby-like when it exists so stale
    // room.status cannot send seat swaps after the game has started.
    const isLobby =
      !!room &&
      (room.status === "waiting" || room.status === "created") &&
      (projection === null ||
        projection.status === "waiting" ||
        projection.status === "created");

    if (seat.isEmpty) {
      if (!isLobby) return;
      if (!myPlayer) {
        void joinGame(seatNo);
        setViewingSeatNo(null);
      } else {
        // Already in the room — request to move into that empty seat.
        // Adding agents is handled by the "+ Add AI" button in CenterStage.
        void swapToSeat(seatNo);
        setViewingSeatNo(null);
      }
      return;
    }

    if (seat.isCurrentUser && isLobby) {
      void leaveCurrentSeat();
      setViewingSeatNo(null);
      return;
    }

    setViewingSeatNo(seatNo);
  }

  function onTargetSelect(playerId: string) {
    if (!centerActionTargetIds.has(playerId)) return;
    setSelectedTargetId(playerId);
  }

  function onClearTarget() {
    setSelectedTargetId(null);
  }

  function actionExpectation() {
    const expectation: {
      expectedPhase?: string | null;
      expectedDay?: number;
      expectedVersion?: number;
    } = {};
    if (projection?.phase !== undefined) expectation.expectedPhase = projection.phase;
    if (projection?.day !== undefined) expectation.expectedDay = projection.day;
    if (projection?.version !== undefined) {
      expectation.expectedVersion = projection.version;
    }
    return expectation;
  }

  async function onConfirmTarget(explicitTargetId?: string) {
    const targetPlayerId = explicitTargetId ?? selectedTargetId;
    if (!targetPlayerId || !myPlayer) return;
    setErrorMessage("");
    setActionLoading(true);
    try {
      const phase = projection?.phase;
      const kind: "nightAction" | "vote" =
        phase === "day_vote" || phase === "tie_vote" ? "vote" : "nightAction";
      const result = await client.submitAction(gameRoomId, {
        kind,
        targetPlayerId,
        ...actionExpectation(),
      });
      if (result.event && sseEventVisibleToMe(result.event, myPrivateStateRef.current)) {
        applyServerEvent(result.event);
      }
      setSelectedTargetId(null);
      // Server auto-advances after action
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setActionLoading(false);
    }
  }

  async function onSpeak(speech?: string) {
    if (!myPlayer) return;
    setErrorMessage("");
    setActionLoading(true);
    try {
      const text = (speech ?? speechDraft).trim();
      if (!text) {
        const result = await client.submitAction(gameRoomId, {
          kind: "pass",
          ...actionExpectation(),
        });
        if (result.event && sseEventVisibleToMe(result.event, myPrivateStateRef.current)) {
          applyServerEvent(result.event);
        }
      } else {
        const result = await client.submitAction(gameRoomId, {
          kind: "speech",
          speech: text,
          ...actionExpectation(),
        });
        if (result.event && sseEventVisibleToMe(result.event, myPrivateStateRef.current)) {
          applyServerEvent(result.event);
        }
      }
      setSpeechDraft("");
      // Server auto-advances after action
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setActionLoading(false);
    }
  }

  async function onSkip() {
    if (!myPlayer || !canCurrentUserAct) return;
    setErrorMessage("");
    setActionLoading(true);
    try {
      const result = await client.submitAction(gameRoomId, {
        kind: "pass",
        ...actionExpectation(),
      });
      if (result.event && sseEventVisibleToMe(result.event, myPrivateStateRef.current)) {
        applyServerEvent(result.event);
      }
      setSelectedTargetId(null);
      setSpeechDraft("");
      // Server auto-advances after action
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setActionLoading(false);
    }
  }

  async function onSpeechComplete() {
    if (!myPlayer) return;
    setErrorMessage("");
    setActionLoading(true);
    try {
      const result = await client.submitAction(gameRoomId, {
        kind: "speechComplete",
        ...actionExpectation(),
      });
      if (result.event && sseEventVisibleToMe(result.event, myPrivateStateRef.current)) {
        applyServerEvent(result.event);
      }
      setSpeechDraft("");
      // Server auto-advances after action
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setActionLoading(false);
    }
  }

  function onFillAiStart() {
    setShowFillPrompt(false);
    setShowAgentPicker(true);
    void refreshAgentCandidates();
  }

  function goHome() {
    const params = new URLSearchParams(window.location.search);
    params.delete("gameRoomId");
    const next = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, "", next);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }

  function onWaitStart() {
    setShowFillPrompt(false);
  }

  function onAgentPickerClose() {
    setShowAgentPicker(false);
  }

  async function onAgentPickerStartNow() {
    setShowAgentPicker(false);
    await startGameNow();
  }

  const winnerText = projection?.winner
    ? projection.winner === "wolf"
      ? t("stage.winnerWolf")
      : t("stage.winnerVillage")
    : "";
  const roleId = normalizeRoleId(myPrivateState?.role);
  const roleLabel = t(`role.${roleId}`);
  const roleDescription = t(`roleCard.description.${roleId}`);

  const revealRoleCard = useCallback(() => {
    if (!myPrivateState?.role) return;
    setRoleRevealOpen(true);
    setRoleRevealNonce((value) => value + 1);
  }, [myPrivateState?.role]);

  const engineGameState: EngineGameState = useMemo(
    () => ({
      scene: dressing.scene,
      phase: projection?.phase ?? null,
      seats: seatView.map((seat) => ({
        seatNo: seat.seatNo,
        playerId: seat.playerId ?? ``,
        displayName: seat.displayName ?? ``,
        isEmpty: seat.isEmpty,
        isDead: seat.isDead,
        isCurrentUser: seat.isCurrentUser,
        isSelected: seat.isSelected,
        isLegalTarget: seat.isActionTarget,
        isWolfTeammate: !!seat.isWolfTeammate,
      })),
      selectedTargetId: selectedTargetId ?? null,
      roleCard: myPrivateState?.role
        ? {
            nonce: roleRevealNonce,
            roleId,
            roleLabel,
            roleDescription,
            cardBackUrl: roleCardBackUrl(),
            cardFrontUrl: roleCardFrontUrl(roleId),
            visible: roleRevealOpen,
          }
        : undefined,
    }),
    [
      dressing.scene,
      myPrivateState?.role,
      projection?.phase,
      roleDescription,
      roleId,
      roleLabel,
      roleRevealNonce,
      roleRevealOpen,
      seatView,
      selectedTargetId,
    ]
  );

  return (
    <VoiceRoomProvider serverUrl={livekitServerUrl} token={livekitToken}>
      <GameRoomShell
        engineGameState={engineGameState}
        onRoleCardClose={() => setRoleRevealOpen(false)}
        title={room?.title ?? t("app.title")}
        roomCode={gameRoomId}
        sourceMatrixRoomId={room?.createdFromMatrixRoomId}
        playerCount={activeSeatCount}
        targetPlayerCount={targetCount}
        phaseLabel={uiProjection.label}
        day={projection?.day}
        rawPhase={projection?.phase ?? null}
        deadlineAt={projection?.deadlineAt}
        aliveCount={projection?.alivePlayerIds.length ?? activeSeatCount}
        scene={dressing.scene}
        accent={dressing.accent}
        seats={seatView}
        seatCount={targetCount}
        onSeatClick={onSeatClick}
        onHomeClick={goHome}
        isLoading={runtimeInProgress}
        errorMessage={errorMessage || undefined}
        center={
          <CenterStage
            kicker={t(dressing.kickerKey)}
            title={uiProjection.label}
            copy={privateResultCopy || (dressing.copyKey ? t(dressing.copyKey) : "")}
            actionMode={uiProjection.actionMode}
            confirmMode={dressing.confirmMode}
            legalTargets={candidateSeats}
            selectedTargetId={selectedTargetId ?? null}
            isCreator={Boolean(isCreator)}
            canStart={canStart}
            canProgress={showRuntimeProgress}
            canCurrentUserAct={canCurrentUserAct}
            winnerText={winnerText}
            statusText={statusText}
            currentSpeakerSeatNo={currentSpeakerSeatNo ?? 0}
            currentSpeakerName={currentSpeakerName}
            myRoleId={myPrivateState?.role}
            aliveCount={projection?.alivePlayerIds.length ?? activeSeatCount}
            totalCount={activeSeatCount}
            isMyTurnToSpeak={isMyTurnToSpeak || (isWolfNightDiscussion && !hasActedThisPhase)}
            speechInput={speechDraft}
            actionLoading={actionLoading}
            onStart={handleStartIntent}
            onAddAgent={onFillAiStart}
            canAddAgent={
              !!room &&
              (room.status === "waiting" || room.status === "created") &&
              activeSeatCount < (room.targetPlayerCount ?? 12)
            }
            onTargetSelect={onTargetSelect}
            onClearTarget={onClearTarget}
            onConfirmTarget={onConfirmTarget}
            onSpeak={onSpeak}
            onSpeechChange={setSpeechDraft}
            onSpeechComplete={onSpeechComplete}
            onSkip={onSkip}
          />
        }
        timeline={
          <TimelineCapsule
            enabled={uiProjection.showTimeline}
            events={events}
            players={room?.players ?? []}
            myPlayerId={myPlayer?.id}
            revealAll={projection?.status === "ended" || room?.status === "ended"}
          />
        }
        roleCardEntry={
          <RoleCardLayer
            roleId={myPrivateState?.role}
            ownerName={myPlayer?.displayName ?? matrixDisplayName}
            enabled={Boolean(myPrivateState?.role)}
            onReveal={revealRoleCard}
          />
        }
        overlays={
          <>
            <UserInfoPanel
              seat={viewingSeat}
              canRemove={canRemoveViewingSeat}
              onRemove={removeViewingSeat}
              onClose={() => setViewingSeatNo(null)}
            />
            <StartDialog
              open={showFillPrompt}
              filled={activeSeatCount}
              target={targetCount}
              onFillAi={onFillAiStart}
              onWait={onWaitStart}
            />
            <AgentPicker
              open={showAgentPicker}
              loading={agentLoading}
              agents={agentCandidates}
              errorMessage={agentError}
              sourceRoomId={agentSourceRoomId}
              remainingSeats={Math.max(
                (room?.targetPlayerCount ?? 12) - activeSeatCount,
                0
              )}
              canStartNow={hasEnoughPlayers}
              onAdd={addAgentToSeat}
              onRefresh={refreshAgentCandidates}
              onStartNow={onAgentPickerStartNow}
              onClose={onAgentPickerClose}
            />
            <SeerResultDialog
              open={seerResultOpen && Boolean(latestSeerResult)}
              seatNo={latestSeerResult?.seatNo ?? 0}
              alignment={latestSeerResult?.alignment ?? "good"}
              onClose={closeSeerResult}
            />
          </>
        }
      />
    </VoiceRoomProvider>
  );
}
