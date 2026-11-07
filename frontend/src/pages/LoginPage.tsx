import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

export default function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<'idle' | 'submitting' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setStatus('submitting')
    setErrorMessage('')

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setStatus('error')
      setErrorMessage(error.message)
      return
    }

    navigate('/dashboard')
  }

  return (
    <div className="flex min-h-screen flex-col bg-ink text-porcelain">
      <header className="px-6 py-5 md:px-12">
        <Link to="/" className="flex w-fit items-center gap-2 text-lg font-bold tracking-tight">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-baltic text-sm font-extrabold">
            N
          </span>
          NeuroGames
        </Link>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 pb-16">
        <div className="w-full max-w-md">
          <h1 className="text-center text-2xl font-bold tracking-tight">Welcome back</h1>
          <p className="mt-2 text-center text-sm text-porcelain/60">
            Log in to manage your collections and games.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <div>
              <label htmlFor="login-email" className="mb-1.5 block text-sm font-medium text-porcelain/80">Email</label>
              <input
                id="login-email"
                required
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm outline-none transition focus:border-baltic"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label htmlFor="login-password" className="mb-1.5 block text-sm font-medium text-porcelain/80">Password</label>
              <input
                id="login-password"
                required
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm outline-none transition focus:border-baltic"
                placeholder="Your password"
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
              {status === 'submitting' ? 'Logging in…' : 'Log in'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-porcelain/50">
            Don't have an account?{' '}
            <Link to="/signup" className="font-medium text-porcelain hover:underline">
              Get started
            </Link>
          </p>
          <p className="mt-2 text-center text-xs text-porcelain/40">
            Joining a game as a student? You don't need an account —{' '}
            <Link to="/signup?role=student" className="underline hover:text-porcelain/70">
              enter your session code here
            </Link>
            .
          </p>
        </div>
      </main>
    </div>
  )
}
