-- =============================================================================
-- NeuroGames — Supabase (Postgres) schema
-- =============================================================================
-- Run this once in the Supabase SQL Editor (or via `supabase db push` /
-- `psql` against the project's connection string) on a fresh project.
--
-- Design decisions baked into this script:
--
--   1. Lecturer identity = Supabase Auth. `public.lecturers.id` is a 1:1
--      extension of `auth.users.id`. A trigger copies new *email* signups
--      into `public.lecturers`; anonymous sign-ins (students) are skipped,
--      so "has a lecturers row" is what makes a Supabase user a lecturer.
--      The Spring Boot backend never issues tokens — it verifies the
--      Supabase-issued JWT and requires that lecturers row to exist.
--
--   2. Every table has RLS enabled. Ownership is resolved by walking
--      collection -> lecturer (or game -> collection -> lecturer) via three
--      small SECURITY DEFINER helper functions, instead of repeating the
--      same join in every policy. Helpers live in the `private` schema,
--      which PostgREST does not expose, so they aren't callable as RPCs.
--
--   3. Students never get row-level SELECT access to `questions` or
--      `answer_options` (the latter would leak `is_correct` to anyone who
--      inspects network traffic). Gameplay goes through three RPCs —
--      `join_game_session`, `get_session_questions` (question + answer
--      text only, for the caller's own active session) and `submit_answer`
--      — so session-joining and scoring are enforced server-side, not
--      trusted to the client. This mirrors principle 4
--      in the project spec ("AI is a content-generation tool; normal
--      gameplay should rely on stored data and deterministic application
--      logic").
--
--   4. Students must hold a Supabase session to play — normally an
--      anonymous sign-in (no account, but a stable uuid), so "Anonymous
--      Sign-Ins" must be enabled in the Auth settings. The gameplay RPCs
--      reject callers with no session: a participant with no auth id has
--      nothing to prove ownership with, so anyone could answer as them.
--      `student_auth_id` stays nullable only so deleting an auth user
--      keeps that participant's results (on delete set null).
--
--   5. A participant may answer each question once (unique constraint on
--      student_answers), and only for questions in their own game while
--      the session is active.
--
--   6. Scoring in `submit_answer` is a flat +10 placeholder — swap for
--      real per-game-type scoring rules once those are designed.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 0. Extensions
-- -----------------------------------------------------------------------------
create extension if not exists pgcrypto;

-- Not in PostgREST's exposed schemas, so nothing here is callable via /rpc.
create schema if not exists private;
grant usage on schema private to anon, authenticated;


-- -----------------------------------------------------------------------------
-- 1. Shared trigger: keep updated_at current
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- -----------------------------------------------------------------------------
-- 2. Tables
-- -----------------------------------------------------------------------------

-- Lecturers --------------------------------------------------------------
create table public.lecturers (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text not null unique,
  full_name  text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Collections --------------------------------------------------------------
create table public.collections (
  id          uuid primary key default gen_random_uuid(),
  lecturer_id uuid not null references public.lecturers (id) on delete cascade,
  name        text not null,
  description text,
  is_public   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index collections_lecturer_id_idx on public.collections (lecturer_id);

-- Learning materials ---------------------------------------------------------
create table public.learning_materials (
  id                uuid primary key default gen_random_uuid(),
  collection_id      uuid not null references public.collections (id) on delete cascade,
  filename           text not null,
  storage_path       text not null,
  file_type          text not null check (file_type in ('pdf', 'docx', 'pptx', 'text')),
  extraction_status  text not null default 'pending'
                       check (extraction_status in ('pending', 'processing', 'completed', 'failed')),
  extracted_content  text,
  uploaded_at        timestamptz not null default now()
);

create index learning_materials_collection_id_idx on public.learning_materials (collection_id);

-- Topics ---------------------------------------------------------------------
create table public.topics (
  id            uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.collections (id) on delete cascade,
  name          text not null,
  description   text,
  unique (collection_id, name)
);

create index topics_collection_id_idx on public.topics (collection_id);

-- Questions --------------------------------------------------------------
create table public.questions (
  id                  uuid primary key default gen_random_uuid(),
  collection_id       uuid not null references public.collections (id) on delete cascade,
  topic_id            uuid references public.topics (id) on delete set null,
  question_text       text not null,
  explanation         text,
  difficulty          text not null default 'medium' check (difficulty in ('easy', 'medium', 'hard')),
  source_material_id  uuid references public.learning_materials (id) on delete set null,
  approval_status     text not null default 'pending_review'
                        check (approval_status in ('pending_review', 'approved', 'rejected')),
  created_at          timestamptz not null default now()
);

create index questions_collection_id_idx on public.questions (collection_id);
create index questions_topic_id_idx on public.questions (topic_id);

-- Answer options ---------------------------------------------------------
create table public.answer_options (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions (id) on delete cascade,
  answer_text text not null,
  is_correct  boolean not null default false
);

create index answer_options_question_id_idx on public.answer_options (question_id);

-- Games --------------------------------------------------------------------
create table public.games (
  id            uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.collections (id) on delete cascade,
  title         text not null,
  description   text,
  game_type     text not null
                  check (game_type in ('answer_run', 'quiz_battle')),
  configuration jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index games_collection_id_idx on public.games (collection_id);

-- Game <-> Question join table (lets a question be reused across games) ------
create table public.game_questions (
  game_id       uuid not null references public.games (id) on delete cascade,
  question_id   uuid not null references public.questions (id) on delete cascade,
  display_order integer not null default 0,
  metadata      jsonb not null default '{}'::jsonb,
  primary key (game_id, question_id)
);

create index game_questions_question_id_idx on public.game_questions (question_id);

-- Game sessions (a single play-through of a saved game) ----------------------
create table public.game_sessions (
  id           uuid primary key default gen_random_uuid(),
  game_id      uuid not null references public.games (id) on delete cascade,
  -- Uppercase only: join_game_session uppercases what students type.
  session_code text not null unique check (session_code = upper(session_code)),
  status       text not null default 'pending' check (status in ('pending', 'active', 'ended')),
  started_at   timestamptz,
  ended_at     timestamptz,
  created_at   timestamptz not null default now()
);

create index game_sessions_game_id_idx on public.game_sessions (game_id);

-- Session participants --------------------------------------------------------
create table public.session_participants (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references public.game_sessions (id) on delete cascade,
  student_auth_id uuid references auth.users (id) on delete set null,
  display_name    text not null,
  score           integer not null default 0,
  joined_at       timestamptz not null default now()
);

create index session_participants_session_id_idx on public.session_participants (session_id);
-- Prevent the same signed-in (incl. anonymous-auth) student joining a session twice.
create unique index session_participants_session_student_uidx
  on public.session_participants (session_id, student_auth_id)
  where student_auth_id is not null;

-- Student answers ------------------------------------------------------------
create table public.student_answers (
  id                  uuid primary key default gen_random_uuid(),
  participant_id      uuid not null references public.session_participants (id) on delete cascade,
  question_id         uuid not null references public.questions (id) on delete cascade,
  selected_answer_id  uuid references public.answer_options (id) on delete set null,
  is_correct          boolean not null,
  time_taken_ms       integer,
  submitted_at        timestamptz not null default now()
);

-- One answer per participant per question (blocks re-submitting for points).
-- Also serves as the participant_id index.
alter table public.student_answers
  add constraint student_answers_participant_question_key unique (participant_id, question_id);
create index student_answers_question_id_idx on public.student_answers (question_id);


-- -----------------------------------------------------------------------------
-- 3. updated_at triggers
-- -----------------------------------------------------------------------------
create trigger lecturers_set_updated_at before update on public.lecturers
  for each row execute function public.set_updated_at();

create trigger collections_set_updated_at before update on public.collections
  for each row execute function public.set_updated_at();

create trigger games_set_updated_at before update on public.games
  for each row execute function public.set_updated_at();


-- -----------------------------------------------------------------------------
-- 4. New Supabase Auth user -> lecturer profile row
-- -----------------------------------------------------------------------------
-- Anonymous sign-ins are students, not lecturers — and have no email, which
-- lecturers.email requires, so inserting them would fail the whole signup.
create or replace function private.handle_new_lecturer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.is_anonymous, false) or new.email is null then
    return new;
  end if;

  insert into public.lecturers (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end;
$$;

revoke execute on function private.handle_new_lecturer() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_lecturer();


-- -----------------------------------------------------------------------------
-- 5. Ownership helper functions (used by RLS policies below)
-- -----------------------------------------------------------------------------
create or replace function private.owns_collection(target_collection_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.collections c
    where c.id = target_collection_id
      and c.lecturer_id = auth.uid()
  );
$$;

create or replace function private.owns_question(target_question_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.questions q
    where q.id = target_question_id
      and private.owns_collection(q.collection_id)
  );
$$;

create or replace function private.owns_game(target_game_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.games g
    where g.id = target_game_id
      and private.owns_collection(g.collection_id)
  );
$$;

-- RLS policies run these as the querying role, so it needs EXECUTE
-- (anon too: games_select_owner_or_public is evaluated for anon reads).
revoke execute on function private.owns_collection(uuid) from public;
revoke execute on function private.owns_question(uuid) from public;
revoke execute on function private.owns_game(uuid) from public;
grant execute on function private.owns_collection(uuid) to anon, authenticated;
grant execute on function private.owns_question(uuid) to anon, authenticated;
grant execute on function private.owns_game(uuid) to anon, authenticated;


-- -----------------------------------------------------------------------------
-- 6. Row Level Security
-- -----------------------------------------------------------------------------
alter table public.lecturers            enable row level security;
alter table public.collections          enable row level security;
alter table public.learning_materials   enable row level security;
alter table public.topics               enable row level security;
alter table public.questions            enable row level security;
alter table public.answer_options       enable row level security;
alter table public.games                enable row level security;
alter table public.game_questions       enable row level security;
alter table public.game_sessions        enable row level security;
alter table public.session_participants enable row level security;
alter table public.student_answers      enable row level security;

-- lecturers: can see and edit only your own profile row.
create policy "lecturers_select_self" on public.lecturers
  for select using (id = auth.uid());

create policy "lecturers_update_self" on public.lecturers
  for update using (id = auth.uid());

-- collections: full CRUD for the owner; read-only for anyone if public.
create policy "collections_select_owner_or_public" on public.collections
  for select using (lecturer_id = auth.uid() or is_public);

create policy "collections_insert_owner" on public.collections
  for insert with check (lecturer_id = auth.uid());

create policy "collections_update_owner" on public.collections
  for update using (lecturer_id = auth.uid()) with check (lecturer_id = auth.uid());

create policy "collections_delete_owner" on public.collections
  for delete using (lecturer_id = auth.uid());

-- learning_materials: lecturer-only (never exposed to students directly).
create policy "materials_all_owner" on public.learning_materials
  for all using (private.owns_collection(collection_id))
  with check (private.owns_collection(collection_id));

-- topics: lecturer-only.
create policy "topics_all_owner" on public.topics
  for all using (private.owns_collection(collection_id))
  with check (private.owns_collection(collection_id));

-- questions: lecturer-only. Students get question text during play via
-- get_session_questions(), not by reading this table.
create policy "questions_all_owner" on public.questions
  for all using (private.owns_collection(collection_id))
  with check (private.owns_collection(collection_id));

-- answer_options: lecturer-only — this is the table with is_correct on it.
create policy "answer_options_all_owner" on public.answer_options
  for all using (private.owns_question(question_id))
  with check (private.owns_question(question_id));

-- games: full CRUD for the owner; read-only for anyone if the collection is public.
create policy "games_select_owner_or_public" on public.games
  for select using (
    private.owns_collection(collection_id)
    or exists (select 1 from public.collections c where c.id = games.collection_id and c.is_public)
  );

create policy "games_insert_owner" on public.games
  for insert with check (private.owns_collection(collection_id));

create policy "games_update_owner" on public.games
  for update using (private.owns_collection(collection_id)) with check (private.owns_collection(collection_id));

create policy "games_delete_owner" on public.games
  for delete using (private.owns_collection(collection_id));

-- game_questions: lecturer manages it; a participant in an active session for
-- that game can read the question order (not the answers — see get_session_questions).
create policy "game_questions_select_owner_or_active_participant" on public.game_questions
  for select using (
    private.owns_game(game_id)
    or exists (
      select 1 from public.game_sessions gs
      join public.session_participants sp on sp.session_id = gs.id
      where gs.game_id = game_questions.game_id
        and gs.status = 'active'
        and sp.student_auth_id = auth.uid()
    )
  );

create policy "game_questions_write_owner" on public.game_questions
  for insert with check (private.owns_game(game_id));

create policy "game_questions_update_owner" on public.game_questions
  for update using (private.owns_game(game_id)) with check (private.owns_game(game_id));

create policy "game_questions_delete_owner" on public.game_questions
  for delete using (private.owns_game(game_id));

-- game_sessions: the owning lecturer has full CRUD. A joined participant can
-- see their own session's status/code (e.g. to poll for 'active' -> 'ended').
-- Deliberately NOT open to anon SELECT-by-anyone: looking a session up by
-- code happens through join_game_session() below, not a table scan.
create policy "sessions_select_owner_or_participant" on public.game_sessions
  for select using (
    private.owns_game(game_id)
    or exists (
      select 1 from public.session_participants sp
      where sp.session_id = game_sessions.id
        and sp.student_auth_id = auth.uid()
    )
  );

create policy "sessions_insert_owner" on public.game_sessions
  for insert with check (private.owns_game(game_id));

create policy "sessions_update_owner" on public.game_sessions
  for update using (private.owns_game(game_id)) with check (private.owns_game(game_id));

create policy "sessions_delete_owner" on public.game_sessions
  for delete using (private.owns_game(game_id));

-- session_participants: a student can see their own row; the lecturer who
-- owns the game can see all participants (for live results/analytics).
-- No INSERT/UPDATE policy on purpose — joining and scoring go through the
-- join_game_session / submit_answer RPCs below, which run as the table
-- owner and bypass RLS, so client code can never edit its own score.
create policy "participants_select_self_or_lecturer" on public.session_participants
  for select using (
    student_auth_id = auth.uid()
    or exists (
      select 1 from public.game_sessions gs
      where gs.id = session_participants.session_id
        and private.owns_game(gs.game_id)
    )
  );

-- student_answers: same shape — a student reads their own answers, the
-- owning lecturer reads everyone's for analytics. Writes go through submit_answer().
create policy "answers_select_self_or_lecturer" on public.student_answers
  for select using (
    exists (
      select 1 from public.session_participants sp
      where sp.id = student_answers.participant_id
        and sp.student_auth_id = auth.uid()
    )
    or exists (
      select 1 from public.session_participants sp
      join public.game_sessions gs on gs.id = sp.session_id
      where sp.id = student_answers.participant_id
        and private.owns_game(gs.game_id)
    )
  );


-- -----------------------------------------------------------------------------
-- 7. Gameplay RPCs: join a session by code, read its questions, submit an
--    answer. All are SECURITY DEFINER, so they run as the table owner and
--    bypass the RLS policies above by design — this is where the actual
--    trust boundary for "did this student really answer this correctly"
--    lives. Each one requires a Supabase session (auth.uid() not null); see
--    design note 4 at the top.
-- -----------------------------------------------------------------------------

-- Re-joining with the same session (e.g. after a page refresh) returns the
-- existing participant instead of failing on the unique index. Codes are
-- matched case-insensitively (stored uppercase, see game_sessions), and the
-- display name is trimmed and must be 1-40 characters for the leaderboard.
create or replace function public.join_game_session(p_session_code text, p_display_name text)
returns table (participant_id uuid, session_id uuid, game_id uuid)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_code text := upper(btrim(p_session_code));
  v_name text := btrim(p_display_name);
  v_session public.game_sessions;
  v_participant_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in (anonymous sign-in is fine) before joining a session';
  end if;

  if coalesce(char_length(v_name), 0) not between 1 and 40 then
    raise exception 'Display name must be between 1 and 40 characters';
  end if;

  select * into v_session
  from public.game_sessions
  where session_code = v_code
    and status = 'active';

  if v_session.id is null then
    raise exception 'No active session found for code %', v_code;
  end if;

  insert into public.session_participants (session_id, student_auth_id, display_name)
  values (v_session.id, auth.uid(), v_name)
  on conflict (session_id, student_auth_id) where student_auth_id is not null
    do update set display_name = excluded.display_name
  returning id into v_participant_id;

  return query select v_participant_id, v_session.id, v_session.game_id;
end;
$$;

-- Question and answer text for the caller's own active session. Never
-- returns is_correct; the explanation is only revealed by submit_answer.
create or replace function public.get_session_questions(p_session_id uuid)
returns table (
  question_id    uuid,
  display_order  integer,
  question_text  text,
  difficulty     text,
  answer_options jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not exists (
    select 1
    from public.session_participants sp
    join public.game_sessions gs on gs.id = sp.session_id
    where sp.session_id = p_session_id
      and sp.student_auth_id = auth.uid()
      and gs.status = 'active'
  ) then
    raise exception 'Caller is not a participant in active session %', p_session_id;
  end if;

  return query
  select
    q.id,
    gq.display_order,
    q.question_text,
    q.difficulty,
    coalesce(
      (select jsonb_agg(jsonb_build_object('id', ao.id, 'answer_text', ao.answer_text) order by ao.id)
       from public.answer_options ao
       where ao.question_id = q.id),
      '[]'::jsonb)
  from public.game_sessions gs
  join public.game_questions gq on gq.game_id = gs.game_id
  join public.questions q on q.id = gq.question_id
  where gs.id = p_session_id
  order by gq.display_order;
end;
$$;

create or replace function public.submit_answer(
  p_participant_id uuid,
  p_question_id uuid,
  p_selected_answer_id uuid,
  p_time_taken_ms integer default null
)
returns table (is_correct boolean, explanation text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_auth_id uuid;
  v_game_id uuid;
  v_session_status text;
  v_is_correct boolean;
  v_explanation text;
  v_answer_id uuid;
  v_points constant integer := 10;
begin
  select sp.student_auth_id, gs.game_id, gs.status
    into v_owner_auth_id, v_game_id, v_session_status
  from public.session_participants sp
  join public.game_sessions gs on gs.id = sp.session_id
  where sp.id = p_participant_id;

  -- Plain `<>`, not `is distinct from`: a NULL on either side must fail.
  if auth.uid() is null or v_owner_auth_id is null or v_owner_auth_id <> auth.uid() then
    raise exception 'Participant % does not belong to the current caller', p_participant_id;
  end if;

  if v_session_status <> 'active' then
    raise exception 'Session for participant % is not active', p_participant_id;
  end if;

  if not exists (
    select 1 from public.game_questions gq
    where gq.game_id = v_game_id
      and gq.question_id = p_question_id
  ) then
    raise exception 'Question % is not part of this game', p_question_id;
  end if;

  select ao.is_correct into v_is_correct
  from public.answer_options ao
  where ao.id = p_selected_answer_id
    and ao.question_id = p_question_id;

  if v_is_correct is null then
    raise exception 'Answer option % does not belong to question %', p_selected_answer_id, p_question_id;
  end if;

  insert into public.student_answers (participant_id, question_id, selected_answer_id, is_correct, time_taken_ms)
  values (p_participant_id, p_question_id, p_selected_answer_id, v_is_correct, p_time_taken_ms)
  on conflict on constraint student_answers_participant_question_key do nothing
  returning id into v_answer_id;

  if v_answer_id is null then
    raise exception 'Question % has already been answered', p_question_id;
  end if;

  if v_is_correct then
    update public.session_participants set score = score + v_points where id = p_participant_id;
  end if;

  select q.explanation into v_explanation
  from public.questions q
  where q.id = p_question_id;

  return query select v_is_correct, v_explanation;
end;
$$;

-- authenticated only: anonymous sign-ins use the authenticated role; the
-- anon role (no session at all) can't play — see design note 4.
revoke execute on function public.join_game_session(text, text) from public, anon;
revoke execute on function public.get_session_questions(uuid) from public, anon;
revoke execute on function public.submit_answer(uuid, uuid, uuid, integer) from public, anon;
grant execute on function public.join_game_session(text, text) to authenticated;
grant execute on function public.get_session_questions(uuid) to authenticated;
grant execute on function public.submit_answer(uuid, uuid, uuid, integer) to authenticated;


-- -----------------------------------------------------------------------------
-- 7b. Leaderboards
-- -----------------------------------------------------------------------------
-- Leaderboards are computed from session_participants.score (kept current by
-- submit_answer) and student_answers, so there is no separate table to keep
-- in sync. Ties on score go to the lower total answer time.
create index if not exists session_participants_session_score_idx
  on public.session_participants (session_id, score desc);

-- Live ranking for one session: visible to its participants (so students see
-- each other) and to the lecturer who owns the game.
create or replace function public.get_session_leaderboard(p_session_id uuid)
returns table (
  rank               bigint,
  participant_id     uuid,
  display_name       text,
  score              integer,
  correct_answers    integer,
  questions_answered integer,
  total_time_ms      bigint,
  is_me              boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not (
    exists (
      select 1 from public.session_participants sp
      where sp.session_id = p_session_id
        and sp.student_auth_id = auth.uid()
    )
    or exists (
      select 1 from public.game_sessions gs
      where gs.id = p_session_id
        and private.owns_game(gs.game_id)
    )
  ) then
    raise exception 'Not allowed to view the leaderboard for session %', p_session_id;
  end if;

  return query
  select
    rank() over (order by sp.score desc, coalesce(a.total_time_ms, 0) asc),
    sp.id,
    sp.display_name,
    sp.score,
    coalesce(a.correct_answers, 0)::integer,
    coalesce(a.questions_answered, 0)::integer,
    coalesce(a.total_time_ms, 0)::bigint,
    sp.student_auth_id is not distinct from auth.uid()
  from public.session_participants sp
  left join (
    select
      sa.participant_id,
      count(*) filter (where sa.is_correct) as correct_answers,
      count(*) as questions_answered,
      sum(sa.time_taken_ms) as total_time_ms
    from public.student_answers sa
    group by sa.participant_id
  ) a on a.participant_id = sp.id
  where sp.session_id = p_session_id
  order by 1, sp.joined_at;
end;
$$;

-- All-time best results for a game across all of its sessions: visible to the
-- owning lecturer and to anyone who has played that game.
create or replace function public.get_game_leaderboard(p_game_id uuid, p_limit integer default 10)
returns table (
  rank            bigint,
  participant_id  uuid,
  display_name    text,
  score           integer,
  correct_answers integer,
  total_time_ms   bigint,
  session_id      uuid,
  played_at       timestamptz,
  is_me           boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not (
    private.owns_game(p_game_id)
    or exists (
      select 1 from public.session_participants sp
      join public.game_sessions gs on gs.id = sp.session_id
      where gs.game_id = p_game_id
        and sp.student_auth_id = auth.uid()
    )
  ) then
    raise exception 'Not allowed to view the leaderboard for game %', p_game_id;
  end if;

  return query
  select
    rank() over (order by sp.score desc, coalesce(a.total_time_ms, 0) asc),
    sp.id,
    sp.display_name,
    sp.score,
    coalesce(a.correct_answers, 0)::integer,
    coalesce(a.total_time_ms, 0)::bigint,
    sp.session_id,
    sp.joined_at,
    sp.student_auth_id is not distinct from auth.uid()
  from public.session_participants sp
  join public.game_sessions gs on gs.id = sp.session_id
  left join (
    select
      sa.participant_id,
      count(*) filter (where sa.is_correct) as correct_answers,
      sum(sa.time_taken_ms) as total_time_ms
    from public.student_answers sa
    group by sa.participant_id
  ) a on a.participant_id = sp.id
  where gs.game_id = p_game_id
  order by 1, sp.joined_at
  limit least(greatest(coalesce(p_limit, 10), 1), 100);
end;
$$;

revoke execute on function public.get_session_leaderboard(uuid) from public, anon;
revoke execute on function public.get_game_leaderboard(uuid, integer) from public, anon;
grant execute on function public.get_session_leaderboard(uuid) to authenticated;
grant execute on function public.get_game_leaderboard(uuid, integer) to authenticated;


-- -----------------------------------------------------------------------------
-- 8. Baseline table grants (RLS still gates individual rows; this just
--    makes the script self-contained if the project's default privileges
--    don't already extend to anon/authenticated).
-- -----------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on
  public.lecturers,
  public.collections,
  public.learning_materials,
  public.topics,
  public.questions,
  public.answer_options,
  public.games,
  public.game_questions,
  public.game_sessions,
  public.session_participants,
  public.student_answers
to authenticated;

grant select on
  public.collections,
  public.games
to anon;
