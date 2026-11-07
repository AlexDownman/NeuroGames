# NeuroGames

AI-powered platform for lecturers to turn their teaching materials into playable educational games.

## Architecture

- **Backend** — Java 25 / Spring Boot 4, in [`backend/`](backend). REST API over collections, questions and games.
- **Database** — Supabase (Postgres). Schema, RLS policies and gameplay RPCs live in [`database/schema.sql`](database/schema.sql).
- **Auth** — Supabase Auth owns identity. The backend never issues its own tokens; it verifies the Supabase-issued JWT against the project's JWKS on every request, and grants a `TEACHER` role only to callers who have a `lecturers` row (`/api/**` requires it: 401 without a valid token, 403 for students). The frontend sends the teacher's Supabase access token via `frontend/src/lib/api.ts` (see `backend/src/main/java/com/neurogames/auth`). Students play via Supabase anonymous sign-ins and the gameplay RPCs in the schema, not through this backend.
- **Frontend** — React 19 + TypeScript + Vite, in [`frontend/`](frontend). Talks to Supabase directly (auth, gameplay RPCs); not yet wired to the backend API.

## Running the backend locally

1. Create a Supabase project, then run [`database/schema.sql`](database/schema.sql) once in its SQL Editor. Enable **Anonymous Sign-Ins** (Authentication -> Sign In / Providers) so students can join games.
   - A project created from an older `schema.sql` instead needs the files in [`database/migrations/`](database/migrations), in order.
2. Copy `backend/.env.example` to `backend/.env` (or export the same variables) with values from the Supabase dashboard (Project Settings -> Database / API).
3. From `backend/`:

   ```bash
   ./mvnw spring-boot:run
   ```

Lecturer registration/login happens through Supabase Auth directly (not through this backend) — the frontend will call the Supabase client SDK for that, then send the resulting access token as a `Bearer` header to this API.

## Running the frontend locally

1. Copy `frontend/.env.example` to `frontend/.env` and fill in the project URL and publishable (anon) key from the Supabase dashboard (Project Settings -> API).
2. From `frontend/`:

   ```bash
   npm ci
   npm run dev      # http://localhost:5173
   ```

`npm run build` type-checks and bundles; `npm run lint` runs oxlint.
