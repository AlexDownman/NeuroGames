import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabaseClient'

export default function DashboardPage() {
  const { session, loading, isTeacher } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink text-porcelain/60">
        Loading…
      </div>
    )
  }

  if (!session || !isTeacher) {
    return <Navigate to="/login" replace />
  }

  return (
    <div className="min-h-screen bg-ink text-porcelain">
      <header className="flex items-center justify-between px-6 py-5 md:px-12">
        <Link to="/" className="flex items-center gap-2 text-lg font-bold tracking-tight">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-baltic text-sm font-extrabold">
            N
          </span>
          NeuroGames
        </Link>
        <button
          type="button"
          onClick={() => supabase.auth.signOut()}
          className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium transition hover:bg-white/10"
        >
          Log out
        </button>
      </header>

      <main className="px-6 py-16 text-center md:py-24">
        <h1 className="text-3xl font-bold tracking-tight">
          Welcome back, {session.user.user_metadata.full_name || session.user.email}.
        </h1>
        <p className="mx-auto mt-3 max-w-md text-porcelain/60">
          Your collections and games will live here. This dashboard is the next thing we build.
        </p>
      </main>
    </div>
  )
}
