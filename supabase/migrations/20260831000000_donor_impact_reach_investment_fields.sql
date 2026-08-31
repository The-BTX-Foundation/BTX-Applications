-- Adds the four Reach/Investment fields to donor_impact. Applied live via
-- the Supabase SQL Editor on 2026-08-31 (this session, Step 1) -- not
-- through this file. Tracked here via `migration repair`, which records
-- this version as already-applied without re-executing this SQL against
-- the live database.
alter table public.donor_impact
  add column applicants_count integer,
  add column geographic_spread_count integer,
  add column scholarship_funds_awarded numeric,
  add column other_program_funds_awarded numeric;
