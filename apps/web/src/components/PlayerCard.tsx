import { Mic } from 'lucide-react'
import type { RoomPlayer } from '../api/client'
import { ROLE_IMG } from '../constants/roles'

interface PlayerCardProps {
  player: RoomPlayer
  isSelf: boolean
  isSpeaking: boolean
  isSelectable: boolean
  isSelected: boolean
  isDead: boolean
  seerResult?: 'wolf' | 'good'
  visibleRole?: string
  onSelect: () => void
  compact?: boolean   // 10+ 人紧凑模式
}

function getInitial(name: string): string {
  if (!name) return '?'
  const str = name.startsWith('@') ? name.slice(1) : name
  return (str.charAt(0) ?? '?').toUpperCase()
}

export function PlayerCard({
  player, isSelf, isSpeaking, isSelectable, isSelected,
  isDead, seerResult, visibleRole, onSelect, compact = false,
}: PlayerCardProps) {
  const roleImg = visibleRole ? ROLE_IMG[visibleRole] : undefined

  // 头像尺寸
  const avatarSize = compact ? 50 : 60

  // 头像边框颜色
  let ringColor = 'rgba(255,255,255,0.15)'
  let ringWidth = 2
  if (isSelected)       { ringColor = '#8b5cf6'; ringWidth = 3 }
  else if (isSpeaking)  { ringColor = '#ffd166'; ringWidth = 3 }
  else if (isSelf)      { ringColor = 'rgba(255,209,102,0.7)'; ringWidth = 2.5 }
  else if (isSelectable){ ringColor = 'rgba(139,92,246,0.55)'; ringWidth = 2 }

  // 发言时金色光晕
  const speakingGlow = isSpeaking
    ? '0 0 0 3px rgba(255,209,102,0.25), 0 0 16px rgba(255,209,102,0.3)'
    : isSelf
      ? '0 0 0 2px rgba(255,209,102,0.1)'
      : 'none'

  // 座位号颜色
  const badgeBg = isSelected
    ? 'linear-gradient(135deg,#3b1fa3,#5b21b6)'
    : isSelf
      ? 'linear-gradient(135deg,#92400e,#b45309)'
      : 'linear-gradient(135deg,#1e1040,#2d1b6b)'
  const badgeBorder = isSelected
    ? 'rgba(139,92,246,0.9)'
    : isSelf
      ? 'rgba(255,209,102,0.7)'
      : 'rgba(139,92,246,0.45)'
  const badgeColor = isSelected ? '#e9d5ff' : isSelf ? '#fde68a' : '#c4b5fd'

  const badgeSize = compact ? 24 : 28
  const badgeFontSize = compact ? 13 : 16

  return (
    <button
      onClick={onSelect}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 0,
        width: '100%',
        padding: compact ? '3px 2px 5px' : '4px 2px 5px',
        borderRadius: 14,
        background: isSelected
          ? 'rgba(109,40,217,0.18)'
          : isSpeaking
            ? 'rgba(255,209,102,0.06)'
            : 'rgba(255,255,255,0.03)',
        border: `1px solid ${
          isSelected  ? 'rgba(139,92,246,0.55)' :
          isSpeaking  ? 'rgba(255,209,102,0.35)' :
          isSelf      ? 'rgba(255,209,102,0.18)' :
          isSelectable? 'rgba(139,92,246,0.28)' :
                        'rgba(255,255,255,0.06)'
        }`,
        cursor: isDead ? 'default' : (isSelectable ? 'pointer' : 'default'),
        opacity: isDead ? 0.32 : 1,
        transition: 'all 150ms ease',
        position: 'relative',
        userSelect: 'none',
      }}
    >
      {/* ── 头像区域 ── */}
      <div style={{ position: 'relative', marginBottom: compact ? 8 : 10 }}>

        {/* 头像圆形 */}
        <div style={{
          width: avatarSize,
          height: avatarSize,
          borderRadius: '50%',
          overflow: 'hidden',
          border: `${ringWidth}px solid ${ringColor}`,
          background: 'rgba(255,255,255,0.06)',
          boxShadow: speakingGlow,
          transition: 'border-color 200ms, box-shadow 200ms',
          filter: isDead ? 'grayscale(1)' : 'none',
          flexShrink: 0,
        }}>
          {roleImg
            ? <img
                src={roleImg}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                draggable={false}
              />
            : <div style={{
                width: '100%', height: '100%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: compact ? 15 : 19,
                fontWeight: 800,
                color: isSelf ? '#fde68a' : '#94a3b8',
                background: isSelf
                  ? 'rgba(120,53,15,0.4)'
                  : isSelected
                    ? 'rgba(109,40,217,0.25)'
                    : 'rgba(255,255,255,0.04)',
              }}>
                {getInitial(player.displayName ?? '')}
              </div>
          }
        </div>

        {/* 选中 ✓ 覆盖层 */}
        {isSelected && (
          <div style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            background: 'rgba(109,40,217,0.48)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: compact ? 14 : 18,
            color: '#fff', fontWeight: 700,
          }}>✓</div>
        )}

        {/* 死亡 💀 覆盖层 */}
        {isDead && (
          <div style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            background: 'rgba(0,0,0,0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: compact ? 16 : 20,
          }}>💀</div>
        )}

        {/* 发言中麦克风 */}
        {isSpeaking && !isDead && (
          <div style={{
            position: 'absolute', top: -3, left: -3,
            width: compact ? 16 : 20, height: compact ? 16 : 20,
            borderRadius: '50%',
            background: 'rgba(16,185,129,0.95)',
            border: '2px solid #07041a',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 8px rgba(16,185,129,0.6)',
          }}>
            <Mic size={compact ? 8 : 10} color="#fff" strokeWidth={2.5} />
          </div>
        )}

        {/* 预言家查验结果点 */}
        {seerResult && (
          <div style={{
            position: 'absolute', top: -2, right: -2,
            width: compact ? 10 : 13, height: compact ? 10 : 13,
            borderRadius: '50%',
            background: seerResult === 'wolf' ? '#ef4444' : '#3b82f6',
            border: '2px solid #07041a',
            boxShadow: `0 0 6px ${seerResult === 'wolf' ? 'rgba(239,68,68,0.7)' : 'rgba(59,130,246,0.7)'}`,
          }} />
        )}

        {/* 自己的金点 */}
        {isSelf && !isDead && !isSelected && (
          <div style={{
            position: 'absolute', bottom: -1, right: -1,
            width: compact ? 8 : 10, height: compact ? 8 : 10,
            borderRadius: '50%',
            background: '#ffd166',
            border: '2px solid #07041a',
          }} />
        )}

        {/* ── 座位号牌 ── */}
        <div style={{
          position: 'absolute',
          bottom: -(badgeSize / 2 + 2),
          left: '50%',
          transform: 'translateX(-50%)',
          minWidth: badgeSize,
          height: badgeSize,
          borderRadius: 8,
          padding: '0 7px',
          background: badgeBg,
          border: `1.5px solid ${badgeBorder}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: badgeFontSize,
          fontWeight: 900,
          color: badgeColor,
          zIndex: 10,
          whiteSpace: 'nowrap',
          boxShadow: isSelected
            ? '0 2px 8px rgba(109,40,217,0.5)'
            : isSelf
              ? '0 2px 8px rgba(180,83,9,0.4)'
              : '0 2px 6px rgba(0,0,0,0.5)',
          letterSpacing: '-0.02em',
        }}>
          {player.seatNo}
        </div>
      </div>

    </button>
  )
}
