-- Manual RLS-isolation test for the Scholarship backend
-- (20260930120000_create_scholarship_backend.sql).
--
-- HOW TO RUN:
--   1. Apply that migration first.
--   2. Paste this ENTIRE file into the Supabase SQL Editor and run it as one
--      block (the temp table and role-switches below depend on running in a
--      single session -- running statements one at a time in separate
--      "Run" clicks works too, as long as you don't open a new SQL Editor
--      tab partway through, which would start a new session).
--   3. Read the output of each SELECT under "STEP 4: RLS-proof queries"
--      yourself and confirm the row counts/values match the comment above
--      each query -- this script prints results, it does not assert them.
--   4. Only after you've reviewed those results, run the "STEP 5: cleanup"
--      block at the bottom. Do not leave this test data in a real database.
--
-- There was no pre-existing convention in this repo for faking a JWT role
-- claim to test RLS by hand (checked all migrations -- none exist), so this
-- uses Supabase's standard approach: `set role authenticated` plus
-- `set_config('request.jwt.claims', ...)`, which is what auth.jwt() reads.
--
-- Test data uses cycle_year 2099 and the name "TEST Applicant" /
-- test.applicant@terpmail.umd.edu specifically so it can never collide with
-- or be mistaken for a real cycle/applicant.

-- ---------------------------------------------------------------------
-- STEP 1 + 2: seed a fake cycle and applicant (runs as the SQL Editor's
-- default connection, postgres -- a superuser, so it bypasses RLS/grants
-- regardless of the policies above; this is expected and is how every
-- writer in this schema besides the future Edge Function would insert).
-- ---------------------------------------------------------------------

create temporary table _scholarship_test_capture (
  applicant_id uuid,
  applicant_code text
);

insert into public.scholarship_cycles (cycle_year, label, status, opens_at, closes_at)
values (2099, 'TEST CYCLE -- delete me', 'open', '2099-01-01', '2099-03-01');

-- applicant_code and terpmail_email casing are both set by the
-- set_scholarship_applicant_code trigger, not by this INSERT -- the values
-- supplied for them here (if any) would be overwritten/normalized anyway.
with ins as (
  insert into public.scholarship_applicants (
    cycle_year, full_name, terpmail_email, phone, gender, race, attends_umd,
    education_status, credits_left, major, how_heard, award_opt_outs,
    certification_interest, essay_text, selected_slots, resume_filename,
    transcript_filename, agreed_accurate, agreed_terms, agreed_privacy
  )
  values (
    2099, 'TEST Applicant', 'TEST.Applicant@terpmail.umd.edu', '(555) 555-5555',
    'Prefer not to say', 'Prefer not to say', true, 'Senior', 12,
    'Undecided / Other', 'Test harness', '{}', false,
    'This is a test essay, not a real applicant.', '{}', 'test_resume.pdf',
    'test_transcript.pdf', true, true, true
  )
  returning id, applicant_code
)
insert into _scholarship_test_capture (applicant_id, applicant_code)
select id, applicant_code from ins;

-- Sanity check -- confirm the trigger ran (applicant_code populated,
-- non-client-supplied) and email was lowercased.
select applicant_id, applicant_code from _scholarship_test_capture;
select terpmail_email from public.scholarship_applicants
  where id = (select applicant_id from _scholarship_test_capture);

-- ---------------------------------------------------------------------
-- STEP 3: one linked row in each of the five operational tables.
-- ---------------------------------------------------------------------

insert into public.scholarship_interviews (applicant_id, cycle_year, scheduled_at, co_interviewer_label, mode, status, meeting_link)
select applicant_id, 2099, now() + interval '1 day', 'Board Member A', 'Video', 'Scheduled', 'https://example.com/test-meeting'
from _scholarship_test_capture;

insert into public.scholarship_scores (applicant_id, cycle_year, interviewer_label, criterion_scores, notes, general_notes, weighted_total, status)
select applicant_id, 2099, 'Board Member A', '{"leadership": 4, "need": 5}'::jsonb, '{"leadership": "solid answer"}'::jsonb, 'Test score row.', 4.5, 'draft'
from _scholarship_test_capture;

insert into public.scholarship_board_votes (applicant_id, cycle_year, board_member_label, decision)
select applicant_id, 2099, 'Board Member A', 'agreed'
from _scholarship_test_capture;

insert into public.scholarship_decisions (applicant_id, cycle_year, stage, scholarship_type, award_amount, final_score, decided_at)
select applicant_id, 2099, 'in_review', 'General', 1000, 4.5, null
from _scholarship_test_capture;

-- ---------------------------------------------------------------------
-- STEP 4: RLS-proof queries. Review each result set yourself.
-- ---------------------------------------------------------------------

-- ADMIN SESSION -- expect: 1 row from scholarship_applicants (the test
-- applicant, full PII visible), and 1 row each from the five operational
-- tables.
set role authenticated;
select set_config('request.jwt.claims', '{"user_metadata": {"role": "admin"}}', false);

select 'admin sees scholarship_applicants' as check_label, count(*) as row_count
  from public.scholarship_applicants where cycle_year = 2099;
select 'admin sees scholarship_interviews' as check_label, count(*) as row_count
  from public.scholarship_interviews where cycle_year = 2099;
select 'admin sees scholarship_scores' as check_label, count(*) as row_count
  from public.scholarship_scores where cycle_year = 2099;
select 'admin sees scholarship_board_votes' as check_label, count(*) as row_count
  from public.scholarship_board_votes where cycle_year = 2099;
select 'admin sees scholarship_decisions' as check_label, count(*) as row_count
  from public.scholarship_decisions where cycle_year = 2099;

reset role;

