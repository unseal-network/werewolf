import { useEffect, useRef, useCallback } from 'react'
import type { GameEventDto } from '../api/client'

const RECONNECT_DELAY = 3000

export function useGameSSE(
  subscribeUrl: string | null,
  onEvent: (event: GameEventDto) => void,
  onRefresh?: () => void,
) {
  const onEventRef = useRef(onEvent)
  const onRefreshRef = useRef(onRefresh)
  const lastSeqRef = useRef(0)
  onEventRef.current = onEvent
  onRefreshRef.current = onRefresh

  const REFRESH_EVENTS = new Set([
    'game_started', 'phase_started', 'phase_closed',
    'night_resolved', 'player_eliminated', 'player_seat_changed',
    'game_ended', 'speech_submitted', 'vote_submitted', 'wolf_vote_resolved',
  ])

  useEffect(() => {
    if (!subscribeUrl) return
    let es: EventSource | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let cancelled = false

    const connect = () => {
      const url = lastSeqRef.current > 0
        ? subscribeUrl
        : subscribeUrl

      es = new EventSource(url)

      es.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data) as GameEventDto
          if (e.lastEventId) lastSeqRef.current = Number(e.lastEventId)
          onEventRef.current(event)
          if (REFRESH_EVENTS.has(event.type)) {
            onRefreshRef.current?.()
          }
        } catch {
          // ignore parse errors
        }
      }

      es.onerror = () => {
        es?.close()
        if (!cancelled) {
          reconnectTimer = setTimeout(connect, RECONNECT_DELAY)
        }
      }
    }

    connect()

    return () => {
      cancelled = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      es?.close()
    }
  }, [subscribeUrl])
}
