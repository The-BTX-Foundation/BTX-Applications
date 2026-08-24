-- Adds an 'Approved' status so Approval-type rows can move Open -> Approved
-- -> Complete instead of jumping straight to Complete, and replaces the
-- single "board/admin/reviewer can do anything" policy with per-command
-- policies so only the assignee can act on their own row.
alter table public.tasks_alerts drop constraint tasks_alerts_status_check;
alter table public.tasks_alerts add constraint tasks_alerts_status_check
  check (status = any (array['Open', 'Overdue', 'Complete', 'Declined', 'Approved']));

drop policy "Allow board, admin, and reviewer access" on public.tasks_alerts;

-- Board/admin/reviewer must see every row (not just ones assigned to them)
-- so they can tell who owns what, even though they can't act on rows that
-- aren't theirs.
create policy "Board/admin/reviewer can view all rows"
  on public.tasks_alerts
  for select
  using ((auth.jwt() -> 'user_metadata' ->> 'role') in ('board', 'admin', 'reviewer'));

-- Task creation stays role-gated only, not assignee-gated -- the assignee is
-- being set as part of this same insert, so there's no prior "assigned_to"
-- to check against.
create policy "Board/admin/reviewer can create rows"
  on public.tasks_alerts
  for insert
  with check ((auth.jwt() -> 'user_metadata' ->> 'role') in ('board', 'admin', 'reviewer'));

-- Updates (Approve/Decline/Mark complete) require both the role check and
-- that the signed-in user is the row's assignee -- this is what actually
-- enforces "only the assignee can act on their own task/approval".
create policy "Only the assignee can update their row"
  on public.tasks_alerts
  for update
  using (
    (auth.jwt() -> 'user_metadata' ->> 'role') in ('board', 'admin', 'reviewer')
    and assigned_to = auth.uid()
  );

-- No delete policy: nothing in the app deletes tasks_alerts rows today, and
-- the prior FOR ALL policy's delete access was incidental, not a feature.
-- Add a scoped delete policy later if a delete feature is actually built.
