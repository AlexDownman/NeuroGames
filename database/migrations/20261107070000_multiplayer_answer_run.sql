-- Multiplayer Answer Run: the lecturer hosts a session, students join a
-- lobby, and once the host starts the game everyone plays through the
-- questions at their own pace while the session leaderboard updates live.
--
--   * A new session starts 'pending' (the lobby); host_start_game makes it
--     'active'. Ending it is unchanged (the backend's end endpoint).
--   * Each participant has their own current question: the first one they
--     haven't answered. get_my_question serves it and starts its timer
--     server-side; submit_answer scores it and the next one follows.
--   * Correct answers earn the question's escalating pointValue, scaled from
--     100% (instant) down to 50% (at the buzzer) for speed. Wrong, missing or
--     late answers still lose the pointValue, floored at 0.
--   * Once the session ends, get_session_summary shows where the class and
--     each player struggled and which topics to revise.
--   * get_session_questions is gone: it handed every question to the client
--     up front. get_my_question only exposes the current one.

alter table public.game_sessions
  add column question_duration_ms integer not null default 9000
    check (question_duration_ms between 3000 and 120000);

-- When the participant was shown their current question; NULL between questions.
alter table public.session_participants add column question_started_at timestamptz;

alter table public.student_answers add column points_awarded integer not null default 0;

drop function if exists public.get_session_questions(uuid);
drop function if exists public.submit_answer(uuid, uuid, uuid, integer);

-- The participant's current question (their first unanswered one, in game
-- order) and what it's worth. No row once they've answered them all.
create or replace function private.participant_current_question(p_participant_id uuid)
returns table (question_id uuid, question_index integer, point_value integer)
language sql
stable
security definer
set search_path = public
as $$
  select x.question_id, x.question_index, x.point_value
  from (
    select
      gq.question_id,
      (row_number() over (order by gq.display_order, gq.question_id) - 1)::integer as question_index,
      coalesce((gq.metadata ->> 'pointValue')::integer, 10) as point_value
    from public.session_participants sp
    join public.game_sessions gs on gs.id = sp.session_id
    join public.game_questions gq on gq.game_id = gs.game_id
    where sp.id = p_participant_id
  ) x
  where not exists (
    select 1 from public.student_answers sa
    where sa.participant_id = p_participant_id
      and sa.question_id = x.question_id
  )
  order by x.question_index
  limit 1;
$$;

revoke execute on function private.participant_current_question(uuid) from public, anon, authenticated;

-- Students can join from the lobby onwards, and late-join a running game.
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
    and status in ('pending', 'active');

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

