-- =============================================================================
-- Session codes are case-insensitive for students and display names are
-- validated, so the frontend's uppercasing and the DB agree.
--
--   * game_sessions.session_code must be stored uppercase.
--   * join_game_session trims + uppercases the code it is given, and trims
--     the display name, rejecting blank or >40-character names.
-- =============================================================================

alter table public.game_sessions
  add constraint game_sessions_session_code_check check (session_code = upper(session_code));

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
