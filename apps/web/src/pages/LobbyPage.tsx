import { useState, useEffect, useRef } from 'react'
import logoImg from '../assets/logo.jpeg'
import { BottomSheet } from '../components/BottomSheet'
import { AdminModal } from '../components/AdminModal'
import { ReadyButton } from '../components/ReadyButton'
import type { GameRoom, AgentCandidate } from '../api/client'

const LORE_RULES = [
  "谎言与真相的博弈，黑夜中谁是猎手",
  "先知窥见灵魂，揭露黑暗中的真相",
  "女巫持有生死，一念之间决人命运",
  "猎人最后的子弹，射向罪恶的胸膛",
  "村民用智慧，驱散隐藏的阴影",
]

const PLAYER_COUNTS = [6, 8, 12] as const
const LANGUAGES = [
  { code: 'zh-CN', name: '中文' },
  { code: 'en-US', name: 'EN' },
  { code: 'ja-JP', name: '日本語' },
  { code: 'ko-KR', name: '한국어' },
] as const

type Sheet = 'players' | 'language' | 'voice' | 'agents' | 'seat' | null

interface LobbyPageProps {
  userId: string
  displayName: string
  isAdmin: boolean
  room: GameRoom | null
  agents: AgentCandidate[]
  agentsLoading: boolean
  onCreateAndJoin: (config: { targetPlayerCount: number; language: string; meetingRequired: boolean }) => Promise<void>
  onJoin: () => Promise<void>
  onSelectSeat: (seatNo: number) => Promise<void>
  onReady: () => Promise<void>
  onAddAgent: (agentUserId: string, displayName: string) => Promise<void>
  onAddAgents: (agents: Array<{ userId: string; displayName: string }>) => Promise<void>
  onLoadAgents: () => Promise<void>
  onStart: () => Promise<void>
  onLeave: () => void
  iframeMessage: { hideApp: () => void; closeApp: () => void }
}

function getInitial(name: string) {
  const s = name.startsWith('@') ? name.slice(1) : name
  return (s.charAt(0) ?? '?').toUpperCase()
}

