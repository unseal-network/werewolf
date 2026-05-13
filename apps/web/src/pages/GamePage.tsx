import { useState, useEffect, useRef, useCallback } from 'react'
import { TopBar } from '../components/TopBar'
import { PlayerCard } from '../components/PlayerCard'
import { CenterIsland } from '../components/CenterIsland'
import { ActionBar } from '../components/ActionBar'
import { MagicCircle } from '../components/MagicCircle'
import { PhaseOverlay } from '../components/PhaseOverlay'
import { AdminModal } from '../components/AdminModal'
import { WaitingRoomView } from '../components/WaitingRoomView'
import { EventLog } from '../components/EventLog'
import { RolePickerBubble } from '../components/RolePickerBubble'
import { VoiceRoomProvider } from '../components/VoiceRoom'
import type { RoleId, BubblePosition } from '../components/RolePickerBubble'
import { useGameSSE } from '../hooks/useGameSSE'
import type { GameRoom, RoomProjection, RoomPlayer, PlayerPrivateState, GameEventDto, AgentCandidate } from '../api/client'

interface GamePageProps {
  gameRoomId: string
  userId: string
  isAdmin: boolean
  room: GameRoom
  projection: RoomProjection | null
  privateStates: PlayerPrivateState[]
  events: GameEventDto[]
  livekitToken: string | null
  livekitServerUrl: string | null
  subscribeUrl: string
  // waiting room
  agents: AgentCandidate[]
  agentsLoading: boolean
  onStart: () => Promise<void>
  onSelectSeat: (seatNo: number) => Promise<void>
  onReady: () => Promise<void>
  onLoadAgents: () => Promise<void>
  onAddAgents: (agents: Array<{ userId: string; displayName: string }>) => Promise<void>
  // game
  onRefresh: () => Promise<void>
  onAction: (body: { kind: string; targetPlayerId?: string; speech?: string }) => Promise<void>
  onBackToLobby: () => void
  iframeMessage: { hideApp: () => void; closeApp: () => void }
}

