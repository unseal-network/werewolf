import { useState, useCallback, useRef } from 'react'
import { useIframeAuth } from './hooks/useIframeAuth'
import { useGameState } from './hooks/useGameState'
import { createApiClient } from './api/client'
import { createUnsealClient, UnsealApiError } from './api/unsealClient'
import type { UnsealClient } from './api/unsealClient'
import { isInIframe } from './mocks/iframeMessageMock'
import { LoadingPage } from './pages/LoadingPage'
import { LobbyPage } from './pages/LobbyPage'
import { GamePage } from './pages/GamePage'
import { AdminModal } from './components/AdminModal'
import type { AgentCandidate } from './api/client'

type AppStage = 'init' | 'lobby' | 'playing'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000'

// ── URL helpers ─────────────────────────────────────────────────────────────
function getUrlGameRoomId(): string | null {
  return new URLSearchParams(window.location.search).get('gameRoomId')
}

function setUrlGameRoomId(id: string) {
  const params = new URLSearchParams(window.location.search)
  params.set('gameRoomId', id)
  window.history.replaceState(null, '', `?${params.toString()}`)
}

function clearUrlGameRoomId() {
  const params = new URLSearchParams(window.location.search)
  params.delete('gameRoomId')
  const qs = params.toString()
  window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname)
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

