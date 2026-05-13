import type { RoomPlayer, PlayerPrivateState } from '../api/client'

type ActionKind = 'speech' | 'speechComplete' | 'vote' | 'nightAction' | 'pass' | ''

interface ActionBarProps {
  actionKind: ActionKind
  actionSubmitted: boolean
  selectedPlayer: RoomPlayer | null
  submitting: boolean
  isEnded: boolean
  canAct: boolean
  isAdmin?: boolean | undefined
  speakerName?: string | undefined
  winner?: 'wolf' | 'good' | null | undefined
  privateState?: PlayerPrivateState | undefined
  currentPhase?: string | undefined
  onSpeechComplete: () => void
  onVote: () => void
  onNightAction: () => void
  onPass: () => void
  onCancel: () => void
  onBackToLobby?: (() => void) | undefined
  onPlayAgain?: (() => void) | undefined
}

const spinnerEl = (
  <span style={{
    width: 16, height: 16, borderRadius: '50%',
    border: '2px solid rgba(255,209,102,0.25)', borderTopColor: '#ffd166',
    display: 'inline-block',
  }} />
)

export function ActionBar({
  actionKind, actionSubmitted, selectedPlayer, submitting,
  isEnded, canAct, isAdmin, speakerName, winner, privateState, currentPhase,
  onSpeechComplete, onVote, onNightAction, onPass, onCancel, onBackToLobby, onPlayAgain,
}: ActionBarProps) {
  const baseStyle: React.CSSProperties = {
    flexShrink: 0, padding: '12px 16px calc(env(safe-area-inset-bottom) + 16px)',
    background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(16px)',
  }

  if (isEnded) {
    const isWolfWin = winner === 'wolf'
    return (
      <div style={{ ...baseStyle, borderTop: `1px solid ${isWolfWin ? 'rgba(239,68,68,0.2)' : 'rgba(96,165,250,0.2)'}`, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          padding: '12px 16px', borderRadius: 16,
          background: isWolfWin ? 'rgba(239,68,68,0.1)' : 'rgba(96,165,250,0.1)',
          border: `1px solid ${isWolfWin ? 'rgba(239,68,68,0.25)' : 'rgba(96,165,250,0.25)'}`,
        }}>
          <span style={{ fontSize: 24 }}>{isWolfWin ? '🐺' : '🎉'}</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: isWolfWin ? '#fca5a5' : '#93c5fd' }}>
              {isWolfWin ? '狼人阵营胜利' : '好人阵营胜利'}
            </div>
            <div style={{ fontSize: 10, color: '#64748b', marginTop: 1 }}>游戏已结束</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {onBackToLobby && (
            <button
              onClick={onBackToLobby}
              style={{
                flex: 1, padding: '13px', borderRadius: 16,
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.12)',
                color: '#94a3b8', fontSize: 14, fontWeight: 800,
                letterSpacing: '0.04em', cursor: 'pointer',
              }}>
              🏠 返回大厅
            </button>
          )}
          {isAdmin && onPlayAgain && (
            <button
              onClick={onPlayAgain}
              disabled={submitting}
              style={{
                flex: 1, padding: '13px', borderRadius: 16,
                background: 'linear-gradient(135deg, #5b21b6, #7c3aed)',
                border: '1px solid rgba(255,209,102,0.35)',
                color: '#ffd166', fontSize: 14, fontWeight: 800,
                letterSpacing: '0.04em', cursor: submitting ? 'not-allowed' : 'pointer',
                opacity: submitting ? 0.6 : 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>
              {submitting ? spinnerEl : '🔄 再来一局'}
            </button>
          )}
        </div>
      </div>
    )
  }

  if (!canAct) {
    return (
      <div style={{ ...baseStyle, borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {[0,1,2].map(i => (
            <div key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: '#475569' }} />
          ))}
        </div>
        <span style={{ fontSize: 12, color: '#475569' }}>
          {speakerName ? `${speakerName} 发言中` : '观看游戏进程'}
        </span>
      </div>
    )
  }

  if (actionSubmitted && actionKind !== 'speech') {
    return (
      <div style={{ ...baseStyle, borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <span style={{ fontSize: 14, color: '#34d399' }}>✓</span>
        <span style={{ fontSize: 12, color: '#64748b' }}>已提交，等待其他玩家</span>
      </div>
    )
  }

  if (actionKind === 'speech') {
    return (
      <div style={{ ...baseStyle, borderTop: '1px solid rgba(255,209,102,0.15)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <span style={{ fontSize: 20 }}>🎙</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#ffd166' }}>轮到你发言了</div>
            <div style={{ fontSize: 10, color: '#64748b' }}>整理思路，发表你的看法</div>
          </div>
        </div>
        <button onClick={onSpeechComplete} disabled={submitting} style={{
          width: '100%', padding: '13px', borderRadius: 16,
          background: 'linear-gradient(135deg, #5b21b6, #7c3aed)',
          border: '1px solid rgba(255,209,102,0.35)',
          color: '#ffd166', fontSize: 13, fontWeight: 800,
          cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.6 : 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}>
          {submitting ? spinnerEl : '✅ 发言完毕'}
        </button>
      </div>
    )
  }

  if (actionKind === 'vote' || actionKind === 'nightAction') {
    const isVote = actionKind === 'vote'
    const phaseIcons: Record<string, { icon: string; label: string; confirmLabel: string }> = {
      vote:    { icon: '🗳', label: '选择放逐目标', confirmLabel: '🗳 投出此票' },
      wolf:    { icon: '🐺', label: '选择击杀目标', confirmLabel: '☠ 确认击杀' },
      seer:    { icon: '🔮', label: '选择查验目标', confirmLabel: '🔮 查验身份' },
      guard:   { icon: '🛡', label: '选择守护目标', confirmLabel: '🛡 守护目标' },
    }
    const mEntry = phaseIcons[currentPhase ?? ''] ?? phaseIcons[isVote ? 'vote' : 'wolf']
    const mIcon = mEntry?.icon ?? '🗳'
    const mLabel = mEntry?.label ?? '选择目标'
    const mConfirmLabel = mEntry?.confirmLabel ?? '确认'
    return (
      <div style={{ ...baseStyle, borderTop: '1px solid rgba(139,92,246,0.15)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 18 }}>{mIcon}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#c4b5fd' }}>{mLabel}</div>
            {selectedPlayer
              ? <div style={{ fontSize: 10, color: '#94a3b8' }}>已选：<span style={{ color: '#ffd166', fontWeight: 700 }}>#{selectedPlayer.seatNo} {selectedPlayer.displayName}</span></div>
              : <div style={{ fontSize: 10, color: '#475569' }}>点击场上玩家进行选择</div>
            }
          </div>
          {selectedPlayer && (
            <button onClick={onCancel} style={{ padding: '4px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#64748b', fontSize: 11, cursor: 'pointer' }}>取消</button>
          )}
        </div>
        <button
          onClick={isVote ? onVote : onNightAction}
          disabled={!selectedPlayer || submitting}
          style={{
            width: '100%', padding: '13px', borderRadius: 16,
            background: selectedPlayer ? 'linear-gradient(135deg, #5b21b6, #7c3aed)' : 'rgba(255,255,255,0.05)',
            border: selectedPlayer ? '1px solid rgba(255,209,102,0.35)' : '1px solid rgba(255,255,255,0.07)',
            color: selectedPlayer ? '#ffd166' : '#475569',
            fontSize: 13, fontWeight: 800, cursor: selectedPlayer ? 'pointer' : 'not-allowed',
            opacity: submitting ? 0.6 : 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
          {submitting ? spinnerEl : (selectedPlayer ? mConfirmLabel : '等待选择目标...')}
        </button>
      </div>
    )
  }

  // heal / poison: witch special
  if (actionKind === 'pass' && currentPhase === 'witch-save') {
    const healAvailable = privateState?.witchItems?.healAvailable
    return (
      <div style={{ ...baseStyle, borderTop: '1px solid rgba(167,139,250,0.15)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 18 }}>🧪</span>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#a78bfa' }}>女巫 · 解药</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onNightAction} disabled={!healAvailable || submitting} style={{ flex: 1, padding: '11px 0', borderRadius: 14, background: healAvailable ? 'rgba(52,211,153,0.15)' : 'rgba(255,255,255,0.04)', border: `1px solid ${healAvailable ? 'rgba(52,211,153,0.45)' : 'rgba(255,255,255,0.08)'}`, color: healAvailable ? '#6ee7b7' : '#475569', fontSize: 12, fontWeight: 700, cursor: healAvailable ? 'pointer' : 'not-allowed', opacity: healAvailable ? 1 : 0.45 }}>
            💊 使用解药
          </button>
          <button onClick={onPass} disabled={submitting} style={{ flex: 1, padding: '11px 0', borderRadius: 14, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#64748b', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>跳过</button>
        </div>
      </div>
    )
  }

  // default waiting
  return (
    <div style={{ ...baseStyle, borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
      <div style={{ display: 'flex', gap: 4 }}>
        {[0,1,2].map(i => <div key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: '#334155' }} />)}
      </div>
      <span style={{ fontSize: 12, color: '#475569' }}>等待游戏进程</span>
    </div>
  )
}
