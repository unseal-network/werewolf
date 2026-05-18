import { un } from "@unseal-network/mobile-log";

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
    un.log('[werewolf] request request', response)
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        code?: string;
        message?: string;
      } | null;
      if (body?.code) {
        un.log('[werewolf] request response', response.status)
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
    // https://keepsecret.io/app-mgr/room/api/auth/enter
    enter(unsealToken: string) {
      return request<UnsealEnterResponse>("/api/auth/enter", {
        method: "POST",
        headers: { unsealToken },
      });
    },
    // https://keepsecret.io/app-mgr/room/api/rooms/45b54890-98a4-4a9f-9717-af131456755b
    async getRoom(roomId: string, jwt: string) {
      const response = await request<{ data: UnsealRoomData }>(
        `/api/rooms/${encodeURIComponent(roomId)}`,
        { headers: { authorization: `Bearer ${jwt}` } }
      );
      return response.data;
    },

    // https://keepsecret.io/app-mgr/room/api/rooms/45b54890-98a4-4a9f-9717-af131456755b/link
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
