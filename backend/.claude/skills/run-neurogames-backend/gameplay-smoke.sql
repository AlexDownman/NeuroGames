-- Gameplay RPC + RLS checks, run by `driver.mjs smoke-db`. Everything happens
-- in one transaction that is rolled back, so the DB is left as it was.
-- Results are RAISE NOTICE lines: "PASS ..." / "FAIL ...".
--
-- now() is fixed for the whole transaction, so answer timing is simulated by
-- moving session_participants.question_started_at back (as postgres).
begin;
do $test$
declare
  v_lect uuid := gen_random_uuid(); v_stud uuid := gen_random_uuid(); v_other uuid := gen_random_uuid();
  v_third uuid := gen_random_uuid(); v_out uuid := gen_random_uuid();
  v_coll uuid; v_q1 uuid; v_q2 uuid; v_q3 uuid; v_a1 uuid; v_a2 uuid; v_a3 uuid; v_a4 uuid; v_a5 uuid;
  v_game uuid; v_sess uuid; v_p uuid; v_p2 uuid; v_p3 uuid; v_p4 uuid;
  v_topic uuid; v_n int; v_b boolean; v_j int; v_t text; v_s jsonb; v_r record;
begin
  -- signup trigger
  insert into auth.users (id, is_anonymous) values (v_stud, true), (v_other, true), (v_third, true);
  select count(*) into v_n from public.lecturers where id in (v_stud, v_other);
  raise notice '% anonymous sign-up creates no lecturer row', case when v_n = 0 then 'PASS' else 'FAIL' end;
  insert into auth.users (id, email, raw_user_meta_data)
    values (v_lect, 'smoke-db-' || v_lect || '@example.com', '{"full_name":"Smoke"}');
  select count(*) into v_n from public.lecturers where id = v_lect and full_name = 'Smoke';
  raise notice '% email sign-up creates lecturer row', case when v_n = 1 then 'PASS' else 'FAIL' end;

  -- fixtures (as postgres): Q1 worth 100, Q2 worth 50, Q3 not in the game; 9s per question
  insert into public.collections (lecturer_id, name, is_public) values (v_lect, 'smoke', true) returning id into v_coll;
  insert into public.topics (collection_id, name, description) values (v_coll, 'Joins', 'Combining rows from two tables') returning id into v_topic;
  insert into public.questions (collection_id, topic_id, question_text, explanation) values (v_coll, v_topic, 'Q1?', 'because') returning id into v_q1;
  insert into public.questions (collection_id, question_text) values (v_coll, 'Q2?') returning id into v_q2;
  insert into public.questions (collection_id, question_text) values (v_coll, 'Q3?') returning id into v_q3;
  insert into public.answer_options (question_id, answer_text, is_correct) values (v_q1, 'right', true) returning id into v_a1;
  insert into public.answer_options (question_id, answer_text, is_correct) values (v_q1, 'wrong', false) returning id into v_a2;
  insert into public.answer_options (question_id, answer_text, is_correct) values (v_q2, 'q2right', true) returning id into v_a3;
  insert into public.answer_options (question_id, answer_text, is_correct) values (v_q2, 'q2wrong', false) returning id into v_a4;
  insert into public.answer_options (question_id, answer_text, is_correct) values (v_q3, 'q3ans', true) returning id into v_a5;
  insert into public.games (collection_id, title, game_type) values (v_coll, 'g', 'answer_run') returning id into v_game;
  insert into public.game_questions (game_id, question_id, display_order, metadata) values
    (v_game, v_q1, 0, '{"pointValue":100}'), (v_game, v_q2, 1, '{"pointValue":50}');
  insert into public.game_sessions (game_id, session_code) values (v_game, upper('SMOKE-' || v_game)) returning id into v_sess;
  begin
    insert into public.game_sessions (game_id, session_code) values (v_game, 'lower-' || v_game);
    raise notice 'FAIL lowercase session code was stored';
  exception when check_violation then raise notice 'PASS lowercase session code rejected'; end;

  -- lobby: as the anonymous student
  perform set_config('request.jwt.claims', json_build_object('sub', v_stud, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  -- typed in lowercase with stray spaces, as a student might
  select participant_id into v_p from public.join_game_session('  smoke-' || v_game || ' ', 'Sam');
  raise notice '% student joins a pending (lobby) session, code matched case-insensitively', case when v_p is not null then 'PASS' else 'FAIL' end;
  select participant_id into v_p2 from public.join_game_session('SMOKE-' || v_game, '  Sam again  ');
  raise notice '% re-joining returns the same participant', case when v_p = v_p2 then 'PASS' else 'FAIL' end;

  begin
    perform public.join_game_session('SMOKE-' || v_game, '   ');
    raise notice 'FAIL blank display name accepted';
  exception when raise_exception then raise notice 'PASS blank display name rejected'; end;
  begin
    perform public.join_game_session('SMOKE-' || v_game, repeat('x', 41));
    raise notice 'FAIL 41-character display name accepted';
  exception when raise_exception then raise notice 'PASS 41-character display name rejected'; end;

  v_s := public.get_session_state(v_sess);
  raise notice '% lobby state: pending, 1 player, 2 questions, not host (got %)',
    case when v_s ->> 'status' = 'pending' and (v_s ->> 'participant_count')::int = 1 and (v_s ->> 'question_count')::int = 2
      and not (v_s ->> 'is_host')::boolean and v_s -> 'me' ->> 'participant_id' = v_p::text
      and not (v_s -> 'me' ->> 'finished')::boolean then 'PASS' else 'FAIL' end, v_s;
  raise notice '% no question is served in the lobby',
    case when public.get_my_question(v_p) is null then 'PASS' else 'FAIL' end;
  begin
    perform public.submit_answer(v_p, v_q1, v_a1);
    raise notice 'FAIL answer accepted before the game started';
  exception when raise_exception then raise notice 'PASS answer rejected in the lobby'; end;
  begin
    perform public.host_start_game(v_sess);
    raise notice 'FAIL a student started the game';
  exception when raise_exception then raise notice 'PASS a student cannot start the game'; end;

  -- host starts the game
  perform set_config('request.jwt.claims', json_build_object('sub', v_lect, 'role', 'authenticated')::text, true);
  v_s := public.host_start_game(v_sess);
  raise notice '% host_start_game makes the session active', case when v_s ->> 'status' = 'active' and (v_s ->> 'is_host')::boolean then 'PASS' else 'FAIL' end;
  v_s := public.host_start_game(v_sess);
  raise notice '% host_start_game twice is harmless', case when v_s ->> 'status' = 'active' then 'PASS' else 'FAIL' end;

  -- Sam plays at their own pace
  perform set_config('request.jwt.claims', json_build_object('sub', v_stud, 'role', 'authenticated')::text, true);
  v_s := public.get_my_question(v_p);
  raise notice '% first question is Q1 with 2 options, no is_correct, full timer (got %)',
    case when v_s ->> 'question_text' = 'Q1?' and (v_s ->> 'question_index')::int = 0
      and jsonb_array_length(v_s -> 'answer_options') = 2 and not (v_s -> 'answer_options' -> 0 ? 'is_correct')
      and (v_s ->> 'time_remaining_ms')::int = 9000 and (v_s ->> 'point_value')::int = 100 then 'PASS' else 'FAIL' end, v_s;
  raise notice '% no future question is exposed', case when v_s::text not like '%Q2?%' then 'PASS' else 'FAIL' end;

  begin
    perform public.submit_answer(v_p, v_q3, v_a5);
    raise notice 'FAIL question outside the game was accepted';
  exception when raise_exception then raise notice 'PASS question outside the game rejected'; end;
  begin
    perform public.submit_answer(v_p, v_q2, v_a3);
    raise notice 'FAIL skipping ahead to Q2 was accepted';
  exception when raise_exception then raise notice 'PASS skipping ahead rejected'; end;
  begin
    perform public.submit_answer(v_p, v_q1, v_a3);
    raise notice 'FAIL answer option from another question accepted';
  exception when raise_exception then raise notice 'PASS answer option from another question rejected'; end;

  select * into v_r from public.submit_answer(v_p, v_q1, v_a1);
  raise notice '% instant correct answer: +100, score 100, streak 1, correct id + explanation returned (got %)',
    case when v_r.is_correct and not v_r.timed_out and v_r.points_awarded = 100 and v_r.score = 100 and v_r.current_streak = 1
      and v_r.correct_answer_ids = array[v_a1] and v_r.explanation = 'because' and not v_r.finished then 'PASS' else 'FAIL' end, v_r;
  begin
    perform public.submit_answer(v_p, v_q1, v_a1);
    raise notice 'FAIL re-submitting the same question was accepted';
  exception when raise_exception then raise notice 'PASS re-submit rejected'; end;

  v_s := public.get_my_question(v_p);
  raise notice '% next question follows straight away (got %)', case when v_s ->> 'question_text' = 'Q2?' and (v_s ->> 'question_index')::int = 1 then 'PASS' else 'FAIL' end, v_s ->> 'question_text';
  perform set_config('role', 'postgres', true);
  update public.session_participants set question_started_at = now() - interval '4.5 seconds' where id = v_p;
  perform set_config('role', 'authenticated', true);
  select * into v_r from public.submit_answer(v_p, v_q2, v_a4);
  raise notice '% wrong answer loses the point value and the streak, last one finishes (got %)',
    case when not v_r.is_correct and v_r.points_awarded = -50 and v_r.score = 50 and v_r.current_streak = 0 and v_r.finished then 'PASS' else 'FAIL' end, v_r;
  v_s := public.get_session_state(v_sess);
  raise notice '% finished: no more questions, state says finished (got %)',
    case when public.get_my_question(v_p) is null and (v_s -> 'me' ->> 'finished')::boolean
      and (v_s ->> 'finished_count')::int = 1 then 'PASS' else 'FAIL' end, v_s;

  select count(*) into v_n from public.questions;
  raise notice '% student cannot read questions table (saw %)', case when v_n = 0 then 'PASS' else 'FAIL' end, v_n;
  select count(*) into v_n from public.answer_options;
  raise notice '% student cannot read answer_options (saw %)', case when v_n = 0 then 'PASS' else 'FAIL' end, v_n;

  -- Bo late-joins, answers Q1 after the timer and lets Q2 time out
  perform set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
  select participant_id into v_p3 from public.join_game_session('SMOKE-' || v_game, 'Bo');
  raise notice '% late join while the game is running', case when v_p3 is not null then 'PASS' else 'FAIL' end;
  begin
    perform public.get_my_question(v_p);
    raise notice 'FAIL another student read this participant''s question';
  exception when raise_exception then raise notice 'PASS another student cannot read this participant''s question'; end;
  begin
    perform public.submit_answer(v_p, v_q1, v_a2);
    raise notice 'FAIL another student answered as this participant';
  exception when raise_exception then raise notice 'PASS another student cannot answer as this participant'; end;
  begin
    perform public.submit_answer(v_p3, v_q1, v_a1);
    raise notice 'FAIL answered without being served the question';
  exception when raise_exception then raise notice 'PASS cannot answer a question before it is served'; end;

  perform public.get_my_question(v_p3);
  perform set_config('role', 'postgres', true);
  update public.session_participants set question_started_at = now() - interval '30 seconds' where id = v_p3;
  perform set_config('role', 'authenticated', true);
  select * into v_r from public.submit_answer(v_p3, v_q1, v_a1);
  raise notice '% a right answer after the timer counts as a timeout (got %)',
    case when v_r.timed_out and not v_r.is_correct and v_r.points_awarded = 0 then 'PASS' else 'FAIL' end, v_r;
  perform public.get_my_question(v_p3);
  select * into v_r from public.submit_answer(v_p3, v_q2, null);
  raise notice '% a NULL answer is a timeout', case when v_r.timed_out and not v_r.is_correct and v_r.finished then 'PASS' else 'FAIL' end;

  -- Cy: refreshing doesn't reset the timer; a correct answer at half time earns 75%
  perform set_config('request.jwt.claims', json_build_object('sub', v_third, 'role', 'authenticated')::text, true);
  select participant_id into v_p4 from public.join_game_session('SMOKE-' || v_game, 'Cy');
  perform public.get_my_question(v_p4);
  perform set_config('role', 'postgres', true);
  update public.session_participants set question_started_at = now() - interval '4.5 seconds' where id = v_p4;
  perform set_config('role', 'authenticated', true);
  v_s := public.get_my_question(v_p4);
  raise notice '% asking again keeps the original timer (got % ms left)',
    case when (v_s ->> 'time_remaining_ms')::int = 4500 then 'PASS' else 'FAIL' end, v_s ->> 'time_remaining_ms';
  select * into v_r from public.submit_answer(v_p4, v_q1, v_a1);
  raise notice '% speed scoring: correct at half time earns 75%% (got %)', case when v_r.points_awarded = 75 then 'PASS' else 'FAIL' end, v_r.points_awarded;

  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'anon', true);
  begin
    perform public.submit_answer(v_p, v_q1, v_a2);
    raise notice 'FAIL anon role could call submit_answer';
  exception when insufficient_privilege then raise notice 'PASS anon role cannot call submit_answer'; end;
  begin
    perform public.get_my_question(v_p);
    raise notice 'FAIL anon role could call get_my_question';
  exception when insufficient_privilege then raise notice 'PASS anon role cannot call get_my_question'; end;
  begin
    perform public.get_session_state(v_sess);
    raise notice 'FAIL anon role could call get_session_state';
  exception when insufficient_privilege then raise notice 'PASS anon role cannot call get_session_state'; end;
  select count(*) into v_n from public.games where id = v_game;
  raise notice '% anon can read a game in a public collection', case when v_n = 1 then 'PASS' else 'FAIL' end;

  perform set_config('role', 'postgres', true);
  select display_name into v_t from public.session_participants where id = v_p;
  raise notice '% display name stored trimmed (got "%")', case when v_t = 'Sam again' then 'PASS' else 'FAIL' end, v_t;

  -- leaderboards: Cy 75, Sam 50, Bo 0
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_stud, 'role', 'authenticated')::text, true);
  select count(*), max(display_name) filter (where rank = 1), max(score) filter (where rank = 1), bool_or(is_me and rank = 2)
    into v_n, v_t, v_j, v_b from public.get_session_leaderboard(v_sess);
  raise notice '% session leaderboard updates live: 3 rows, Cy first with 75, Sam (is_me) second (got %/%/%/%)',
    case when v_n = 3 and v_t = 'Cy' and v_j = 75 and v_b then 'PASS' else 'FAIL' end, v_n, v_t, v_j, v_b;
  select count(*) into v_n from public.get_session_leaderboard(v_sess)
    where display_name = 'Bo' and rank = 3 and correct_answers = 0 and questions_answered = 2 and total_time_ms = 9000;
  raise notice '% Bo last: 0 correct, 2 answered, 9000 ms', case when v_n = 1 then 'PASS' else 'FAIL' end;

  perform set_config('request.jwt.claims', json_build_object('sub', v_lect, 'role', 'authenticated')::text, true);
  v_s := public.get_session_state(v_sess);
  raise notice '% host sees 3 players, 2 finished (got %/%)',
    case when (v_s ->> 'participant_count')::int = 3 and (v_s ->> 'finished_count')::int = 2 and v_s -> 'me' = 'null'::jsonb then 'PASS' else 'FAIL' end,
    v_s ->> 'participant_count', v_s ->> 'finished_count';
  select count(*), bool_or(is_me) into v_n, v_b from public.get_session_leaderboard(v_sess);
  raise notice '% owning lecturer sees the session leaderboard (% rows, any is_me=%)', case when v_n = 3 and not v_b then 'PASS' else 'FAIL' end, v_n, v_b;
  select count(*) into v_n from public.get_game_leaderboard(v_game);
  raise notice '% game leaderboard for the lecturer: 3 entries (got %)', case when v_n = 3 then 'PASS' else 'FAIL' end, v_n;
  select count(*) into v_n from public.get_game_leaderboard(v_game, 1);
  raise notice '% game leaderboard respects the limit (got %)', case when v_n = 1 then 'PASS' else 'FAIL' end, v_n;

  perform set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.get_game_leaderboard(v_game);
  raise notice '% a student who played sees the game leaderboard (got %)', case when v_n = 3 then 'PASS' else 'FAIL' end, v_n;

  begin
    perform public.get_session_summary(v_sess);
    raise notice 'FAIL summary available before the session ended';
  exception when raise_exception then raise notice 'PASS summary not available while the session is running'; end;

  -- the host ends the session (backend endpoint)
  perform set_config('role', 'postgres', true);
  update public.game_sessions set status = 'ended', ended_at = now() where id = v_sess;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_third, 'role', 'authenticated')::text, true);
  v_s := public.get_session_state(v_sess);
  raise notice '% ended: state still readable, no question served',
    case when v_s ->> 'status' = 'ended' and public.get_my_question(v_p4) is null then 'PASS' else 'FAIL' end;
  -- end-of-session summary. Joins (Q1): Sam right, Bo late, Cy right = 67%; General (Q2): Sam wrong, Bo timed out = 0%
  v_s := public.get_session_summary(v_sess);
  raise notice '% a student''s summary has only their own row and no class overview (got %)',
    case when v_s -> 'class' = 'null'::jsonb and jsonb_array_length(v_s -> 'players') = 1
      and v_s -> 'players' -> 0 ->> 'display_name' = 'Cy' and (v_s -> 'players' -> 0 ->> 'accuracy')::int = 100
      and v_s -> 'players' -> 0 -> 'strong_topics' = '["Joins"]'::jsonb
      and v_s -> 'players' -> 0 -> 'weak_topics' = '[]'::jsonb then 'PASS' else 'FAIL' end, v_s;
  perform set_config('request.jwt.claims', json_build_object('sub', v_lect, 'role', 'authenticated')::text, true);
  v_s := public.get_session_summary(v_sess);
  raise notice '% class summary: 3 players, 40%% accuracy, General (0%%) flagged for revision before Joins (67%%) (got %)',
    case when (v_s -> 'class' ->> 'participant_count')::int = 3 and (v_s -> 'class' ->> 'accuracy')::int = 40
      and v_s -> 'class' -> 'topics' -> 0 ->> 'topic_name' = 'General' and (v_s -> 'class' -> 'topics' -> 0 ->> 'needs_revision')::boolean
      and (v_s -> 'class' -> 'topics' -> 1 ->> 'accuracy')::int = 67 and not (v_s -> 'class' -> 'topics' -> 1 ->> 'needs_revision')::boolean
      then 'PASS' else 'FAIL' end, v_s -> 'class' -> 'topics';
  raise notice '% hardest question first: Q2 at 0%% with its correct answer (got %)',
    case when v_s -> 'class' -> 'questions' -> 0 ->> 'question_text' = 'Q2?' and (v_s -> 'class' -> 'questions' -> 0 ->> 'accuracy')::int = 0
      and v_s -> 'class' -> 'questions' -> 0 ->> 'correct_answer' = 'q2right' then 'PASS' else 'FAIL' end, v_s -> 'class' -> 'questions' -> 0;
  select p into v_s from jsonb_array_elements(public.get_session_summary(v_sess) -> 'players') p where p ->> 'display_name' = 'Sam again';
  raise notice '% Sam: weak in General, strong in Joins, missed Q2 with answer + explanation slot (got %)',
    case when v_s -> 'weak_topics' -> 0 ->> 'topic_name' = 'General' and jsonb_array_length(v_s -> 'weak_topics') = 1
      and v_s -> 'strong_topics' = '["Joins"]'::jsonb and jsonb_array_length(v_s -> 'missed') = 1
      and v_s -> 'missed' -> 0 ->> 'correct_answer' = 'q2right' and not (v_s -> 'missed' -> 0 ->> 'timed_out')::boolean
      then 'PASS' else 'FAIL' end, v_s;
  select p into v_s from jsonb_array_elements(public.get_session_summary(v_sess) -> 'players') p where p ->> 'display_name' = 'Bo';
  raise notice '% Bo: weak in both topics, 2 missed, both timed out (got %)',
    case when jsonb_array_length(v_s -> 'weak_topics') = 2 and jsonb_array_length(v_s -> 'missed') = 2
      and (v_s -> 'missed' -> 0 ->> 'timed_out')::boolean and (v_s -> 'missed' -> 1 ->> 'timed_out')::boolean then 'PASS' else 'FAIL' end, v_s;
  perform set_config('request.jwt.claims', json_build_object('sub', v_third, 'role', 'authenticated')::text, true);

  begin
    perform public.submit_answer(v_p4, v_q2, v_a3);
    raise notice 'FAIL answer accepted after the session ended';
  exception when raise_exception then raise notice 'PASS answer rejected after the session ended'; end;
  begin
    perform public.join_game_session('SMOKE-' || v_game, 'Cy');
    raise notice 'FAIL joined an ended session';
  exception when raise_exception then raise notice 'PASS ended session cannot be joined'; end;

  perform set_config('request.jwt.claims', json_build_object('sub', v_out, 'role', 'authenticated')::text, true);
  begin
    perform public.get_session_leaderboard(v_sess);
    raise notice 'FAIL outsider read the session leaderboard';
  exception when raise_exception then raise notice 'PASS outsider cannot read the session leaderboard'; end;
  begin
    perform public.get_session_state(v_sess);
    raise notice 'FAIL outsider read the session state';
  exception when raise_exception then raise notice 'PASS outsider cannot read the session state'; end;
  begin
    perform public.get_session_summary(v_sess);
    raise notice 'FAIL outsider read the session summary';
  exception when raise_exception then raise notice 'PASS outsider cannot read the session summary'; end;
  begin
    perform public.get_game_leaderboard(v_game);
    raise notice 'FAIL outsider read the game leaderboard';
  exception when raise_exception then raise notice 'PASS outsider cannot read the game leaderboard'; end;

  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'anon', true);
  begin
    perform public.get_session_leaderboard(v_sess);
    raise notice 'FAIL anon role could call get_session_leaderboard';
  exception when insufficient_privilege then raise notice 'PASS anon role cannot call the leaderboards'; end;
  begin
    perform public.host_start_game(v_sess);
    raise notice 'FAIL anon role could call host_start_game';
  exception when insufficient_privilege then raise notice 'PASS anon role cannot call host_start_game'; end;
  perform set_config('role', 'postgres', true);

  raise notice '% helpers not exposed in public schema',
    case when to_regprocedure('public.owns_collection(uuid)') is null
      and to_regprocedure('public.participant_current_question(uuid)') is null then 'PASS' else 'FAIL' end;
end;
$test$;
rollback;
