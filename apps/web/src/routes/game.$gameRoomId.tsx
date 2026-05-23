import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createApiClient, defaultApiBaseUrl, type AgentCandidate, type GameEventDto, type GameRoom, type RoomPlayer, type PlayerPrivateState, type RoomProjection } from "../api/client";
import { GameRoomShell } from "../components/GameRoomShell";
import { CenterStage } from "../components/CenterStage";
import { CenterInfoPanel } from "../components/CenterInfoPanel";
import { TimelineCapsule } from "../components/TimelineCapsule";
import { RoleCardLayer } from "../components/RoleCardLayer";
import { UserInfoPanel } from "../components/UserInfoPanel";
import { StartDialog } from "../components/StartDialog";
import { AgentPicker } from "../components/AgentPicker";
import { SeerResultDialog } from "../components/SeerResultDialog";
import { VoiceRoomProvider } from "../components/VoiceRoom";
import { useT } from "../i18n/I18nProvider";
import type { EngineGameState } from "../engine/GameEngine";
import {
  actorDayKey,
  actorPhaseDayKey,
  compareGameEventIdStrings,
  deriveTimelineDisplayState,
  computeTimelineBaseEventId,
  seerDayKey,
  upsertRoomPlayers,
} from "../game/timelineState";
import { canUseActionPanel } from "../game/actionAvailability";
import { isActionStateConflictError } from "../game/actionConflict";
import { clearLivekitCredential, getStableLivekitCredentials } from "../game/livekitCredentials";
import {
  PHASE_DRESSING,
  mapServerPhaseToUi,
  type PhaseDressing,
} from "../game/phaseUi";
import { computeVisibleSeatCount, visibleSeatNumbersForRoom } from "../game/seatLayout";
import {
  DEMO_DISPLAY_NAME,
  DEMO_USER_ID,
  readStoredMatrixDisplayName,
  readStoredMatrixUserId,
  readMatrixToken,
  readMatrixHomeserver,
  writeMatrixIdentity,
} from "../matrix/session";
import { resolveAvatarUrl } from "../matrix/media";
import { appendTimelineEvent, useSnapshotSse } from "../runtime/snapshotSse";
import { isHostRuntime } from "../runtime/hostBridge";
import { useIframeAuth } from "../hooks/useIframeAuth";
import type { MemberInfo } from "@unseal-network/game-sdk";

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
const errorToastDurationMs = 3600;

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
  return `${roleAssetBase}/${normalizeRoleId(roleId)}.avif`;
}

