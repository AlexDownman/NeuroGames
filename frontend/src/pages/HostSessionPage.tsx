import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Leaderboard, Podium } from '../components/Leaderboard'
import { HostSessionSummary } from '../components/SessionSummary'
import { endSession } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useLiveSession, type SessionState } from '../lib/liveSession'
import { supabase } from '../lib/supabaseClient'

// The lecturer's screen (meant for the projector): lobby with the join code,
// then a live leaderboard while everyone plays at their own pace, then the
// final podium once the host ends the session.
export default function HostSessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const { session, loading, isTeacher } = useAuth()
  const { state, leaderboard, error, refresh, setState } = useLiveSession(isTeacher ? sessionId : undefined)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')

  async function handleStart() {
    if (!sessionId) return
    setBusy(true)
    setActionError('')
    const { data, error: rpcError } = await supabase.rpc('host_start_game', { p_session_id: sessionId })
    setBusy(false)
    if (rpcError) {
      console.error('host_start_game failed:', rpcError)
      setActionError(rpcError.message)
      return
    }
    setState(data as SessionState)
  }

  async function handleEnd() {
    if (!sessionId) return
    setBusy(true)
    setActionError('')
    try {
      await endSession(sessionId)
      void refresh()
    } catch (err) {
      setActionError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <Centered>Loading…</Centered>

  if (!session || !isTeacher) {
    return (
      <Centered>
        <p>Log in with your teacher account to host this session.</p>
        <Link to="/login" className="mt-4 inline-block text-sm underline">
          Log in
        </Link>
      </Centered>
    )
  }

  if (error && !state) {
    return (
      <Centered>
        <p className="text-cherry-light">{error}</p>
        <Link to="/dashboard" className="mt-4 inline-block text-sm underline">
          Back to dashboard
        </Link>
      </Centered>
    )
  }

  if (!state) return <Centered>Loading session…</Centered>

  const everyoneFinished = state.participant_count > 0 && state.finished_count >= state.participant_count

  return (
    <div className="flex min-h-screen flex-col bg-ink text-porcelain">
      <header className="flex items-center justify-between px-6 py-4">
        <Link to="/dashboard" className="text-sm text-porcelain/50 hover:text-porcelain">
          ← Dashboard
        </Link>
        <div className="flex items-center gap-4 text-sm">
          <span className="font-mono text-porcelain/50">
            Code <span className="tracking-[0.2em] text-porcelain">{state.session_code}</span>
          </span>
          <span className="text-porcelain/50">👥 {state.participant_count}</span>
        </div>
      </header>

      {actionError && <p className="px-6 text-center text-sm text-cherry-light">{actionError}</p>}

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 pb-10">
        {state.status === 'pending' && (
          <section className="flex flex-1 flex-col items-center gap-8 pt-6 text-center">
            <div>
              <p className="text-porcelain/60">
                Join at <span className="font-semibold text-porcelain">{window.location.host}/signup?role=student</span> with code
              </p>
              <p className="mt-2 font-mono text-6xl font-bold tracking-[0.3em] text-baltic-light md:text-7xl">
                {state.session_code}
              </p>
            </div>

            <button
              type="button"
              disabled={busy || state.participant_count === 0}
              onClick={handleStart}
              className="rounded-lg bg-cherry px-8 py-3 text-lg font-semibold hover:bg-cherry-light disabled:opacity-50"
            >
              {state.participant_count === 0 ? 'Waiting for players…' : `Start game (${state.question_count} questions)`}
            </button>

            <ul className="flex flex-wrap justify-center gap-2">
              {leaderboard.map((entry) => (
                <li key={entry.participant_id} className="animate-pop rounded-full bg-white/10 px-4 py-1.5 text-sm font-medium">
                  {entry.display_name}
                </li>
              ))}
            </ul>
          </section>
        )}

        {state.status === 'active' && (
          <section className="flex flex-1 flex-col gap-6 pt-4">
            <div className="flex items-end justify-between">
              <div>
                <h1 className="text-2xl font-bold">Live leaderboard</h1>
                <p className="text-sm text-porcelain/50">
                  {everyoneFinished
                    ? 'Everyone has finished!'
                    : `${state.finished_count} of ${state.participant_count} players finished`}
                </p>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={handleEnd}
                className={`rounded-lg px-5 py-2.5 text-sm font-semibold disabled:opacity-60 ${
                  everyoneFinished ? 'bg-cherry hover:bg-cherry-light' : 'bg-white/10 hover:bg-white/20'
                }`}
              >
                End game & show results
              </button>
            </div>
            <Leaderboard entries={leaderboard} limit={50} questionCount={state.question_count} />
          </section>
        )}

        {state.status === 'ended' && (
          <section className="flex flex-1 flex-col items-center gap-8 pt-6">
            <h1 className="text-3xl font-bold">🏁 Final results</h1>
            <Podium entries={leaderboard} />
            <HostSessionSummary sessionId={state.session_id} />
            <Link to="/dashboard" className="rounded-lg bg-baltic px-5 py-2.5 text-sm font-semibold hover:bg-baltic-light">
              Back to dashboard
            </Link>
          </section>
        )}
      </main>
    </div>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-ink px-6 text-center text-porcelain">
      <div>{children}</div>
    </div>
  )
}
