import { refreshMatrixToken as refreshStoredMatrixToken } from "../matrix/session";

type PlayerKind = "user" | "agent";

type RoomStatus = "created" | "waiting" | "active" | "paused" | "ended";

type RoleId = "werewolf" | "seer" | "witch" | "guard" | "villager";

type PlayerRoleState = "wolf" | "good";

export interface CallerIdentity {
  userId?: string | undefined;
  displayName?: string | undefined;
  avatarUrl?: string | undefined;
}

export interface ApiClientOptions {
  baseUrl: string;
  getMatrixToken(): string;
  refreshMatrixToken?: (() => Promise<string | null | undefined>) | undefined;
  caller?: CallerIdentity | undefined;
}

export interface CreatedGame {
  gameRoomId: string;
  card: {
    webUrl?: string;
    [key: string]: unknown;
  };
}

export interface JoinedPlayer {
  player: {
    id: string;
    userId?: string;
    agentId?: string;
    invitedByUserId?: string;
    displayName: string;
    avatarUrl?: string;
    seatNo: number;
    kind: PlayerKind;
    ready: boolean;
    onlineState: "online" | "offline";
    leftAt: string | null;
  };
}

export interface GameEventDto {
  id: string;
  gameRoomId?: string;
  seq?: number;
  type: string;
  actorId?: string;
  subjectId?: string;
  visibility: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface RoomPlayer {
  id: string;
  userId?: string;
  agentId?: string;
  invitedByUserId?: string;
  displayName: string;
  avatarUrl?: string;
  seatNo: number;
  kind: PlayerKind;
  ready: boolean;
  onlineState: "online" | "offline";
  leftAt: string | null;
}

export interface RoomProjection {
  gameRoomId: string;
  status: RoomStatus;
  phase: string | null;
  day: number;
  deadlineAt: string | null;
  currentSpeakerPlayerId: string | null;
  winner: "wolf" | "good" | null;
  alivePlayerIds: string[];
  version: number | string;
}

export interface TimelineDisplayFactsDto {
  tieCandidateIds: string[];
  seerCheckedTargetIdsBySeerId: Record<string, string[]>;
  latestSeerResultBySeerDay: Record<string, unknown>;
  witchKillTargetIdByDay: Record<string, string>;
  guardProtectTargetIdByActorDay: Record<string, string>;
  voteSubmittedByActorDay: string[];
  nightActionSubmittedByActorPhaseDay: string[];
}

export interface GameReadSnapshot {
  snapshotEventId: string;
  latestEventId: string;
  displayState: {
    room: GameRoom;
    projection: RoomProjection | null;
    privateStates: PlayerPrivateState[];
    displayFacts?: TimelineDisplayFactsDto;
  };
}

export interface GameReadResponse {
  snapshot: GameReadSnapshot;
  timelineCursor: { after: string };
}

export interface TimelinePageResponse {
  events: GameEventDto[];
  cursor: {
    before: string | null;
    after: string | null;
  };
}

export interface PlayerPrivateState {
  playerId: string;
  role: RoleId;
  team: PlayerRoleState;
  alive: boolean;
  knownTeammatePlayerIds: string[];
  witchItems?: {
    healAvailable: boolean;
    poisonAvailable: boolean;
  };
}

export interface GameRoom {
  id: string;
  title: string;
  status: RoomStatus;
  targetPlayerCount: number;
  creatorUserId: string;
  language: "zh-CN" | "en";
  timing?: {
    nightActionSeconds: number;
    speechSeconds: number;
    voteSeconds: number;
    agentSpeechRate?: number;
  };
  createdFromMatrixRoomId: string;
  players: RoomPlayer[];
  projection: RoomProjection | null;
  sourceMatrixRoomId?: string;
}

export interface MatrixWhoAmI {
  user_id?: string;
  display_name?: string;
}

export interface MatrixJoinedRooms {
  joined_rooms: string[];
}

export interface MatrixRoomNameState {
  name?: string;
}

export interface MatrixCanonicalAliasState {
  alias?: string;
}

export interface AgentCandidate {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  userType: string;
  membership: string;
  alreadyJoined: boolean;
}

export interface AgentCandidatesResponse {
  agents: AgentCandidate[];
  total: number;
  roomId: string;
}

export interface FillAgentsResponse {
  addedPlayers: RoomPlayer[];
  targetPlayerCount: number;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function appBasePath(): string {
  const base = import.meta.env.BASE_URL || "/";
  const leading = base.startsWith("/") ? base : `/${base}`;
  return leading.endsWith("/") ? leading : `${leading}/`;
}

function createCommandId(kind: string): string {
  const random =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${kind}-${random}`;
}

function idempotentHeaders(kind: string): Record<string, string> {
  return { "x-command-id": createCommandId(kind) };
}

export function defaultApiBaseUrl(): string {
  const explicit = import.meta.env.VITE_API_BASE_URL?.trim();
  if (explicit) return trimTrailingSlash(explicit);

  const { protocol, hostname, origin } = window.location;
  const isLocalDev =
    protocol === "http:" &&
    (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1");
  if (isLocalDev && appBasePath() === "/") {
    return "http://localhost:3000";
  }

  return `${origin}${trimTrailingSlash(appBasePath())}/api`;
}

export function createApiClient(options: ApiClientOptions) {
  const baseUrl = trimTrailingSlash(options.baseUrl);
  let refreshedMatrixToken: string | null = null;

  function withCaller(body: Record<string, unknown>): Record<string, unknown> {
    const { userId, displayName, avatarUrl } = options.caller ?? {};
    return {
      ...body,
      ...(userId ? { userId } : {}),
      ...(displayName ? { displayName } : {}),
      ...(avatarUrl ? { avatarUrl } : {}),
    };
  }

  function currentMatrixToken(): string {
    return refreshedMatrixToken ?? options.getMatrixToken();
  }

  async function refreshMatrixToken(): Promise<string | null> {
    const nextToken = (
      (await options.refreshMatrixToken?.()) ??
      (await refreshStoredMatrixToken())
    )?.trim();
    if (!nextToken) return null;
    refreshedMatrixToken = nextToken;
    return nextToken;
  }

  async function request<T>(
    path: string,
    init: RequestInit = {},
    retryOnUnauthorized = true
  ): Promise<T> {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${currentMatrixToken()}`,
        ...(init.headers ?? {}),
      },
    });

    if (!response.ok) {
      if (response.status === 401 && retryOnUnauthorized) {
        const nextToken = await refreshMatrixToken().catch(() => null);
        if (nextToken) return request<T>(path, init, false);
      }
      throw new Error(await response.text());
    }

    return (await response.json()) as T;
  }

  return {
    createGame(body: unknown) {
      return request<CreatedGame>("/games", {
        method: "POST",
        body: JSON.stringify(withCaller(body as Record<string, unknown>)),
      });
    },
    whoAmIAgainstApi() {
      return request<MatrixWhoAmI>("/games/me");
    },
    joinGame(gameRoomId: string, seatNo?: number, displayName?: string, avatarUrl?: string) {
      return request<JoinedPlayer>(`/games/${gameRoomId}/join`, {
        method: "POST",
        headers: idempotentHeaders("join"),
        body: JSON.stringify({
          ...withCaller({}),
          ...(seatNo ? { seatNo } : {}),
          ...(displayName ? { displayName } : {}),
          ...(avatarUrl ? { avatarUrl } : {}),
        }),
      });
    },
    leaveGame(gameRoomId: string) {
      return request<{ player: RoomPlayer }>(`/games/${gameRoomId}/leave`, {
        method: "POST",
        headers: idempotentHeaders("leave"),
        body: JSON.stringify(withCaller({})),
      });
    },
    swapSeat(gameRoomId: string, seatNo: number) {
      return request<{ player: RoomPlayer; swappedWith: RoomPlayer | null }>(
        `/games/${gameRoomId}/seat`,
        {
          method: "POST",
          headers: idempotentHeaders("swapSeat"),
          body: JSON.stringify(withCaller({ seatNo })),
        }
      );
    },
    startGame(gameRoomId: string) {
      return request<{
        status: string;
        projection: RoomProjection;
        privateStates: PlayerPrivateState[];
        events: GameEventDto[];
      }>(`/games/${gameRoomId}/start`, {
        method: "POST",
        headers: idempotentHeaders("start"),
        body: JSON.stringify(withCaller({})),
      });
    },
    getGame(gameRoomId: string) {
      return request<GameReadResponse>(`/games/${gameRoomId}`);
    },
    getTimeline(
      gameRoomId: string,
      params: { after?: string; before?: string; limit?: number } = {}
    ) {
      const search = new URLSearchParams();
      if (params.after) search.set("after", params.after);
      if (params.before) search.set("before", params.before);
      if (params.limit !== undefined) search.set("limit", String(params.limit));
      const suffix = search.toString() ? `?${search.toString()}` : "";
      return request<TimelinePageResponse>(`/games/${gameRoomId}/timeline${suffix}`);
    },
    listAgentCandidates(gameRoomId: string) {
      return request<AgentCandidatesResponse>(
        `/games/${gameRoomId}/agent-candidates`
      );
    },
    addAgentPlayer(
      gameRoomId: string,
      agentUserId: string,
      displayName?: string,
      avatarUrl?: string
    ) {
      return request<{ player: RoomPlayer }>(`/games/${gameRoomId}/agents`, {
        method: "POST",
        headers: idempotentHeaders("addAgent"),
        body: JSON.stringify({ agentUserId, displayName, avatarUrl }),
      });
    },
    fillAgentPlayers(gameRoomId: string, targetPlayerCount: number) {
      return request<FillAgentsResponse>(`/games/${gameRoomId}/agents/fill`, {
        method: "POST",
        headers: idempotentHeaders("fillAgents"),
        body: JSON.stringify(withCaller({ targetPlayerCount })),
      });
    },
    removePlayer(gameRoomId: string, matrixUserId: string) {
      return request<{ player: RoomPlayer }>(
        `/games/${gameRoomId}/players/${encodeURIComponent(matrixUserId)}`,
        { method: "DELETE", headers: idempotentHeaders("removePlayer") }
      );
    },
    submitAction(
      gameRoomId: string,
      body: {
        kind: "speech" | "speechComplete" | "vote" | "nightAction" | "pass";
        targetMatrixUserId?: string;
        speech?: string;
      }
    ) {
      return request<{ success: boolean; event?: GameEventDto }>(
        `/games/${gameRoomId}/actions`,
        {
          method: "POST",
          headers: idempotentHeaders(`action-${body.kind}`),
          body: JSON.stringify(withCaller(body as Record<string, unknown>)),
        }
      );
    },
    getLivekitToken(gameRoomId: string) {
      return request<{
        token: string;
        serverUrl: string;
        room: string;
        identity: string;
        canPublish?: boolean;
      }>(`/games/${gameRoomId}/livekit-token`, {
        method: "POST",
      });
    },
    downloadTranscript(gameRoomId: string, eventId: string) {
      return fetch(
        `${baseUrl}/games/${encodeURIComponent(gameRoomId)}/events/${encodeURIComponent(eventId)}/transcript`,
        {
          headers: {
            authorization: `Bearer ${options.getMatrixToken()}`,
          },
        }
      ).then(async (response) => {
        if (!response.ok) {
          throw new Error(`Transcript download failed: HTTP ${response.status}`);
        }
        return response.text();
      });
    },
    subscribeUrl(gameRoomId: string) {
      const token = encodeURIComponent(options.getMatrixToken());
      const { userId } = options.caller ?? {};
      const userIdParam = userId ? `&userId=${encodeURIComponent(userId)}` : "";
      return `${baseUrl}/games/${gameRoomId}/subscribe?access_token=${token}${userIdParam}`;
    },
    async whoAmI(matrixServerBase: string): Promise<MatrixWhoAmI> {
      const response = await fetch(
        `${matrixServerBase}/_matrix/client/v3/account/whoami`,
        {
          headers: {
            authorization: `Bearer ${options.getMatrixToken()}`,
          },
        }
      );
      if (!response.ok) {
        throw new Error(`Matrix whoami failed: HTTP ${response.status}`);
      }
      return (await response.json()) as MatrixWhoAmI;
    },
    async joinedRooms(matrixServerBase: string): Promise<MatrixJoinedRooms> {
      const response = await fetch(
        `${matrixServerBase}/_matrix/client/v3/joined_rooms`,
        {
          headers: {
            authorization: `Bearer ${options.getMatrixToken()}`,
          },
        }
      );
      if (!response.ok) {
        throw new Error(`Matrix joined_rooms failed: HTTP ${response.status}`);
      }
      return (await response.json()) as MatrixJoinedRooms;
    },
    async roomDisplayName(
      matrixServerBase: string,
      roomId: string
    ): Promise<string | null> {
      const encodedRoomId = encodeURIComponent(roomId);
      const stateBase = `${matrixServerBase}/_matrix/client/v3/rooms/${encodedRoomId}/state`;

      const nameResponse = await fetch(`${stateBase}/m.room.name`, {
        headers: {
          authorization: `Bearer ${options.getMatrixToken()}`,
        },
      });
      if (nameResponse.ok) {
        const body = (await nameResponse.json()) as MatrixRoomNameState;
        if (body.name?.trim()) return body.name.trim();
      }

      const aliasResponse = await fetch(`${stateBase}/m.room.canonical_alias`, {
        headers: {
          authorization: `Bearer ${options.getMatrixToken()}`,
        },
      });
      if (aliasResponse.ok) {
        const body = (await aliasResponse.json()) as MatrixCanonicalAliasState;
        if (body.alias?.trim()) return body.alias.trim();
      }

      return null;
    },
  };
}
