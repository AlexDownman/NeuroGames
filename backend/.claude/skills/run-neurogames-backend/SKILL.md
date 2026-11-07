---
name: run-neurogames-backend
description: Build, run, start, test, and drive the NeuroGames Spring Boot backend (REST API + Supabase schema/RLS/gameplay RPCs) locally with no Supabase credentials. Use when asked to run or start the backend, smoke-test or curl its API, mint a lecturer/student JWT, check the database schema or gameplay RPCs, or verify a backend or database/schema.sql change works.
---

Drive the backend with `.claude/skills/run-neurogames-backend/driver.mjs`. It
starts a fully local stand-in for Supabase — Postgres 17 in Docker (stub
`auth` schema + the real `database/schema.sql`) and a JWKS server with a fresh
ES256 key — then runs the built jar against it and mints tokens the backend
accepts exactly like Supabase-issued ones. No `.env`, no Supabase project.

All paths are relative to `backend/`.

## Prerequisites

Docker (running), Java 25, Node ≥ 18 (stdlib only, no `npm install`).

```bash
open -a Docker          # macOS; wait until `docker info` succeeds
java -version           # 25.x
node --version          # v22 verified
```

## Build

```bash
./mvnw package          # compiles, runs unit tests, writes target/backend-0.0.1-SNAPSHOT.jar
```

Plain `./mvnw` does the same (`defaultGoal` is `package`). The driver runs the
**jar**, so rebuild after every Java change or you are testing stale code.

## Run (agent path)

```bash
D=.claude/skills/run-neurogames-backend/driver.mjs
node $D up              # ~20s: Postgres :54322, JWKS :54399, backend :8080
node $D smoke           # HTTP checks: auth, CRUD, file upload + storage, error statuses; exit 1 on failure
node $D smoke-db        # 61 multiplayer gameplay RPC, summary, leaderboard + RLS checks, in a rolled-back transaction
node $D down            # stop backend + JWKS, delete the DB container
```

Poke it by hand while it's up:

```bash
node $D call POST /api/collections '{"name":"Neuro 101"}'      # as lecturer@example.com
node $D call GET /api/collections --as someone@example.com     # any email becomes a lecturer
node $D call GET /api/collections --anon                       # student token -> 403
node $D call GET /api/collections --no-auth                    # -> 401
curl -s -H "Authorization: Bearer $(node $D token)" http://127.0.0.1:8080/api/auth/me
node $D sql "select email, full_name from public.lecturers"
SID=$(node $D anon-token | jq -r .id)                          # {"id","token"}
node $D sql-as "$SID" "select * from public.join_game_session('NOPE','Sam');"   # RLS/RPCs as that user
node $D logs 80         # backend log tail (target/run-harness/backend.log)
node $D status
```

`up` recreates the database from `database/schema.sql` every time, so it's
also the fastest check that a schema edit applies cleanly to a fresh project
and still passes Hibernate's `ddl-auto: validate`. For new gameplay/RLS
behaviour, add checks to `gameplay-smoke.sql` (same `PASS`/`FAIL` notice style).

Ports can be moved with `HARNESS_APP_PORT`, `HARNESS_JWKS_PORT`,
`HARNESS_PG_PORT`; pass the same variable to every later driver command.

## Test

```bash
./mvnw test             # unit + MockMvc tests, no external services
```

`NeurogamesBackendApplicationTests.contextLoads` is skipped unless
`SUPABASE_DB_HOST` and `SUPABASE_URL` are exported (it needs a real database).

## Run (human path, real Supabase)

`./mvnw spring-boot:run` with `backend/.env` filled from `.env.example`.
Not verified by this skill (it needs the project's DB password).

## Gotchas

- **`application.yml` hard-codes `?sslmode=require`.** The local Postgres has
  no TLS, so the driver overrides the whole URL with `SPRING_DATASOURCE_URL`
  (`sslmode=disable`). Without it: `PSQLException: The server does not support SSL`.
- **A busy port hangs instead of failing on macOS.** Tomcat's wildcard bind
  succeeds even when another process owns `127.0.0.1:8080`, so the app
  "starts" but requests hit the other process. `up` now refuses if the port
  answers; use `HARNESS_APP_PORT=8091`.
- **Teacher = a `public.lecturers` row**, created by the `auth.users` trigger
  for non-anonymous users with an email; only they get `ROLE_TEACHER`, which
  `/api/**` requires. `token EMAIL` inserts into `auth.users` (not
  `lecturers`) so the real trigger runs. No/invalid token -> 401; a valid
  token without the role (anonymous student, unknown user) -> 403.
- **Tokens must carry `iss = <SUPABASE_URL>/auth/v1` and `aud = authenticated`**
  and be ES256/RS256 — the same checks as production. Hand-made tokens without
  those fail with an empty-body 401; the reason is in the `WWW-Authenticate` header.
- **The local `auth` schema is a stub** (`auth.users` with id/email/is_anonymous/
  raw_user_meta_data, `auth.uid()` reading `request.jwt.claims`). Schema code
  using other Supabase internals (e.g. `auth.jwt()`, `storage.*`) needs the stub
  in `driver.mjs` (`AUTH_STUB_SQL`) extended.
- **Storage is faked too.** The JWKS server (`SUPABASE_URL`) also serves the
  Storage API calls the backend and browser make (signed upload URL + PUT,
  authenticated read, upload, sign, signed download, delete),
  with files on disk under `target/run-harness/storage/`. Each operation runs
  in Postgres *as the calling user* against a stub `storage.objects`, so the
  real bucket RLS policies from `schema.sql` decide access.
- **The backend connects as `postgres`, which bypasses RLS.** HTTP smoke tests
  say nothing about RLS; use `sql-as` / `smoke-db` for that layer.
- macOS has no `timeout` command; use the driver's own waits.

## Troubleshooting

- `driver: no jar at …` → `./mvnw package`.
- `driver: Docker is not running` → `open -a Docker`.
- `driver: already up` → `node $D down` first (also after a failed `up`).
- `driver: backend exited during startup` → the log tail above it has the
  cause; a Hibernate `Schema-validation:` error means an entity and
  `database/schema.sql` disagree.
- `SQL failed: … No active session found for code …` from `sql-as` is the RPC's
  own error, i.e. the call worked.
