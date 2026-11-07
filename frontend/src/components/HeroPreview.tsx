const GAMES = [
  { title: 'Quiz Battle: OOP Basics', status: 'Live', score: '142 playing' },
  { title: 'Answer Run: SQL Joins', status: 'Draft', score: '—' },
  { title: 'Quiz Battle: Networking', status: 'Live', score: '87 playing' },
]

const LEADERBOARD = [
  { name: 'Mia R.', points: 980 },
  { name: 'Jordan T.', points: 915 },
  { name: 'Priya K.', points: 860 },
]

export default function HeroPreview() {
  return (
    <div className="mx-auto w-full max-w-4xl overflow-hidden rounded-2xl border border-white/10 bg-[#0c0c14] shadow-2xl shadow-black/60">
      <div className="flex items-center gap-2 border-b border-white/10 bg-white/5 px-4 py-3">
        <span className="h-3 w-3 rounded-full bg-cherry" />
        <span className="h-3 w-3 rounded-full bg-amber-400" />
        <span className="h-3 w-3 rounded-full bg-emerald-400" />
        <span className="ml-3 text-xs font-medium text-porcelain/50">
          Database Systems — Collection
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_1.4fr]">
        <div className="border-r border-white/10 p-5">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-porcelain/40">
            Games
          </p>
          <ul className="space-y-2">
            {GAMES.map((game) => (
              <li
                key={game.title}
                className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-sm"
              >
                <span className="text-porcelain/90">{game.title}</span>
                <span
                  className={
                    game.status === 'Live'
                      ? 'rounded-full bg-baltic/20 px-2 py-0.5 text-xs font-medium text-baltic-light'
                      : 'rounded-full bg-white/10 px-2 py-0.5 text-xs font-medium text-porcelain/50'
                  }
                >
                  {game.status}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="p-5">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-porcelain/40">
            Leaderboard — Quiz Battle: OOP Basics
          </p>
          <ul className="space-y-2">
            {LEADERBOARD.map((entry, index) => (
              <li
                key={entry.name}
                className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-sm"
              >
                <span className="flex items-center gap-3 text-porcelain/90">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-cherry/80 text-[11px] font-bold text-porcelain">
                    {index + 1}
                  </span>
                  {entry.name}
                </span>
                <span className="font-mono text-xs text-porcelain/60">{entry.points} pts</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
