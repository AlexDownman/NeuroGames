# NeuroGames

AI-powered platform for lecturers to turn their teaching materials into playable educational games.

## Architecture

- **Backend** — Java 25 / Spring Boot 4, in [`backend/`](backend). REST API over collections, questions and games.
- **Database** — Supabase (Postgres). Schema, RLS policies and gameplay RPCs live in [`database/schema.sql`](database/schema.sql).
- **Auth** — Supabase Auth owns lecturer identity. The backend never issues its own tokens; it verifies the Supabase-issued JWT on every request (see `backend/src/main/java/com/neurogames/auth`).
- **Frontend** — not scaffolded yet (React + TypeScript planned).

## Running the backend locally

1. Create a Supabase project, then run [`database/schema.sql`](database/schema.sql) once in its SQL Editor.
2. Copy `backend/.env.example` to `backend/.env` (or export the same variables) with values from the Supabase dashboard (Project Settings -> Database / API).
3. From `backend/`:

   ```bash
   ./mvnw spring-boot:run
   ```

Lecturer registration/login happens through Supabase Auth directly (not through this backend) — the frontend will call the Supabase client SDK for that, then send the resulting access token as a `Bearer` header to this API.
