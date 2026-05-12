import { useState, useCallback, useRef } from 'react'
import { useIframeAuth } from './hooks/useIframeAuth'
import { useGameState } from './hooks/useGameState'
import { createApiClient } from './api/client'
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
    // join 可能已在房间中，忽略错误
    try { await client.joinGame(id) } catch { /* already joined */ }
    const data = await client.getGame(id)
    updateFromSnapshot(data)
    setGameRoomId(id)
    // 如果游戏已开始，尝试拿 LiveKit token
    if (data.projection?.status === 'active' || data.projection?.status === 'waiting') {
      try {
        const lkData = await client.getLivekitToken(id)
        setLivekitToken(lkData.token)
        setLivekitServerUrl(lkData.serverUrl)
      } catch { /* optional */ }
    }
    setStage('playing')
  }, [getClient, updateFromSnapshot])

  // ── init ───────────────────────────────────────────────────────────────────
  const handleInit = useCallback(async () => {
    setInitError(null)
    try {
      await getToken()
      await init()

      const urlId = getUrlGameRoomId()
      if (urlId) {
        // 刷新场景：URL 中有 gameRoomId，自动重连
        await reconnectGame(urlId)
      } else {
        setStage('lobby')
      }
    } catch (e) {
      setInitError(e instanceof Error ? e.message : '初始化失败')
    }
  }, [init, getToken, reconnectGame])

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
  const handleCreateAndJoin = useCallback(async (config: { targetPlayerCount: number; language: string; meetingRequired: boolean }) => {
    await getToken()
    const client = getClient()
    const result = await client.createGame({
      sourceMatrixRoomId: info?.roomId ?? '',
      title: '狼人杀',
      targetPlayerCount: config.targetPlayerCount,
      language: config.language,
      timing: { nightActionSeconds: 45, speechSeconds: 60, voteSeconds: 30 },
      allowedSourceMatrixRoomIds: [],
    })
    setGameRoomId(result.gameRoomId)
    setUrlGameRoomId(result.gameRoomId)       // 写入 URL
    await client.joinGame(result.gameRoomId)
    await refreshGame(result.gameRoomId)
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
      const res = await client.listAgentCandidates(gameRoomId)
      setAgents(res.agents)
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

  const handleAction = useCallback(async (body: { kind: string; targetPlayerId?: string; speech?: string }) => {
    if (!gameRoomId) return
    await getToken()
    const client = getClient()
    await client.submitAction(gameRoomId, body as Parameters<typeof client.submitAction>[1])
    await refreshGame()
  }, [gameRoomId, getToken, getClient, refreshGame])

  const handleBackToLobby = useCallback(() => {
    clearUrlGameRoomId()                      // 清除 URL
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
        onAddAgent={handleAddAgent}
        onRefresh={refreshGame}
        onAction={handleAction}
        onBackToLobby={handleBackToLobby}
        iframeMessage={iframeMessage}
      />
    )
  }

  return null
}
