/**
 * Unseal 宿主服务 API 客户端
 * baseUrl = gameInfo.config.streamURL + '/app-mgr/room'
 * 例：https://keepsecret.io/app-mgr/room
 */

export interface UnsealUser {
  userId: string
  displayName: string
  avatarUrl: string
}

export interface UnsealEnterResponse {
  user: UnsealUser
  token: string
}

export interface UnsealRoomData {
  roomId: string
  meetId: string
  status: string
  playerCount: number | null
  currentPlayers: number
  mode: string
  lang: string
  adminId: string
  creatorId: string
  refereeId: string | null
  gameAppId: number
  linkRoomId: string | null
  isMine: boolean
  players: unknown[]
}

/** Unseal 服务返回的结构化错误（含业务 code，如 ROOM_002） */
export class UnsealApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message)
    this.name = 'UnsealApiError'
  }
}

export interface UnsealClient {
  /**
   * 用 unsealToken 换取 JWT
   * POST /api/auth/enter
   */
  enter(unsealToken: string): Promise<UnsealEnterResponse>

  /**
   * 查询宿主房间信息（含 linkRoomId）
   * GET /api/rooms/:roomId
   * 房间不存在时抛 UnsealApiError(code='ROOM_002')
   */
  getRoom(roomId: string, jwt: string): Promise<UnsealRoomData>

  /**
   * 将游戏房间 ID 绑定到宿主房间
   * POST /api/rooms/:roomId/link
   */
  linkRoom(roomId: string, linkRoomId: string, jwt: string): Promise<void>
}

/**
 * 创建 Unseal 客户端
 * @param baseUrl gameInfo.config.streamURL + '/app-mgr/room'
 */
export function createUnsealClient(baseUrl: string): UnsealClient {
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${baseUrl}${path}`, init)
    if (!res.ok) {
      // 尝试解析结构化错误（{ success: false, code, message }）
      const body = await res.json().catch(() => null) as { code?: string; message?: string } | null
      if (body?.code) {
        throw new UnsealApiError(body.code, body.message ?? `Unseal API error`, res.status)
      }
      throw new Error(`Unseal API ${path} failed (${res.status})`)
    }
    return res.json() as Promise<T>
  }

  return {
    enter(unsealToken: string) {
      return request<UnsealEnterResponse>('/api/auth/enter', {
        method: 'POST',
        headers: { unsealToken },
      })
    },

    async getRoom(roomId: string, jwt: string) {
      const res = await request<{ success: boolean; data: UnsealRoomData }>(
        `/api/rooms/${encodeURIComponent(roomId)}`,
        { headers: { Authorization: `Bearer ${jwt}` } }
      )
      return res.data
    },

    linkRoom(roomId: string, linkRoomId: string, jwt: string) {
      return request(`/api/rooms/${encodeURIComponent(roomId)}/link`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${jwt}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ linkRoomId }),
      }) as Promise<void>
    },
  }
}