function roleCardBackUrl(): string {
  return `${roleAssetBase}/card-back.avif`;
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
  visibleRolesByPlayerId: Map<string, string> = new Map(),
  resolveUrl: (url: string | undefined) => string | undefined = (u) => u
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

  const isGameStarted =
    (room.status !== "created" && room.status !== "waiting") ||
    (room.projection !== null && room.projection.status !== "created" && room.projection.status !== "waiting");
  const visibleSeatNos = visibleSeatNumbersForRoom({
    targetPlayerCount,
    occupiedSeatNos: active.map((player) => player.seatNo),
    isGameStarted,
  });

  for (const seatNo of visibleSeatNos) {
    const player = active.find((candidate) => candidate.seatNo === seatNo);
    const playerId = player?.id;
    seats.push({
      seatNo,
      playerId,
      userId: player?.userId,
      agentId: player?.agentId,
      invitedByUserId: player?.invitedByUserId,
      displayName: player?.displayName,
      avatarUrl: resolveUrl(player?.avatarUrl),
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

export function GameRoomPage({ gameRoomId, onLeave }: { gameRoomId: string; onLeave?: (() => void) | undefined }) {
  const t = useT();
  const { iframeMessage } = useIframeAuth();
  const [memberCache, setMemberCache] = useState<Map<string, MemberInfo>>(() => new Map());
  const [matrixToken] = useState(() => readMatrixToken());
  const [matrixHomeserver] = useState(() => readMatrixHomeserver());
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
  const [timelineBaseEventId, setTimelineBaseEventId] = useState("");
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
  const [livekitRefreshNonce, setLivekitRefreshNonce] = useState(0);
  const livekitCredentialKeyRef = useRef<string>("");
  const [roleRevealNonce, setRoleRevealNonce] = useState(0);
  const [roleRevealOpen, setRoleRevealOpen] = useState(false);
  // Tick once per second so countdown text re-renders smoothly between SSE
  // events. The projection's deadlineAt is absolute, so we just need to
  // recompute (now - deadlineAt) on a steady cadence.
  const [nowTick, setNowTick] = useState(0);
  const autoTickPhaseRef = useRef<string>("");
  const seerResultTimeoutRef = useRef<number | null>(null);
  const lastShownSeerResultKeyRef = useRef<string | null>(null);
  const timelineDisplayState = useMemo(
    () =>
      deriveTimelineDisplayState(
        roomSnapshot,
        projectionSnapshot,
        timeline,
        timelineBaseEventId,
        matrixUserId
      ),
    [roomSnapshot, projectionSnapshot, timeline, timelineBaseEventId, matrixUserId]
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

  // 获取当前用户身份：host 模式从 iframeMessage.getInfo() 取，避免调 /profile；
  // 非 host 模式走原有的 whoAmIAgainstApi 路径。
  useEffect(() => {
    if (isHostRuntime()) {
      console.log("[wolf] kkkk");
      void iframeMessage
        .getInfo()
        .then((info) => {
          writeMatrixIdentity(info.userId, info.displayName);
          setMatrixUserId(info.userId);
          setMatrixDisplayName(info.displayName);
        })
        .catch(() => {});
      return;
    }
    let cancelled = false;
    void client
      .whoAmIAgainstApi()
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

  // host 模式：初始化时拉取一次 Matrix 房间成员列表并缓存，
  // 用于 displayName/avatarUrl 展示，避免后续重复调 /profile 接口。
  useEffect(() => {
    if (!isHostRuntime()) return;
    console.log('[wolf] 222222')
    void iframeMessage
      .getMembers()
      .then((members) => {
        setMemberCache(new Map(members.map((m) => [m.userId, m])));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!errorMessage) return undefined;
    const timeout = window.setTimeout(() => setErrorMessage(""), errorToastDurationMs);
    return () => window.clearTimeout(timeout);
  }, [errorMessage]);

  useEffect(() => {
    if (!agentError) return undefined;
    const timeout = window.setTimeout(() => setAgentError(undefined), errorToastDurationMs);
    return () => window.clearTimeout(timeout);
  }, [agentError]);

  const applyServerEvent = useCallback(
    (event: GameEventDto) => {
      if (event.gameRoomId !== undefined && event.gameRoomId !== gameRoomId) return;
      setTimeline((current) => appendTimelineEvent(current, event));
    },
    [gameRoomId]
  );

  const eventsForCurrentRoom = useCallback(
    (events: GameEventDto[]) =>
      events.filter(
        (event) => event.gameRoomId === undefined || event.gameRoomId === gameRoomId
      ),
    [gameRoomId]
  );

  const refreshGameSnapshot = useCallback(async () => {
    const readModel = await client.getGame(gameRoomId);
    const display = readModel.snapshot.displayState;
    setRoomSnapshot(display.room);
    setProjectionSnapshot(display.projection ?? display.room.projection);
    setPrivateStates(display.privateStates);
    setTimelineBaseEventId(readModel.snapshot.snapshotEventId);
    const timelinePage = await client.getTimeline(gameRoomId, {
      after: readModel.timelineCursor.after,
      limit: 100,
    });
    setTimeline((current) => {
      const byId = new Map(
        eventsForCurrentRoom(current).map((event) => [event.id, event])
      );
      for (const event of eventsForCurrentRoom(timelinePage.events)) {
        byId.set(event.id, event);
      }
      return Array.from(byId.values()).slice(-260);
    });
  }, [client, eventsForCurrentRoom, gameRoomId]);

  const handleActionError = useCallback(
    async (error: unknown) => {
      if (isActionStateConflictError(error)) {
        try {
          await refreshGameSnapshot();
          setErrorMessage("行动阶段已变化，已同步最新状态");
        } catch (refreshError) {
          setErrorMessage(
            refreshError instanceof Error
              ? refreshError.message
              : String(refreshError)
          );
        }
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : String(error));
    },
    [refreshGameSnapshot]
  );

  useEffect(() => {
    autoTickPhaseRef.current = "";
    setRoomSnapshot(null);
    setProjectionSnapshot(null);
    setPrivateStates([]);
    setTimeline([]);
    setTimelineBaseEventId("");
    setSelectedTargetId(null);
    setViewingSeatNo(null);
    setSpeechDraft("");
    setErrorMessage("");
  }, [gameRoomId]);

  useEffect(() => {
    let cancelled = false;
    void client
      .getGame(gameRoomId)
      .then(async (readModel) => {
        if (cancelled) return;
        const display = readModel.snapshot.displayState;
        setRoomSnapshot(display.room);
        setProjectionSnapshot(display.projection ?? display.room.projection);
        setPrivateStates(display.privateStates);
        setTimelineBaseEventId(readModel.snapshot.snapshotEventId);
        const timelinePage = await client.getTimeline(gameRoomId, {
          after: readModel.timelineCursor.after,
          limit: 100,
        });
        if (cancelled) return;
        setTimeline((current) => {
          const byId = new Map(
            eventsForCurrentRoom(current).map((event) => [event.id, event])
          );
          for (const event of eventsForCurrentRoom(timelinePage.events)) {
            byId.set(event.id, event);
          }
          return Array.from(byId.values()).slice(-260);
        });
      })
      .catch((err) => {
        if (!cancelled) {
          setErrorMessage(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [client, eventsForCurrentRoom, gameRoomId]);

  // Page-scoped live updates. New servers may send snapshot-first messages
  // without timeline history; older servers still include `events` here.
  useSnapshotSse({
    subscribeUrl: client.subscribeUrl(gameRoomId),
    onSnapshot(snapshot) {
      setRoomSnapshot(snapshot.room);
      setProjectionSnapshot(snapshot.projection);
      setPrivateStates(snapshot.privateStates);
      setTimeline(eventsForCurrentRoom(snapshot.events));
      setTimelineBaseEventId(
        snapshot.snapshotEventId ?? computeTimelineBaseEventId(snapshot.events)
      );
    },
    onEvent(event) {
      applyServerEvent(event);
    },
  });

  const isGameStarted = Boolean(
    room &&
      ((room.status !== "created" && room.status !== "waiting") ||
        (projection !== null &&
          projection.status !== "created" &&
          projection.status !== "waiting"))
  );
  const maxSeatCount = room?.targetPlayerCount ?? 12;
  // In the lobby, keep one extra open seat visible so users can join. After
  // start, the board only shows actual participants even if max seats is 12.
  const activeSeatCount =
    room?.players.filter((player) => !player.leftAt).length ?? 0;
  const targetCount = computeVisibleSeatCount({
    seatCount: maxSeatCount,
    playerCount: activeSeatCount,
    occupiedSeatCount: activeSeatCount,
  });
  const participantCount = isGameStarted ? activeSeatCount : targetCount;
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
  const isCreator = room?.creatorUserId === matrixUserId;

  // Fetch LiveKit credentials independently from the SSE room snapshot and
  // game runtime. Once a credential exists for this user+game, websocket
  // reconnects must reuse it inside VoiceRoomProvider instead of minting a new
  // token and hitting the LiveKit server again.
  useEffect(() => {
    if (!matrixUserId) {
      livekitCredentialKeyRef.current = "";
      setLivekitToken(null);
      setLivekitServerUrl(null);
      return;
    }
    const credentialKey = `${gameRoomId}:${matrixUserId}:publish-token-v2`;
    if (livekitRefreshNonce === 0 && livekitCredentialKeyRef.current === credentialKey) {
      return;
    }
    let cancelled = false;
    void getStableLivekitCredentials(credentialKey, () =>
      client.getLivekitToken(gameRoomId)
    )
      .then((res) => {
        if (cancelled) return;
        console.info("[VoiceRoom] livekit token ready", {
          gameRoomId,
          identity: res.identity,
          hasServerUrl: Boolean(res.serverUrl),
        });
        livekitCredentialKeyRef.current = credentialKey;
        setLivekitToken(res.token);
        setLivekitServerUrl(res.serverUrl);
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn("[LiveKit] token fetch failed:", err);
        livekitCredentialKeyRef.current = "";
        setLivekitToken(null);
        setLivekitServerUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [matrixUserId, client, gameRoomId, livekitRefreshNonce]);

  const refreshLivekitToken = useCallback(() => {
    const credentialKey = livekitCredentialKeyRef.current;
    if (credentialKey) clearLivekitCredential(credentialKey);
    livekitCredentialKeyRef.current = "";
    setLivekitToken(null);
    setLivekitServerUrl(null);
    setLivekitRefreshNonce((value) => value + 1);
  }, []);

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

  const rawSeatView = useMemo(
    () =>
      buildSeatView(
        room,
        maxSeatCount,
        myPlayer?.id,
        selectedTargetId,
        legalTargetIds,
        projection?.currentSpeakerPlayerId ?? undefined,
        knownTeammateIds,
        visibleRolesByPlayerId,
        (url) => resolveAvatarUrl(url, matrixHomeserver, matrixToken)
      ),
    [
      myPlayer?.id,
      maxSeatCount,
      room,
      legalTargetIds,
      selectedTargetId,
      projection?.currentSpeakerPlayerId,
      knownTeammateIds,
      visibleRolesByPlayerId,
      matrixHomeserver,
      matrixToken,
    ]
  );

  // host 模式下，用 memberCache 补充/覆盖座位的 displayName 和 avatarUrl，
  // memberCache 中的 avatarUrl 已经是宿主 App 直接解析好的 HTTPS URL，无需 mxc:// 转换。
  const seatView = useMemo(() => {
    if (!isHostRuntime() || memberCache.size === 0) return rawSeatView;
    return rawSeatView.map((seat) => {
      if (!seat.userId) return seat;
      const cached = memberCache.get(seat.userId);
      if (!cached) return seat;
      return {
        ...seat,
        displayName: cached.displayName || seat.displayName,
        avatarUrl: cached.avatarUrl ?? seat.avatarUrl,
      };
    });
  }, [rawSeatView, memberCache]);
  const viewingSeat = useMemo(
    () => seatView.find((seat) => seat.seatNo === viewingSeatNo) ?? null,
    [seatView, viewingSeatNo]
  );
  const lastEmptyLobbySeatNo = useMemo(() => {
    if (isGameStarted) return undefined;
    return seatView
      .filter((seat) => seat.isEmpty)
      .at(-1)?.seatNo;
  }, [isGameStarted, seatView]);
  const canJoinLobbySeat = Boolean(!myPlayer && lastEmptyLobbySeatNo !== undefined);
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
        .map((player) => {
          const cached = player.userId ? memberCache.get(player.userId) : undefined;
          return {
            seatNo: player.seatNo,
            playerId: player.id,
            userId: player.userId,
            agentId: player.agentId,
            displayName: cached?.displayName || player.displayName,
            avatarUrl: cached?.avatarUrl ?? resolveAvatarUrl(player.avatarUrl, matrixHomeserver, matrixToken),
            visibleRole: visibleRolesByPlayerId.get(player.id),
          };
        }),
    [centerActionTargetIds, room?.players, visibleRolesByPlayerId, matrixHomeserver, matrixToken, memberCache]
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
      // host 模式：从 memberCache 拿自己的 displayName/avatarUrl 随 join 请求一起传给后端，
      // 让后端直接用这里的值写入 player 记录，无需服务端再发起 /profile 请求。
      const selfCached = isHostRuntime() ? memberCache.get(matrixUserId) : undefined;
      const joinDisplayName = selfCached?.displayName ?? matrixDisplayName;
      const joinAvatarUrl = selfCached?.avatarUrl;
      const joined = await client.joinGame(gameRoomId, seatNo, joinDisplayName, joinAvatarUrl);
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
    const matrixUserId = viewingSeat.userId ?? viewingSeat.agentId;
    if (!matrixUserId) {
      setErrorMessage("Player is missing Matrix user id");
      return;
    }
    setErrorMessage("");
    try {
      const removed = await client.removePlayer(gameRoomId, matrixUserId);
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
        const byId = new Map(
          eventsForCurrentRoom(current).map((event) => [event.id, event])
        );
        for (const event of eventsForCurrentRoom(started.events)) {
          byId.set(event.id, event);
        }
        return Array.from(byId.values()).slice(-260);
      });
      setTimelineBaseEventId((current) => {
        const fromEvents = computeTimelineBaseEventId(
          eventsForCurrentRoom(started.events)
        );
        return compareGameEventIdStrings(fromEvents, current) > 0 ? fromEvents : current;
      });
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
      if (isHostRuntime()) {
        console.log('[wolf] 11111')
        const members = await iframeMessage.getMembers();
        const candidates: AgentCandidate[] = members.map((m) => ({
          userId: m.userId,
          displayName: m.displayName,
          ...(m.avatarUrl ? { avatarUrl: m.avatarUrl } : {}),
          userType: m.isAgent ? "agent" : "user",
          membership: "join",
          alreadyJoined: false,
        }));
        setAgentCandidates(candidates);
        const info = await iframeMessage.getInfo();
        setAgentSourceRoomId(info.roomId ?? info.linkRoomId ?? undefined);
      } else {
        const result = await client.listAgentCandidates(gameRoomId);
        setAgentCandidates(result.agents);
        setAgentSourceRoomId(result.roomId);
      }
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

  async function fillAgentsToTarget(targetPlayerCount: number) {
    try {
      const filled = await client.fillAgentPlayers(gameRoomId, targetPlayerCount);
      setRoomSnapshot((current) => upsertRoomPlayers(current, filled.addedPlayers));
      await refreshAgentCandidates();
    } catch (error) {
      setAgentError(error instanceof Error ? error.message : String(error));
    }
  }

  async function removeAgentFromSeat(agent: AgentCandidate) {
    try {
      const removed = await client.removePlayer(gameRoomId, agent.userId);
      setRoomSnapshot((current) => upsertRoomPlayers(current, [removed.player]));
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

  async function handleJoinLobbySeat() {
    if (myPlayer || lastEmptyLobbySeatNo === undefined) return;
    await joinGame(lastEmptyLobbySeatNo);
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

  async function onConfirmTarget(explicitTargetId?: string) {
    const targetPlayerId = explicitTargetId ?? selectedTargetId;
    if (!targetPlayerId || !myPlayer) return;
    const targetPlayer = room?.players.find(
      (player) => !player.leftAt && player.id === targetPlayerId
    );
    const targetMatrixUserId = targetPlayer?.userId ?? targetPlayer?.agentId;
    if (!targetMatrixUserId) {
      setErrorMessage("Target is missing Matrix user id");
      return;
    }
    setErrorMessage("");
    setActionLoading(true);
    try {
      const phase = projection?.phase;
      const kind: "nightAction" | "vote" =
        phase === "day_vote" || phase === "tie_vote" ? "vote" : "nightAction";
      const result = await client.submitAction(gameRoomId, {
        kind,
        targetMatrixUserId,
      });
      if (result.event) {
        applyServerEvent(result.event);
      }
      setSelectedTargetId(null);
      // Server auto-advances after action
    } catch (error) {
      await handleActionError(error);
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
        });
        if (result.event) {
          applyServerEvent(result.event);
        }
      } else {
        const result = await client.submitAction(gameRoomId, {
          kind: "speech",
          speech: text,
        });
        if (result.event) {
          applyServerEvent(result.event);
        }
      }
      setSpeechDraft("");
      // Server auto-advances after action
    } catch (error) {
      await handleActionError(error);
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
      });
      if (result.event) {
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
      });
      if (result.event) {
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
    <VoiceRoomProvider
      serverUrl={livekitServerUrl}
      token={livekitToken}
      onTokenUnauthorized={refreshLivekitToken}
    >
      <GameRoomShell
        engineGameState={engineGameState}
        onRoleCardClose={() => setRoleRevealOpen(false)}
        title={room?.title ?? t("app.title")}
        roomCode={gameRoomId}
        sourceMatrixRoomId={room?.createdFromMatrixRoomId}
        playerCount={activeSeatCount}
        targetPlayerCount={participantCount}
        phaseLabel={uiProjection.label}
        day={projection?.day}
        rawPhase={projection?.phase ?? null}
        deadlineAt={projection?.deadlineAt}
        aliveCount={projection?.alivePlayerIds.length ?? activeSeatCount}
        scene={dressing.scene}
        accent={dressing.accent}
        seats={seatView}
        seatCount={maxSeatCount}
        onSeatClick={onSeatClick}
        onHomeClick={goHome}
        onMobileClose={onLeave}
        isLoading={runtimeInProgress}
        errorMessage={errorMessage || undefined}
        centerInfo={
          <CenterInfoPanel
            rawPhase={projection?.phase ?? null}
            scene={dressing.scene}
            day={projection?.day}
            players={room?.players ?? []}
            events={events}
            currentSpeakerPlayerId={projection?.currentSpeakerPlayerId}
          />
        }
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
            canJoinLobby={canJoinLobbySeat}
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
            onJoinLobby={handleJoinLobbySeat}
            onExitGame={goHome}
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
              activePlayerCount={activeSeatCount}
              targetPlayerCount={room?.targetPlayerCount ?? 12}
              canStartNow={hasEnoughPlayers}
              onAdd={addAgentToSeat}
              onRemove={removeAgentFromSeat}
              onFill={fillAgentsToTarget}
              onRefresh={refreshAgentCandidates}
              {...(isCreator ? { onStartNow: onAgentPickerStartNow } : {})}
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
