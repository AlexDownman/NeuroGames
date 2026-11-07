import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

interface SessionAnswerOption {
  id: string
  answer_text: string
}

interface SessionQuestion {
  question_id: string
  display_order: number
  question_text: string
  difficulty: string
  answer_options: SessionAnswerOption[]
}

// How long a question takes to "fall" to the bottom before it's too late.
// Reaching the bottom unanswered now counts as a wrong answer, same as the
// show treating a statement hitting the top bar as wrong.
const FALL_DURATION_MS = 9000

type Phase = 'loading' | 'playing' | 'feedback' | 'finished' | 'error'

interface Feedback {
  correct: boolean
  explanation: string
  selectedAnswerId: string | null
  timedOut: boolean
}

export default function AnswerRunPlayPage() {
  const { sessionCode } = useParams<{ sessionCode: string }>()
  const location = useLocation()
  const navState = location.state as { participantId?: string; sessionId?: string } | null

  const [phase, setPhase] = useState<Phase>('loading')
  const [errorMessage, setErrorMessage] = useState('')
  const [questions, setQuestions] = useState<SessionQuestion[]>([])
  const [index, setIndex] = useState(0)
  const [score, setScore] = useState(0)
  const [streak, setStreak] = useState(0)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const questionStartedAt = useRef(Date.now())
  const answeredRef = useRef(false)

  useEffect(() => {
    if (!navState?.participantId || !navState?.sessionId) {
      setPhase('error')
      setErrorMessage('Join a session first.')
      return
    }

    supabase
      .rpc('get_session_questions', { p_session_id: navState.sessionId })
      .then(({ data, error }) => {
        if (error) {
          console.error('get_session_questions failed:', error)
          setPhase('error')
          setErrorMessage('Something went wrong loading this session. Try rejoining.')
          return
        }
        if (!data || data.length === 0) {
          setPhase('error')
          setErrorMessage('No questions found for this session.')
          return
        }
        setQuestions(data as SessionQuestion[])
        setPhase('playing')
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (phase !== 'playing') return

    answeredRef.current = false
    questionStartedAt.current = Date.now()

    const timeout = setTimeout(() => {
      if (!answeredRef.current) answer(null)
    }, FALL_DURATION_MS)

    return () => clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, index])

  async function answer(answerId: string | null) {
    if (phase !== 'playing' || !navState?.participantId || answeredRef.current) return
    answeredRef.current = true

    const question = questions[index]
    const timeTakenMs = Date.now() - questionStartedAt.current

    const { data: raw, error } = await supabase
      .rpc('submit_answer', {
        p_participant_id: navState.participantId,
        p_question_id: question.question_id,
        p_selected_answer_id: answerId,
        p_time_taken_ms: timeTakenMs,
      })
      .single()
    const data = raw as { is_correct: boolean; explanation: string; score: number; current_streak: number } | null

    if (error || !data) {
      if (error) console.error('submit_answer failed:', error)
      setPhase('error')
      setErrorMessage('Something went wrong submitting that answer. Try rejoining.')
      return
    }

    setScore(data.score)
    setStreak(data.current_streak)
    setFeedback({
      correct: data.is_correct,
      explanation: data.explanation,
      selectedAnswerId: answerId,
      timedOut: answerId === null,
    })
    setPhase('feedback')

    setTimeout(() => {
      if (index + 1 < questions.length) {
        setIndex((value) => value + 1)
        setFeedback(null)
        setPhase('playing')
      } else {
        setPhase('finished')
      }
    }, 1800)
  }

  if (phase === 'error') {
    return (
      <Centered>
        <p className="text-cherry-light">{errorMessage}</p>
        <Link to="/signup?role=student" className="mt-4 inline-block text-sm underline">
          Join a session
        </Link>
      </Centered>
    )
  }

  if (phase === 'loading') {
    return <Centered>Loading your run…</Centered>
  }

  if (phase === 'finished') {
    return (
      <Centered>
        <p className="text-5xl">🏁</p>
        <h1 className="mt-4 text-2xl font-bold">Run complete!</h1>
        <p className="mt-2 text-porcelain/70">
          Final score: <span className="font-mono text-xl text-baltic-light">{score}</span>
        </p>
        {streak >= 3 && <p className="mt-1 text-sm text-cherry-light">🔥 Best streak: {streak} in a row</p>}
        <Link to="/" className="mt-6 inline-block rounded-lg bg-baltic px-5 py-2.5 text-sm font-semibold hover:bg-baltic-light">
          Back to home
        </Link>
      </Centered>
    )
  }

  const question = questions[index]

  return (
    <div className="flex min-h-screen flex-col bg-ink text-porcelain">
      <header className="flex items-center justify-between px-6 py-4">
        <span className="font-mono text-sm text-porcelain/50">Session {sessionCode}</span>
        <div className="flex items-center gap-4 text-sm">
          {streak >= 2 && <span className="text-cherry-light">🔥 {streak} streak</span>}
          <span className="font-mono text-lg text-baltic-light">{score} pts</span>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 pb-8 lg:flex-row">
        <div className="flex flex-1 flex-col gap-6">
          <div className="relative min-h-[50vh] flex-1 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] lg:min-h-0">
            <FallingCard key={question.question_id} question={question} fallDurationMs={FALL_DURATION_MS} />
            <div className="absolute inset-x-0 bottom-0 h-1 bg-cherry/60" />
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {question.answer_options.map((option) => {
              const isCorrectOption = feedback !== null && feedback.correct && option.id === feedback.selectedAnswerId
              const isWrongSelection =
                feedback !== null && !feedback.correct && !feedback.timedOut && option.id === feedback.selectedAnswerId
              const colorClasses = isCorrectOption
                ? 'border-emerald-500/60 bg-emerald-500/20 text-emerald-300'
                : isWrongSelection
                  ? 'border-red-500/60 bg-red-500/20 text-red-300'
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

        <div className="w-full lg:w-72">
          {feedback ? (
            <div
              key={index}
              className={`rounded-lg px-4 py-3 text-sm ${
                feedback.correct
                  ? 'animate-pop bg-emerald-500/20 text-emerald-300'
                  : 'animate-shake bg-red-500/20 text-red-300'
              }`}
            >
              <span className="font-semibold">
                {feedback.timedOut ? "Time's up!" : feedback.correct ? 'Correct!' : 'Not quite.'}
              </span>{' '}
              {feedback.explanation}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-white/10 px-4 py-3 text-sm text-porcelain/40">
              Pick an answer before it falls.
            </p>
          )}
        </div>
      </main>
    </div>
  )
}

// A fresh instance (via the `key={question.question_id}` the parent gives it)
// for every question, so `fallen` always starts false on a clean mount —
// no stale position carried over from the previous question's card.
function FallingCard({ question, fallDurationMs }: { question: SessionQuestion; fallDurationMs: number }) {
  const [fallen, setFallen] = useState(false)

  useEffect(() => {
    const raf = requestAnimationFrame(() => setFallen(true))
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div
      className="absolute left-1/2 w-[90%] -translate-x-1/2 rounded-xl border border-white/10 bg-[#13131d] p-5 text-center shadow-xl"
      style={{
        top: fallen ? '82%' : '4%',
        transition: `top ${fallDurationMs}ms linear`,
      }}
    >
      <p className="text-xs uppercase tracking-wide text-porcelain/40">{question.difficulty}</p>
      <p className="mt-2 text-lg font-semibold">{question.question_text}</p>
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
