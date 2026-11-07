import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { listCollections, type Collection } from '../lib/api'
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
          Your collections and games live here.
        </p>

        <TeacherCollections />
      </main>
    </div>
  )
}

type CollectionsState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; collections: Collection[] }

function TeacherCollections() {
  const [state, setState] = useState<CollectionsState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    listCollections()
      .then((collections) => !cancelled && setState({ status: 'ready', collections }))
      .catch((error: Error) => !cancelled && setState({ status: 'error', message: error.message }))
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <section className="mx-auto mt-12 max-w-2xl text-left">
      <h2 className="text-lg font-semibold">Your collections</h2>

      {state.status === 'loading' && <p className="mt-4 text-sm text-porcelain/50">Loading collections…</p>}

      {state.status === 'error' && (
        <p role="alert" className="mt-4 rounded-lg bg-cherry/10 px-3.5 py-2.5 text-sm text-cherry-light">
          {state.message}
        </p>
      )}

      {state.status === 'ready' && state.collections.length === 0 && (
        <p className="mt-4 rounded-xl border border-dashed border-white/15 px-4 py-6 text-center text-sm text-porcelain/50">
          No collections yet.
        </p>
      )}

      {state.status === 'ready' && state.collections.length > 0 && (
        <ul className="mt-4 space-y-2">
          {state.collections.map((collection) => (
            <li key={collection.id} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">{collection.name}</span>
                <span className="text-xs text-porcelain/50">
                  {collection.publicCollection ? 'Public' : 'Private'}
                </span>
              </div>
              {collection.description && (
                <p className="mt-1 text-sm text-porcelain/60">{collection.description}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