-- BOARD SESSION -- expect: 0 rows from scholarship_applicants (PII hidden),
-- 1 row each from the five operational tables.
set role authenticated;
select set_config('request.jwt.claims', '{"user_metadata": {"role": "board"}}', false);

select 'board sees scholarship_applicants (expect 0)' as check_label, count(*) as row_count
  from public.scholarship_applicants where cycle_year = 2099;
select 'board sees scholarship_interviews' as check_label, count(*) as row_count
  from public.scholarship_interviews where cycle_year = 2099;
select 'board sees scholarship_scores' as check_label, count(*) as row_count
  from public.scholarship_scores where cycle_year = 2099;
select 'board sees scholarship_board_votes' as check_label, count(*) as row_count
  from public.scholarship_board_votes where cycle_year = 2099;
select 'board sees scholarship_decisions' as check_label, count(*) as row_count
  from public.scholarship_decisions where cycle_year = 2099;

reset role;

-- REVIEWER SESSION -- same expectation as board above.
set role authenticated;
select set_config('request.jwt.claims', '{"user_metadata": {"role": "reviewer"}}', false);

select 'reviewer sees scholarship_applicants (expect 0)' as check_label, count(*) as row_count
  from public.scholarship_applicants where cycle_year = 2099;
select 'reviewer sees scholarship_interviews' as check_label, count(*) as row_count
  from public.scholarship_interviews where cycle_year = 2099;
select 'reviewer sees scholarship_scores' as check_label, count(*) as row_count
  from public.scholarship_scores where cycle_year = 2099;
select 'reviewer sees scholarship_board_votes' as check_label, count(*) as row_count
  from public.scholarship_board_votes where cycle_year = 2099;
select 'reviewer sees scholarship_decisions' as check_label, count(*) as row_count
  from public.scholarship_decisions where cycle_year = 2099;

reset role;

-- PII-LEAK CHECK -- grep-style scan of every text/jsonb column on the five
-- operational tables for the test applicant's name or email. Every row
-- below should show leak_count = 0. Runs as postgres (post-reset), which
-- bypasses RLS, so this checks the underlying data itself, not what a role
-- can see.
select 'scholarship_interviews' as tbl, count(*) as leak_count
  from public.scholarship_interviews
  where applicant_id = (select applicant_id from _scholarship_test_capture)
    and (
      coalesce(co_interviewer_label, '') ilike '%TEST Applicant%'
      or coalesce(co_interviewer_label, '') ilike '%test.applicant@terpmail.umd.edu%'
      or coalesce(meeting_link, '') ilike '%TEST Applicant%'
      or coalesce(meeting_link, '') ilike '%test.applicant@terpmail.umd.edu%'
    )
union all
select 'scholarship_scores', count(*)
  from public.scholarship_scores
  where applicant_id = (select applicant_id from _scholarship_test_capture)
    and (
      coalesce(interviewer_label, '') ilike '%TEST Applicant%'
      or coalesce(interviewer_label, '') ilike '%test.applicant@terpmail.umd.edu%'
      or coalesce(general_notes, '') ilike '%TEST Applicant%'
      or coalesce(general_notes, '') ilike '%test.applicant@terpmail.umd.edu%'
      or coalesce(criterion_scores::text, '') ilike '%TEST Applicant%'
      or coalesce(criterion_scores::text, '') ilike '%test.applicant@terpmail.umd.edu%'
      or coalesce(notes::text, '') ilike '%TEST Applicant%'
      or coalesce(notes::text, '') ilike '%test.applicant@terpmail.umd.edu%'
    )
union all
select 'scholarship_board_votes', count(*)
  from public.scholarship_board_votes
  where applicant_id = (select applicant_id from _scholarship_test_capture)
    and (
      coalesce(board_member_label, '') ilike '%TEST Applicant%'
      or coalesce(board_member_label, '') ilike '%test.applicant@terpmail.umd.edu%'
    )
union all
select 'scholarship_decisions', count(*)
  from public.scholarship_decisions
  where applicant_id = (select applicant_id from _scholarship_test_capture)
    and (
      coalesce(scholarship_type, '') ilike '%TEST Applicant%'
      or coalesce(scholarship_type, '') ilike '%test.applicant@terpmail.umd.edu%'
    );

-- ---------------------------------------------------------------------
-- STEP 5: cleanup -- children before the parent. Runs as postgres
-- (RLS-bypassing), since none of these tables have a DELETE policy for any
-- client role. Only run this after you've reviewed the results above.
-- ---------------------------------------------------------------------

delete from public.scholarship_decisions
  where applicant_id = (select applicant_id from _scholarship_test_capture);
delete from public.scholarship_board_votes
  where applicant_id = (select applicant_id from _scholarship_test_capture);
delete from public.scholarship_scores
  where applicant_id = (select applicant_id from _scholarship_test_capture);
delete from public.scholarship_interviews
  where applicant_id = (select applicant_id from _scholarship_test_capture);
delete from public.scholarship_applicants
  where id = (select applicant_id from _scholarship_test_capture);
delete from public.scholarship_cycles
  where cycle_year = 2099;

drop table if exists _scholarship_test_capture;

-- Verification -- every row count below must be 0.
select 'scholarship_cycles' as tbl, count(*) as remaining from public.scholarship_cycles where cycle_year = 2099
union all
select 'scholarship_applicants', count(*) from public.scholarship_applicants where cycle_year = 2099
union all
select 'scholarship_interviews', count(*) from public.scholarship_interviews where cycle_year = 2099
union all
select 'scholarship_scores', count(*) from public.scholarship_scores where cycle_year = 2099
union all
select 'scholarship_board_votes', count(*) from public.scholarship_board_votes where cycle_year = 2099
union all
select 'scholarship_decisions', count(*) from public.scholarship_decisions where cycle_year = 2099;
