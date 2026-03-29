import type { Session } from '@supabase/supabase-js'
import { PropsWithChildren, createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type SessionContextType = {
  session: Session | null
  loading: boolean
}

const SessionContext = createContext<SessionContextType>({
  session: null,
  loading: true,
})

export function SessionProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null)
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  return (
    <SessionContext.Provider value={{ session, loading }}>
      {children}
    </SessionContext.Provider>
  )
}

export function useSession() {
  return useContext(SessionContext)
}