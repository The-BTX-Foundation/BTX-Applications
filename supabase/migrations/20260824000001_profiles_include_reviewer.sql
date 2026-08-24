-- Reviewer was missing from the profiles SELECT policy, so reviewers saw
-- "Unassigned" for every task_alerts row's assignee name (the profiles join
-- silently returns null under RLS rather than erroring). Add reviewer here
-- to match the tasks_alerts policies, which already treat board/admin/
-- reviewer as one group for read access.
drop policy "Board/Admin can view profiles" on public.profiles;

create policy "Board/Admin can view profiles"
  on public.profiles
  for select
  using ((auth.jwt() -> 'user_metadata' ->> 'role') in ('board', 'admin', 'reviewer'));
