-- =============================================================================
-- NeuroGames — Supabase (Postgres) schema
-- =============================================================================
-- Run this once in the Supabase SQL Editor (or via `supabase db push` /
-- `psql` against the project's connection string) on a fresh project.
--
-- Design decisions baked into this script:
--
--   1. Lecturer identity = Supabase Auth. `public.lecturers.id` is a 1:1
--      extension of `auth.users.id`. A trigger copies new signups into
--      `public.lecturers`. This is required for the RLS policies below,
--      which key everything off `auth.uid()`.
--      => Consequence: the Spring Boot backend's own password/JWT issuing
--         (AuthController/JwtService/Lecturer.passwordHash) needs to be
--         replaced with "verify the Supabase-issued JWT" instead of minting
--         its own, and lecturer registration/login should go through the
--         Supabase Auth API (or GoTrue) rather than POST /api/auth/register.
--         Not done in this script — flagging it as the next required change.
--
--   2. Every table has RLS enabled. Ownership is resolved by walking
--      collection -> lecturer (or game -> collection -> lecturer) via three
--      small SECURITY DEFINER helper functions, instead of repeating the
--      same join in every policy.
--
--   3. Students never get row-level SELECT access to `answer_options`
--      (that would leak `is_correct` to anyone who inspects network
--      traffic). Gameplay reads go through the `answer_options_for_play`
--      view (text only, scoped to the caller's own active session), and
--      gameplay writes go through two RPCs — `join_game_session` and
--      `submit_answer` — so scoring/session-joining logic is enforced
--      server-side, not trusted to the client. This mirrors principle 4
--      in the project spec ("AI is a content-generation tool; normal
--      gameplay should rely on stored data and deterministic application
--      logic").
--
--   4. `student_auth_id` is nullable throughout. NULL = fully anonymous
--      participant (no Supabase session at all); non-null = a Supabase
--      Auth user (including anonymous sign-ins, which still get a stable
--      uuid). Both modes the spec asked to keep open are supported.
--
--   5. Scoring in `submit_answer` is a flat +10 placeholder — swap for
--      real per-game-type scoring rules once those are designed.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 0. Extensions
-- -----------------------------------------------------------------------------
create extension if not exists pgcrypto;


-- -----------------------------------------------------------------------------
-- 1. Shared trigger: keep updated_at current
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
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
                  check (game_type in ('answer_run', 'quiz_battle', 'match_up', 'millionaire', 'word_scramble', 'escape_room')),
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
  session_code text not null unique,
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

create index student_answers_participant_id_idx on public.student_answers (participant_id);
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
create or replace function public.handle_new_lecturer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.lecturers (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_lecturer();


-- -----------------------------------------------------------------------------
-- 5. Ownership helper functions (used by RLS policies below)
-- -----------------------------------------------------------------------------
create or replace function public.owns_collection(target_collection_id uuid)
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

create or replace function public.owns_question(target_question_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.questions q
    where q.id = target_question_id
      and public.owns_collection(q.collection_id)
  );
$$;

create or replace function public.owns_game(target_game_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.games g
    where g.id = target_game_id
      and public.owns_collection(g.collection_id)
  );
$$;


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
  for all using (public.owns_collection(collection_id))
  with check (public.owns_collection(collection_id));

-- topics: lecturer-only.
create policy "topics_all_owner" on public.topics
  for all using (public.owns_collection(collection_id))
  with check (public.owns_collection(collection_id));

-- questions: lecturer-only. Students get question text during play via the
-- game_questions + answer_options_for_play path, not by reading this table.
create policy "questions_all_owner" on public.questions
  for all using (public.owns_collection(collection_id))
  with check (public.owns_collection(collection_id));

-- answer_options: lecturer-only — this is the table with is_correct on it.
create policy "answer_options_all_owner" on public.answer_options
  for all using (public.owns_question(question_id))
  with check (public.owns_question(question_id));

-- games: full CRUD for the owner; read-only for anyone if the collection is public.
create policy "games_select_owner_or_public" on public.games
  for select using (
    public.owns_collection(collection_id)
    or exists (select 1 from public.collections c where c.id = games.collection_id and c.is_public)
  );

create policy "games_insert_owner" on public.games
  for insert with check (public.owns_collection(collection_id));

create policy "games_update_owner" on public.games
  for update using (public.owns_collection(collection_id)) with check (public.owns_collection(collection_id));

create policy "games_delete_owner" on public.games
  for delete using (public.owns_collection(collection_id));

-- game_questions: lecturer manages it; a participant in an active session for
-- that game can read the question order (not the answers — see the view below).
create policy "game_questions_select_owner_or_active_participant" on public.game_questions
  for select using (
    public.owns_game(game_id)
    or exists (
      select 1 from public.game_sessions gs
      join public.session_participants sp on sp.session_id = gs.id
      where gs.game_id = game_questions.game_id
        and gs.status = 'active'
        and sp.student_auth_id = auth.uid()
    )
  );

create policy "game_questions_write_owner" on public.game_questions
  for insert with check (public.owns_game(game_id));

create policy "game_questions_update_owner" on public.game_questions
  for update using (public.owns_game(game_id)) with check (public.owns_game(game_id));

create policy "game_questions_delete_owner" on public.game_questions
  for delete using (public.owns_game(game_id));

-- game_sessions: the owning lecturer has full CRUD. A joined participant can
-- see their own session's status/code (e.g. to poll for 'active' -> 'ended').
-- Deliberately NOT open to anon SELECT-by-anyone: looking a session up by
-- code happens through join_game_session() below, not a table scan.
create policy "sessions_select_owner_or_participant" on public.game_sessions
  for select using (
    public.owns_game(game_id)
    or exists (
      select 1 from public.session_participants sp
      where sp.session_id = game_sessions.id
        and sp.student_auth_id = auth.uid()
    )
  );

create policy "sessions_insert_owner" on public.game_sessions
  for insert with check (public.owns_game(game_id));

create policy "sessions_update_owner" on public.game_sessions
  for update using (public.owns_game(game_id)) with check (public.owns_game(game_id));

create policy "sessions_delete_owner" on public.game_sessions
  for delete using (public.owns_game(game_id));

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
        and public.owns_game(gs.game_id)
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
        and public.owns_game(gs.game_id)
    )
  );


-- -----------------------------------------------------------------------------
-- 7. Gameplay read path: answer text without is_correct, scoped to the
--    caller's own active session.
-- -----------------------------------------------------------------------------
create view public.answer_options_for_play as
select ao.id, ao.question_id, ao.answer_text
from public.answer_options ao
join public.questions q on q.id = ao.question_id
join public.game_questions gq on gq.question_id = q.id
join public.game_sessions gs on gs.game_id = gq.game_id
join public.session_participants sp on sp.session_id = gs.id
where gs.status = 'active'
  and sp.student_auth_id = auth.uid();

grant select on public.answer_options_for_play to anon, authenticated;


-- -----------------------------------------------------------------------------
-- 8. Gameplay write path: join a session by code, submit an answer.
--    Both are SECURITY DEFINER, so they run as the table owner and bypass
--    the RLS policies above by design — this is where the actual trust
--    boundary for "did this student really answer this correctly" lives.
-- -----------------------------------------------------------------------------
create or replace function public.join_game_session(p_session_code text, p_display_name text)
returns table (participant_id uuid, session_id uuid, game_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.game_sessions;
  v_participant_id uuid;
begin
  select * into v_session
  from public.game_sessions
  where session_code = p_session_code
    and status = 'active';

  if v_session.id is null then
    raise exception 'No active session found for code %', p_session_code;
  end if;

  insert into public.session_participants (session_id, student_auth_id, display_name)
  values (v_session.id, auth.uid(), p_display_name)
  returning id into v_participant_id;

  return query select v_participant_id, v_session.id, v_session.game_id;
end;
$$;

grant execute on function public.join_game_session(text, text) to anon, authenticated;

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
  v_is_correct boolean;
  v_explanation text;
  v_owner_auth_id uuid;
  v_points constant integer := 10;
begin
  select student_auth_id into v_owner_auth_id
  from public.session_participants
  where id = p_participant_id;

  if v_owner_auth_id is distinct from auth.uid() then
    raise exception 'Participant % does not belong to the current caller', p_participant_id;
  end if;

  select ao.is_correct into v_is_correct
  from public.answer_options ao
  where ao.id = p_selected_answer_id
    and ao.question_id = p_question_id;

  if v_is_correct is null then
    raise exception 'Answer option % does not belong to question %', p_selected_answer_id, p_question_id;
  end if;

  select q.explanation into v_explanation
  from public.questions q
  where q.id = p_question_id;

  insert into public.student_answers (participant_id, question_id, selected_answer_id, is_correct, time_taken_ms)
  values (p_participant_id, p_question_id, p_selected_answer_id, v_is_correct, p_time_taken_ms);

  if v_is_correct then
    update public.session_participants set score = score + v_points where id = p_participant_id;
  end if;

  return query select v_is_correct, v_explanation;
end;
$$;

grant execute on function public.submit_answer(uuid, uuid, uuid, integer) to anon, authenticated;


-- -----------------------------------------------------------------------------
-- 9. Baseline table grants (RLS still gates individual rows; this just
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
