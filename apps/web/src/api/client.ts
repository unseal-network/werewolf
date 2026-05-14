type PlayerKind = "user" | "agent";

type RoomStatus = "created" | "waiting" | "active" | "paused" | "ended";

type RoleId = "werewolf" | "seer" | "witch" | "guard" | "villager";

type PlayerRoleState = "wolf" | "good";

export interface ApiClientOptions {
  baseUrl: string;
  getMatrixToken(): string;
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
  seq: number;
  type: string;
  actorId?: string;
  subjectId?: string;
  visibility: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface RuntimeTickDto {
  status: string;
  done: boolean;
  projection: {
    gameRoomId: string;
    status: RoomStatus;
    phase: string;
    day: number;
    deadlineAt: string | null;
    currentSpeakerPlayerId: string | null;
    winner: "wolf" | "good" | null;
    alivePlayerIds: string[];
    version: number;
  };
  events: GameEventDto[];
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
  version: number;
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

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function appBasePath(): string {
  const base = import.meta.env.BASE_URL || "/";
  const leading = base.startsWith("/") ? base : `/${base}`;
  return leading.endsWith("/") ? leading : `${leading}/`;
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

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${options.getMatrixToken()}`,
        ...(init.headers ?? {}),
      },
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    return (await response.json()) as T;
  }

  return {
    createGame(body: unknown) {
      return request<CreatedGame>("/games", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    joinGame(gameRoomId: string, seatNo?: number) {
      return request<JoinedPlayer>(`/games/${gameRoomId}/join`, {
        method: "POST",
        body: JSON.stringify(seatNo ? { seatNo } : {}),
      });
    },
    leaveGame(gameRoomId: string) {
      return request<{ player: RoomPlayer }>(`/games/${gameRoomId}/leave`, {
        method: "POST",
      });
    },
    swapSeat(gameRoomId: string, seatNo: number) {
      return request<{ player: RoomPlayer; swappedWith: RoomPlayer | null }>(
        `/games/${gameRoomId}/seat`,
        {
          method: "POST",
          body: JSON.stringify({ seatNo }),
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
      });
    },
    runRuntimeTick(gameRoomId: string) {
      return request<RuntimeTickDto>(`/games/${gameRoomId}/runtime/tick`, {
        method: "POST",
      });
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
        body: JSON.stringify({ agentUserId, displayName, avatarUrl }),
      });
    },
    removePlayer(gameRoomId: string, matrixUserId: string) {
      return request<{ player: RoomPlayer }>(
        `/games/${gameRoomId}/players/${encodeURIComponent(matrixUserId)}`,
        { method: "DELETE" }
      );
    },
    submitAction(
      gameRoomId: string,
      body: {
        kind: "speech" | "speechComplete" | "vote" | "nightAction" | "pass";
        targetMatrixUserId?: string;
        speech?: string;
        expectedPhase?: string | null;
        expectedDay?: number;
        expectedVersion?: number;
      }
    ) {
      return request<{ success: boolean; event?: GameEventDto }>(
        `/games/${gameRoomId}/actions`,
        {
          method: "POST",
          body: JSON.stringify(body),
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
      return `${baseUrl}/games/${gameRoomId}/subscribe?access_token=${token}`;
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
