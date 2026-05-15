export interface UnsealEnterResponse {
  token: string;
  user?: {
    userId: string;
    displayName?: string;
    avatarUrl?: string;
  };
}

export interface UnsealRoomData {
  roomId: string;
  linkRoomId: string | null;
  [key: string]: unknown;
}

export class UnsealApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "UnsealApiError";
  }
}

export interface UnsealClient {
  enter(unsealToken: string): Promise<UnsealEnterResponse>;
  getRoom(roomId: string, jwt: string): Promise<UnsealRoomData>;
  linkRoom(roomId: string, linkRoomId: string, jwt: string): Promise<void>;
}

export function createUnsealClient(baseUrl: string): UnsealClient {
  const normalized = baseUrl.replace(/\/+$/, "");

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${normalized}${path}`, init);
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        code?: string;
        message?: string;
      } | null;
      if (body?.code) {
        throw new UnsealApiError(
          body.code,
          body.message ?? `Unseal API ${path} failed`,
          response.status
        );
      }
      throw new Error(`Unseal API ${path} failed (${response.status})`);
    }
    return (await response.json()) as T;
  }

  return {
    enter(unsealToken: string) {
      return request<UnsealEnterResponse>("/api/auth/enter", {
        method: "POST",
        headers: { unsealToken },
      });
    },

    async getRoom(roomId: string, jwt: string) {
      const response = await request<{ data: UnsealRoomData }>(
        `/api/rooms/${encodeURIComponent(roomId)}`,
        { headers: { authorization: `Bearer ${jwt}` } }
      );
      return response.data;
    },

    async linkRoom(roomId: string, linkRoomId: string, jwt: string) {
      await request(`/api/rooms/${encodeURIComponent(roomId)}/link`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${jwt}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ linkRoomId }),
      });
    },
  };
}
