-- =============================================================================
-- Brings a project created from the original database/schema.sql up to the
-- current one. Fresh projects should just run schema.sql instead.
--
--   * handle_new_lecturer skips anonymous sign-ins (they have no email, so
--     the lecturers insert failed and blocked the sign-in).
--   * Ownership helpers + the signup trigger move to the unexposed `private`
--     schema so they aren't callable via /rest/v1/rpc.
--   * set_updated_at gets a fixed search_path.
--   * Gameplay: answer_options_for_play view replaced by
--     get_session_questions() (which also returns the question text);
--     submit_answer checks the session is active, the question belongs to
--     the game, and that it hasn't been answered already; all gameplay RPCs
--     require a Supabase session and are no longer granted to anon.
-- =============================================================================

-- private schema -------------------------------------------------------------
create schema if not exists private;
grant usage on schema private to anon, authenticated;

-- set_updated_at -------------------------------------------------------------
alter function public.set_updated_at() set search_path = '';

-- Ownership helpers: SET SCHEMA keeps the OIDs the RLS policies point at.
-- owns_question/owns_game call owns_collection by name, so re-create them.
alter function public.owns_collection(uuid) set schema private;
alter function public.owns_question(uuid) set schema private;
alter function public.owns_game(uuid) set schema private;

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

revoke execute on function private.owns_collection(uuid) from public;
revoke execute on function private.owns_question(uuid) from public;
revoke execute on function private.owns_game(uuid) from public;
grant execute on function private.owns_collection(uuid) to anon, authenticated;
grant execute on function private.owns_question(uuid) to anon, authenticated;
grant execute on function private.owns_game(uuid) to anon, authenticated;

-- Signup trigger -------------------------------------------------------------
alter function public.handle_new_lecturer() set schema private;

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

-- One answer per participant per question ------------------------------------
drop index public.student_answers_participant_id_idx;
alter table public.student_answers
  add constraint student_answers_participant_question_key unique (participant_id, question_id);

-- Gameplay -------------------------------------------------------------------
drop view public.answer_options_for_play;

create or replace function public.join_game_session(p_session_code text, p_display_name text)
returns table (participant_id uuid, session_id uuid, game_id uuid)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_session public.game_sessions;
  v_participant_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in (anonymous sign-in is fine) before joining a session';
  end if;

  select * into v_session
  from public.game_sessions
  where session_code = p_session_code
    and status = 'active';

  if v_session.id is null then
    raise exception 'No active session found for code %', p_session_code;
  end if;

  insert into public.session_participants (session_id, student_auth_id, display_name)
  values (v_session.id, auth.uid(), p_display_name)
  on conflict (session_id, student_auth_id) where student_auth_id is not null
    do update set display_name = excluded.display_name
  returning id into v_participant_id;

  return query select v_participant_id, v_session.id, v_session.game_id;
end;
$$;

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

revoke execute on function public.join_game_session(text, text) from public, anon;
revoke execute on function public.get_session_questions(uuid) from public, anon;
revoke execute on function public.submit_answer(uuid, uuid, uuid, integer) from public, anon;
grant execute on function public.join_game_session(text, text) to authenticated;
grant execute on function public.get_session_questions(uuid) to authenticated;
grant execute on function public.submit_answer(uuid, uuid, uuid, integer) to authenticated;
