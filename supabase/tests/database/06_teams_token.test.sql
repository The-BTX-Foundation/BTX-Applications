-- Teams sign-in in Vault (20261106120000): only the server's service role can read or save the refresh token, through
-- public.teams_token_get() and public.teams_token_set(); anon and signed-in people can do neither and cannot see the
-- secret; a value that is not a token is refused.
-- Run with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

-- The functions exist and are locked down.
select has_function('public', 'teams_token_get', 'teams_token_get() exists');
select has_function('public', 'teams_token_set', array['text'], 'teams_token_set(text) exists');
select ok(not has_function_privilege('anon', 'public.teams_token_get()', 'execute'), 'anon cannot run teams_token_get');
select ok(not has_function_privilege('authenticated', 'public.teams_token_get()', 'execute'), 'authenticated cannot run teams_token_get');
select ok(not has_function_privilege('anon', 'public.teams_token_set(text)', 'execute'), 'anon cannot run teams_token_set');
select ok(not has_function_privilege('authenticated', 'public.teams_token_set(text)', 'execute'), 'authenticated cannot run teams_token_set');
select ok(has_function_privilege('service_role', 'public.teams_token_get()', 'execute'), 'service_role can run teams_token_get');
select ok(has_function_privilege('service_role', 'public.teams_token_set(text)', 'execute'), 'service_role can run teams_token_set');
select is((select prosecdef from pg_proc where oid = 'public.teams_token_set(text)'::regprocedure), true, 'teams_token_set is security definer');
select ok((select proconfig::text from pg_proc where oid = 'public.teams_token_get()'::regprocedure) like '%search_path=%', 'teams_token_get pins search_path');
select ok((select proconfig::text from pg_proc where oid = 'public.teams_token_set(text)'::regprocedure) like '%search_path=%', 'teams_token_set pins search_path');

-- A fresh local database has no saved token (the migration creates none).
-- The server saves, reads back and rotates.
set local role service_role;
select is((select count(*) from public.teams_token_get()), 0::bigint, 'no row before anything is saved');
select lives_ok($$ select public.teams_token_set('rt-first-0123456789abcdef') $$, 'service_role saves a token');
select is((select refresh_token from public.teams_token_get()), 'rt-first-0123456789abcdef', 'service_role reads it back');
select lives_ok($$ select public.teams_token_set('rt-second-0123456789abcdef') $$, 'service_role saves the rotated token');
select is((select refresh_token from public.teams_token_get()), 'rt-second-0123456789abcdef', 'the rotated token replaces the first');
select isnt((select updated_at from public.teams_token_get()), null, 'the row says when it was saved');
reset role;

-- One more save. (The test runner cannot write vault.secrets directly, so it cannot backdate the saved time to
-- prove updated_at moves; teams_token_get() reports greatest(updated_at, created_at), which a save always sets.)
set local role service_role;
select lives_ok($$ select public.teams_token_set('rt-third-0123456789abcdef') $$, 'service_role saves again');

-- Bad input is refused and leaves the saved token alone.
select throws_ok($$ select public.teams_token_set(null) $$, '22023', null, 'null is refused');
select throws_ok($$ select public.teams_token_set('') $$, '22023', null, 'an empty value is refused');
select throws_ok($$ select public.teams_token_set('short') $$, '22023', null, 'a too-short value is refused');
select throws_ok($$ select public.teams_token_set('rt-with a-space-0123456789') $$, '22023', null, 'a value with a space is refused');
select is((select refresh_token from public.teams_token_get()), 'rt-third-0123456789abcdef', 'the saved token is unchanged after bad input');
reset role;

set local role service_role;
select is((select count(*) from public.teams_token_get()), 1::bigint, 'still exactly one saved token');
reset role;

-- anon and signed-in people get nothing.
set local role anon;
select throws_ok($$ select * from public.teams_token_get() $$, '42501', null, 'anon cannot read the token');
select throws_ok($$ select public.teams_token_set('rt-anon-0123456789abcdefgh') $$, '42501', null, 'anon cannot save a token');
select throws_ok($$ select * from vault.decrypted_secrets $$, '42501', null, 'anon cannot see Vault');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000aa","role":"authenticated","app_metadata":{"role":"admin"}}', true);
select throws_ok($$ select * from public.teams_token_get() $$, '42501', null, 'a signed-in admin cannot read the token');
select throws_ok($$ select public.teams_token_set('rt-admin-0123456789abcdefg') $$, '42501', null, 'a signed-in admin cannot save a token');
select throws_ok($$ select * from vault.decrypted_secrets $$, '42501', null, 'a signed-in admin cannot see Vault');
select throws_ok($$ select * from vault.secrets $$, '42501', null, 'a signed-in admin cannot see the encrypted secrets');
reset role;

select is((select refresh_token from public.teams_token_get()), 'rt-third-0123456789abcdef', 'nobody else changed the token');

select * from finish();
rollback;
