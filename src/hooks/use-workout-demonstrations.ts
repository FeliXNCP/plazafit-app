import { useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'
import { AppState } from 'react-native'
import {
  fetchSessionDemonstrations,
  type SessionDemonstrations,
} from '../services/training/exercise-demonstration-service'

const EMPTY: SessionDemonstrations = {}

export function useWorkoutDemonstrations(sessionId: string | undefined, enabled: boolean) {
  const [state, setState] = useState<{
    sessionId: string | undefined
    items: SessionDemonstrations
  }>({ sessionId: undefined, items: EMPTY })

  useFocusEffect(useCallback(() => {
    if (!sessionId || !enabled) return
    let disposed = false
    let inFlight = false
    let requestedAgain = false
    let lastSuccessAt = 0

    async function refresh() {
      if (disposed || !sessionId) return
      if (inFlight) {
        requestedAgain = true
        return
      }
      inFlight = true
      try {
        const items = await fetchSessionDemonstrations(sessionId)
        if (!disposed) {
          setState({ sessionId, items })
          lastSuccessAt = Date.now()
        }
      } catch (error: unknown) {
        if (!disposed) {
          // No registrar URLs firmadas ni tokens; la guía visual no bloquea entrenar.
          const code = error instanceof Error ? error.message : 'MEDIA_REQUEST_FAILED'
          console.warn('[PlazaFit] Guía visual no disponible:', code)
        }
      } finally {
        inFlight = false
        if (requestedAgain && !disposed) {
          requestedAgain = false
          void refresh()
        }
      }
    }

    void refresh()
    const listener = AppState.addEventListener('change', (next) => {
      if (next === 'active' && Date.now() - lastSuccessAt > 30 * 60 * 1000) {
        void refresh()
      }
    })
    return () => {
      disposed = true
      listener.remove()
    }
  }, [sessionId, enabled]))

  return enabled && state.sessionId === sessionId ? state.items : EMPTY
}