export function LobbyPage({
  userId, displayName: _displayName, isAdmin, room, agents, agentsLoading,
  onCreateAndJoin, onJoin: _onJoin, onSelectSeat, onReady, onAddAgent: _onAddAgent, onAddAgents, onLoadAgents,
  onStart, onLeave, iframeMessage,
}: LobbyPageProps) {
  const [ruleIndex, setRuleIndex] = useState(0)
  const [ruleVisible, setRuleVisible] = useState(true)
  const [playerCount, setPlayerCount] = useState<6|8|12>(8)
  const [langCode, setLangCode] = useState('zh-CN')
  const [meetingRequired, setMeetingRequired] = useState(false)
  const [activeSheet, setActiveSheet] = useState<Sheet>(null)
  const [showAdminModal, setShowAdminModal] = useState(false)
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)
  const [readying, setReadying] = useState(false)
  const [joiningGame, setJoiningGame] = useState(false)
  const [selectingSeat, setSelectingSeat] = useState<number | null>(null)
  // AI 多选
  const [selectedAgentIds, setSelectedAgentIds] = useState<Set<string>>(new Set())
  const [addingAgents, setAddingAgents] = useState(false)
  const [addAgentError, setAddAgentError] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const myPlayer = room?.players.find(p => p.userId === userId && !p.leftAt)
  const seatedPlayers = room?.players.filter(p => p.seatNo > 0 && !p.leftAt) ?? []
  const allReady = seatedPlayers.length > 0 && seatedPlayers.every(p => p.ready)
  const canStart = isAdmin && allReady && !starting
  const readyCount = seatedPlayers.filter(p => p.ready).length
  const selectedLang = LANGUAGES.find(l => l.code === langCode) ?? LANGUAGES[0]

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setRuleVisible(false)
      setTimeout(() => {
        setRuleIndex(p => (p + 1) % LORE_RULES.length)
        setRuleVisible(true)
      }, 400)
    }, 5000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [])

  const handleStart = async () => {
    if (!canStart) return
    setStarting(true)
    setStartError(null)
    try {
      await onStart()
    } catch (e: unknown) {
      setStartError(e instanceof Error ? e.message : '开始失败')
    } finally {
      setStarting(false)
    }
  }

  const handleCreateAndJoin = async () => {
    setJoiningGame(true)
    try {
      await onCreateAndJoin({ targetPlayerCount: playerCount, language: langCode, meetingRequired })
    } finally {
      setJoiningGame(false)
    }
  }

  const handleSeat = async (seatNo: number) => {
    setSelectingSeat(seatNo)
    try {
      await onSelectSeat(seatNo)
      setActiveSheet(null)
    } finally {
      setSelectingSeat(null)
    }
  }

  const handleReady = async () => {
    setReadying(true)
    try {
      await onReady()
    } finally {
      setReadying(false)
    }
  }

  const handleLoadAgents = async () => {
    setSelectedAgentIds(new Set())
    setAddAgentError(null)
    await onLoadAgents()
    setActiveSheet('agents')
  }

  const toggleAgent = (userId: string) => {
    setSelectedAgentIds(prev => {
      const next = new Set(prev)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })
  }

  const handleConfirmAddAgents = async () => {
    const toAdd = agents.filter(a => selectedAgentIds.has(a.userId) && !a.alreadyJoined)
    if (toAdd.length === 0) return
    setAddingAgents(true)
    setAddAgentError(null)
    try {
      await onAddAgents(toAdd.map(a => ({ userId: a.userId, displayName: a.displayName })))
      setSelectedAgentIds(new Set())
      setActiveSheet(null)
    } catch (e) {
      setAddAgentError(e instanceof Error ? e.message : '添加失败，请重试')
    } finally {
      setAddingAgents(false)
    }
  }

  const occupiedSeats = new Set(seatedPlayers.map(p => p.seatNo))
  const totalSeats = room?.targetPlayerCount ?? playerCount
  const availableSeats = Array.from({ length: totalSeats }, (_, i) => i + 1).filter(n => !occupiedSeats.has(n))

  return (
    <div style={{
      minHeight: '100dvh', width: '100%', overflow: 'hidden',
      background: 'linear-gradient(160deg, #07041a 0%, #0d0825 40%, #120930 70%, #0a0618 100%)',
      display: 'flex', flexDirection: 'column',
      position: 'relative',
    }}>
      {/* Ambient glows */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '10%', left: '50%', transform: 'translateX(-50%)', width: 320, height: 320, background: 'radial-gradient(circle, rgba(109,40,217,0.28) 0%, transparent 70%)', borderRadius: '50%' }} />
        {[...Array(16)].map((_, i) => (
          <div key={i} style={{
            position: 'absolute', width: i % 3 === 0 ? 2 : 1, height: i % 3 === 0 ? 2 : 1,
            borderRadius: '50%', background: `rgba(${i%2===0?'196,181,253':'255,209,102'},${0.2+(i%4)*0.1})`,
            left: `${(i*37+13)%90+5}%`, top: `${(i*23+7)%60+5}%`,
          }} />
        ))}
      </div>

      {/* Top bar */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '52px 20px 12px', position: 'relative', zIndex: 10 }}>
        <button onClick={onLeave} style={{ width: 36, height: 36, borderRadius: 12, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>←</button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: '#e2e8f0' }}>Hero Zone</div>
          {isAdmin && <div style={{ fontSize: 10, color: 'rgba(139,92,246,0.8)', marginTop: 1, letterSpacing: '0.1em' }}>AUTHORITY</div>}
        </div>
        <button onClick={isAdmin ? () => setShowAdminModal(true) : undefined} style={{ width: 36, height: 36, borderRadius: 12, background: isAdmin ? 'rgba(239,68,68,0.12)' : 'rgba(109,40,217,0.18)', border: `1px solid ${isAdmin ? 'rgba(239,68,68,0.3)' : 'rgba(139,92,246,0.35)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, cursor: isAdmin ? 'pointer' : 'default', color: isAdmin ? 'rgba(252,165,165,0.9)' : 'inherit' }}>
          {isAdmin ? '⚙︎' : '🐺'}
        </button>
      </div>

      {isAdmin ? (
        <div style={{ flex: 1, position: 'relative', zIndex: 10, padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto' }}>
          {/* Config cards */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, transparent, rgba(139,92,246,0.35))' }} />
            <span style={{ fontSize: 10, color: 'rgba(139,92,246,0.7)', letterSpacing: '0.22em', fontWeight: 700 }}>✦ GAME SETUP ✦</span>
            <div style={{ flex: 1, height: 1, background: 'linear-gradient(270deg, transparent, rgba(139,92,246,0.35))' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[
              { icon: '👥', label: '人数', value: `${playerCount}P`, sheet: 'players' as Sheet },
              { icon: '🌐', label: '语言', value: selectedLang.name, sheet: 'language' as Sheet },
              { icon: '🎙', label: '语音', value: meetingRequired ? '已开启' : '已关闭', sheet: 'voice' as Sheet },
            ].map(({ icon, label, value, sheet }) => (
              <button key={label} onClick={() => setActiveSheet(sheet)} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(139,92,246,0.18)', borderRadius: 18, padding: '14px', cursor: 'pointer', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ fontSize: 14 }}>{icon}</span>
                    <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>{label}</span>
                  </div>
                  <span style={{ fontSize: 10, color: 'rgba(139,92,246,0.5)' }}>›</span>
                </div>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#c4b5fd' }}>{value}</div>
              </button>
            ))}
          </div>

          {/* Player list */}
          <div style={{ fontSize: 10, color: 'rgba(139,92,246,0.7)', letterSpacing: '0.2em', fontWeight: 700, marginTop: 4 }}>
            ✦ 玩家列表 ({seatedPlayers.length}/{totalSeats}) ✦
          </div>
          {seatedPlayers.map(p => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(139,92,246,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: '#c4b5fd', border: '1px solid rgba(139,92,246,0.3)', flexShrink: 0 }}>
                {getInitial(p.displayName ?? '')}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.displayName}</div>
                <div style={{ fontSize: 10, color: '#475569' }}>座位 #{p.seatNo} {p.kind === 'agent' ? '· AI' : ''}</div>
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: p.ready ? '#34d399' : '#64748b', background: p.ready ? 'rgba(52,211,153,0.1)' : 'rgba(255,255,255,0.05)', border: `1px solid ${p.ready ? 'rgba(52,211,153,0.3)' : 'rgba(255,255,255,0.08)'}`, borderRadius: 8, padding: '3px 8px' }}>
                {p.ready ? '✓ 已准备' : '等待中'}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Non-admin view */
        <div style={{ flex: 1, position: 'relative', zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 28px 24px', gap: 0 }}>
          <div style={{ position: 'relative', marginBottom: 28 }}>
            <div style={{ position: 'absolute', inset: -16, borderRadius: '50%', border: '1.5px solid rgba(139,92,246,0.4)', animation: 'spinSlow 16s linear infinite' }} />
            <div style={{ width: 144, height: 144, borderRadius: '50%', border: '3px solid rgba(255,209,102,0.65)', boxShadow: '0 0 36px rgba(255,209,102,0.22), 0 0 60px rgba(109,40,217,0.3)', overflow: 'hidden' }}>
              <img src={logoImg} alt="狼人杀" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          </div>
          <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: '0.12em', background: 'linear-gradient(135deg, #ffd166, #f59e0b)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: 6 }}>狼 人 杀</div>
          <div style={{ fontSize: 11, color: 'rgba(139,92,246,0.7)', letterSpacing: '0.3em', marginBottom: 24 }}>WEREWOLF</div>
          <div style={{ width: '100%', marginBottom: 20, background: 'rgba(109,40,217,0.1)', border: '1px solid rgba(139,92,246,0.22)', borderRadius: 20, padding: '18px 24px', opacity: ruleVisible ? 1 : 0, transition: 'opacity 400ms ease' }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: '#cbd5e1', lineHeight: 1.7, textAlign: 'center' }}>"{LORE_RULES[ruleIndex]}"</div>
          </div>
          {myPlayer ? (
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>座位 #{myPlayer.seatNo}</div>
            </div>
          ) : (
            <div style={{ width: '100%', fontSize: 12, color: '#64748b', textAlign: 'center', padding: '14px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, marginBottom: 8 }}>
              等待房主开始游戏
            </div>
          )}
        </div>
      )}

      {/* CTA */}
      <div style={{ flexShrink: 0, position: 'relative', zIndex: 10, padding: '16px 20px calc(env(safe-area-inset-bottom) + 16px)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {startError && (
          <div style={{ textAlign: 'center', fontSize: 12, color: '#f87171', padding: '6px 12px', borderRadius: 10, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>{startError}</div>
        )}

        {isAdmin && (
          <>
            {/* <button onClick={handleLoadAgents} disabled={agentsLoading} style={{ width: '100%', height: 48, borderRadius: 16, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(139,92,246,0.3)', color: '#c4b5fd', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: agentsLoading ? 0.6 : 1 }}>
              {agentsLoading ? '加载中...' : '🤖 添加 AI 玩家'}
            </button> */}
            {!room ? (
              <button onClick={handleCreateAndJoin} disabled={joiningGame} style={{ width: '100%', height: 64, borderRadius: 20, background: 'linear-gradient(135deg, #5b21b6, #7c3aed)', border: '1px solid rgba(255,209,102,0.5)', color: '#ffd166', fontSize: 18, fontWeight: 800, cursor: joiningGame ? 'not-allowed' : 'pointer', opacity: joiningGame ? 0.6 : 1, boxShadow: '0 0 24px rgba(109,40,217,0.5)' }}>
                {joiningGame ? '创建中...' : '🐺 创建游戏'}
              </button>
            ) : (
              <button onClick={handleStart} disabled={!canStart} style={{ width: '100%', height: 64, borderRadius: 20, background: canStart ? 'linear-gradient(135deg, #5b21b6, #7c3aed)' : 'rgba(255,255,255,0.06)', border: canStart ? '1px solid rgba(255,209,102,0.5)' : '1px solid rgba(255,255,255,0.08)', color: canStart ? '#ffd166' : '#475569', fontSize: 18, fontWeight: 800, cursor: canStart ? 'pointer' : 'not-allowed', opacity: canStart ? 1 : 0.5, boxShadow: canStart ? '0 0 24px rgba(109,40,217,0.5)' : 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                {starting ? <span style={{ width: 22, height: 22, borderRadius: '50%', border: '2.5px solid rgba(255,255,255,0.2)', borderTopColor: '#fff', display: 'inline-block' }} /> : <>
                  <span>▶ 开始游戏</span>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>
                    {canStart ? `${readyCount}/${seatedPlayers.length} 已准备` : `等待玩家准备（${readyCount}/${seatedPlayers.length}）`}
                  </span>
                </>}
              </button>
            )}
          </>
        )}

        {!isAdmin && (
          <>
            {!myPlayer ? (
              room ? (
                <button onClick={() => setActiveSheet('seat')} style={{ width: '100%', height: 56, borderRadius: 18, background: 'linear-gradient(135deg, #5b21b6, #7c3aed)', border: '1px solid rgba(255,209,102,0.4)', color: '#ffd166', fontSize: 16, fontWeight: 800, cursor: 'pointer', boxShadow: '0 0 20px rgba(109,40,217,0.4)' }}>
                  🪑 选择座位加入
                </button>
              ) : (
                <div style={{ textAlign: 'center', fontSize: 13, color: '#64748b', padding: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: 14, border: '1px solid rgba(255,255,255,0.06)' }}>等待房主创建游戏...</div>
              )
            ) : (
              <ReadyButton ready={myPlayer.ready} loading={readying} onClick={handleReady} />
            )}
          </>
        )}
        <button onClick={onLeave} style={{ background: 'transparent', border: 'none', color: 'rgba(148,163,184,0.5)', fontSize: 12, cursor: 'pointer', padding: '8px', letterSpacing: '0.12em', fontWeight: 600 }}>← Abandon</button>
      </div>

      {/* Sheets */}
      <BottomSheet open={activeSheet === 'players'} onClose={() => setActiveSheet(null)} title="玩家人数">
        <div style={{ display: 'flex', gap: 12 }}>
          {PLAYER_COUNTS.map(n => (
            <button key={n} onClick={() => { setPlayerCount(n); setActiveSheet(null) }} style={{ flex: 1, padding: '20px 0', borderRadius: 16, background: playerCount === n ? 'rgba(109,40,217,0.25)' : 'rgba(255,255,255,0.04)', border: `1px solid ${playerCount === n ? 'rgba(139,92,246,0.6)' : 'rgba(255,255,255,0.08)'}`, cursor: 'pointer' }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: playerCount === n ? '#c4b5fd' : '#64748b', textAlign: 'center' }}>{n}</div>
              <div style={{ fontSize: 11, textAlign: 'center', color: playerCount === n ? 'rgba(196,181,253,0.7)' : '#475569', marginTop: 2 }}>人局</div>
            </button>
          ))}
        </div>
      </BottomSheet>

      <BottomSheet open={activeSheet === 'language'} onClose={() => setActiveSheet(null)} title="语言设置">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {LANGUAGES.map(lang => (
            <button key={lang.code} onClick={() => { setLangCode(lang.code); setActiveSheet(null) }} style={{ padding: '14px', borderRadius: 14, background: langCode === lang.code ? 'rgba(109,40,217,0.22)' : 'rgba(255,255,255,0.04)', border: `1px solid ${langCode === lang.code ? 'rgba(139,92,246,0.55)' : 'rgba(255,255,255,0.08)'}`, cursor: 'pointer', fontSize: 15, fontWeight: 700, color: langCode === lang.code ? '#c4b5fd' : '#64748b', textAlign: 'center' }}>
              {lang.name}
            </button>
          ))}
        </div>
      </BottomSheet>

      <BottomSheet open={activeSheet === 'voice'} onClose={() => setActiveSheet(null)} title="语音通话">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[{value: true, label:'开启语音', desc:'玩家可使用语音通话', icon:'🎙'},{value: false, label:'关闭语音', desc:'仅使用文字模式', icon:'🔇'}].map(opt => (
            <button key={String(opt.value)} onClick={() => { setMeetingRequired(opt.value); setActiveSheet(null) }} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px', borderRadius: 16, background: meetingRequired === opt.value ? 'rgba(109,40,217,0.22)' : 'rgba(255,255,255,0.04)', border: `1px solid ${meetingRequired === opt.value ? 'rgba(139,92,246,0.55)' : 'rgba(255,255,255,0.08)'}`, cursor: 'pointer', textAlign: 'left', width: '100%' }}>
              <span style={{ fontSize: 24 }}>{opt.icon}</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: meetingRequired === opt.value ? '#c4b5fd' : '#e2e8f0' }}>{opt.label}</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{opt.desc}</div>
              </div>
              {meetingRequired === opt.value && <span style={{ marginLeft: 'auto', color: '#8b5cf6', fontSize: 18 }}>✓</span>}
            </button>
          ))}
        </div>
      </BottomSheet>

      <BottomSheet
        open={activeSheet === 'agents'}
        onClose={() => { setActiveSheet(null); setSelectedAgentIds(new Set()); setAddAgentError(null) }}
        title="添加 AI 玩家"
      >
        {(() => {
          const availableSlots = totalSeats - seatedPlayers.length
          const selectableCount = selectedAgentIds.size
          const canConfirm = selectableCount > 0 && selectableCount <= availableSlots && !addingAgents

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {/* 顶部提示栏 */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ fontSize: 12, color: '#64748b' }}>
                  剩余空位 <span style={{ color: '#c4b5fd', fontWeight: 700 }}>{availableSlots}</span> 个
                </span>
                {selectableCount > 0 && (
                  <span style={{ fontSize: 12, color: '#a78bfa', fontWeight: 700 }}>
                    已选 {selectableCount} 位
                  </span>
                )}
              </div>

              {/* AI 列表 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
                {agents.length === 0 ? (
                  <div style={{ textAlign: 'center', color: '#475569', fontSize: 13, padding: '24px 0' }}>暂无可用 AI</div>
                ) : agents.map(agent => {
                  const isSelected = selectedAgentIds.has(agent.userId)
                  const disabled = agent.alreadyJoined || addingAgents

                  return (
                    <button
                      key={agent.userId}
                      onClick={() => { if (!disabled) toggleAgent(agent.userId) }}
                      disabled={disabled}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '12px 14px', borderRadius: 14,
                        background: isSelected
                          ? 'rgba(109,40,217,0.2)'
                          : agent.alreadyJoined
                            ? 'rgba(255,255,255,0.02)'
                            : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${isSelected ? 'rgba(139,92,246,0.6)' : 'rgba(255,255,255,0.08)'}`,
                        cursor: disabled ? 'default' : 'pointer',
                        opacity: agent.alreadyJoined ? 0.45 : 1,
                        width: '100%', textAlign: 'left',
                        transition: 'all 120ms',
                      }}
                    >
                      {/* 头像 */}
                      <div style={{
                        width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                        background: isSelected ? 'rgba(139,92,246,0.3)' : 'rgba(255,255,255,0.08)',
                        border: `2px solid ${isSelected ? 'rgba(139,92,246,0.7)' : 'transparent'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 16, fontWeight: 700, color: isSelected ? '#c4b5fd' : '#94a3b8',
                        transition: 'all 120ms',
                      }}>
                        {getInitial(agent.displayName)}
                      </div>

                      {/* 名称 */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 14, fontWeight: 600,
                          color: isSelected ? '#e2e8f0' : '#94a3b8',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {agent.displayName}
                        </div>
                        <div style={{ fontSize: 11, color: '#475569', marginTop: 1 }}>AI 玩家</div>
                      </div>

                      {/* 右侧状态 */}
                      {agent.alreadyJoined ? (
                        <span style={{
                          fontSize: 11, color: '#34d399',
                          background: 'rgba(52,211,153,0.1)',
                          border: '1px solid rgba(52,211,153,0.3)',
                          borderRadius: 8, padding: '3px 8px', flexShrink: 0,
                        }}>已加入</span>
                      ) : (
                        <div style={{
                          width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                          border: `2px solid ${isSelected ? '#8b5cf6' : 'rgba(255,255,255,0.15)'}`,
                          background: isSelected ? '#8b5cf6' : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transition: 'all 120ms',
                        }}>
                          {isSelected && (
                            <span style={{ color: '#fff', fontSize: 12, fontWeight: 800, lineHeight: 1 }}>✓</span>
                          )}
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>

              {/* 错误提示 */}
              {addAgentError && (
                <div style={{
                  marginTop: 10, padding: '8px 12px', borderRadius: 10,
                  background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
                  fontSize: 12, color: '#f87171', textAlign: 'center',
                }}>
                  {addAgentError}
                </div>
              )}

              {/* 确认按钮 */}
              <button
                onClick={() => { void handleConfirmAddAgents() }}
                disabled={!canConfirm}
                style={{
                  marginTop: 14, width: '100%', height: 52, borderRadius: 16,
                  background: canConfirm
                    ? 'linear-gradient(135deg, #5b21b6, #7c3aed)'
                    : 'rgba(255,255,255,0.06)',
                  border: canConfirm
                    ? '1px solid rgba(255,209,102,0.4)'
                    : '1px solid rgba(255,255,255,0.08)',
                  color: canConfirm ? '#ffd166' : '#475569',
                  fontSize: 15, fontWeight: 800,
                  cursor: canConfirm ? 'pointer' : 'not-allowed',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  transition: 'all 150ms',
                }}
              >
                {addingAgents ? (
                  <>
                    <span style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.2)', borderTopColor: '#fff', display: 'inline-block' }} />
                    添加中...
                  </>
                ) : selectableCount > 0 ? (
                  `🤖 确认添加 ${selectableCount} 位 AI`
                ) : (
                  '请选择 AI 玩家'
                )}
              </button>
            </div>
          )
        })()}
      </BottomSheet>

      <BottomSheet open={activeSheet === 'seat'} onClose={() => setActiveSheet(null)} title="选择座位">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          {availableSeats.map(n => (
            <button key={n} onClick={() => { void handleSeat(n) }} disabled={selectingSeat !== null} style={{ padding: '16px 0', borderRadius: 14, background: selectingSeat === n ? 'rgba(109,40,217,0.3)' : 'rgba(255,255,255,0.04)', border: `1px solid ${selectingSeat === n ? 'rgba(139,92,246,0.6)' : 'rgba(255,255,255,0.08)'}`, cursor: 'pointer', fontSize: 20, fontWeight: 800, color: '#c4b5fd', textAlign: 'center' }}>
              {n}
            </button>
          ))}
          {availableSeats.length === 0 && <div style={{ gridColumn: '1/-1', textAlign: 'center', color: '#475569', fontSize: 13, padding: '20px 0' }}>暂无空余座位</div>}
        </div>
      </BottomSheet>

      {showAdminModal && (
        <AdminModal
          onClose={() => setShowAdminModal(false)}
          onHide={() => { setShowAdminModal(false); iframeMessage.hideApp() }}
          onDisband={() => { setShowAdminModal(false); iframeMessage.closeApp() }}
        />
      )}

      <style>{`
        @keyframes spinSlow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