// ── App ──────────────────────────────────────────────────────────────────────
export function App() {
  const { info, getToken, getTokenSync, iframeMessage, init } = useIframeAuth()
  const { state: gameState, updateFromSnapshot, appendEvent: _appendEvent, reset: resetGame } = useGameState()

  const [stage, setStage] = useState<AppStage>('init')
  const [initError, setInitError] = useState<string | null>(null)
  const [showAdminModalOnLoading, setShowAdminModalOnLoading] = useState(false)
  const [agents, setAgents] = useState<AgentCandidate[]>([])
  const [agentsLoading, setAgentsLoading] = useState(false)
  const [gameRoomId, setGameRoomId] = useState<string | null>(null)
  const [livekitToken, setLivekitToken] = useState<string | null>(null)
  const [livekitServerUrl, setLivekitServerUrl] = useState<string | null>(null)

  // Unseal JWT（与 Matrix token 分开存储）
  const unsealJwtRef = useRef<string>('')
  // Unseal 客户端（baseUrl = gameInfo.config.streamURL + '/app-mgr/room'）
  const unsealClientRef = useRef<UnsealClient | null>(null)
  // 用于中止非 admin 轮询
  const pollAbortRef = useRef(false)
  const initDoneRef = useRef(false)

  const getClient = useCallback(() => {
    return createApiClient({ baseUrl: API_BASE, getMatrixToken: getTokenSync })
  }, [getTokenSync])

  // ── refreshGame ────────────────────────────────────────────────────────────
  const refreshGame = useCallback(async (overrideId?: string) => {
    const id = overrideId ?? gameRoomId
    if (!id) return
    await getToken()
    const client = getClient()
    const data = await client.getGame(id)
    updateFromSnapshot(data)
  }, [gameRoomId, getToken, getClient, updateFromSnapshot])

  // ── reconnect：已有 gameRoomId 时自动加入并拉取状态 ────────────────────────
  const reconnectGame = useCallback(async (id: string) => {
    const client = getClient()
    try { await client.joinGame(id) } catch { /* already joined */ }
    const data = await client.getGame(id)
    updateFromSnapshot(data)
    setGameRoomId(id)
    setUrlGameRoomId(id)
    if (data.projection?.status === 'active' || data.projection?.status === 'waiting') {
      try {
        const lkData = await client.getLivekitToken(id)
        setLivekitToken(lkData.token)
        setLivekitServerUrl(lkData.serverUrl)
      } catch { /* optional */ }
    }
    setStage('playing')
  }, [getClient, updateFromSnapshot])

  // ── 轮询宿主房间直到 linkRoomId 出现（非 admin 专用）─────────────────────
  const pollUntilLinked = useCallback(async (roomId: string): Promise<string> => {
    pollAbortRef.current = false
    while (!pollAbortRef.current) {
      try {
        const roomData = await unsealClientRef.current?.getRoom(roomId, unsealJwtRef.current)
        if (roomData?.linkRoomId) return roomData.linkRoomId
      } catch { /* 暂时忽略网络错误，继续轮询 */ }
      await sleep(1000)
    }
    throw new Error('Polling aborted')
  }, [])

  // ── init ───────────────────────────────────────────────────────────────────
  const handleInit = useCallback(async () => {
    setInitError(null)
    pollAbortRef.current = true // 中止可能正在进行的轮询

    try {
      // 1. 先用 URL 中已有的 gameRoomId 快速恢复（刷新场景）
      const urlId = getUrlGameRoomId()
      if (urlId) {
        await getToken()
        await init()
        await reconnectGame(urlId)
        return
      }

      // 2. 获取 Matrix token
      const unsealToken = await getToken()
      const gameInfo = await init()

      // 3. 非 iframe（本地开发）：跳过 Unseal 服务，直接进大厅
      if (!isInIframe()) {
        const adminFromPowerLevel = (gameInfo?.powerLevel ?? 0) >= 100
        if (adminFromPowerLevel) {
          setStage('lobby')
        } else {
          // 本地 mock 非 admin：直接进大厅等待
          setStage('lobby')
        }
        return
      }

      // 3.5 创建 Unseal 客户端（baseUrl = streamURL + '/app-mgr/room'）
      unsealClientRef.current = createUnsealClient(
        (gameInfo?.config?.streamURL ?? '') + '/app-mgr/room'
      )

      // 4. 用 unsealToken 换取 JWT
      const { token: jwt } = await unsealClientRef.current.enter(unsealToken)
      unsealJwtRef.current = jwt

      // 5. 查询宿主房间
      const roomId = gameInfo?.gameRoomId
      if (!roomId) {
        // 没有 roomId，直接进大厅
        setStage('lobby')
        return
      }
      const adminFromPowerLevel = (gameInfo?.powerLevel ?? 0) >= 100

      // 5a. 查询宿主房间（ROOM_002 = 房间不存在，视为尚无 linkRoomId）
      let linkRoomId: string | null = null
      try {
        const roomData = await unsealClientRef.current.getRoom(roomId, jwt)
        linkRoomId = roomData.linkRoomId
      } catch (e) {
        if (e instanceof UnsealApiError && e.code === 'ROOM_002') {
          setInitError('房间不存在')
          return
        }
        throw e
      }

      if (linkRoomId) {
        // 6a. 宿主已绑定游戏房间 → 直接进入
        await reconnectGame(linkRoomId)
      } else if (adminFromPowerLevel) {
        // 6b. Admin 且未创建 → 进大厅手动创建
        setStage('lobby')
      } else {
        // 6c. 非 Admin → 轮询等待 admin 创建
        const linkedId = await pollUntilLinked(roomId)
        await reconnectGame(linkedId)
      }
    } catch (e) {
      setInitError(e instanceof Error ? e.message : '初始化失败')
    }
  }, [init, getToken, reconnectGame, pollUntilLinked])

  // Auto-init on mount
  useState(() => {
    if (!initDoneRef.current) {
      initDoneRef.current = true
      void handleInit()
    }
  })

  const isAdmin = (info?.powerLevel ?? 0) >= 100
  const userId = info?.userId ?? ''

  // ── handlers ───────────────────────────────────────────────────────────────
  const handleCreateAndJoin = useCallback(async (config: {
    targetPlayerCount: number
    language: string
    meetingRequired: boolean
  }) => {
    await getToken()
    const client = getClient()

    // 创建空房间
    const { gameRoomId: newRoomId } = await client.createRoom()

    // 配置房间参数
    await client.updateRoomSettings(newRoomId, {
      sourceMatrixRoomId: info?.gameRoomId ?? '',
      title: '狼人杀',
      targetPlayerCount: config.targetPlayerCount,
      language: config.language as 'zh-CN' | 'en',
      timing: { nightActionSeconds: 45, speechSeconds: 60, voteSeconds: 30 },
    })

    // 加入房间
    await client.joinGame(newRoomId)

    // 绑定到宿主房间（供非 admin 玩家发现，仅 iframe 模式生效）
    if (isInIframe() && info?.gameRoomId && unsealClientRef.current && unsealJwtRef.current) {
      await unsealClientRef.current.linkRoom(info.gameRoomId, newRoomId, unsealJwtRef.current)
    }

    setGameRoomId(newRoomId)
    setUrlGameRoomId(newRoomId)
    await refreshGame(newRoomId)
    setStage('playing')
  }, [getToken, getClient, info, refreshGame])

  const handleJoin = useCallback(async () => {
    if (!gameRoomId) return
    await getToken()
    const client = getClient()
    await client.joinGame(gameRoomId)
    await refreshGame()
  }, [gameRoomId, getToken, getClient, refreshGame])

  const handleSelectSeat = useCallback(async (seatNo: number) => {
    if (!gameRoomId) return
    await getToken()
    const client = getClient()
    await client.swapSeat(gameRoomId, seatNo)
    await refreshGame()
  }, [gameRoomId, getToken, getClient, refreshGame])

  const handleReady = useCallback(async () => {
    if (!gameRoomId) return
    await getToken()
    const client = getClient()
    await client.submitAction(gameRoomId, { kind: 'pass' })
    await refreshGame()
  }, [gameRoomId, getToken, getClient, refreshGame])

  const handleLoadAgents = useCallback(async () => {
    if (!gameRoomId) return
    setAgentsLoading(true)
    try {
      await getToken()
      const client = getClient()
      if (isInIframe()) {
        const members = await iframeMessage.getMembers()
        setAgents(members.filter((r: any) => !!r.isAgent).map((r: any) => ({
          userId: r.userId,
          displayName: r.displayName,
          alreadyJoined: false,
          membership: '',
          userType: ''
        })))
      } else {
        const res = await client.listAgentCandidates(gameRoomId)
        setAgents(res.agents)
      }


    } finally {
      setAgentsLoading(false)
    }
  }, [gameRoomId, getToken, getClient])

  const handleAddAgent = useCallback(async (agentUserId: string, displayName: string) => {
    if (!gameRoomId) return
    await getToken()
    const client = getClient()
    await client.addAgentPlayer(gameRoomId, agentUserId, displayName)
    await refreshGame()
  }, [gameRoomId, getToken, getClient, refreshGame])

  // 批量添加 AI：逐个添加，最后刷新一次
  const handleAddAgents = useCallback(async (
    agentList: Array<{ userId: string; displayName: string }>
  ) => {
    if (!gameRoomId || agentList.length === 0) return
    await getToken()
    const client = getClient()
    for (const agent of agentList) {
      await client.addAgentPlayer(gameRoomId, agent.userId, agent.displayName)
    }
    await refreshGame()
  }, [gameRoomId, getToken, getClient, refreshGame])

  const handleStart = useCallback(async () => {
    if (!gameRoomId) return
    await getToken()
    const client = getClient()
    const result = await client.startGame(gameRoomId)
    updateFromSnapshot({
      room: gameState.room!,
      projection: result.projection,
      privateStates: result.privateStates,
      events: [...gameState.events, ...result.events],
    })
    try {
      const lkData = await client.getLivekitToken(gameRoomId)
      setLivekitToken(lkData.token)
      setLivekitServerUrl(lkData.serverUrl)
    } catch { /* voice optional */ }
  }, [gameRoomId, getToken, getClient, updateFromSnapshot, gameState])

  const handleAction = useCallback(async (body: {
    kind: string
    targetPlayerId?: string
    speech?: string
  }) => {
    if (!gameRoomId) return
    await getToken()
    const client = getClient()
    await client.submitAction(gameRoomId, body as Parameters<typeof client.submitAction>[1])
    await refreshGame()
  }, [gameRoomId, getToken, getClient, refreshGame])

  const handleBackToLobby = useCallback(() => {
    pollAbortRef.current = true  // 中止轮询
    clearUrlGameRoomId()
    setLivekitToken(null)
    setLivekitServerUrl(null)
    resetGame()
    setGameRoomId(null)
    setAgents([])
    setStage('lobby')
  }, [resetGame])

  const handleLeave = useCallback(() => {
    iframeMessage.closeApp()
  }, [iframeMessage])

  // ── SSE subscribe URL ──────────────────────────────────────────────────────
  const subscribeUrl = gameRoomId
    ? `${API_BASE}/games/${gameRoomId}/subscribe?access_token=${encodeURIComponent(getTokenSync())}`
    : null

  // ── render ─────────────────────────────────────────────────────────────────
  if (stage === 'init') {
    return (
      <>
        <LoadingPage
          isAdmin={isAdmin}
          onAdminMenu={() => setShowAdminModalOnLoading(true)}
          error={initError}
          onRetry={handleInit}
        />
        {showAdminModalOnLoading && (
          <AdminModal
            onClose={() => setShowAdminModalOnLoading(false)}
            onHide={() => { setShowAdminModalOnLoading(false); iframeMessage.hideApp() }}
            onDisband={() => { setShowAdminModalOnLoading(false); iframeMessage.closeApp() }}
          />
        )}
      </>
    )
  }

  if (stage === 'lobby') {
    return (
      <LobbyPage
        userId={userId}
        displayName={info?.displayName ?? ''}
        isAdmin={isAdmin}
        room={gameState.room}
        agents={agents}
        agentsLoading={agentsLoading}
        onCreateAndJoin={handleCreateAndJoin}
        onJoin={handleJoin}
        onSelectSeat={handleSelectSeat}
        onReady={handleReady}
        onAddAgent={handleAddAgent}
        onAddAgents={handleAddAgents}
        onLoadAgents={handleLoadAgents}
        onStart={handleStart}
        onLeave={handleLeave}
        iframeMessage={iframeMessage}
      />
    )
  }

  if (stage === 'playing' && gameState.room) {
    return (
      <GamePage
        gameRoomId={gameRoomId!}
        userId={userId}
        isAdmin={isAdmin}
        room={gameState.room}
        projection={gameState.projection}
        privateStates={gameState.privateStates}
        events={gameState.events}
        livekitToken={livekitToken}
        livekitServerUrl={livekitServerUrl}
        subscribeUrl={subscribeUrl!}
        agents={agents}
        agentsLoading={agentsLoading}
        onStart={handleStart}
        onSelectSeat={handleSelectSeat}
        onReady={handleReady}
        onLoadAgents={handleLoadAgents}
        onAddAgents={handleAddAgents}
        onRefresh={refreshGame}
        onAction={handleAction}
        onBackToLobby={handleBackToLobby}
        iframeMessage={iframeMessage}
      />
    )
  }

  return null
}
