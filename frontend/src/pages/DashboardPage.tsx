import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { createCollection, listCollections, type Collection } from '../lib/api'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabaseClient'
import Logo from '../components/Logo'

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
          <Logo className="h-9 w-9" />
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
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  function load() {
    setState({ status: 'loading' })
    listCollections()
      .then((collections) => setState({ status: 'ready', collections }))
      .catch((error: Error) => setState({ status: 'error', message: error.message }))
  }

  useEffect(load, [])

  async function handleCreate(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) return

    setCreating(true)
    setCreateError('')
    try {
      await createCollection({ name: name.trim() })
      setName('')
      setShowForm(false)
      load()
    } catch (error) {
      setCreateError((error as Error).message)
    } finally {
      setCreating(false)
    }
  }

  return (
    <section className="mx-auto mt-12 max-w-2xl text-left">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Your collections</h2>
        <button
          type="button"
          onClick={() => setShowForm((value) => !value)}
          className="rounded-lg bg-baltic px-3.5 py-2 text-sm font-semibold hover:bg-baltic-light"
        >
          {showForm ? 'Cancel' : 'New collection'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="mt-4 flex gap-2">
          <input
            autoFocus
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Database Systems"
            className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm outline-none transition focus:border-baltic"
          />
          <button
            type="submit"
            disabled={creating}
            className="rounded-lg bg-cherry px-4 py-2.5 text-sm font-semibold hover:bg-cherry-light disabled:opacity-60"
          >
            {creating ? 'Creating…' : 'Create'}
          </button>
        </form>
      )}
      {createError && (
        <p role="alert" className="mt-2 text-sm text-cherry-light">
          {createError}
        </p>
      )}

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
            <li key={collection.id}>
              <Link
                to={`/dashboard/collections/${collection.id}`}
                className="block rounded-xl border border-white/10 bg-white/5 px-4 py-3 transition hover:border-baltic/60 hover:bg-white/[0.08]"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">{collection.name}</span>
                  <span className="text-xs text-porcelain/50">
                    {collection.publicCollection ? 'Public' : 'Private'}
                  </span>
                </div>
                {collection.description && (
                  <p className="mt-1 text-sm text-porcelain/60">{collection.description}</p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
