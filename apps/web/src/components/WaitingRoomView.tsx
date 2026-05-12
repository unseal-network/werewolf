import { useState } from 'react'
import { BottomSheet } from './BottomSheet'
import { ReadyButton } from './ReadyButton'
import type { GameRoom, AgentCandidate } from '../api/client'

interface WaitingRoomViewProps {
  userId: string
  isAdmin: boolean
  room: GameRoom
  agents: AgentCandidate[]
  agentsLoading: boolean
  onStart: () => Promise<void>
  onSelectSeat: (seatNo: number) => Promise<void>
  onReady: () => Promise<void>
  onLoadAgents: () => Promise<void>
  onAddAgent: (agentUserId: string, displayName: string) => Promise<void>
  onLeave: () => void
}

function getInitial(name: string) {
  const s = name.startsWith('@') ? name.slice(1) : name
  return (s.charAt(0) ?? '?').toUpperCase()
}

export function WaitingRoomView({
  userId, isAdmin, room, agents, agentsLoading,
  onStart, onSelectSeat, onReady, onLoadAgents, onAddAgent, onLeave,
}: WaitingRoomViewProps) {
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)
  const [readying, setReadying] = useState(false)
  const [selectingSeat, setSelectingSeat] = useState<number | null>(null)
  const [showSeatSheet, setShowSeatSheet] = useState(false)
  const [showAgentSheet, setShowAgentSheet] = useState(false)
  const [agentsLoaded, setAgentsLoaded] = useState(false)

  const total = room.targetPlayerCount ?? 8
  const seatedPlayers = room.players.filter(p => p.seatNo > 0 && !p.leftAt)
  const myPlayer = room.players.find(p => p.userId === userId && !p.leftAt)
  const isSeated = (myPlayer?.seatNo ?? 0) > 0
  const allReady = seatedPlayers.length > 0 && seatedPlayers.every(p => p.ready)
  const readyCount = seatedPlayers.filter(p => p.ready).length
  const canStart = isAdmin && allReady

  // Build seat map
  const seatMap = new Map<number, typeof seatedPlayers[0]>()
  seatedPlayers.forEach(p => seatMap.set(p.seatNo, p))

  const occupiedSeatNos = new Set(seatedPlayers.map(p => p.seatNo))
  const availableSeats = Array.from({ length: total }, (_, i) => i + 1).filter(n => !occupiedSeatNos.has(n))

  const handleStart = async () => {
    if (!canStart) return
    setStarting(true)
    setStartError(null)
    try {
      await onStart()
    } catch (e) {
      setStartError(e instanceof Error ? e.message : '开始失败')
      setStarting(false)
    }
  }

  const handleSeat = async (seatNo: number) => {
    setSelectingSeat(seatNo)
    try {
      await onSelectSeat(seatNo)
      setShowSeatSheet(false)
    } finally {
      setSelectingSeat(null)
    }
  }

  const handleReady = async () => {
    setReadying(true)
    try { await onReady() } finally { setReadying(false) }
  }

  const handleLoadAgents = async () => {
    await onLoadAgents()
    setAgentsLoaded(true)
    setShowAgentSheet(true)
  }

  // Grid columns
  const cols = total <= 6 ? 3 : total <= 8 ? 4 : 4

  return (
    <div style={{
      minHeight: '100dvh', width: '100%',
      background: 'linear-gradient(160deg, #07041a 0%, #0d0825 40%, #120930 70%, #0a0618 100%)',
      display: 'flex', flexDirection: 'column',
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Ambient */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '8%', left: '50%', transform: 'translateX(-50%)', width: 280, height: 280, background: 'radial-gradient(circle, rgba(109,40,217,0.22) 0%, transparent 70%)', borderRadius: '50%' }} />
        {[...Array(14)].map((_, i) => (
          <div key={i} style={{ position: 'absolute', width: 1, height: 1, borderRadius: '50%', background: `rgba(${i % 2 === 0 ? '196,181,253' : '255,209,102'},${0.2 + (i % 4) * 0.1})`, left: `${(i * 37 + 13) % 90 + 5}%`, top: `${(i * 23 + 7) % 70 + 5}%` }} />
        ))}
      </div>

      {/* Header */}
      <div style={{ flexShrink: 0, padding: '52px 20px 12px', position: 'relative', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button onClick={onLeave} style={{ width: 36, height: 36, borderRadius: 12, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>←</button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0' }}>等待玩家加入</div>
          <div style={{ fontSize: 11, color: 'rgba(139,92,246,0.7)', marginTop: 2 }}>
            {seatedPlayers.length} / {total} 人 · {readyCount} 已准备
          </div>
        </div>
        <div style={{ width: 36 }} />
      </div>

      {/* Seat grid */}
      <div style={{ flex: 1, position: 'relative', zIndex: 10, padding: '8px 16px', overflowY: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 10 }}>
          {Array.from({ length: total }, (_, i) => i + 1).map(seatNo => {
            const player = seatMap.get(seatNo)
            const isMe = player?.userId === userId
            return (
              <div key={seatNo} style={{
                borderRadius: 16,
                border: player
                  ? isMe
                    ? '1.5px solid rgba(139,92,246,0.8)'
                    : '1.5px solid rgba(255,255,255,0.1)'
                  : '1.5px dashed rgba(255,255,255,0.12)',
                background: player
                  ? isMe
                    ? 'rgba(109,40,217,0.15)'
                    : 'rgba(255,255,255,0.04)'
                  : 'rgba(255,255,255,0.02)',
                padding: '12px 8px',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                minHeight: 90,
                position: 'relative',
              }}>
                {/* Seat number badge */}
                <div style={{ position: 'absolute', top: 6, left: 8, fontSize: 9, color: player ? 'rgba(196,181,253,0.6)' : 'rgba(255,255,255,0.2)', fontWeight: 700 }}>#{seatNo}</div>

                {player ? (
                  <>
                    {/* Avatar */}
                    <div style={{ width: 40, height: 40, borderRadius: '50%', background: isMe ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800, color: isMe ? '#c4b5fd' : '#94a3b8', border: isMe ? '1.5px solid rgba(139,92,246,0.6)' : '1px solid rgba(255,255,255,0.1)', flexShrink: 0 }}>
                      {player.kind === 'agent' ? '🤖' : getInitial(player.displayName ?? '')}
                    </div>
                    {/* Name */}
                    <div style={{ fontSize: 10, color: isMe ? '#c4b5fd' : '#94a3b8', fontWeight: 600, textAlign: 'center', width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.3 }}>
                      {player.displayName}
                    </div>
                    {/* Ready badge */}
                    <div style={{ fontSize: 9, fontWeight: 700, color: player.ready ? '#34d399' : '#475569', background: player.ready ? 'rgba(52,211,153,0.12)' : 'rgba(255,255,255,0.04)', border: `1px solid ${player.ready ? 'rgba(52,211,153,0.3)' : 'rgba(255,255,255,0.07)'}`, borderRadius: 6, padding: '2px 6px' }}>
                      {player.ready ? '✓ 准备' : '等待中'}
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, color: 'rgba(255,255,255,0.15)', marginTop: 4 }}>＋</div>
                    <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.05em' }}>空位</div>
                  </>
                )}
              </div>
            )
          })}
        </div>

        {/* Unseated players (joined but no seat) */}
        {(() => {
          const unseated = room.players.filter(p => p.seatNo === 0 && !p.leftAt)
          if (unseated.length === 0) return null
          return (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 10, color: 'rgba(139,92,246,0.5)', letterSpacing: '0.18em', fontWeight: 700, marginBottom: 8, textAlign: 'center' }}>已加入 · 未入座</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                {unseated.map(p => (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                    <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#64748b' }}>{getInitial(p.displayName ?? '')}</div>
                    <span style={{ fontSize: 11, color: '#64748b' }}>{p.displayName}</span>
                  </div>
                ))}
              </div>
            </div>
          )
        })()}
      </div>

      {/* Bottom CTA */}
      <div style={{ flexShrink: 0, position: 'relative', zIndex: 10, padding: '12px 20px calc(env(safe-area-inset-bottom) + 12px)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {startError && (
          <div style={{ textAlign: 'center', fontSize: 12, color: '#f87171', padding: '6px 12px', borderRadius: 10, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>{startError}</div>
        )}

        {isAdmin && (
          <>
            <button onClick={handleLoadAgents} disabled={agentsLoading} style={{ width: '100%', height: 44, borderRadius: 14, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(139,92,246,0.28)', color: '#c4b5fd', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: agentsLoading ? 0.6 : 1 }}>
              {agentsLoading ? '加载中...' : '🤖 添加 AI 玩家'}
            </button>
            <button onClick={() => void handleStart()} disabled={!canStart || starting} style={{ width: '100%', height: 60, borderRadius: 18, background: canStart ? 'linear-gradient(135deg, #5b21b6, #7c3aed)' : 'rgba(255,255,255,0.05)', border: canStart ? '1px solid rgba(255,209,102,0.5)' : '1px solid rgba(255,255,255,0.07)', color: canStart ? '#ffd166' : '#475569', fontSize: 17, fontWeight: 800, cursor: canStart ? 'pointer' : 'not-allowed', opacity: canStart ? 1 : 0.5, boxShadow: canStart ? '0 0 24px rgba(109,40,217,0.5)' : 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
              {starting
                ? <span style={{ width: 20, height: 20, borderRadius: '50%', border: '2.5px solid rgba(255,255,255,0.2)', borderTopColor: '#fff', display: 'inline-block' }} />
                : <>
                  <span>▶ 开始游戏</span>
                  <span style={{ fontSize: 11, color: canStart ? 'rgba(255,255,255,0.45)' : '#374151' }}>
                    {canStart ? `${readyCount}/${seatedPlayers.length} 已准备` : `等待玩家准备（${readyCount}/${seatedPlayers.length}）`}
                  </span>
                </>
              }
            </button>
          </>
        )}

        {!isAdmin && (
          isSeated
            ? <ReadyButton ready={myPlayer?.ready ?? false} loading={readying} onClick={handleReady} />
            : <button onClick={() => setShowSeatSheet(true)} style={{ width: '100%', height: 56, borderRadius: 18, background: 'linear-gradient(135deg, #5b21b6, #7c3aed)', border: '1px solid rgba(255,209,102,0.4)', color: '#ffd166', fontSize: 16, fontWeight: 800, cursor: 'pointer', boxShadow: '0 0 20px rgba(109,40,217,0.4)' }}>
              🪑 选择座位
            </button>
        )}
      </div>

      {/* Seat picker sheet */}
      <BottomSheet open={showSeatSheet} onClose={() => setShowSeatSheet(false)} title="选择座位">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          {availableSeats.map(n => (
            <button key={n} onClick={() => void handleSeat(n)} disabled={selectingSeat !== null} style={{ padding: '16px 0', borderRadius: 14, background: selectingSeat === n ? 'rgba(109,40,217,0.3)' : 'rgba(255,255,255,0.04)', border: `1px solid ${selectingSeat === n ? 'rgba(139,92,246,0.6)' : 'rgba(255,255,255,0.08)'}`, cursor: 'pointer', fontSize: 20, fontWeight: 800, color: '#c4b5fd', textAlign: 'center' }}>
              {n}
            </button>
          ))}
          {availableSeats.length === 0 && <div style={{ gridColumn: '1/-1', textAlign: 'center', color: '#475569', fontSize: 13, padding: '20px 0' }}>暂无空余座位</div>}
        </div>
      </BottomSheet>

      {/* Agent picker sheet */}
      <BottomSheet open={showAgentSheet} onClose={() => setShowAgentSheet(false)} title="添加 AI 玩家">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {!agentsLoaded || agentsLoading ? (
            <div style={{ textAlign: 'center', color: '#475569', padding: '20px 0' }}>加载中...</div>
          ) : agents.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#475569', fontSize: 13, padding: '20px 0' }}>暂无可用 AI</div>
          ) : agents.map(agent => (
            <button key={agent.userId} onClick={() => { if (!agent.alreadyJoined) { void onAddAgent(agent.userId, agent.displayName); setShowAgentSheet(false) } }} disabled={agent.alreadyJoined} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 14, background: agent.alreadyJoined ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', cursor: agent.alreadyJoined ? 'default' : 'pointer', opacity: agent.alreadyJoined ? 0.5 : 1, width: '100%', textAlign: 'left' }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>{getInitial(agent.displayName)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{agent.displayName}</div>
              </div>
              {agent.alreadyJoined && <span style={{ fontSize: 11, color: '#34d399', background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.3)', borderRadius: 8, padding: '2px 8px' }}>已加入</span>}
            </button>
          ))}
        </div>
      </BottomSheet>
    </div>
  )
}
