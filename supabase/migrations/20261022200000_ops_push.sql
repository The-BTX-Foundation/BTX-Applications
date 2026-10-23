-- Push notifications for the BTX Ops Hub iPhone app (docs/ops-iphone-app/BUILD.md, PR B).
--
-- Two tables, both written only by the server (the service role):
--   ops_push_devices  one row per phone a board member turned notifications on for. A board member reads their own rows;
--                     nobody writes through the API (the server registers a phone from the signed-in session, never
--                     from a user id in the request).
--   ops_push_log      "never twice" for pushes, like email_log: the server reserves a (person, key) row before it sends
--                     and gives it back when the send fails. No policies, so only the service role can touch it.
--
-- Idempotent: safe to run twice.

create table if not exists public.ops_push_devices (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  kind         text not null default 'apns' check (kind in ('apns')),
  token        text not null check (char_length(token) between 32 and 512),
  label        text check (label is null or char_length(label) <= 80),
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  disabled_at  timestamptz,
  last_error   text check (last_error is null or char_length(last_error) <= 200),
  constraint ops_push_devices_user_token unique (user_id, token)
);

create index if not exists ops_push_devices_user on public.ops_push_devices (user_id) where disabled_at is null;

create table if not exists public.ops_push_log (
  id      bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  key     text not null check (char_length(key) between 1 and 200),
  title   text,
  sent_at timestamptz not null default now(),
  result  text,
  constraint ops_push_log_user_key unique (user_id, key)
);

alter table public.ops_push_devices enable row level security;
alter table public.ops_push_log enable row level security;

-- Staff read their own devices (the app can show "this phone is on"). No insert, update or delete policy: the server
-- writes with the service role.
drop policy if exists ops_push_devices_select_own on public.ops_push_devices;
create policy ops_push_devices_select_own on public.ops_push_devices
  for select to authenticated
  using ((select public.app_role()) in ('admin', 'board') and user_id = (select auth.uid()));

-- ops_push_log has no policy on purpose: row level security with no policy denies everyone but the service role.

revoke all on public.ops_push_devices from anon;
revoke insert, update, delete, truncate on public.ops_push_devices from authenticated;
revoke all on public.ops_push_log from anon, authenticated;
revoke usage, select on sequence public.ops_push_log_id_seq from anon, authenticated;
