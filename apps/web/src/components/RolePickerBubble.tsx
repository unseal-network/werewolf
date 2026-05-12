import { useEffect, useRef } from 'react'
import { ROLE_IMG, ROLE_LABEL, ROLE_COLOR } from '../constants/roles'

export type RoleId = 'werewolf' | 'villager' | 'seer' | 'witch' | 'guard' | 'hunter'

export interface BubblePosition {
  /** 气泡锚点的 x（相对 viewport） */
  x: number
  /** 气泡锚点的 y（相对 viewport） */
  y: number
  /** 向上还是向下弹出 */
  direction: 'up' | 'down'
  /** 向左还是向右展开 */
  align: 'left' | 'right'
}

interface RolePickerBubbleProps {
  position: BubblePosition
  currentMark: RoleId | null
  onSelect: (role: RoleId | null) => void
  onClose: () => void
}

const ROLES: { id: RoleId; emoji: string }[] = [
  { id: 'werewolf', emoji: '🐺' },
  { id: 'villager', emoji: '👤' },
  { id: 'seer',     emoji: '🔮' },
  { id: 'witch',    emoji: '🧙' },
  { id: 'guard',    emoji: '🛡' },
  { id: 'hunter',   emoji: '🏹' },
]

export function RolePickerBubble({ position, currentMark, onSelect, onClose }: RolePickerBubbleProps) {
  const ref = useRef<HTMLDivElement>(null)

  // 点击气泡外部关闭
  useEffect(() => {
    const handler = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    // 延迟绑定，避免触发气泡的长按事件立即关闭
    const t = setTimeout(() => {
      document.addEventListener('mousedown', handler)
      document.addEventListener('touchstart', handler)
    }, 50)
    return () => {
      clearTimeout(t)
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('touchstart', handler)
    }
  }, [onClose])

  const top = position.direction === 'down'
    ? position.y + 8
    : undefined
  const bottom = position.direction === 'up'
    ? window.innerHeight - position.y + 8
    : undefined
  const left = position.align === 'left' ? position.x : undefined
  const right = position.align === 'right' ? window.innerWidth - position.x : undefined

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        top, bottom, left, right,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '6px 8px',
        background: 'rgba(10,6,26,0.95)',
        border: '1px solid rgba(139,92,246,0.45)',
        borderRadius: 16,
        backdropFilter: 'blur(16px)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(139,92,246,0.15)',
      }}
    >
      {/* 角色选项 */}
      {ROLES.map(({ id, emoji }) => {
        const isActive = currentMark === id
        const color = ROLE_COLOR[id]
        return (
          <button
            key={id}
            onClick={() => onSelect(isActive ? null : id)}
            style={{
              width: 42,
              height: 42,
              borderRadius: 12,
              border: `1.5px solid ${isActive ? color : 'rgba(255,255,255,0.08)'}`,
              background: isActive ? `${color}22` : 'rgba(255,255,255,0.04)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
              cursor: 'pointer',
              transition: 'all 120ms',
              boxShadow: isActive ? `0 0 10px ${color}44` : 'none',
              padding: 0,
            }}
          >
            {/* 角色图片 */}
            <div style={{
              width: 22, height: 22,
              borderRadius: '50%',
              overflow: 'hidden',
              border: `1.5px solid ${isActive ? color : 'rgba(255,255,255,0.12)'}`,
              flexShrink: 0,
            }}>
              {ROLE_IMG[id]
                ? <img src={ROLE_IMG[id]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} draggable={false} />
                : <span style={{ fontSize: 14, lineHeight: '22px', display: 'block', textAlign: 'center' }}>{emoji}</span>
              }
            </div>
            <span style={{ fontSize: 8, color: isActive ? color : '#475569', fontWeight: 700, lineHeight: 1 }}>
              {ROLE_LABEL[id]}
            </span>
          </button>
        )
      })}

      {/* 分隔线 */}
      <div style={{ width: 1, height: 32, background: 'rgba(255,255,255,0.08)', margin: '0 2px' }} />

      {/* 清除按钮 */}
      <button
        onClick={() => onSelect(null)}
        style={{
          width: 36, height: 42,
          borderRadius: 12,
          border: currentMark ? '1.5px solid rgba(239,68,68,0.45)' : '1.5px solid rgba(255,255,255,0.06)',
          background: currentMark ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.03)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          cursor: 'pointer',
          padding: 0,
        }}
      >
        <span style={{ fontSize: 14 }}>✕</span>
        <span style={{ fontSize: 8, color: '#475569', fontWeight: 700 }}>清除</span>
      </button>
    </div>
  )
}