-- Session overview for the host and player screens (lobby, progress, end).
create or replace function public.get_session_state(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_session public.game_sessions;
  v_is_host boolean;
  v_participant public.session_participants;
  v_question_count integer;
  v_me jsonb;
  v_answered integer;
begin
  select * into v_session from public.game_sessions where id = p_session_id;
  v_is_host := v_session.id is not null and private.owns_game(v_session.game_id);

  select * into v_participant
  from public.session_participants sp
  where sp.session_id = p_session_id
    and sp.student_auth_id = auth.uid();

  if auth.uid() is null or v_session.id is null or not (v_is_host or v_participant.id is not null) then
    raise exception 'Not allowed to view session %', p_session_id;
  end if;

  select count(*) into v_question_count from public.game_questions gq where gq.game_id = v_session.game_id;

  if v_participant.id is not null then
    select count(*) into v_answered from public.student_answers sa where sa.participant_id = v_participant.id;
    v_me := jsonb_build_object(
      'participant_id', v_participant.id,
      'display_name', v_participant.display_name,
      'score', v_participant.score,
      'current_streak', v_participant.current_streak,
      'questions_answered', v_answered,
      'finished', v_answered >= v_question_count);
  end if;

  return jsonb_build_object(
    'session_id', v_session.id,
    'session_code', v_session.session_code,
    'status', v_session.status,
    'question_count', v_question_count,
    'question_duration_ms', v_session.question_duration_ms,
    'participant_count', (select count(*) from public.session_participants sp where sp.session_id = p_session_id),
    'finished_count', (
      select count(*) from public.session_participants sp
      where sp.session_id = p_session_id
        and (select count(*) from public.student_answers sa where sa.participant_id = sp.id) >= v_question_count),
    'is_host', v_is_host,
    'me', v_me);
end;
$$;

-- The caller's current question (text and options only, never is_correct),
-- starting its timer the first time it is served. Asking again — a page
-- refresh — returns the same question with the time that's left, so a
-- refresh can't buy extra time. NULL in the lobby, after the last question,
-- or once the session has ended.
create or replace function public.get_my_question(p_participant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_participant public.session_participants;
  v_session public.game_sessions;
  v_question_id uuid;
  v_question_index integer;
  v_point_value integer;
  v_started_at timestamptz;
begin
  select * into v_participant from public.session_participants sp where sp.id = p_participant_id;

  -- Plain `<>`, not `is distinct from`: a NULL on either side must fail.
  if auth.uid() is null or v_participant.student_auth_id is null or v_participant.student_auth_id <> auth.uid() then
    raise exception 'Participant % does not belong to the current caller', p_participant_id;
  end if;

  select * into v_session from public.game_sessions gs where gs.id = v_participant.session_id;
  if v_session.status <> 'active' then
    return null;
  end if;

  select cq.question_id, cq.question_index, cq.point_value into v_question_id, v_question_index, v_point_value
  from private.participant_current_question(p_participant_id) cq;
  if v_question_id is null then
    return null;
  end if;

  update public.session_participants sp
  set question_started_at = coalesce(sp.question_started_at, now())
  where sp.id = p_participant_id
  returning sp.question_started_at into v_started_at;

  return (
    select jsonb_build_object(
      'question_id', q.id,
      'question_index', v_question_index,
      'question_text', q.question_text,
      'difficulty', q.difficulty,
      'point_value', v_point_value,
      'time_remaining_ms', greatest(
        v_session.question_duration_ms - (extract(epoch from now() - v_started_at) * 1000)::integer, 0),
      'answer_options', coalesce(
        (select jsonb_agg(jsonb_build_object('id', ao.id, 'answer_text', ao.answer_text) order by ao.id)
         from public.answer_options ao
         where ao.question_id = q.id),
        '[]'::jsonb))
    from public.questions q
    where q.id = v_question_id);
end;
$$;

-- Answer the caller's current question and score it straight away. A NULL
-- answer means the timer ran out on the client; an answer that arrives after
-- the timer (plus a second of grace for network lag) is also a timeout.
create or replace function public.submit_answer(
  p_participant_id uuid,
  p_question_id uuid,
  p_selected_answer_id uuid
)
returns table (
  is_correct         boolean,
  timed_out          boolean,
  correct_answer_ids uuid[],
  explanation        text,
  points_awarded     integer,
  score              integer,
  current_streak     integer,
  finished           boolean
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_participant public.session_participants;
  v_session public.game_sessions;
  v_current_question_id uuid;
  v_point_value integer;
  v_time_taken_ms integer;
  v_timed_out boolean;
  v_is_correct boolean;
  v_points integer;
  v_score integer;
  v_current_streak integer;
begin
  -- FOR UPDATE: a double-tap can't score the same question twice.
  select * into v_participant from public.session_participants sp where sp.id = p_participant_id for update;

  if auth.uid() is null or v_participant.student_auth_id is null or v_participant.student_auth_id <> auth.uid() then
    raise exception 'Participant % does not belong to the current caller', p_participant_id;
  end if;

  select * into v_session from public.game_sessions gs where gs.id = v_participant.session_id;
  if v_session.status <> 'active' then
    raise exception 'Session for participant % is not active', p_participant_id;
  end if;

  select cq.question_id, cq.point_value into v_current_question_id, v_point_value
  from private.participant_current_question(p_participant_id) cq;

  if v_current_question_id is distinct from p_question_id or v_participant.question_started_at is null then
    raise exception 'Question % is not your current question', p_question_id;
  end if;

  -- Timed by the server, not the client.
  v_time_taken_ms := least(
    (extract(epoch from now() - v_participant.question_started_at) * 1000)::integer,
    v_session.question_duration_ms);
  v_timed_out := p_selected_answer_id is null
    or now() > v_participant.question_started_at + make_interval(secs => (v_session.question_duration_ms + 1000) / 1000.0);

  if p_selected_answer_id is not null then
    select ao.is_correct into v_is_correct
    from public.answer_options ao
    where ao.id = p_selected_answer_id
      and ao.question_id = p_question_id;

    if v_is_correct is null then
      raise exception 'Answer option % does not belong to question %', p_selected_answer_id, p_question_id;
    end if;
  end if;
  v_is_correct := coalesce(v_is_correct, false) and not v_timed_out;

  v_points := case
    when v_is_correct then
      round(v_point_value * (1 - v_time_taken_ms::numeric / v_session.question_duration_ms / 2))::integer
    else -least(v_participant.score, v_point_value)
  end;

  insert into public.student_answers (participant_id, question_id, selected_answer_id, is_correct, time_taken_ms, points_awarded)
  values (p_participant_id, p_question_id, case when v_timed_out then null else p_selected_answer_id end,
          v_is_correct, v_time_taken_ms, v_points);

  update public.session_participants sp
  set score = sp.score + v_points,
      current_streak = case when v_is_correct then sp.current_streak + 1 else 0 end,
      question_started_at = null
  where sp.id = p_participant_id
  returning sp.score, sp.current_streak into v_score, v_current_streak;

  return query
  select
    v_is_correct,
    v_timed_out,
    coalesce(
      (select array_agg(ao.id) from public.answer_options ao where ao.question_id = p_question_id and ao.is_correct),
      '{}'::uuid[]),
    (select q.explanation from public.questions q where q.id = p_question_id),
    v_points,
    v_score,
    v_current_streak,
    not exists (select 1 from private.participant_current_question(p_participant_id));
end;
$$;

-- Lobby -> playing. Only the lecturer who owns the game; safe to call twice.
create or replace function public.host_start_game(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.game_sessions;
begin
  select * into v_session from public.game_sessions where id = p_session_id for update;

  if auth.uid() is null or v_session.id is null or not private.owns_game(v_session.game_id) then
    raise exception 'Not allowed to host session %', p_session_id;
  end if;

  if v_session.status = 'ended' then
    raise exception 'Session % has ended', p_session_id;
  end if;

  if not exists (select 1 from public.game_questions gq where gq.game_id = v_session.game_id) then
    raise exception 'This game has no questions';
  end if;

  update public.game_sessions
  set status = 'active', started_at = coalesce(started_at, now())
  where id = p_session_id;

  return public.get_session_state(p_session_id);
end;
$$;

revoke execute on function public.get_session_state(uuid) from public, anon;
revoke execute on function public.get_my_question(uuid) from public, anon;
revoke execute on function public.submit_answer(uuid, uuid, uuid) from public, anon;
revoke execute on function public.host_start_game(uuid) from public, anon;
grant execute on function public.get_session_state(uuid) to authenticated;
grant execute on function public.get_my_question(uuid) to authenticated;
grant execute on function public.submit_answer(uuid, uuid, uuid) to authenticated;
grant execute on function public.host_start_game(uuid) to authenticated;

-- End-of-session summary: where the class and each player struggled, and what
-- to revise. Rule-based, from the stored answers: a topic under 60% correct
-- needs revision, 80%+ is a strength. Questions with no topic count as
-- 'General'. Questions a player never reached aren't counted against them.
-- The host gets the class overview and every player; a student only their own.
create or replace function public.get_session_summary(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_session public.game_sessions;
  v_is_host boolean;
  v_my_participant_id uuid;
  v_players jsonb;
  v_class jsonb;
begin
  select * into v_session from public.game_sessions where id = p_session_id;
  v_is_host := v_session.id is not null and private.owns_game(v_session.game_id);

  select sp.id into v_my_participant_id
  from public.session_participants sp
  where sp.session_id = p_session_id
    and sp.student_auth_id = auth.uid();

  if auth.uid() is null or v_session.id is null or not (v_is_host or v_my_participant_id is not null) then
    raise exception 'Not allowed to view the summary for session %', p_session_id;
  end if;

  if v_session.status <> 'ended' then
    raise exception 'The summary is available once session % has ended', p_session_id;
  end if;

  with player_topics as (
    select
      sa.participant_id,
      coalesce(t.name, 'General') as topic_name,
      t.description as topic_description,
      count(*) filter (where sa.is_correct) as correct,
      count(*) as answered
    from public.student_answers sa
    join public.session_participants sp on sp.id = sa.participant_id
    join public.questions q on q.id = sa.question_id
    left join public.topics t on t.id = q.topic_id
    where sp.session_id = p_session_id
    group by sa.participant_id, t.id, t.name, t.description
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'participant_id', r.participant_id,
    'display_name', r.display_name,
    'rank', r.rank,
    'score', r.score,
    'correct_answers', r.correct_answers,
    'questions_answered', r.questions_answered,
    'accuracy', case when r.questions_answered > 0 then round(100.0 * r.correct_answers / r.questions_answered)::integer end,
    'is_me', r.is_me,
    'weak_topics', coalesce(
      (select jsonb_agg(jsonb_build_object(
          'topic_name', pt.topic_name,
          'topic_description', pt.topic_description,
          'correct', pt.correct,
          'answered', pt.answered,
          'accuracy', round(100.0 * pt.correct / pt.answered)::integer)
        order by pt.correct::numeric / pt.answered, pt.topic_name)
       from player_topics pt
       where pt.participant_id = r.participant_id and pt.correct::numeric / pt.answered < 0.6),
      '[]'::jsonb),
    'strong_topics', coalesce(
      (select jsonb_agg(pt.topic_name order by pt.topic_name)
       from player_topics pt
       where pt.participant_id = r.participant_id and pt.correct::numeric / pt.answered >= 0.8),
      '[]'::jsonb),
    'missed', coalesce(
      (select jsonb_agg(jsonb_build_object(
          'question_text', q.question_text,
          'topic_name', coalesce(t.name, 'General'),
          'correct_answer', (select string_agg(ao.answer_text, ' / ' order by ao.id)
                             from public.answer_options ao where ao.question_id = q.id and ao.is_correct),
          'explanation', q.explanation,
          'timed_out', sa.selected_answer_id is null)
        order by gq.display_order)
       from public.student_answers sa
       join public.questions q on q.id = sa.question_id
       join public.game_questions gq on gq.game_id = v_session.game_id and gq.question_id = q.id
       left join public.topics t on t.id = q.topic_id
       where sa.participant_id = r.participant_id and not sa.is_correct),
      '[]'::jsonb))
    order by r.rank, r.display_name), '[]'::jsonb)
  into v_players
  from public.get_session_leaderboard(p_session_id) r
  where v_is_host or r.participant_id = v_my_participant_id;

  if v_is_host then
    with answers as (
      select sa.question_id, sa.is_correct, coalesce(t.name, 'General') as topic_name, t.description as topic_description, t.id as topic_id
      from public.student_answers sa
      join public.session_participants sp on sp.id = sa.participant_id
      join public.questions q on q.id = sa.question_id
      left join public.topics t on t.id = q.topic_id
      where sp.session_id = p_session_id
    )
    select jsonb_build_object(
      'participant_count', (select count(*) from public.session_participants sp where sp.session_id = p_session_id),
      'average_score', (select round(avg(sp.score))::integer from public.session_participants sp where sp.session_id = p_session_id),
      'accuracy', (select round(100.0 * count(*) filter (where a.is_correct) / nullif(count(*), 0))::integer from answers a),
      'topics', coalesce(
        (select jsonb_agg(jsonb_build_object(
            'topic_name', x.topic_name,
            'topic_description', x.topic_description,
            'correct', x.correct,
            'answered', x.answered,
            'accuracy', x.accuracy,
            'needs_revision', x.accuracy < 60)
          order by x.accuracy, x.topic_name)
         from (
           select a.topic_name, a.topic_description,
                  count(*) filter (where a.is_correct) as correct, count(*) as answered,
                  round(100.0 * count(*) filter (where a.is_correct) / count(*))::integer as accuracy
           from answers a
           group by a.topic_id, a.topic_name, a.topic_description
         ) x),
        '[]'::jsonb),
      -- Hardest first; questions nobody reached go last.
      'questions', coalesce(
        (select jsonb_agg(jsonb_build_object(
            'question_text', y.question_text,
            'topic_name', y.topic_name,
            'correct_answer', y.correct_answer,
            'explanation', y.explanation,
            'correct', y.correct,
            'answered', y.answered,
            'accuracy', y.accuracy)
          order by y.accuracy nulls last, y.display_order)
         from (
           select gq.display_order, q.question_text, coalesce(t.name, 'General') as topic_name, q.explanation,
                  (select string_agg(ao.answer_text, ' / ' order by ao.id)
                   from public.answer_options ao where ao.question_id = q.id and ao.is_correct) as correct_answer,
                  count(a.question_id) filter (where a.is_correct) as correct,
                  count(a.question_id) as answered,
                  round(100.0 * count(a.question_id) filter (where a.is_correct) / nullif(count(a.question_id), 0))::integer as accuracy
           from public.game_questions gq
           join public.questions q on q.id = gq.question_id
           left join public.topics t on t.id = q.topic_id
           left join answers a on a.question_id = q.id
           where gq.game_id = v_session.game_id
           group by gq.display_order, q.id, q.question_text, t.name, q.explanation
         ) y),
        '[]'::jsonb))
    into v_class;
  end if;

  return jsonb_build_object('class', v_class, 'players', v_players);
end;
$$;

revoke execute on function public.get_session_summary(uuid) from public, anon;
grant execute on function public.get_session_summary(uuid) to authenticated;

-- Supabase Realtime: host and player screens refetch when these change.
-- RLS still decides who receives which rows (a player only sees their own
-- participant row, so player leaderboards also poll).
do $$
declare
  v_table text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach v_table in array array['game_sessions', 'session_participants'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = v_table
      ) then
        execute format('alter publication supabase_realtime add table public.%I', v_table);
      end if;
    end loop;
  end if;
end;
$$;
