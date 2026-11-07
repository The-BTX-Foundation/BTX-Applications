-- =============================================================================
-- Teams sign-in (2026-11-06). One row that holds the newest Microsoft refresh
-- token for BTX's Teams account (admin@btxfoundation.onmicrosoft.com), so the Ops
-- Hub can make a Teams meeting for each scholarship interview ("Make Teams links",
-- apps/ops/lib/teams/). Microsoft hands back a new refresh token on every use; the
-- server writes it here each time. Additive: one new table, nothing else changes.
--
--   Written and read: only by the server with the service role. Row level
--             security is on with no policies, and anon and authenticated have
--             no rights at all, so no signed-in person (admins included) can
--             read the token through the API.
--   One row:  the key is the constant 'btx' (a check allows nothing else).
--   Seed:     the server falls back to the env var BTX_TEAMS_REFRESH_TOKEN when
--             this table is empty, then saves the rotated token here.
--
-- Safe to run twice.
-- =============================================================================

begin;

create table if not exists public.teams_auth (
  id            text primary key default 'btx' check (id = 'btx'),
  refresh_token text not null,
  updated_at    timestamptz not null default now()
);

alter table public.teams_auth enable row level security;

-- No policies on purpose. Only the service role (which skips row level security) reaches this table.
revoke all on public.teams_auth from public, anon, authenticated;
grant select, insert, update, delete on public.teams_auth to service_role;

commit;
