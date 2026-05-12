import { useState, useEffect } from 'react'
import { PHASE_ICON, PHASE_LABEL } from '../constants/roles'

interface TopBarProps {
  phase: string
  day: number
  deadlineAt: string | null
  playerCount: number
  aliveCount: number
  isNight: boolean
  isAdmin: boolean
  onAdminMenu: () => void
}

function useCountdown(deadlineAt: string | null) {
  const [rem, setRem] = useState(0)
  useEffect(() => {
    if (!deadlineAt) { setRem(0); return }
    const deadlineTs = new Date(deadlineAt).getTime() / 1000
    const tick = () => setRem(Math.max(0, Math.floor(deadlineTs - Date.now() / 1000)))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [deadlineAt])
  return rem
}

export function TopBar({ phase, day, deadlineAt, playerCount, aliveCount, isNight, isAdmin, onAdminMenu }: TopBarProps) {
  const rem = useCountdown(deadlineAt)
  const danger = rem > 0 && rem <= 10
  const maxSecs = 180
  const ratio = deadlineAt ? Math.min(1, rem / maxSecs) : 0
  const r = 13; const circ = 2 * Math.PI * r

  return (
    <div style={{
      flexShrink: 0, zIndex: 20, position: 'relative',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '50px 16px 10px',
      background: 'rgba(0,0,0,0.45)',
      backdropFilter: 'blur(20px)',
      borderBottom: `1px solid ${isNight ? 'rgba(139,92,246,0.2)' : 'rgba(245,158,11,0.18)'}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 11,
          background: isNight ? 'rgba(109,40,217,0.25)' : 'rgba(245,158,11,0.18)',
          border: `1px solid ${isNight ? 'rgba(139,92,246,0.4)' : 'rgba(245,158,11,0.4)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
        }}>
          {PHASE_ICON[phase] ?? (isNight ? '🌙' : '☀️')}
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>
            {PHASE_LABEL[phase] ?? '游戏中'}
          </div>
          <div style={{ fontSize: 10, color: '#64748b' }}>
            第 {day} 天 · {aliveCount}/{playerCount} 存活
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {isAdmin && (
          <button
            onClick={onAdminMenu}
            style={{
              width: 30, height: 30, borderRadius: 9,
              background: 'rgba(239,68,68,0.12)',
              border: '1px solid rgba(239,68,68,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', fontSize: 14, color: 'rgba(252,165,165,0.9)',
            }}>⚙︎</button>
        )}
        <div style={{ position: 'relative', width: 34, height: 34 }}>
          <svg width="34" height="34" style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }}>
            <circle cx="17" cy="17" r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="2.5" />
            {deadlineAt && (
              <circle cx="17" cy="17" r={r} fill="none"
                stroke={danger ? '#ef4444' : isNight ? '#8b5cf6' : '#f59e0b'}
                strokeWidth="2.5" strokeDasharray={circ}
                strokeDashoffset={circ * (1 - ratio)} strokeLinecap="round"
                style={{ transition: 'stroke-dashoffset 1s linear, stroke 500ms' }}
              />
            )}
          </svg>
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, fontWeight: 800,
            color: danger ? '#ef4444' : '#94a3b8',
          }}>
            {deadlineAt ? (rem > 0 ? rem : '✓') : '—'}
          </div>
        </div>
      </div>
    </div>
  )
}
