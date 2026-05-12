import { useState, useRef, useEffect } from 'react'
import type { GameEventDto, RoomPlayer } from '../api/client'

interface EventLogProps {
  events: GameEventDto[]
  players: RoomPlayer[]
}

// 事件类型 → 可读文案
function formatEvent(e: GameEventDto, players: RoomPlayer[]): { icon: string; text: string; color: string } | null {
  const actor = players.find(p => p.id === e.actorId)
  const subject = players.find(p => p.id === e.subjectId)
  const actorName = actor?.displayName?.split(':')[0] ?? e.actorId ?? '?'
  const subjectName = subject?.displayName?.split(':')[0] ?? e.subjectId ?? '?'
  const payload = e.payload

  switch (e.type) {
    case 'phase_started':
      return {
        icon: (payload.phase as string)?.startsWith('night') || ['wolf','seer','guard','witch-save','witch-poison'].includes(payload.phase as string)
          ? '🌙' : '☀️',
        text: `第 ${payload.day ?? '?'} 天 · ${phaseLabel(payload.phase as string)}`,
        color: '#a78bfa',
      }
    case 'speech_submitted':
      return {
        icon: '🎙',
        text: `${actorName}：${String(payload.speech ?? '').slice(0, 30)}${String(payload.speech ?? '').length > 30 ? '…' : ''}`,
        color: '#e2e8f0',
      }
    case 'vote_submitted':
      return {
        icon: '🗳',
        text: `${actorName} 投票放逐 ${subjectName}`,
        color: '#fbbf24',
      }
    case 'wolf_vote_submitted':
      return {
        icon: '🐺',
        text: `狼人选择了 ${subjectName}`,
        color: '#f87171',
      }
    case 'wolf_vote_resolved':
      return {
        icon: '🔪',
        text: `${subjectName} 被狼人杀害`,
        color: '#ef4444',
      }
    case 'night_action_submitted':
      return {
        icon: '🌑',
        text: `${actorName} 提交了夜间行动`,
        color: '#94a3b8',
      }
    case 'seer_result_revealed':
      return {
        icon: '🔮',
        text: `预言家查验：${subjectName} 是${payload.result === 'wolf' ? '狼人' : '好人'}`,
        color: payload.result === 'wolf' ? '#f87171' : '#60a5fa',
      }
    case 'witch_kill_revealed':
      return {
        icon: '☠️',
        text: `女巫毒死了 ${subjectName}`,
        color: '#a855f7',
      }
    case 'phase_closed': {
      const eliminated = payload.eliminatedPlayerId
        ? players.find(p => p.id === payload.eliminatedPlayerId)?.displayName?.split(':')[0]
        : null
      return {
        icon: '⚖️',
        text: eliminated ? `${eliminated} 被放逐出局` : '本轮投票结束',
        color: '#fb923c',
      }
    }
    case 'night_resolved':
      return {
        icon: '🌅',
        text: '夜晚结束',
        color: '#818cf8',
      }
    case 'game_started':
      return { icon: '🎮', text: '游戏开始', color: '#34d399' }
    case 'game_ended':
      return {
        icon: payload.winner === 'wolf' ? '🐺' : '🎉',
        text: `游戏结束 · ${payload.winner === 'wolf' ? '狼人获胜' : '好人获胜'}`,
        color: payload.winner === 'wolf' ? '#f87171' : '#34d399',
      }
    default:
      return null
  }
}

function phaseLabel(phase: string): string {
  const map: Record<string, string> = {
    day: '白天发言',
    vote: '投票放逐',
    wolf: '狼人行动',
    seer: '预言家查验',
    guard: '守卫守护',
    'witch-save': '女巫救人',
    'witch-poison': '女巫毒人',
    night: '黑夜降临',
    end: '游戏结束',
  }
  return map[phase] ?? phase
}

export function EventLog({ events, players }: EventLogProps) {
  const [collapsed, setCollapsed] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // 新事件自动滚到底部
  useEffect(() => {
    if (!collapsed && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [events.length, collapsed])

  // 过滤掉 runtime 事件和无法显示的事件
  const visible = events
    .map(e => ({ e, fmt: formatEvent(e, players) }))
    .filter(({ fmt }) => fmt !== null) as { e: GameEventDto; fmt: NonNullable<ReturnType<typeof formatEvent>> }[]

  const unread = visible.length

  return (
    <div style={{
      position: 'absolute',
      bottom: 0,
      left: 0,
      zIndex: 30,
      width: collapsed ? 'auto' : 200,
      maxWidth: '60vw',
      transition: 'width 200ms ease',
    }}>
      {/* 收起/展开 toggle */}
      <button
        onClick={() => setCollapsed(c => !c)}
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '5px 10px 5px 8px',
          background: 'rgba(15,10,35,0.82)',
          border: '1px solid rgba(139,92,246,0.28)',
          borderBottom: collapsed ? '1px solid rgba(139,92,246,0.28)' : 'none',
          borderRadius: collapsed ? '10px 10px 10px 10px' : '10px 10px 0 0',
          cursor: 'pointer',
          color: '#94a3b8',
          fontSize: 11,
          fontWeight: 700,
          backdropFilter: 'blur(10px)',
          whiteSpace: 'nowrap',
          width: '100%',
        }}
      >
        <span style={{ fontSize: 12 }}>📋</span>
        {!collapsed && <span style={{ color: '#c4b5fd' }}>日志</span>}
        {collapsed && unread > 0 && (
          <span style={{ fontSize: 9, color: '#a78bfa' }}>{unread}</span>
        )}
        {!collapsed && (
          <span style={{ marginLeft: 'auto', fontSize: 10, color: '#475569' }}>▼</span>
        )}
        {collapsed && (
          <span style={{ fontSize: 10, color: '#475569' }}>▲</span>
        )}
      </button>

      {/* 日志列表 */}
      {!collapsed && (
        <div
          ref={scrollRef}
          style={{
            maxHeight: 200,
            overflowY: 'auto',
            background: 'rgba(10,6,26,0.88)',
            border: '1px solid rgba(139,92,246,0.22)',
            borderTop: 'none',
            borderRadius: '0 0 10px 10px',
            backdropFilter: 'blur(10px)',
            scrollbarWidth: 'none',
          }}
        >
          {visible.length === 0 ? (
            <div style={{ padding: '10px 10px', fontSize: 10, color: '#374151', textAlign: 'center' }}>
              暂无日志
            </div>
          ) : (
            visible.map(({ e, fmt }) => (
              <div
                key={e.id}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 5,
                  padding: '5px 8px',
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                }}
              >
                <span style={{ fontSize: 11, flexShrink: 0, marginTop: 1 }}>{fmt.icon}</span>
                <span style={{
                  fontSize: 10, color: fmt.color,
                  lineHeight: 1.5, wordBreak: 'break-all',
                }}>
                  {fmt.text}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
