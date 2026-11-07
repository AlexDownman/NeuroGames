import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import Logo from './Logo'

const LINKS = [
  { label: 'How it works', href: '#how-it-works' },
  { label: 'Game modes', href: '#game-modes' },
  { label: 'Subjects', href: '#subjects' },
]

export default function Navbar() {
  const { isTeacher } = useAuth()

  return (
    <header className="relative z-10 flex items-center justify-between px-6 py-5 md:px-12">
      <Link to="/" className="flex items-center gap-2 text-lg font-bold tracking-tight text-porcelain">
        <Logo className="h-9 w-9" />
        NeuroGames
      </Link>

      <nav className="hidden items-center gap-8 text-sm font-medium text-porcelain/70 md:flex">
        {LINKS.map((link) => (
          <a key={link.href} href={link.href} className="transition hover:text-porcelain">
            {link.label}
          </a>
        ))}
      </nav>

      <div className="flex items-center gap-3">
        {isTeacher ? (
          <Link
            to="/dashboard"
            className="rounded-lg bg-baltic px-4 py-2 text-sm font-semibold text-porcelain shadow-lg shadow-baltic/30 transition hover:bg-baltic-light"
          >
            Dashboard
          </Link>
        ) : (
          <>
            <Link
              to="/login"
              className="hidden text-sm font-medium text-porcelain/80 transition hover:text-porcelain sm:block"
            >
              Log in
            </Link>
            <Link
              to="/signup"
              className="rounded-lg bg-baltic px-4 py-2 text-sm font-semibold text-porcelain shadow-lg shadow-baltic/30 transition hover:bg-baltic-light"
            >
              Get Started
            </Link>
          </>
        )}
      </div>
    </header>
  )
}
