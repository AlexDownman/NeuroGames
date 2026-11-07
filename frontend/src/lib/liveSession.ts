import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabaseClient'

// Shapes of what the gameplay RPCs return (see database/schema.sql). The host
// opens the lobby and starts the game; after that each player works through
// the questions at their own pace while the session leaderboard updates live.

export interface SessionAnswerOption {
  id: string
  answer_text: string
}

export interface MyQuestion {
  question_id: string
  question_index: number
  question_text: string
  difficulty: string
  point_value: number
  time_remaining_ms: number
  answer_options: SessionAnswerOption[]
}

export interface AnswerResult {
  is_correct: boolean
  timed_out: boolean
  correct_answer_ids: string[]
  explanation: string | null
  points_awarded: number
  score: number
  current_streak: number
  finished: boolean
}

export interface SessionMe {
  participant_id: string
  display_name: string
  score: number
  current_streak: number
  questions_answered: number
  finished: boolean
}

export interface SessionState {
  session_id: string
  session_code: string
  status: 'pending' | 'active' | 'ended'
  question_count: number
  question_duration_ms: number
  participant_count: number
  finished_count: number
  is_host: boolean
  me: SessionMe | null
}

export interface LeaderboardEntry {
  rank: number
  participant_id: string
  display_name: string
  score: number
  correct_answers: number
  questions_answered: number
  total_time_ms: number
  is_me: boolean
}

// Fallback for when a Realtime event is missed (or Realtime isn't enabled).
// Players only receive Realtime events for their own row, so this is also
// what keeps their view of everyone else's scores moving.
const POLL_INTERVAL_MS = 3000

export function useLiveSession(sessionId: string | undefined) {
  const [state, setState] = useState<SessionState | null>(null)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [error, setError] = useState('')
  // Bursts of Realtime events (a whole class answering at once) collapse
  // into at most one request in flight plus one queued behind it.
  const inFlight = useRef(false)
  const queued = useRef(false)

  const refresh = useCallback(async () => {
    if (!sessionId) return
    if (inFlight.current) {
      queued.current = true
      return
    }
    inFlight.current = true

    do {
      queued.current = false
      const [stateRes, leaderboardRes] = await Promise.all([
        supabase.rpc('get_session_state', { p_session_id: sessionId }),
        supabase.rpc('get_session_leaderboard', { p_session_id: sessionId }),
      ])

      if (stateRes.error) {
        console.error('get_session_state failed:', stateRes.error)
        setError("Couldn't load this session. Try rejoining.")
      } else {
        setState(stateRes.data as SessionState)
        setError('')
      }
      if (!leaderboardRes.error) setLeaderboard((leaderboardRes.data ?? []) as LeaderboardEntry[])
    } while (queued.current)

    inFlight.current = false
  }, [sessionId])

  useEffect(() => {
    if (!sessionId) return
    void refresh()

    const onChange = () => void refresh()
    // RLS decides which rows each viewer receives: the host sees every
    // participant, a player only their own.
    const channel = supabase
      .channel(`session-${sessionId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_sessions', filter: `id=eq.${sessionId}` }, onChange)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'session_participants', filter: `session_id=eq.${sessionId}` },
        onChange,
      )
      .subscribe()

    const poll = setInterval(onChange, POLL_INTERVAL_MS)

    return () => {
      clearInterval(poll)
      void supabase.removeChannel(channel)
    }
  }, [sessionId, refresh])

  return { state, leaderboard, error, refresh, setState }
}
