-- =============================================================================
-- Game leaderboards: get_session_leaderboard() for a live session and
-- get_game_leaderboard() for a game's all-time best results, both computed
-- from existing scores and answers.
-- =============================================================================

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
