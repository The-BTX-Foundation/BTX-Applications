-- Adds the 13 Engagement/Outcomes/Equity/Stewardship fields to donor_impact,
-- backing what were previously client-only placeholder tabs in
-- DonorImpact.vue. Applied live via the Supabase SQL Editor earlier in this
-- session (2026-09-01), not through this file. Tracked here via
-- `migration repair`, which records this version as already-applied
-- without re-executing this SQL against the live database. Column types
-- verified against a live schema dump: all nullable, no defaults, same as
-- every donor_impact column added by the two prior migrations.
alter table public.donor_impact
  -- Engagement
  add column workshops_held integer,
  add column attendance_per_workshop numeric,
  add column mentor_volunteer_hours numeric,
  add column repeat_engagement integer,
  add column students_sponsored_travel integer,
  add column students_sponsored_certifications integer,
  -- Outcomes
  add column retention_graduation_rate numeric,
  add column gpa_improvement numeric,
  add column internships_received integer,
  add column post_graduation_outcomes numeric,
  -- Equity
  add column pct_first_generation numeric,
  add column pct_underrepresented_low_income numeric,
  -- Stewardship
  add column pct_donations_to_programs numeric;
