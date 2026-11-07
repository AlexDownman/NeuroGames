-- =============================================================================
-- Drops the match_up game type — the product now offers only Answer Run and
-- Quiz Battle. Fails if any game still uses match_up (there were none when
-- this was written).
-- =============================================================================

alter table public.games drop constraint games_game_type_check;

alter table public.games
  add constraint games_game_type_check check (game_type in ('answer_run', 'quiz_battle'));
