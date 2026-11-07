import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

// What get_session_summary returns once a session has ended (see
// database/schema.sql). Rule-based: a topic under 60% correct needs revision,
// 80%+ is a strength. The host gets `class` and every player; a student gets
// only their own player entry.

interface TopicStat {
  topic_name: string
  topic_description: string | null
  correct: number
  answered: number
  accuracy: number
}

interface ClassTopicStat extends TopicStat {
  needs_revision: boolean
}

interface QuestionStat {
  question_text: string
  topic_name: string
  correct_answer: string | null
  explanation: string | null
  correct: number
  answered: number
  accuracy: number | null
}

interface MissedQuestion {
  question_text: string
  topic_name: string
  correct_answer: string | null
  explanation: string | null
  timed_out: boolean
}

export interface PlayerSummary {
  participant_id: string
  display_name: string
  rank: number
  score: number
  correct_answers: number
  questions_answered: number
  accuracy: number | null
  is_me: boolean
  weak_topics: TopicStat[]
  strong_topics: string[]
  missed: MissedQuestion[]
}

interface ClassSummary {
  participant_count: number
  average_score: number | null
  accuracy: number | null
  topics: ClassTopicStat[]
  questions: QuestionStat[]
}

interface Summary {
  class: ClassSummary | null
  players: PlayerSummary[]
}

function useSessionSummary(sessionId: string) {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.rpc('get_session_summary', { p_session_id: sessionId }).then(({ data, error: rpcError }) => {
      if (rpcError) {
        console.error('get_session_summary failed:', rpcError)
        setError("Couldn't load the session summary.")
        return
      }
      setSummary(data as Summary)
    })
  }, [sessionId])

  return { summary, error }
}

