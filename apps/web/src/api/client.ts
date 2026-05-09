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
    displayName: string;
    status: string;
  };
}

export interface GameEventDto {
  id: string;
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
    phase: string;
    winner: "wolf" | "good" | null;
  };
  events: GameEventDto[];
}

export function createApiClient(options: ApiClientOptions) {
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${options.baseUrl}${path}`, {
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
    joinGame(gameRoomId: string) {
      return request<JoinedPlayer>(`/games/${gameRoomId}/join`, {
        method: "POST",
      });
    },
    startGame(gameRoomId: string) {
      return request<{ status: string }>(`/games/${gameRoomId}/start`, {
        method: "POST",
      });
    },
    runRuntimeTick(
      gameRoomId: string,
      body: { agentApiKey?: string; agentApiBaseUrl?: string } = {}
    ) {
      return request<RuntimeTickDto>(`/games/${gameRoomId}/runtime/tick`, {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    getGame(gameRoomId: string) {
      return request<{
        projection: RuntimeTickDto["projection"] | null;
        events: GameEventDto[];
      }>(`/games/${gameRoomId}`);
    },
    subscribeUrl(gameRoomId: string) {
      return `${options.baseUrl}/games/${gameRoomId}/subscribe`;
    },
  };
}
