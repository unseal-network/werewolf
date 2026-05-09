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
    subscribeUrl(gameRoomId: string) {
      return `${options.baseUrl}/games/${gameRoomId}/subscribe`;
    },
  };
}
