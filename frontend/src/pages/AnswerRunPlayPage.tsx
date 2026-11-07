import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { Leaderboard, Podium } from '../components/Leaderboard'
import { MySessionSummary } from '../components/SessionSummary'
import { useLiveSession, type AnswerResult, type MyQuestion } from '../lib/liveSession'
import { supabase } from '../lib/supabaseClient'

// How long the right/wrong flash stays up before the next question drops in.
const FEEDBACK_MS = 1800

type Phase = 'idle' | 'loading' | 'playing' | 'feedback' | 'done' | 'error'

interface Feedback extends AnswerResult {
  selectedAnswerId: string | null
}

// A player's phone. Once the host starts the game, each player runs through
// the questions at their own pace — the next one drops in as soon as the
// last is answered — while the session leaderboard updates live alongside.
export default function AnswerRunPlayPage() {
  const { sessionCode } = useParams<{ sessionCode: string }>()
  const location = useLocation()
  const navState = location.state as { participantId?: string; sessionId?: string } | null
  const participantId = navState?.participantId
  const { state, leaderboard, error, refresh } = useLiveSession(navState?.sessionId)

  const [phase, setPhase] = useState<Phase>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [question, setQuestion] = useState<MyQuestion | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [score, setScore] = useState(0)
  const [streak, setStreak] = useState(0)
  const answeredRef = useRef(false)

  async function loadQuestion() {
    if (!participantId) return
    setPhase('loading')
    const { data, error: rpcError } = await supabase.rpc('get_my_question', { p_participant_id: participantId })
    if (rpcError) {
      console.error('get_my_question failed:', rpcError)
      setPhase('error')
      setErrorMessage('Something went wrong loading your next question. Try rejoining.')
      return
    }
    setFeedback(null)
    if (!data) {
      // Finished every question (or the session ended in between).
      setQuestion(null)
      setPhase('done')
      void refresh()
      return
    }
    answeredRef.current = false
    setQuestion(data as MyQuestion)
    setPhase('playing')
  }

  // Start (or resume, after a refresh) as soon as the host starts the game.
  useEffect(() => {
    if (state?.me) {
      setScore(state.me.score)
      setStreak(state.me.current_streak)
    }
    if (phase === 'idle' && state?.status === 'active') void loadQuestion()
    if (state?.status === 'ended' && phase !== 'error') setPhase('done')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.status, state?.me?.score])

  // Reaching the bottom unanswered counts as a wrong answer.
  useEffect(() => {
    if (phase !== 'playing' || !question) return
    const timeout = setTimeout(() => {
      if (!answeredRef.current) void answer(null)
    }, question.time_remaining_ms)
    return () => clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, question])

  async function answer(answerId: string | null) {
    if (phase !== 'playing' || !question || !participantId || answeredRef.current) return
    answeredRef.current = true

    const { data, error: rpcError } = await supabase
      .rpc('submit_answer', {
        p_participant_id: participantId,
        p_question_id: question.question_id,
        p_selected_answer_id: answerId,
      })
      .single()

    if (rpcError || !data) {
      if (rpcError) console.error('submit_answer failed:', rpcError)
      // The session may have just ended; otherwise pick up wherever the server says we are.
      void refresh()
      void loadQuestion()
      return
    }

    const result = data as AnswerResult
    setScore(result.score)
    setStreak(result.current_streak)
    setFeedback({ ...result, selectedAnswerId: answerId })
    setPhase('feedback')
    void refresh()

    setTimeout(() => {
      if (result.finished) {
        setFeedback(null)
        setPhase('done')
      } else {
        void loadQuestion()
      }
    }, FEEDBACK_MS)
  }

  if (!participantId || !navState?.sessionId) {
    return (
      <Centered>
        <p className="text-cherry-light">Join a session first.</p>
        <JoinLink />
      </Centered>
    )
  }

  if (phase === 'error' || (error && !state)) {
    return (
      <Centered>
        <p className="text-cherry-light">{errorMessage || error}</p>
        <JoinLink />
      </Centered>
    )
  }

  if (!state) return <Centered>Joining…</Centered>

  const myEntry = leaderboard.find((entry) => entry.is_me)

  if (state.status === 'ended') {
    return (
      <Centered>
        <p className="text-5xl">🏁</p>
        <h1 className="mt-4 text-2xl font-bold">Game over!</h1>
        {myEntry && (
          <p className="mt-2 text-porcelain/70">
            You finished <span className="font-semibold text-porcelain">{ordinal(myEntry.rank)}</span> of {leaderboard.length} with{' '}
            <span className="font-mono text-xl text-baltic-light">{myEntry.score}</span> pts
          </p>
        )}
        <div className="mt-8">
          <Podium entries={leaderboard} />
        </div>
        <div className="mx-auto mt-6 w-full max-w-sm text-left">
          <Leaderboard entries={leaderboard} limit={5} />
        </div>
        <div className="mx-auto mt-6 w-full max-w-sm text-left">
          <MySessionSummary sessionId={state.session_id} />
        </div>
        <Link to="/" className="mt-6 inline-block rounded-lg bg-baltic px-5 py-2.5 text-sm font-semibold hover:bg-baltic-light">
          Back to home
        </Link>
      </Centered>
    )
  }

  if (state.status === 'pending') {
    return (
      <Centered>
        <p className="text-5xl">🎮</p>
        <h1 className="mt-4 text-2xl font-bold">You're in{state.me ? `, ${state.me.display_name}` : ''}!</h1>
        <p className="mt-2 text-porcelain/60">Your run starts as soon as your teacher starts the game.</p>
        <p className="mt-6 text-sm text-porcelain/40">
          {state.participant_count} {state.participant_count === 1 ? 'player' : 'players'} in the lobby
        </p>
      </Centered>
    )
  }

  if (phase === 'done') {
    return (
      <Centered>
        <p className="text-5xl">🏁</p>
        <h1 className="mt-4 text-2xl font-bold">Run complete!</h1>
        <p className="mt-2 text-porcelain/70">
          Final score: <span className="font-mono text-xl text-baltic-light">{score}</span>
          {myEntry && (
            <>
              {' '}
              · currently <span className="font-semibold text-porcelain">{ordinal(myEntry.rank)}</span> of {leaderboard.length}
            </>
          )}
        </p>
        <p className="mt-1 text-sm text-porcelain/40">
          {state.finished_count} of {state.participant_count} players finished — the leaderboard updates live.
        </p>
        <div className="mx-auto mt-6 w-full max-w-sm text-left">
          <Leaderboard entries={leaderboard} limit={5} />
        </div>
      </Centered>
    )
  }

  if (!question) return <Centered>Loading your run…</Centered>

  return (
    <div className="flex min-h-screen flex-col bg-ink text-porcelain">
      <header className="flex items-center justify-between px-6 py-4">
        <span className="font-mono text-sm text-porcelain/50">
          {sessionCode} · Q{question.question_index + 1}/{state.question_count}
        </span>
        <div className="flex items-center gap-4 text-sm">
          {streak >= 2 && <span className="text-cherry-light">🔥 {streak} streak</span>}
          <span className="font-mono text-lg text-baltic-light">{score} pts</span>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 pb-8 lg:flex-row">
        <div className="flex flex-1 flex-col gap-6">
          <div className="relative min-h-[50vh] flex-1 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] lg:min-h-0">
            <FallingCard key={question.question_id} question={question} durationMs={state.question_duration_ms} />
            <div className="absolute inset-x-0 bottom-0 h-1 bg-cherry/60" />
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {question.answer_options.map((option) => {
              const isCorrectOption = feedback !== null && feedback.correct_answer_ids.includes(option.id)
              const isWrongSelection = feedback !== null && !feedback.is_correct && option.id === feedback.selectedAnswerId
              const colorClasses = isCorrectOption
                ? 'border-baltic-light/70 bg-baltic/25 text-baltic-light'
                : isWrongSelection
                  ? 'border-cherry-light/70 bg-cherry/20 text-cherry-light'
                  : 'border-white/10 bg-white/5 hover:border-baltic/60 hover:bg-white/10'
              // Remounts the instant feedback lands, so the pop/shake animation
              // below always restarts instead of silently no-op'ing on a
              // className change to an element that's already on screen.
              const animationKey = feedback && (isCorrectOption || isWrongSelection) ? 'answered' : 'idle'
              const animationClass = isCorrectOption ? 'animate-pop' : isWrongSelection ? 'animate-shake' : ''

              return (
                <button
                  key={`${option.id}-${animationKey}`}
                  type="button"
                  disabled={phase !== 'playing'}
                  onClick={() => answer(option.id)}
                  className={`rounded-lg border px-4 py-3 text-left text-sm font-medium transition disabled:opacity-100 ${colorClasses} ${animationClass}`}
                >
                  {option.answer_text}
                </button>
              )
            })}
          </div>
        </div>

        <div className="w-full space-y-4 lg:w-72">
          {feedback ? (
            <div
              className={`rounded-lg px-4 py-3 text-sm ${
                feedback.is_correct ? 'animate-pop bg-baltic/25 text-baltic-light' : 'animate-shake bg-cherry/20 text-cherry-light'
              }`}
            >
              <span className="font-semibold">
                {feedback.timed_out ? "Time's up!" : feedback.is_correct ? 'Correct!' : 'Not quite.'}{' '}
                <span className="font-mono">
                  {feedback.points_awarded >= 0 ? '+' : ''}
                  {feedback.points_awarded}
                </span>
              </span>{' '}
              {feedback.explanation}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-white/10 px-4 py-3 text-sm text-porcelain/40">
              Pick an answer before it falls — faster answers score more (up to {question.point_value} pts).
            </p>
          )}

          <div>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-porcelain/40">Live leaderboard</h2>
            <Leaderboard entries={leaderboard} limit={5} />
          </div>
        </div>
      </main>
    </div>
  )
}

