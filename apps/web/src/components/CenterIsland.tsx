import { ROLE_IMG, ROLE_LABEL, ROLE_COLOR } from '../constants/roles'
import logoImg from '../assets/logo.jpeg'

interface CenterIslandProps {
  myRole?: string | undefined
  speakerName?: string | undefined
  actionHint?: string | undefined
  aliveCount: number
  totalCount: number
}

export function CenterIsland({ myRole, speakerName, actionHint, aliveCount, totalCount }: CenterIslandProps) {
  const roleImg = myRole ? ROLE_IMG[myRole] : undefined
  const roleColor = myRole ? ROLE_COLOR[myRole] : '#8b5cf6'
  const roleLabel = myRole ? (ROLE_LABEL[myRole] ?? myRole) : null

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      gap: 8, padding: '6px 4px',
      position: 'relative', zIndex: 10,
    }}>

      {/* 我的身份 */}
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
        padding: '10px 8px',
        background: 'rgba(255,255,255,0.03)',
        border: `1px solid ${roleColor}28`,
        borderRadius: 16,
        width: '100%',
      }}>
        <div style={{
          width: 48, height: 48,
          borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
          border: `2.5px solid ${roleColor}`,
          boxShadow: `0 0 14px ${roleColor}40`,
        }}>
          <img
            src={roleImg ?? logoImg}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            draggable={false}
          />
        </div>
        {roleLabel ? (
          <>
            <div style={{ fontSize: 8, color: 'rgba(100,116,139,0.8)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>我的身份</div>
            <div style={{
              fontSize: 14, fontWeight: 900, color: roleColor,
              letterSpacing: '0.06em', lineHeight: 1,
            }}>
              {roleLabel}
            </div>
          </>
        ) : (
          <div style={{ fontSize: 9, color: '#374151', letterSpacing: '0.08em' }}>身份未知</div>
        )}
      </div>

      {/* 发言中 */}
      {speakerName && (
        <div style={{
          width: '100%',
          padding: '7px 8px',
          borderRadius: 12,
          background: 'rgba(255,209,102,0.07)',
          border: '1px solid rgba(255,209,102,0.22)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
        }}>
          <div style={{ fontSize: 8, color: 'rgba(100,116,139,0.7)', letterSpacing: '0.1em' }}>🎙 发言中</div>
          <div style={{
            fontSize: 11, fontWeight: 700, color: '#ffd166',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            width: '100%', textAlign: 'center',
          }}>
            {speakerName}
          </div>
        </div>
      )}

      {/* 行动提示 */}
      {actionHint && (
        <div style={{
          width: '100%',
          padding: '7px 6px',
          borderRadius: 12,
          background: 'rgba(139,92,246,0.1)',
          border: '1px solid rgba(139,92,246,0.25)',
        }}>
          <div style={{
            fontSize: 10, fontWeight: 600,
            color: '#a78bfa', textAlign: 'center', lineHeight: 1.4,
          }}>
            {actionHint}
          </div>
        </div>
      )}

      {/* 存活点阵 */}
      <div style={{
        display: 'flex', flexWrap: 'wrap',
        justifyContent: 'center', gap: 4,
        padding: '4px 4px 0',
      }}>
        {Array.from({ length: totalCount }).map((_, i) => (
          <div key={i} style={{
            width: 6, height: 6, borderRadius: '50%',
            background: i < aliveCount
              ? 'rgba(139,92,246,0.7)'
              : 'rgba(255,255,255,0.07)',
            boxShadow: i < aliveCount ? '0 0 4px rgba(139,92,246,0.5)' : 'none',
            transition: 'background 600ms, box-shadow 600ms',
          }} />
        ))}
      </div>

    </div>
  )
}
