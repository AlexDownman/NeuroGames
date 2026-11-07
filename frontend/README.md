# NeuroGames frontend

React 19 + TypeScript + Vite + Tailwind 4. See the [root README](../README.md) for setup.

```bash
npm ci
npm run dev      # http://localhost:5173
npm run build    # tsc -b && vite build
npm run lint     # oxlint
```

- **Auth** — Supabase Auth via `src/lib/supabaseClient.ts`; session state in
  `src/lib/AuthContext.tsx`, read with `useAuth()` from `src/lib/auth.ts`.
  Teachers sign up with email; students use anonymous sign-ins
  (`isTeacher` is false for them).
- **Students** join with `join_game_session` (a Supabase RPC, see
  `database/schema.sql`). Anonymous Sign-Ins must be enabled in the Supabase
  project for this to work.
