import { un } from "./devLog";

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

export interface UnsealClientOptions {
  refreshJwt?: (() => Promise<string | null | undefined>) | undefined;
}

export function createUnsealClient(
  baseUrl: string,
  options: UnsealClientOptions = {}
): UnsealClient {
  const normalized = baseUrl.replace(/\/+$/, "");
  let refreshedJwt: string | null = null;

  function headersWithRefreshedJwt(init: RequestInit): HeadersInit | undefined {
    if (!refreshedJwt) return init.headers;
    const headers = new Headers(init.headers);
    if (headers.has("authorization")) {
      headers.set("authorization", `Bearer ${refreshedJwt}`);
    }
    return Object.fromEntries(headers.entries());
  }

  async function refreshJwt(): Promise<string | null> {
    const nextJwt = (await options.refreshJwt?.())?.trim();
    if (!nextJwt) return null;
    refreshedJwt = nextJwt;
    return nextJwt;
  }

  async function request<T>(
    path: string,
    init: RequestInit = {},
    retryOnUnauthorized = true
  ): Promise<T> {
    const headers = headersWithRefreshedJwt(init);
    const requestInit: RequestInit = { ...init };
    if (headers) requestInit.headers = headers;
    const response = await fetch(`${normalized}${path}`, requestInit);
    if (!response.ok) {
      if (response.status === 401 && retryOnUnauthorized) {
        const nextJwt = await refreshJwt().catch(() => null);
        if (nextJwt) return request<T>(path, init, false);
      }
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
    
    const resp = (await response.json()) as T;
    return resp
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
