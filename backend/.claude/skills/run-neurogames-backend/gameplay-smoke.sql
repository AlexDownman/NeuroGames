-- Gameplay RPC + RLS checks, run by `driver.mjs smoke-db`. Everything happens
-- in one transaction that is rolled back, so the DB is left as it was.
-- Results are RAISE NOTICE lines: "PASS ..." / "FAIL ...".
begin;
do $test$
declare
  v_lect uuid := gen_random_uuid(); v_stud uuid := gen_random_uuid(); v_other uuid := gen_random_uuid();
  v_coll uuid; v_q1 uuid; v_q2 uuid; v_a1 uuid; v_a2 uuid; v_a3 uuid;
  v_game uuid; v_sess uuid; v_p uuid; v_p2 uuid;
  v_n int; v_b boolean; v_j int; v_t text; v_out uuid := gen_random_uuid(); v_p3 uuid;
begin
  -- signup trigger
  insert into auth.users (id, is_anonymous) values (v_stud, true), (v_other, true);
  select count(*) into v_n from public.lecturers where id in (v_stud, v_other);
  raise notice '% anonymous sign-up creates no lecturer row', case when v_n = 0 then 'PASS' else 'FAIL' end;
  insert into auth.users (id, email, raw_user_meta_data)
    values (v_lect, 'smoke-db-' || v_lect || '@example.com', '{"full_name":"Smoke"}');
  select count(*) into v_n from public.lecturers where id = v_lect and full_name = 'Smoke';
  raise notice '% email sign-up creates lecturer row', case when v_n = 1 then 'PASS' else 'FAIL' end;

  -- fixtures (as postgres)
  insert into public.collections (lecturer_id, name, is_public) values (v_lect, 'smoke', true) returning id into v_coll;
  insert into public.questions (collection_id, question_text, explanation) values (v_coll, 'Q1?', 'because') returning id into v_q1;
  insert into public.questions (collection_id, question_text) values (v_coll, 'Q2?') returning id into v_q2;
  insert into public.answer_options (question_id, answer_text, is_correct) values (v_q1, 'right', true) returning id into v_a1;
  insert into public.answer_options (question_id, answer_text, is_correct) values (v_q1, 'wrong', false) returning id into v_a2;
  insert into public.answer_options (question_id, answer_text, is_correct) values (v_q2, 'q2ans', true) returning id into v_a3;
  insert into public.games (collection_id, title, game_type) values (v_coll, 'g', 'quiz_battle') returning id into v_game;
  insert into public.game_questions (game_id, question_id) values (v_game, v_q1);
  insert into public.game_sessions (game_id, session_code, status) values (v_game, upper('SMOKE-' || v_game), 'active') returning id into v_sess;
  begin
    insert into public.game_sessions (game_id, session_code) values (v_game, 'lower-' || v_game);
    raise notice 'FAIL lowercase session code was stored';
  exception when check_violation then raise notice 'PASS lowercase session code rejected'; end;

  -- as the anonymous student
  perform set_config('request.jwt.claims', json_build_object('sub', v_stud, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  -- typed in lowercase with stray spaces, as a student might
  select participant_id into v_p from public.join_game_session('  smoke-' || v_game || ' ', 'Sam');
  raise notice '% code matched case-insensitively', case when v_p is not null then 'PASS' else 'FAIL' end;
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

  select count(*), bool_and(not (answer_options -> 0 ? 'is_correct')), max(jsonb_array_length(answer_options)), max(question_text)
    into v_n, v_b, v_j, v_t from public.get_session_questions(v_sess);
  raise notice '% get_session_questions: 1 question, text, 2 options, no is_correct (got %/%/%/%)',
    case when v_n = 1 and v_t = 'Q1?' and v_j = 2 and v_b then 'PASS' else 'FAIL' end, v_n, v_t, v_j, v_b;

  begin
    perform public.submit_answer(v_p, v_q2, v_a3);
    raise notice 'FAIL question outside the game was accepted';
  exception when raise_exception then raise notice 'PASS question outside the game rejected'; end;

  select is_correct into v_b from public.submit_answer(v_p, v_q1, v_a1);
  raise notice '% correct answer scored as correct', case when v_b then 'PASS' else 'FAIL' end;

  begin
    perform public.submit_answer(v_p, v_q1, v_a1);
    raise notice 'FAIL re-submitting the same question was accepted';
  exception when raise_exception then raise notice 'PASS re-submit rejected'; end;

  select count(*) into v_n from public.questions;
  raise notice '% student cannot read questions table (saw %)', case when v_n = 0 then 'PASS' else 'FAIL' end, v_n;
  select count(*) into v_n from public.answer_options;
  raise notice '% student cannot read answer_options (saw %)', case when v_n = 0 then 'PASS' else 'FAIL' end, v_n;

  perform set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
  begin
    perform public.submit_answer(v_p, v_q1, v_a2);
    raise notice 'FAIL another student answered as this participant';
  exception when raise_exception then raise notice 'PASS another student cannot answer as this participant'; end;

  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'anon', true);
  begin
    perform public.submit_answer(v_p, v_q1, v_a2);
    raise notice 'FAIL anon role could call submit_answer';
  exception when insufficient_privilege then raise notice 'PASS anon role cannot call submit_answer'; end;
  select count(*) into v_n from public.games where id = v_game;
  raise notice '% anon can read a game in a public collection', case when v_n = 1 then 'PASS' else 'FAIL' end;

  perform set_config('role', 'postgres', true);
  select score into v_n from public.session_participants where id = v_p;
  raise notice '% final score is 10 (got %)', case when v_n = 10 then 'PASS' else 'FAIL' end, v_n;
  select display_name into v_t from public.session_participants where id = v_p;
  raise notice '% display name stored trimmed (got "%")', case when v_t = 'Sam again' then 'PASS' else 'FAIL' end, v_t;

  -- leaderboards: a second student joins and answers wrong
  perform set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select participant_id into v_p3 from public.join_game_session('SMOKE-' || v_game, 'Bo');
  perform public.submit_answer(v_p3, v_q1, v_a2, 1500);

  perform set_config('request.jwt.claims', json_build_object('sub', v_stud, 'role', 'authenticated')::text, true);
  select count(*), max(display_name) filter (where rank = 1), max(score) filter (where rank = 1), bool_or(is_me and rank = 1)
    into v_n, v_t, v_j, v_b from public.get_session_leaderboard(v_sess);
  raise notice '% session leaderboard for a player: 2 rows, "Sam again" first with 10, flagged is_me (got %/%/%/%)',
    case when v_n = 2 and v_t = 'Sam again' and v_j = 10 and v_b then 'PASS' else 'FAIL' end, v_n, v_t, v_j, v_b;
  select count(*) into v_n from public.get_session_leaderboard(v_sess) where display_name = 'Bo' and rank = 2 and correct_answers = 0 and questions_answered = 1 and total_time_ms = 1500;
  raise notice '% second place has 0 correct, 1 answered, 1500 ms', case when v_n = 1 then 'PASS' else 'FAIL' end;

  perform set_config('request.jwt.claims', json_build_object('sub', v_lect, 'role', 'authenticated')::text, true);
  select count(*), bool_or(is_me) into v_n, v_b from public.get_session_leaderboard(v_sess);
  raise notice '% owning lecturer sees the session leaderboard (% rows, any is_me=%)', case when v_n = 2 and not v_b then 'PASS' else 'FAIL' end, v_n, v_b;
  select count(*) into v_n from public.get_game_leaderboard(v_game);
  raise notice '% game leaderboard for the lecturer: 2 entries (got %)', case when v_n = 2 then 'PASS' else 'FAIL' end, v_n;
  select count(*) into v_n from public.get_game_leaderboard(v_game, 1);
  raise notice '% game leaderboard respects the limit (got %)', case when v_n = 1 then 'PASS' else 'FAIL' end, v_n;

  perform set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.get_game_leaderboard(v_game);
  raise notice '% a student who played sees the game leaderboard (got %)', case when v_n = 2 then 'PASS' else 'FAIL' end, v_n;

  perform set_config('request.jwt.claims', json_build_object('sub', v_out, 'role', 'authenticated')::text, true);
  begin
    perform public.get_session_leaderboard(v_sess);
    raise notice 'FAIL outsider read the session leaderboard';
  exception when raise_exception then raise notice 'PASS outsider cannot read the session leaderboard'; end;
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
  perform set_config('role', 'postgres', true);

  update public.game_sessions set status = 'ended' where id = v_sess;
  perform set_config('request.jwt.claims', json_build_object('sub', v_stud, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  begin
    perform public.get_session_questions(v_sess);
    raise notice 'FAIL ended session still readable';
  exception when raise_exception then raise notice 'PASS ended session not readable'; end;
  perform set_config('role', 'postgres', true);

  raise notice '% helpers not exposed in public schema',
    case when to_regprocedure('public.owns_collection(uuid)') is null then 'PASS' else 'FAIL' end;
end;
$test$;
rollback;
