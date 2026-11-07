-- =============================================================================
-- Re-revokes anon's EXECUTE on submit_answer, which had been re-granted on the
-- live project after 20261107000000_fix_auth_and_gameplay removed it. Players
-- need a Supabase session (anonymous sign-in is fine — that's the
-- authenticated role); the anon role (no session) never calls this.
-- =============================================================================

revoke execute on function public.submit_answer(uuid, uuid, uuid, integer) from public, anon;
grant execute on function public.submit_answer(uuid, uuid, uuid, integer) to authenticated;
