-- Adds reviewer to donor_impact's view policy, matching the
-- profiles_include_reviewer.sql / tasks_alerts_assignee_gating.sql pattern
-- of tracking a role-access addition separately from a table's original
-- creation.
--
-- Timestamped 2026-08-24 12:24:52 -0400, the commit time of 5b9859c ("Move
-- Headline Metrics into the homepage, fix reviewer access gap"). That
-- commit's message states RLS "already grants [reviewer] read access on
-- donor_impact" at the time it was written -- this is the earliest point
-- git evidence proves the change already existed, NOT a record of when
-- the ALTER POLICY itself was actually run. The true execution time is
-- unknown; it was applied via the Supabase SQL Editor with no
-- corresponding tracked change. This file is applied via `migration
-- repair`, which records it as already-applied without executing this SQL
-- against the live database, so the exact timestamp only affects local
-- replay ordering, not live state.
alter policy "Admin and board can view donor impact"
  on public.donor_impact
  using ((auth.jwt() -> 'user_metadata' ->> 'role') = any (array['admin', 'board', 'reviewer']));
