-- =============================================================================
-- Fixes "column reference \"score\" is ambiguous" in submit_answer: its
-- RETURNS TABLE output columns are named score/current_streak, which are
-- also real columns on session_participants — the exact same collision
-- join_game_session already works around with #variable_conflict use_column.
-- Same return signature as the previous migration, so no DROP needed.
-- =============================================================================

create or replace function public.submit_answer(
  p_participant_id uuid,
  p_question_id uuid,
  p_selected_answer_id uuid,
  p_time_taken_ms integer default null
)
returns table (is_correct boolean, explanation text, score integer, current_streak integer)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_owner_auth_id uuid;
  v_game_id uuid;
  v_session_status text;
  v_is_correct boolean;
  v_explanation text;
  v_answer_id uuid;
  v_point_value integer;
  v_score integer;
  v_current_streak integer;
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

  select coalesce((gq.metadata ->> 'pointValue')::integer, 10) into v_point_value
  from public.game_questions gq
  where gq.game_id = v_game_id
    and gq.question_id = p_question_id;

  if v_point_value is null then
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
    update public.session_participants
    set score = score + v_point_value, current_streak = current_streak + 1
    where id = p_participant_id
    returning score, current_streak into v_score, v_current_streak;
  else
    update public.session_participants
    set score = greatest(score - v_point_value, 0), current_streak = 0
    where id = p_participant_id
    returning score, current_streak into v_score, v_current_streak;
  end if;

  select q.explanation into v_explanation
  from public.questions q
  where q.id = p_question_id;

  return query select v_is_correct, v_explanation, v_score, v_current_streak;
end;
$$;
