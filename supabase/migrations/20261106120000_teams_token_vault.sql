-- =============================================================================
-- Teams sign-in, kept encrypted (2026-11-06). The newest Microsoft refresh token
-- for BTX's Teams meetings account (meetings@btxfoundation.onmicrosoft.com, a
-- licensed non-admin user) is stored in Supabase Vault, so the Ops Hub can make a
-- Teams meeting for each scholarship interview ("Make Teams links",
-- apps/ops/lib/teams/). Microsoft hands back a new refresh token on every use; the
-- server writes it back each time. Additive: two functions and one Vault secret,
-- no table, nothing else changes.
--
--   Stored:   one Vault secret named 'btx_teams_refresh_token' (encrypted at rest
--             by Vault; readable in clear only through vault.decrypted_secrets).
--   Reached:  only through the two functions below. Both are SECURITY DEFINER with
--             search_path pinned to empty, and EXECUTE is granted to service_role
--             only (revoked from public, anon and authenticated). No signed-in
--             person, admins included, can read or write the token.
--   Seed:     the server falls back to the env var BTX_TEAMS_REFRESH_TOKEN when no
--             secret exists yet, then saves the rotated token here.
--
-- Must be applied BEFORE the code that calls it is deployed (the button would say
-- "Couldn't reach Teams" otherwise). Safe to run twice.
-- =============================================================================

begin;

create extension if not exists supabase_vault with schema vault;

-- Reads the saved token and when it was last written. No row when nothing is saved yet.
create or replace function public.teams_token_get()
returns table (refresh_token text, updated_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select s.decrypted_secret, s.updated_at
  from vault.decrypted_secrets s
  where s.name = 'btx_teams_refresh_token'
  limit 1;
$$;

-- Saves a new token: creates the secret the first time, replaces it after that. A token must be 20 to 8000 characters
-- with no spaces or line breaks; anything else is refused (22023) so a bad value never overwrites a working one.
create or replace function public.teams_token_set(p_token text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_token is null or length(p_token) < 20 or length(p_token) > 8000 or p_token ~ '\s' then
    raise exception 'teams_token_set: not a token' using errcode = '22023';
  end if;
  select s.id into v_id from vault.secrets s where s.name = 'btx_teams_refresh_token' limit 1;
  if v_id is null then
    perform vault.create_secret(p_token, 'btx_teams_refresh_token', 'Microsoft refresh token for the BTX Teams meetings account (Ops Hub)');
  else
    perform vault.update_secret(v_id, p_token);
  end if;
end;
$$;

-- Supabase gives new functions in public to anon and authenticated by default: take that away, then allow the server.
revoke all on function public.teams_token_get() from public, anon, authenticated;
revoke all on function public.teams_token_set(text) from public, anon, authenticated;
grant execute on function public.teams_token_get() to service_role;
grant execute on function public.teams_token_set(text) to service_role;

commit;