// A fresh instance (via the `key={question.question_id}` the parent gives it)
// for every question. It starts as far down as the server's timer already is
// — so a refresh doesn't buy a head start — and lands on the bottom bar when
// time runs out.
function FallingCard({ question, durationMs }: { question: MyQuestion; durationMs: number }) {
  const [fallen, setFallen] = useState(false)
  const startTop = 4 + 78 * (1 - question.time_remaining_ms / durationMs)

  useEffect(() => {
    const raf = requestAnimationFrame(() => setFallen(true))
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div
      className="absolute left-1/2 w-[90%] -translate-x-1/2 rounded-xl border border-white/10 bg-[#13131d] p-5 text-center shadow-xl"
      style={{
        top: fallen ? '82%' : `${startTop}%`,
        transition: fallen ? `top ${question.time_remaining_ms}ms linear` : 'none',
      }}
    >
      <p className="text-xs uppercase tracking-wide text-porcelain/40">
        {question.difficulty} · {question.point_value} pts
      </p>
      <p className="mt-2 text-lg font-semibold">{question.question_text}</p>
    </div>
  )
}

function ordinal(rank: number) {
  const suffix = rank % 100 >= 11 && rank % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[rank % 10] ?? 'th')
  return `${rank}${suffix}`
}

function JoinLink() {
  return (
    <Link to="/signup?role=student" className="mt-4 inline-block text-sm underline">
      Join a session
    </Link>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-ink px-6 py-10 text-center text-porcelain">
      <div className="w-full max-w-lg">{children}</div>
    </div>
  )
}
