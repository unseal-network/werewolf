import { useRef, useState, useCallback, useMemo } from 'react'
import { useIFrameMessage } from '@unseal-network/game-sdk'
import { createIframeMessageMock, isInIframe } from '../mocks/iframeMessageMock'

export interface GameInfo {
  roomId: string
  userId: string
  displayName: string
  powerLevel: number
  config: { streamURL: string }
  gameRoomId?: string
  [key: string]: unknown
}

export function useIframeAuth() {
  // 非 iframe 环境（本地开发）自动使用 mock
  const realMessage = useIFrameMessage()
  const mockMessage = useMemo(() => createIframeMessageMock(), [])
  const iframeMessage = isInIframe() ? realMessage : mockMessage

  const [info, setInfo] = useState<GameInfo | null>(null)
  const tokenRef = useRef<string>('')

  const init = useCallback(async (): Promise<GameInfo> => {
    const gameInfo = await iframeMessage.getInfo() as GameInfo
    const token = await iframeMessage.getToken() as string
    tokenRef.current = token
    setInfo(gameInfo)
    return gameInfo
  }, [iframeMessage])

  const getToken = useCallback(async (): Promise<string> => {
    const fresh = await iframeMessage.getToken() as string
    tokenRef.current = fresh
    return fresh
  }, [iframeMessage])

  const getTokenSync = useCallback((): string => {
    return tokenRef.current
  }, [])

  return { info, setInfo, getToken, getTokenSync, iframeMessage, init }
}