// Host view: where the class as a whole struggled, then each player.
export function HostSessionSummary({ sessionId }: { sessionId: string }) {
  const { summary, error } = useSessionSummary(sessionId)

  if (error) return <p className="text-sm text-cherry-light">{error}</p>
  if (!summary?.class) return <p className="text-sm text-porcelain/40">Building the session summary…</p>

  const cls = summary.class
  const revise = cls.topics.filter((topic) => topic.needs_revision)
  const struggling = summary.players.filter((player) => player.accuracy !== null && player.accuracy < 60)
  const hardest = cls.questions.filter((question) => question.accuracy !== null && question.accuracy < 100).slice(0, 5)

  return (
    <div className="w-full space-y-8 text-left">
      <div className="grid grid-cols-3 gap-3 text-center">
        <Stat label="Players" value={cls.participant_count} />
        <Stat label="Class accuracy" value={cls.accuracy === null ? '—' : `${cls.accuracy}%`} />
        <Stat label="Average score" value={cls.average_score ?? '—'} />
      </div>

      <Card title="Recommended revision for the class">
        {revise.length === 0 ? (
          <p className="text-sm text-porcelain/60">No topic fell below 60% — the class has a good handle on this material.</p>
        ) : (
          <ul className="space-y-2">
            {revise.map((topic) => (
              <li key={topic.topic_name} className="rounded-lg bg-cherry/15 px-3 py-2 text-sm">
                <span className="font-semibold text-cherry-light">{topic.topic_name}</span>
                <span className="text-porcelain/60"> — {topic.accuracy}% correct</span>
                {topic.topic_description && <p className="mt-0.5 text-porcelain/60">{topic.topic_description}</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Accuracy by topic">
        <ul className="space-y-2">
          {cls.topics.map((topic) => (
            <li key={topic.topic_name} className="text-sm">
              <div className="flex justify-between">
                <span>{topic.topic_name}</span>
                <span className="font-mono text-porcelain/60">
                  {topic.correct}/{topic.answered} · {topic.accuracy}%
                </span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className={`h-full rounded-full ${topic.needs_revision ? 'bg-cherry' : 'bg-baltic'}`}
                  style={{ width: `${topic.accuracy}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {hardest.length > 0 && (
        <Card title="Hardest questions">
          <ul className="space-y-3">
            {hardest.map((question) => (
              <li key={question.question_text} className="text-sm">
                <p className="font-medium">
                  {question.question_text}{' '}
                  <span className="font-mono text-xs text-cherry-light">{question.accuracy}% correct</span>
                </p>
                <p className="text-porcelain/60">
                  Answer: <span className="text-porcelain">{question.correct_answer}</span>
                  {question.explanation && <> — {question.explanation}</>}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title={struggling.length > 0 ? `Players who may need support (${struggling.length})` : 'Players'}>
        <ul className="space-y-2">
          {[...struggling, ...summary.players.filter((player) => !struggling.includes(player))].map((player) => (
            <li key={player.participant_id}>
              <details className="rounded-lg bg-white/5 px-3 py-2">
                <summary className="flex cursor-pointer items-center gap-3 text-sm">
                  <span className="w-6 text-right font-mono text-porcelain/50">{player.rank}</span>
                  <span className="flex-1 font-medium">{player.display_name}</span>
                  <span
                    className={`font-mono text-xs ${
                      player.accuracy !== null && player.accuracy < 60 ? 'text-cherry-light' : 'text-porcelain/60'
                    }`}
                  >
                    {player.correct_answers}/{player.questions_answered} correct
                  </span>
                  <span className="font-mono text-baltic-light">{player.score}</span>
                </summary>
                <div className="mt-3 pb-1">
                  <PlayerBreakdown player={player} />
                </div>
              </details>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}

// Student view: just their own struggles and revision plan.
export function MySessionSummary({ sessionId }: { sessionId: string }) {
  const { summary, error } = useSessionSummary(sessionId)
  const me = summary?.players[0]

  if (error) return <p className="text-sm text-cherry-light">{error}</p>
  if (!summary) return <p className="text-sm text-porcelain/40">Building your summary…</p>
  if (!me) return null

  return (
    <Card title="Your revision plan">
      <PlayerBreakdown player={me} />
    </Card>
  )
}

function PlayerBreakdown({ player }: { player: PlayerSummary }) {
  if (player.questions_answered === 0) {
    return <p className="text-sm text-porcelain/60">No questions answered this session.</p>
  }

  return (
    <div className="space-y-4 text-sm">
      {player.weak_topics.length > 0 ? (
        <div>
          <p className="mb-1.5 font-semibold">Revise these topics</p>
          <ul className="space-y-1.5">
            {player.weak_topics.map((topic) => (
              <li key={topic.topic_name} className="rounded-lg bg-cherry/15 px-3 py-2">
                <span className="font-semibold text-cherry-light">{topic.topic_name}</span>
                <span className="text-porcelain/60">
                  {' '}
                  — {topic.correct}/{topic.answered} correct
                </span>
                {topic.topic_description && <p className="mt-0.5 text-porcelain/60">{topic.topic_description}</p>}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-porcelain/70">No weak topics this time — nice work!</p>
      )}

      {player.strong_topics.length > 0 && (
        <p>
          <span className="font-semibold">Strengths: </span>
          {player.strong_topics.map((topic) => (
            <span key={topic} className="mr-1.5 inline-block rounded-full bg-baltic/25 px-2.5 py-0.5 text-xs text-baltic-light">
              {topic}
            </span>
          ))}
        </p>
      )}

      {player.missed.length > 0 && (
        <div>
          <p className="mb-1.5 font-semibold">Questions to look over</p>
          <ul className="space-y-2">
            {player.missed.map((question) => (
              <li key={question.question_text} className="rounded-lg border border-white/10 px-3 py-2">
                <p className="font-medium">
                  {question.question_text}
                  {question.timed_out && <span className="ml-1.5 text-xs text-porcelain/40">(ran out of time)</span>}
                </p>
                <p className="mt-0.5 text-porcelain/60">
                  Answer: <span className="text-porcelain">{question.correct_answer}</span>
                  {question.explanation && <> — {question.explanation}</>}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-porcelain/50">{title}</h2>
      {children}
    </section>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-white/5 px-3 py-3">
      <p className="font-mono text-2xl font-bold text-baltic-light">{value}</p>
      <p className="text-xs text-porcelain/50">{label}</p>
    </div>
  )
}
