import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase, type AccountRole } from '../lib/supabaseClient'
import Logo from '../components/Logo'

const ROLES: Array<{
  id: AccountRole
  title: string
  description: string
  emoji: string
}> = [
  {
    id: 'teacher',
    title: "I'm a Teacher",
    description: 'Create collections, generate games from your materials, and track results.',
    emoji: '🎓',
  },
  {
    id: 'student',
    title: "I'm a Student",
    description: 'Enter a session code and your name — no email needed to play.',
    emoji: '🎮',
  },
]

type Status = 'idle' | 'submitting' | 'success' | 'error'

export default function SignupPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  // /signup?role=student (linked from the login page) skips the role picker.
  const [role, setRole] = useState<AccountRole | null>(
    searchParams.get('role') === 'student' ? 'student' : null,
  )
  const [status, setStatus] = useState<Status>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  // Teacher fields
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  // Student fields
  const [displayName, setDisplayName] = useState('')
  const [sessionCode, setSessionCode] = useState('')

  function reset() {
    setRole(null)
    setStatus('idle')
    setErrorMessage('')
  }

  async function handleTeacherSubmit(event: FormEvent) {
    event.preventDefault()
    setStatus('submitting')
    setErrorMessage('')

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, role: 'teacher' } },
    })

    if (error) {
      setStatus('error')
      setErrorMessage(error.message)
      return
    }

    // With email confirmation off, Supabase signs the teacher straight in.
    if (data.session) {
      navigate('/dashboard')
      return
    }

    setStatus('success')
  }

  async function handleStudentSubmit(event: FormEvent) {
    event.preventDefault()

    // `required` accepts whitespace-only input; the DB would reject it anyway.
    if (!displayName.trim()) {
      setStatus('error')
      setErrorMessage('Enter a name for the leaderboard.')
      return
    }

    setStatus('submitting')
    setErrorMessage('')

    // Reuse an existing session: signInAnonymously() always creates a new
    // user, so calling it on every submit (e.g. retrying a mistyped code)
    // left orphaned users and gave a re-joining student a new participant.
    const { data: existing } = await supabase.auth.getSession()
    if (!existing.session) {
      const { error: signInError } = await supabase.auth.signInAnonymously()
      if (signInError) {
        setStatus('error')
        setErrorMessage(signInError.message)
        return
      }
    }

    const { error: joinError } = await supabase.rpc('join_game_session', {
      p_session_code: sessionCode.trim().toUpperCase(),
      p_display_name: displayName.trim(),
    })

    if (joinError) {
      setStatus('error')
      setErrorMessage(joinError.message)
      return
    }

    setStatus('success')
  }

  return (
    <div className="flex min-h-screen flex-col bg-ink text-porcelain">
      <header className="px-6 py-5 md:px-12">
        <Link to="/" className="flex w-fit items-center gap-2 text-lg font-bold tracking-tight">
          <Logo className="h-9 w-9" />
          NeuroGames
        </Link>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 pb-16">
        <div className="w-full max-w-md">
          {status === 'success' ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
              <p className="text-2xl">✅</p>
              {/* Teachers only land here when email confirmation is on (otherwise
                  handleTeacherSubmit goes straight to the dashboard). */}
              {role === 'teacher' ? (
                <>
                  <h1 className="mt-3 text-xl font-bold">Check your email</h1>
                  <p className="mt-2 text-sm text-porcelain/60">
                    We sent a confirmation link to <span className="text-porcelain">{email}</span>.
                    Follow it to finish setting up your teacher account.
                  </p>
                </>
              ) : (
                <>
                  <h1 className="mt-3 text-xl font-bold">You're in, {displayName}!</h1>
                  <p className="mt-2 text-sm text-porcelain/60">
                    You've joined session <span className="text-porcelain">{sessionCode.toUpperCase()}</span>.
                    The game view is coming soon — for now, ask your teacher what's next.
                  </p>
                </>
              )}
              <Link
                to="/"
                className="mt-6 inline-block rounded-lg bg-baltic px-5 py-2.5 text-sm font-semibold hover:bg-baltic-light"
              >
                Back to home
              </Link>
            </div>
          ) : !role ? (
            <>
              <h1 className="text-center text-2xl font-bold tracking-tight">Get started</h1>
              <p className="mt-2 text-center text-sm text-porcelain/60">
                Teachers create an account. Students just join with a code.
              </p>

              <div className="mt-8 space-y-3">
                {ROLES.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setRole(option.id)}
                    className="flex w-full items-start gap-4 rounded-xl border border-white/10 bg-white/5 p-5 text-left transition hover:border-baltic/60 hover:bg-white/[0.08]"
                  >
                    <span className="text-2xl">{option.emoji}</span>
                    <span>
                      <span className="block font-semibold">{option.title}</span>
                      <span className="mt-1 block text-sm text-porcelain/60">
                        {option.description}
                      </span>
                    </span>
                  </button>
                ))}
              </div>

              <p className="mt-6 text-center text-sm text-porcelain/50">
                Already have a teacher account?{' '}
                <Link to="/login" className="font-medium text-porcelain hover:underline">
                  Log in
                </Link>
              </p>
            </>
          ) : role === 'teacher' ? (
            <>
              <button
                type="button"
                onClick={reset}
                className="mb-6 text-sm font-medium text-porcelain/60 hover:text-porcelain"
              >
                ← Back
              </button>

              <h1 className="text-2xl font-bold tracking-tight">Teacher account</h1>
              <p className="mt-2 text-sm text-porcelain/60">
                Set up your login — you'll create your first collection next.
              </p>

              <form onSubmit={handleTeacherSubmit} className="mt-8 space-y-4">
                <div>
                  <label htmlFor="signup-full-name" className="mb-1.5 block text-sm font-medium text-porcelain/80">
                    Full name
                  </label>
                  <input
                    id="signup-full-name"
                    required
                    type="text"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm outline-none transition focus:border-baltic"
                    placeholder="Alex Morgan"
                  />
                </div>

                <div>
                  <label htmlFor="signup-email" className="mb-1.5 block text-sm font-medium text-porcelain/80">Email</label>
                  <input
                    id="signup-email"
                    required
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm outline-none transition focus:border-baltic"
                    placeholder="you@example.com"
                  />
                </div>

                <div>
                  <label htmlFor="signup-password" className="mb-1.5 block text-sm font-medium text-porcelain/80">
                    Password
                  </label>
                  <input
                    id="signup-password"
                    required
                    minLength={8}
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm outline-none transition focus:border-baltic"
                    placeholder="At least 8 characters"
                  />
                </div>

                {status === 'error' && (
                  <p className="rounded-lg bg-cherry/10 px-3.5 py-2.5 text-sm text-cherry-light">
                    {errorMessage}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={status === 'submitting'}
                  className="w-full rounded-lg bg-baltic px-4 py-2.5 text-sm font-semibold text-porcelain transition hover:bg-baltic-light disabled:opacity-60"
                >
                  {status === 'submitting' ? 'Creating account…' : 'Create account'}
                </button>
              </form>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={reset}
                className="mb-6 text-sm font-medium text-porcelain/60 hover:text-porcelain"
              >
                ← Back
              </button>

              <h1 className="text-2xl font-bold tracking-tight">Join a game</h1>
              <p className="mt-2 text-sm text-porcelain/60">
                No account needed — just the code your teacher shared and a name for the
                leaderboard.
              </p>

              <form onSubmit={handleStudentSubmit} className="mt-8 space-y-4">
                <div>
                  <label htmlFor="join-session-code" className="mb-1.5 block text-sm font-medium text-porcelain/80">
                    Session code
                  </label>
                  <input
                    id="join-session-code"
                    required
                    type="text"
                    value={sessionCode}
                    onChange={(event) => setSessionCode(event.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3.5 py-2.5 text-center font-mono text-lg uppercase tracking-[0.3em] outline-none transition focus:border-baltic"
                    placeholder="ABCD12"
                    maxLength={12}
                  />
                </div>

                <div>
                  <label htmlFor="join-display-name" className="mb-1.5 block text-sm font-medium text-porcelain/80">
                    Your name
                  </label>
                  <input
                    id="join-display-name"
                    required
                    type="text"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm outline-none transition focus:border-baltic"
                    placeholder="Shown on the leaderboard"
                    maxLength={40}
                  />
                </div>

                {status === 'error' && (
                  <p className="rounded-lg bg-cherry/10 px-3.5 py-2.5 text-sm text-cherry-light">
                    {errorMessage}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={status === 'submitting'}
                  className="w-full rounded-lg bg-cherry px-4 py-2.5 text-sm font-semibold text-porcelain transition hover:bg-cherry-light disabled:opacity-60"
                >
                  {status === 'submitting' ? 'Joining…' : 'Join game'}
                </button>
              </form>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
