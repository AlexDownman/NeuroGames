import type { LeaderboardEntry } from '../lib/liveSession'

// Top `limit` rows, plus the viewer's own row underneath if they're further
// down. With `questionCount`, each row also shows how far that player has got.
export function Leaderboard({
  entries,
  limit = 5,
  questionCount,
}: {
  entries: LeaderboardEntry[]
  limit?: number
  questionCount?: number
}) {
  const top = entries.slice(0, limit)
  const me = entries.find((entry) => entry.is_me)
  const showMeBelow = me !== undefined && !top.includes(me)

  if (entries.length === 0) {
    return <p className="text-sm text-porcelain/40">No players yet.</p>
  }

  return (
    <ol className="space-y-1.5">
      {top.map((entry) => (
        <LeaderboardRow key={entry.participant_id} entry={entry} questionCount={questionCount} />
      ))}
      {showMeBelow && (
        <>
          <li className="text-center text-xs text-porcelain/30">⋯</li>
          <LeaderboardRow entry={me} questionCount={questionCount} />
        </>
      )}
    </ol>
  )
}

function LeaderboardRow({ entry, questionCount }: { entry: LeaderboardEntry; questionCount?: number }) {
  return (
    <li
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all ${
        entry.is_me ? 'bg-baltic/30 ring-1 ring-baltic-light' : 'bg-white/5'
      }`}
    >
      <span className="w-6 text-right font-mono text-porcelain/50">{entry.rank}</span>
      <span className="flex-1 truncate font-medium">
        {entry.display_name}
        {entry.is_me && <span className="ml-1.5 text-xs text-baltic-light">(you)</span>}
      </span>
      {questionCount !== undefined && (
        <span className="font-mono text-xs text-porcelain/50">
          {entry.questions_answered >= questionCount ? '🏁' : `${entry.questions_answered}/${questionCount}`}
        </span>
      )}
      <span className="font-mono text-baltic-light">{entry.score}</span>
    </li>
  )
}

const PODIUM = [
  { place: 2, medal: '🥈', height: 'h-24' },
  { place: 1, medal: '🥇', height: 'h-32' },
  { place: 3, medal: '🥉', height: 'h-16' },
]

// Top three by position (not rank value), so ties still fill all three steps.
export function Podium({ entries }: { entries: LeaderboardEntry[] }) {
  return (
    <div className="flex items-end justify-center gap-3">
      {PODIUM.map(({ place, medal, height }) => {
        const entry = entries[place - 1]
        if (!entry) return <div key={place} className="w-28" />
        return (
          <div key={place} className="flex w-28 flex-col items-center">
            <span className="text-3xl">{medal}</span>
            <span className={`mt-1 w-full truncate text-center text-sm font-semibold ${entry.is_me ? 'text-baltic-light' : ''}`}>
              {entry.display_name}
            </span>
            <span className="font-mono text-xs text-porcelain/60">{entry.score} pts</span>
            <div
              className={`mt-2 flex w-full items-start justify-center rounded-t-lg bg-white/10 pt-2 text-lg font-bold ${height}`}
            >
              {place}
            </div>
          </div>
        )
      })}
    </div>
  )
}
