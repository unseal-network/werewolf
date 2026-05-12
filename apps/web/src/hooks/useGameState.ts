import { useState, useCallback } from 'react'
import type {
  GameRoom, RoomProjection, PlayerPrivateState, GameEventDto, RoomPlayer
} from '../api/client'

export interface GameState {
  room: GameRoom | null
  projection: RoomProjection | null
  privateStates: PlayerPrivateState[]
  events: GameEventDto[]
}

export function useGameState() {
  const [state, setState] = useState<GameState>({
    room: null,
    projection: null,
    privateStates: [],
    events: [],
  })

  const setRoom = useCallback((room: GameRoom) => {
    setState(prev => ({ ...prev, room }))
  }, [])

  const updateFromSnapshot = useCallback((data: {
    room: GameRoom
    projection: RoomProjection | null
    privateStates: PlayerPrivateState[]
    events: GameEventDto[]
  }) => {
    setState({
      room: data.room,
      projection: data.projection,
      privateStates: data.privateStates,
      events: data.events,
    })
  }, [])

  const appendEvent = useCallback((event: GameEventDto) => {
    setState(prev => ({
      ...prev,
      events: [...prev.events, event],
    }))
  }, [])

  const reset = useCallback(() => {
    setState({ room: null, projection: null, privateStates: [], events: [] })
  }, [])

  const myPlayer = useCallback((userId: string): RoomPlayer | undefined => {
    return state.room?.players.find(p => p.userId === userId && !p.leftAt)
  }, [state.room])

  return { state, setRoom, updateFromSnapshot, appendEvent, reset, myPlayer }
}
