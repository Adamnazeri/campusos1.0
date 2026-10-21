import { createContext, useContext } from 'react'
import type { ApiUser } from './api'

export type SessionCtx = { user: ApiUser; setUser: (u: ApiUser) => void; signOut: () => void }
export const SessionContext = createContext<SessionCtx | null>(null)
export const useSession = () => {
  const c = useContext(SessionContext)
  if (!c) throw new Error('useSession di luar SessionContext')
  return c
}
