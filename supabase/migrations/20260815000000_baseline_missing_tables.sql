-- Baseline migration capturing tables/policies that were applied directly
-- via the Supabase SQL Editor (not through this migrations folder) before
-- this file existed, so local migration history matches what's actually
-- live. Sourced from live-schema dumps taken during this session
-- (2026-08-31) and cross-checked against the app's git history.
--
-- tasks_alerts' original policy below ("Allow board, admin, and reviewer
-- access") no longer exists live -- it was replaced by
-- 20260824000000_tasks_alerts_assignee_gating.sql before this baseline was
-- written. Its shape here is reconstructed from that migration's own DROP
-- POLICY statement (which names it) and its comment describing it as a
-- single "board/admin/reviewer can do anything" policy, matched against
-- the identical FOR ALL role-check pattern still live on budgeting_tasks,
-- fundraising_tasks, and marketing_tasks. This file is applied via
-- `migration repair`, which records it as already-applied without running
-- its SQL against the live database -- so this reconstruction only needs
-- to be correct enough for 20260824000000's own DROP POLICY statement to
-- find a policy of this exact name when migration history replays from
-- scratch; it never touches the live database.

-- tasks_alerts: original creation, pre-dating the 'Approved' status and
-- the per-command policy split added later by
-- 20260824000000_tasks_alerts_assignee_gating.sql.
create table public.tasks_alerts (
  task_id uuid primary key default gen_random_uuid(),
  title text,
  assigned_to uuid references public.profiles(id),
  due_date date,
  status text,
  type text,
  completed_at timestamptz,
  constraint tasks_alerts_status_check
    check (status = any (array['Open', 'Overdue', 'Complete', 'Declined']))
);

alter table public.tasks_alerts enable row level security;

create policy "Allow board, admin, and reviewer access"
  on public.tasks_alerts
  for all
  using ((auth.jwt() -> 'user_metadata' ->> 'role') in ('board', 'admin', 'reviewer'));

grant select, references, trigger, truncate, maintain on table public.tasks_alerts to anon;
grant all on table public.tasks_alerts to authenticated;
grant references, trigger, truncate, maintain on table public.tasks_alerts to service_role;

-- donor_impact: TRUE original creation -- admin/board view access only.
-- Reviewer's SELECT access was added later; see
-- 20260824122452_donor_impact_include_reviewer.sql. The 4 Reach/Investment
-- columns added this session are tracked separately in
-- 20260831000000_donor_impact_reach_investment_fields.sql.
create table public.donor_impact (
  metric_id uuid primary key default gen_random_uuid(),
  cycle_year integer unique,
  funds_granted numeric,
  students_reached integer,
  scholarships_awarded integer,
  published boolean default false
);

alter table public.donor_impact enable row level security;

create policy "Admin and board can view donor impact"
  on public.donor_impact
  for select
  using ((auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'board'));

create policy "Admin can insert donor impact"
  on public.donor_impact
  for insert
  with check ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');

create policy "Admin can update donor impact"
  on public.donor_impact
  for update
  using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');

grant references, trigger, truncate, maintain on table public.donor_impact to anon;
grant select, insert, references, trigger, truncate, maintain, update on table public.donor_impact to authenticated;
grant references, trigger, truncate, maintain on table public.donor_impact to service_role;

-- budgeting_tasks, fundraising_tasks, marketing_tasks: full creation,
-- matching the assignee-gated policy pattern tasks_alerts was later
-- migrated to match (see 20260824000000_tasks_alerts_assignee_gating.sql).
create table public.budgeting_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  date date not null,
  status text not null default 'Open',
  assigned_to uuid references public.profiles(id),
  completed_at timestamptz,
  description text,
  created_at timestamptz not null default now(),
  constraint budgeting_tasks_status_check
    check (status = any (array['Open', 'Overdue', 'Approved', 'Complete', 'Declined']))
);

alter table public.budgeting_tasks enable row level security;

create policy "Board/admin/reviewer can view all rows"
  on public.budgeting_tasks
  for select
  using ((auth.jwt() -> 'user_metadata' ->> 'role') in ('board', 'admin', 'reviewer'));

create policy "Board/admin/reviewer can create rows"
  on public.budgeting_tasks
  for insert
  with check ((auth.jwt() -> 'user_metadata' ->> 'role') in ('board', 'admin', 'reviewer'));

create policy "Only the assignee can update their row"
  on public.budgeting_tasks
  for update
  using (
    (auth.jwt() -> 'user_metadata' ->> 'role') in ('board', 'admin', 'reviewer')
    and assigned_to = auth.uid()
  );

grant references, trigger, truncate, maintain on table public.budgeting_tasks to anon;
grant select, insert, references, trigger, truncate, maintain, update on table public.budgeting_tasks to authenticated;
grant references, trigger, truncate, maintain on table public.budgeting_tasks to service_role;

create table public.fundraising_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  date date not null,
  status text not null default 'Open',
  assigned_to uuid references public.profiles(id),
  completed_at timestamptz,
  description text,
  created_at timestamptz not null default now(),
  constraint fundraising_tasks_status_check
    check (status = any (array['Open', 'Overdue', 'Approved', 'Complete', 'Declined']))
);

alter table public.fundraising_tasks enable row level security;

create policy "Board/admin/reviewer can view all rows"
  on public.fundraising_tasks
  for select
  using ((auth.jwt() -> 'user_metadata' ->> 'role') in ('board', 'admin', 'reviewer'));

create policy "Board/admin/reviewer can create rows"
  on public.fundraising_tasks
  for insert
  with check ((auth.jwt() -> 'user_metadata' ->> 'role') in ('board', 'admin', 'reviewer'));

create policy "Only the assignee can update their row"
  on public.fundraising_tasks
  for update
  using (
    (auth.jwt() -> 'user_metadata' ->> 'role') in ('board', 'admin', 'reviewer')
    and assigned_to = auth.uid()
  );

grant references, trigger, truncate, maintain on table public.fundraising_tasks to anon;
grant select, insert, references, trigger, truncate, maintain, update on table public.fundraising_tasks to authenticated;
grant references, trigger, truncate, maintain on table public.fundraising_tasks to service_role;

create table public.marketing_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  type text not null,
  date date not null,
  status text not null default 'Open',
  assigned_to uuid references public.profiles(id),
  completed_at timestamptz,
  description text,
  created_at timestamptz not null default now(),
  constraint marketing_tasks_status_check
    check (status = any (array['Open', 'Overdue', 'Approved', 'Complete', 'Declined'])),
  constraint marketing_tasks_type_check
    check (type = any (array['Marketing Event', 'Ad Publishment', 'Media Post']))
);

alter table public.marketing_tasks enable row level security;

create policy "Board/admin/reviewer can view all rows"
  on public.marketing_tasks
  for select
  using ((auth.jwt() -> 'user_metadata' ->> 'role') in ('board', 'admin', 'reviewer'));

create policy "Board/admin/reviewer can create rows"
  on public.marketing_tasks
  for insert
  with check ((auth.jwt() -> 'user_metadata' ->> 'role') in ('board', 'admin', 'reviewer'));

create policy "Only the assignee can update their row"
  on public.marketing_tasks
  for update
  using (
    (auth.jwt() -> 'user_metadata' ->> 'role') in ('board', 'admin', 'reviewer')
    and assigned_to = auth.uid()
  );

grant references, trigger, truncate, maintain on table public.marketing_tasks to anon;
grant select, insert, references, trigger, truncate, maintain, update on table public.marketing_tasks to authenticated;
grant references, trigger, truncate, maintain on table public.marketing_tasks to service_role;
