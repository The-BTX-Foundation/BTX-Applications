-- Example cycle for PREVIEWS ONLY. Not a migration; never run against production.
-- Placeholder values in [brackets] match the signed-off Figma frames until the
-- board fills in the real settings in the Ops Hub.
--
-- The dates are moved so the cycle is open right now (opened yesterday, closes
-- in 14 days at 11:59 PM Eastern), so a preview can walk the whole application.
-- Needs the 20261009130000_portal_fresh_start migration applied first.
insert into public.cycles (
  term, year, status,
  award_name, award_amount_cents,
  opens_at, closes_at,
  interview_start, interview_end, decision_date,
  next_cycle_month,
  essay_prompt, essay_use,
  requirements,
  photo_due, payment_note,
  event_enabled, event_at,
  code_lifetime_minutes
) values (
  'Fall 2026', 2026, 'published',
  'Legacy Scholarship', 200000,                       -- stand-in name and amount ($2,000)
  (date_trunc('day', now() at time zone 'America/New_York') - interval '1 day') at time zone 'America/New_York',
  (date_trunc('day', now() at time zone 'America/New_York') + interval '14 days 23 hours 59 minutes') at time zone 'America/New_York',
  (current_date + 15), (current_date + 39), (current_date + 53),
  'October',
  '[Legacy essay prompt to confirm]',
  '[How the essay is used, to confirm]',
  '["Full-time Clark School undergraduate working toward a B.S. in engineering",
    "12 or more credits left in your program",
    "GPA of 2.5 or higher when you apply",
    "[Legacy requirements to confirm]"]'::jsonb,
  null, '[How it''s paid]',
  false, null,
  10
)
on conflict (term) do nothing;
