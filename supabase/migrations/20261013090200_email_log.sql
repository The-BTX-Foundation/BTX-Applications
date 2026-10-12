-- =============================================================================
-- Email log (2026-10-13). One row per email the apps send, so the same kind is
-- never sent twice to the same application and the Ops Hub can show "Sent to 18
-- applicants, Mon Nov 9, 9:02 AM". Additive: one new table, nothing else changes.
--
--   Written:  only by the server with the service role (the Portal's confirmation
--             email and the Ops Hub's batches). No insert/update/delete policy for
--             any signed-in role.
--   Read:     admins only (board members and reviewers never see addresses here).
--
-- Safe to run twice.
-- =============================================================================

begin;

create table if not exists public.email_log (
  id             uuid primary key default gen_random_uuid(),
  kind           text not null check (kind in ('confirmation', 'book', 'won', 'not-picked', 'staff-invite')),
  cycle_id       uuid references public.cycles (id) on delete cascade,
  application_id uuid references public.applications (id) on delete cascade,
  to_address     text not null,
  resend_id      text,
  sent_at        timestamptz not null default now()
);

-- Never the same kind twice to the same application. Staff invites have no application, so they are not limited here.
create unique index if not exists email_log_once_per_application
  on public.email_log (kind, application_id) where application_id is not null;

create index if not exists email_log_kind_cycle on public.email_log (kind, cycle_id, sent_at desc);

alter table public.email_log enable row level security;

revoke all on public.email_log from public, anon, authenticated;
grant select on public.email_log to authenticated;  -- RLS below: admins only
grant all on public.email_log to service_role;

drop policy if exists email_log_select_admin on public.email_log;
create policy email_log_select_admin on public.email_log
  for select to authenticated
  using ((select public.app_role()) = 'admin');

commit;