export function GamePage({
  gameRoomId: _gameRoomId, userId, isAdmin, room, projection, privateStates, events,
  livekitToken, livekitServerUrl, subscribeUrl,
  agents, agentsLoading, onStart, onSelectSeat, onReady, onLoadAgents, onAddAgents,
  onRefresh, onAction, onBackToLobby, iframeMessage,
}: GamePageProps) {
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [phaseAnim, setPhaseAnim] = useState<string | null>(null)
  const [showAdminModal, setShowAdminModal] = useState(false)
  // 本地角色标记
  const [roleMarks, setRoleMarks] = useState<Record<string, RoleId | null>>({})
  const [pickerTarget, setPickerTarget] = useState<{ playerId: string; pos: BubblePosition } | null>(null)
  const prevPhaseRef = useRef('')
  const initRef = useRef(false)

  const phase = projection?.phase ?? ''
  const day = projection?.day ?? 0
  const isNight = phase.startsWith('night_') || ['wolf', 'guard', 'seer', 'witch-save', 'witch-poison'].includes(phase)
  const isEnded = projection?.status === 'ended' || phase === 'end'
  const alivePlayerIds = new Set(projection?.alivePlayerIds ?? [])

  const myPlayer = room.players.find(p => p.userId === userId && !p.leftAt)
  const myPrivateState = privateStates.find(s => s.playerId === myPlayer?.id)
  const myRole = myPrivateState?.role

  // Voice: disconnect when ended
  const voiceToken = isEnded ? null : livekitToken
  const voiceServerUrl = isEnded ? null : livekitServerUrl

  // Phase transition animation
  useEffect(() => {
    if (!phase) return
    if (!initRef.current) { initRef.current = true; prevPhaseRef.current = phase; return }
    if (phase !== prevPhaseRef.current) {
      setPhaseAnim(phase)
      const t = setTimeout(() => setPhaseAnim(null), 2000)
      prevPhaseRef.current = phase
      return () => clearTimeout(t)
    }
  }, [phase])

  const handleSSEEvent = useCallback((_event: GameEventDto) => {
    // events are appended by parent
  }, [])

  useGameSSE(subscribeUrl, handleSSEEvent, () => { void onRefresh() })

  // 长按头像 → 计算气泡位置 → 打开 picker
  // ⚠️ 必须在所有 early return 之前声明，避免违反 hooks 调用顺序规则
  const handleLongPress = useCallback((playerId: string, rect: DOMRect) => {
    const midY = rect.top + rect.height / 2
    const direction: BubblePosition['direction'] = midY > window.innerHeight / 2 ? 'up' : 'down'
    const isLeft = rect.left < window.innerWidth / 2
    setPickerTarget({
      playerId,
      pos: {
        x: isLeft ? rect.left : rect.right,
        y: direction === 'down' ? rect.bottom : rect.top,
        direction,
        align: isLeft ? 'left' : 'right',
      },
    })
  }, [])

  // ── Waiting room（游戏未开始）──────────────────────────────────
  const isWaiting = !projection || projection.status === 'waiting'
  if (isWaiting) {
    return (
      <WaitingRoomView
        userId={userId}
        isAdmin={isAdmin}
        room={room}
        agents={agents}
        agentsLoading={agentsLoading}
        onStart={onStart}
        onSelectSeat={onSelectSeat}
        onReady={onReady}
        onLoadAgents={onLoadAgents}
        onAddAgents={onAddAgents}
        onLeave={onBackToLobby}
      />
    )
  }

  const sorted = [...room.players].filter(p => !p.leftAt && p.seatNo > 0).sort((a, b) => a.seatNo - b.seatNo)
  const leftPlayers = sorted.filter((_, i) => i % 2 === 0)
  const rightPlayers = sorted.filter((_, i) => i % 2 === 1)
  const compact = sorted.length >= 10
  const aliveCount = sorted.filter(p => alivePlayerIds.has(p.id)).length

  // 列宽随人数动态调整
  const colWidth = sorted.length >= 10 ? 82 : sorted.length >= 8 ? 90 : 94

  const currentSpeakerPlayer = projection?.currentSpeakerPlayerId
    ? room.players.find(p => p.id === projection.currentSpeakerPlayerId)
    : null
  const speakerName = currentSpeakerPlayer?.userId !== userId ? currentSpeakerPlayer?.displayName : undefined

  const selectedPlayer = selectedPlayerId ? room.players.find(p => p.id === selectedPlayerId) ?? null : null

  // Determine action
  const canAct = !!myPlayer && !isEnded && alivePlayerIds.has(myPlayer.id)
  let actionKind: 'speech' | 'speechComplete' | 'vote' | 'nightAction' | 'pass' | '' = ''
  if (canAct) {
    if (phase === 'day' && projection?.currentSpeakerPlayerId === myPlayer?.id) actionKind = 'speech'
    else if (phase === 'vote') actionKind = 'vote'
    else if (['wolf', 'seer', 'guard', 'witch-save', 'witch-poison'].includes(phase)) {
      if (myRole === 'werewolf' && phase === 'wolf') actionKind = 'nightAction'
      else if (myRole === 'seer' && phase === 'seer') actionKind = 'nightAction'
      else if (myRole === 'guard' && phase === 'guard') actionKind = 'nightAction'
      else if (myRole === 'witch' && (phase === 'witch-save' || phase === 'witch-poison')) actionKind = 'nightAction'
    }
  }

  const TARGET_PHASES = new Set(['vote', 'wolf', 'seer', 'guard', 'witch-poison'])
  const canTarget = (p: RoomPlayer) => {
    if (!canAct) return false
    if (!alivePlayerIds.has(p.id)) return false
    if (!TARGET_PHASES.has(phase)) return false
    if (p.userId === userId) return false
    return true
  }

  const handleSubmit = async (kind: string, targetPlayerId?: string) => {
    setSubmitting(true)
    try {
      const body: { kind: string; targetPlayerId?: string } = { kind }
      if (targetPlayerId !== undefined) body.targetPlayerId = targetPlayerId
      await onAction(body)
      setSelectedPlayerId(null)
    } finally {
      setSubmitting(false)
    }
  }

  const actionHint = !canAct ? undefined
    : actionKind === 'speech' ? '🎙 轮到你发言'
    : actionKind === 'vote' ? '🗳 选择放逐目标'
    : actionKind === 'nightAction' && phase === 'wolf' ? '🐺 选择击杀目标'
    : actionKind === 'nightAction' && phase === 'seer' ? '🔮 选择查验目标'
    : actionKind === 'nightAction' && phase === 'guard' ? '🛡 选择守护目标'
    : undefined

  return (
    <VoiceRoomProvider serverUrl={voiceServerUrl} token={voiceToken}>
      <div style={{
        minHeight: '100dvh', width: '100%',
        background: isNight
          ? 'linear-gradient(160deg, #07041a 0%, #0d0825 40%, #120930 70%, #0a0618 100%)'
          : 'linear-gradient(160deg, #0c0a1a 0%, #1a1030 40%, #0e1525 70%, #080d18 100%)',
        display: 'flex', flexDirection: 'column',
        position: 'relative', overflow: 'hidden',
        transition: 'background 1.5s ease',
      }}>
        {/* BG particles */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
          {[...Array(16)].map((_, i) => (
            <div key={i} style={{
              position: 'absolute', width: i%4===0?2:1, height: i%4===0?2:1, borderRadius: '50%',
              background: `rgba(${i%2===0?'196,181,253':'255,209,102'},${0.18+(i%5)*0.1})`,
              left: `${(i*43+7)%90+5}%`, top: `${(i*31+11)%70+5}%`,
            }} />
          ))}
        </div>

        <PhaseOverlay phase={phaseAnim} />

        <TopBar
          phase={phase} day={day} deadlineAt={projection?.deadlineAt ?? null}
          isNight={isNight} playerCount={sorted.length} aliveCount={aliveCount}
          isAdmin={isAdmin} onAdminMenu={() => setShowAdminModal(true)}
        />

        <div style={{ flex: 1, position: 'relative', display: 'flex', minHeight: 0, overflow: 'hidden' }}>
          <MagicCircle isNight={isNight} />
          <div style={{
            position: 'absolute', inset: 0, zIndex: 10,
            display: 'flex', gap: 4,
            padding: compact ? '8px 6px 10px' : '10px 8px 12px',
            alignItems: 'flex-start',   // 靠上对齐
            paddingTop: compact ? 8 : 12,
          }}>
            {/* Left column */}
            <div style={{
              width: colWidth, flexShrink: 0,
              display: 'flex', flexDirection: 'column',
              justifyContent: 'flex-start',
              gap: compact ? 3 : 4,
            }}>
              {leftPlayers.map(p => (
                <PlayerCard key={p.id} player={p}
                  isSelf={p.userId === userId}
                  isSpeaking={p.id === projection?.currentSpeakerPlayerId}
                  isSelectable={canTarget(p)}
                  isSelected={selectedPlayerId === p.id}
                  isDead={!alivePlayerIds.has(p.id)}
                  markedRole={roleMarks[p.id] ?? null}
                  onSelect={() => { if (canTarget(p)) setSelectedPlayerId(prev => prev === p.id ? null : p.id) }}
                  onLongPress={p.userId !== userId ? (rect) => handleLongPress(p.id, rect) : undefined}
                  compact={compact}
                />
              ))}
            </div>

            {/* Center island */}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-start' }}>
              <CenterIsland
                myRole={myRole}
                speakerName={speakerName}
                actionHint={actionHint}
                aliveCount={aliveCount}
                totalCount={sorted.length}
              />
            </div>

            {/* Right column */}
            <div style={{
              width: colWidth, flexShrink: 0,
              display: 'flex', flexDirection: 'column',
              justifyContent: 'flex-start',
              gap: compact ? 3 : 4,
            }}>
              {rightPlayers.map(p => (
                <PlayerCard key={p.id} player={p}
                  isSelf={p.userId === userId}
                  isSpeaking={p.id === projection?.currentSpeakerPlayerId}
                  isSelectable={canTarget(p)}
                  isSelected={selectedPlayerId === p.id}
                  isDead={!alivePlayerIds.has(p.id)}
                  markedRole={roleMarks[p.id] ?? null}
                  onSelect={() => { if (canTarget(p)) setSelectedPlayerId(prev => prev === p.id ? null : p.id) }}
                  onLongPress={p.userId !== userId ? (rect) => handleLongPress(p.id, rect) : undefined}
                  compact={compact}
                />
              ))}
            </div>
          </div>

          {/* 左下角日志面板 */}
          <div style={{ position: 'absolute', bottom: 8, left: 8, zIndex: 20 }}>
            <EventLog events={events} players={room.players} />
          </div>
        </div>

        <ActionBar
          actionKind={actionKind}
          actionSubmitted={false}
          selectedPlayer={selectedPlayer}
          submitting={submitting}
          isEnded={isEnded}
          canAct={canAct}
          isAdmin={isAdmin}
          speakerName={speakerName}
          winner={projection?.winner}
          privateState={myPrivateState}
          currentPhase={phase}
          onSpeechComplete={() => void handleSubmit('speechComplete')}
          onVote={() => { if (selectedPlayerId) void handleSubmit('vote', selectedPlayerId) }}
          onNightAction={() => { if (selectedPlayerId || phase === 'witch-save') void handleSubmit('nightAction', selectedPlayerId ?? undefined) }}
          onPass={() => void handleSubmit('pass')}
          onCancel={() => setSelectedPlayerId(null)}
          onBackToLobby={onBackToLobby}
          onPlayAgain={isAdmin ? onStart : undefined}
        />

        {/* 角色标记气泡 */}
        {pickerTarget && (
          <RolePickerBubble
            position={pickerTarget.pos}
            currentMark={roleMarks[pickerTarget.playerId] ?? null}
            onSelect={(role) => {
              setRoleMarks(prev => ({ ...prev, [pickerTarget.playerId]: role }))
              setPickerTarget(null)
            }}
            onClose={() => setPickerTarget(null)}
          />
        )}

        {showAdminModal && (
          <AdminModal
            onClose={() => setShowAdminModal(false)}
            onHide={() => { setShowAdminModal(false); iframeMessage.hideApp() }}
            onDisband={() => { setShowAdminModal(false); iframeMessage.closeApp() }}
          />
        )}

        <style>{`
          @keyframes magicSpin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
          @keyframes magicSpinReverse { from{transform:rotate(0deg)} to{transform:rotate(-360deg)} }
          @keyframes spin { to{transform:rotate(360deg)} }
        `}</style>
      </div>
    </VoiceRoomProvider>
  )
}
