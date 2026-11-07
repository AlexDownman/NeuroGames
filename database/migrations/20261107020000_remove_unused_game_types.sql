-- =============================================================================
-- Drops the millionaire, word_scramble and escape_room game types — the
-- product now offers only Answer Run, Quiz Battle and Match-Up. Fails if any
-- game still uses a removed type (there were none when this was written).
-- =============================================================================

alter table public.games drop constraint games_game_type_check;

alter table public.games
  add constraint games_game_type_check check (game_type in ('answer_run', 'quiz_battle', 'match_up'));
