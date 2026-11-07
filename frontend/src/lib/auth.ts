import type { Session } from '@supabase/supabase-js'
import { createContext, useContext } from 'react'

// Kept apart from AuthProvider so AuthContext.tsx exports only a component,
// which React Fast Refresh needs to hot-reload it.

export interface AuthContextValue {
  session: Session | null
  loading: boolean
  // Students play on anonymous sign-ins; only a non-anonymous session is a
  // teacher (the DB only creates a lecturers row for email signups).
  isTeacher: boolean
}

export const AuthContext = createContext<AuthContextValue>({ session: null, loading: true, isTeacher: false })

export function useAuth() {
  return useContext(AuthContext)
}
