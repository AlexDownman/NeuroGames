import { Link } from 'react-router-dom'
import Navbar from '../components/Navbar'
import HeroPreview from '../components/HeroPreview'

const STEPS = [
  {
    number: '01',
    title: 'Upload your materials',
    description:
      'Drop in lecture slides, PDFs or notes. NeuroGames extracts the concepts, terms and facts worth testing.',
  },
  {
    number: '02',
    title: 'Agents build the game',
    description:
      'A team of AI agents turns that content into grounded questions, then hands them off to a game-specific agent to build the match.',
  },
  {
    number: '03',
    title: 'Compete with friends',
    description:
      'Publish a session, share the code, and watch the leaderboard move in real time as your class plays.',
  },
]

const GAME_MODES = [
  { emoji: '🏃', title: 'Answer Run', description: 'Endless runner — correct answers keep you moving.' },
  { emoji: '⚔️', title: 'Quiz Battle', description: 'Head-to-head quiz with live leaderboards.' },
  { emoji: '🧩', title: 'Match-Up', description: 'Pair terms with definitions against the clock.' },
  { emoji: '💰', title: 'Millionaire-Style', description: 'Escalating difficulty, with lifelines to spare you.' },
  { emoji: '🔤', title: 'Word Scramble', description: 'Unscramble key terms pulled from your materials.' },
  { emoji: '🚪', title: 'Escape Room', description: 'Chain challenges together to unlock the next stage.' },
]

const SUBJECTS = [
  'Java Programming',
  'Database Systems',
  'Computer Networking',
  'Software Engineering',
  'Data Structures',
  'Operating Systems',
]

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-ink text-porcelain">
      {/* Hero */}
      <div className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-[640px]"
          style={{
            background:
              'radial-gradient(60% 50% at 50% 0%, rgba(126,25,70,0.45) 0%, rgba(12,98,145,0.18) 45%, rgba(0,0,4,0) 80%)',
          }}
        />

        <Navbar />

        <main className="relative px-6 pb-24 pt-16 text-center md:pt-24">
          <h1 className="mx-auto max-w-3xl text-5xl font-extrabold leading-[1.05] tracking-tight md:text-7xl">
            Meet your AI game masters.
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg text-porcelain/70">
            NeuroGames turns lecture materials into playable game series — quizzes, battles, escape
            rooms — built by a team of AI agents. Create a collection, publish a game, and compete
            with your friends.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              to="/signup"
              className="rounded-lg bg-baltic px-6 py-3 text-sm font-semibold text-porcelain shadow-lg shadow-baltic/30 transition hover:bg-baltic-light"
            >
              Get Started free
            </Link>
            <a
              href="#how-it-works"
              className="rounded-lg border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold text-porcelain transition hover:bg-white/10"
            >
              See how it works
            </a>
          </div>

          <div className="mt-16">
            <HeroPreview />
          </div>
        </main>
      </div>

      {/* How it works */}
      <section id="how-it-works" className="bg-porcelain px-6 py-24 text-ink">
        <div className="mx-auto max-w-5xl">
          <p className="text-center text-sm font-semibold uppercase tracking-widest text-baltic">
            How it works
          </p>
          <h2 className="mt-3 text-center text-3xl font-bold tracking-tight md:text-4xl">
            From slides to scoreboard in three steps.
          </h2>

          <div className="mt-14 grid grid-cols-1 gap-10 md:grid-cols-3">
            {STEPS.map((step) => (
              <div key={step.number}>
                <span className="text-sm font-bold text-cherry">{step.number}</span>
                <h3 className="mt-2 text-lg font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink/60">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Game modes */}
      <section id="game-modes" className="bg-ink px-6 py-24">
        <div className="mx-auto max-w-5xl">
          <p className="text-center text-sm font-semibold uppercase tracking-widest text-baltic-light">
            Game modes
          </p>
          <h2 className="mt-3 text-center text-3xl font-bold tracking-tight md:text-4xl">
            One question bank. Six ways to play.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-porcelain/60">
            Every game mode draws from the same AI-generated question bank, so your content never
            goes to waste.
          </p>

          <div className="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {GAME_MODES.map((mode) => (
              <div
                key={mode.title}
                className="rounded-xl border border-white/10 bg-white/5 p-5 transition hover:border-white/20 hover:bg-white/[0.07]"
              >
                <span className="text-2xl">{mode.emoji}</span>
                <h3 className="mt-3 font-semibold">{mode.title}</h3>
                <p className="mt-1 text-sm text-porcelain/60">{mode.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Subjects */}
      <section id="subjects" className="bg-porcelain px-6 py-20 text-ink">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="text-2xl font-bold tracking-tight md:text-3xl">
            Works with whatever you're teaching.
          </h2>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {SUBJECTS.map((subject) => (
              <span
                key={subject}
                className="rounded-full border border-ink/10 bg-ink/5 px-4 py-2 text-sm font-medium text-ink/70"
              >
                {subject}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section
        className="px-6 py-24 text-center"
        style={{ background: 'linear-gradient(135deg, #7e1946 0%, #a63446 60%, #0c6291 140%)' }}
      >
        <h2 className="text-3xl font-bold tracking-tight text-porcelain md:text-4xl">
          Ready to turn your class into a competition?
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-porcelain/80">
          Create your free account as a teacher or a student and get your first game live today.
        </p>
        <Link
          to="/signup"
          className="mt-8 inline-block rounded-lg bg-porcelain px-6 py-3 text-sm font-semibold text-ink shadow-lg transition hover:bg-white"
        >
          Get Started free
        </Link>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 bg-ink px-6 py-10 text-sm text-porcelain/50">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 sm:flex-row">
          <span>© {new Date().getFullYear()} NeuroGames</span>
          <div className="flex gap-6">
            <a href="#how-it-works" className="hover:text-porcelain">
              How it works
            </a>
            <a href="#game-modes" className="hover:text-porcelain">
              Game modes
            </a>
            <Link to="/signup" className="hover:text-porcelain">
              Get Started
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
