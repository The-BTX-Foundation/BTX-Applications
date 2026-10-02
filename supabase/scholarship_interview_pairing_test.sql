-- Manual seed-and-describe test for the interview-pairing backend
-- (20261002130000_scholarship_interview_pairing.sql, plus the
-- save-board-availability and run-interview-pairing Edge Functions).
--
-- HOW TO RUN:
--   1. Apply that migration first.
--   2. Paste this ENTIRE file into a single Supabase SQL Editor tab and
--      run it as one block -- same reason as
--      supabase/scholarship_backend_test.sql: the temp table and STEP 2's
--      checks are session-scoped.
--   3. This script CANNOT invoke an Edge Function itself -- there is no
--      SQL-level way to call run-interview-pairing. What it CAN do, and
--      does: seed deterministic data, assert the seed itself landed
--      correctly, and print out EXACTLY what a dry_run call to
--      run-interview-pairing should return for this seed data. After
--      running this file, call the function by hand (e.g. with curl or
--      Postman, as an admin session's JWT) with
--      { "dry_run": true } and compare its response against the NOTICE
--      this script prints -- see STEP 2's own comment for the exact
--      expected shape.
--   4. Read the result: STEP 2 runs inside one PL/pgSQL block that RAISEs
--      EXCEPTION the instant a SEED-DATA check fails (same fail-fast
--      convention as scholarship_backend_test.sql), so a failure here
--      means the seed itself is broken, not that the Edge Function
--      disagreed with it -- this script has no way to detect the latter.
--      A clean run ends with a single 'PASS -- ...' NOTICE containing the
--      full expected dry_run shape, and cleanup always runs at the very
--      end of that same success path -- there is nothing in this script
--      gated on whether you've actually called the Edge Function yet, so
--      running this file and inspecting the function's response are two
--      independent steps; do the latter BEFORE re-running this file a
--      second time, since cleanup removes the seed data the function call
--      would need to read.
--   5. If you get a FAIL: investigate with cycle_year = 2098 against
--      scholarship_cycles/scholarship_applicants/
--      scholarship_board_availability, then manually delete those rows
--      (children before parents, same order as STEP 3 below) before
--      re-running this file.
--
-- Test data uses cycle_year 2098 -- deliberately distinct from
-- scholarship_backend_test.sql's 2099, so the two scripts' seed data can
-- never collide if run close together in the same database.
--
-- Same two-top-level-block structure as scholarship_backend_test.sql, and
-- for the same reason: an explicit COMMIT after STEP 1 so a later RAISE
-- EXCEPTION in STEP 2 can't roll back the seed data too, leaving it in
-- place for inspection on a FAIL.

-- ---------------------------------------------------------------------
-- STEP 1: seed one cycle, three applicants, and four board-availability
-- rows across three board members -- deliberately shaped so the expected
-- run-interview-pairing result is fully deterministic (see STEP 2's own
-- comment for exactly what that result is). Runs as the SQL Editor's
-- default connection, postgres -- a superuser, bypassing RLS/grants,
-- same as every INSERT in scholarship_backend_test.sql.
--
-- Slot design (six slot ids, "YYYY-MM-DD-HHMM" shape -- see
-- btx-frontend-portal/src/lib/interviewSlots.js and
-- run-interview-pairing's own comment on why this is the id shape
-- reused, not Interviews.vue's unrelated sample data):
--   SLOT_A 2098-03-02-1000 -- TEST Board Member A AND B both free here
--                             (2 distinct members -> a real candidate
--                             slot).
--   SLOT_B 2098-03-02-1030 -- only TEST Board Member A free (1 member).
--   SLOT_C 2098-03-02-1100 -- nobody free (0 members).
--   SLOT_D 2098-03-03-1400 -- only TEST Board Member C free (1 member).
--   SLOT_E 2098-03-03-1430 -- nobody free (0 members).
--   SLOT_F 2098-03-04-0900 -- nobody free (0 members).
--
-- Applicant design:
--   TEST Applicant One   selected_slots = {SLOT_A, SLOT_B, SLOT_C, SLOT_D}
--   TEST Applicant Two   selected_slots = {SLOT_A, SLOT_B, SLOT_C, SLOT_D}
--     Both share the exact same four slots, of which only SLOT_A has a
--     2-person overlap -- so both have exactly one candidate_slot
--     (SLOT_A) with exactly 2 available members (A, B). That makes the
--     expected pairing fully deterministic: both get paired to SLOT_A
--     with interviewer_one/two_label = TEST Board Member A and TEST
--     Board Member B (the only two members who could possibly be
--     picked, since the weighted choice is "2 distinct from a pool of
--     exactly 2").
--   TEST Applicant Three selected_slots = {SLOT_B, SLOT_D, SLOT_E, SLOT_F}
--     Deliberately has NO slot with 2-person overlap (SLOT_B has only A,
--     SLOT_D has only C, SLOT_E/SLOT_F have nobody) -- proves the
--     "unpaired with reason" path. Submitted earliest of the three (see
--     submitted_at below) specifically so a human reading the dry_run
--     response in submitted_at order sees the unpaired case appear
--     first, not buried after two successful pairings.
--
-- submitted_at is staggered explicitly (not left to each row's own
-- now()) so the expected processing order is unambiguous: Three, then
-- One, then Two.
-- ---------------------------------------------------------------------

BEGIN;

create temporary table _pairing_test_capture (
  label text,
  applicant_id uuid,
  applicant_code text
);

insert into public.scholarship_cycles (cycle_year, label, status, opens_at, closes_at)
values (2098, 'TEST CYCLE -- delete me (interview pairing)', 'open', '2098-01-01', '2098-06-01');

with ins as (
  insert into public.scholarship_applicants (
    cycle_year, full_name, terpmail_email, phone, gender, race, attends_umd,
    education_status, credits_left, major, how_heard, award_opt_outs,
    certification_interest, essay_text, selected_slots, resume_filename,
    transcript_filename, agreed_accurate, agreed_terms, agreed_privacy, submitted_at
  )
  values (
    2098, 'TEST Applicant Three', 'TEST.Applicant.Three@terpmail.umd.edu', '(555) 555-5553',
    'Prefer not to say', 'Prefer not to say', true, 'Senior', 12,
    'Undecided / Other', 'Test harness', '{}', false,
    'Test essay for the interview-pairing test -- Applicant Three (expected unpaired).',
    ARRAY['2098-03-02-1030', '2098-03-03-1400', '2098-03-03-1430', '2098-03-04-0900'],
    'test_resume.pdf', 'test_transcript.pdf', true, true, true, now() - interval '3 hours'
  )
  returning id, applicant_code
)
insert into _pairing_test_capture (label, applicant_id, applicant_code)
select 'three', id, applicant_code from ins;

with ins as (
  insert into public.scholarship_applicants (
    cycle_year, full_name, terpmail_email, phone, gender, race, attends_umd,
    education_status, credits_left, major, how_heard, award_opt_outs,
    certification_interest, essay_text, selected_slots, resume_filename,
    transcript_filename, agreed_accurate, agreed_terms, agreed_privacy, submitted_at
  )
  values (
    2098, 'TEST Applicant One', 'TEST.Applicant.One@terpmail.umd.edu', '(555) 555-5551',
    'Prefer not to say', 'Prefer not to say', true, 'Senior', 12,
    'Undecided / Other', 'Test harness', '{}', false,
    'Test essay for the interview-pairing test -- Applicant One (expected paired).',
    ARRAY['2098-03-02-1000', '2098-03-02-1030', '2098-03-02-1100', '2098-03-03-1400'],
    'test_resume.pdf', 'test_transcript.pdf', true, true, true, now() - interval '2 hours'
  )
  returning id, applicant_code
)
insert into _pairing_test_capture (label, applicant_id, applicant_code)
select 'one', id, applicant_code from ins;

with ins as (
  insert into public.scholarship_applicants (
    cycle_year, full_name, terpmail_email, phone, gender, race, attends_umd,
    education_status, credits_left, major, how_heard, award_opt_outs,
    certification_interest, essay_text, selected_slots, resume_filename,
    transcript_filename, agreed_accurate, agreed_terms, agreed_privacy, submitted_at
  )
  values (
    2098, 'TEST Applicant Two', 'TEST.Applicant.Two@terpmail.umd.edu', '(555) 555-5552',
    'Prefer not to say', 'Prefer not to say', true, 'Senior', 12,
    'Undecided / Other', 'Test harness', '{}', false,
    'Test essay for the interview-pairing test -- Applicant Two (expected paired).',
    ARRAY['2098-03-02-1000', '2098-03-02-1030', '2098-03-02-1100', '2098-03-03-1400'],
    'test_resume.pdf', 'test_transcript.pdf', true, true, true, now() - interval '1 hour'
  )
  returning id, applicant_code
)
insert into _pairing_test_capture (label, applicant_id, applicant_code)
select 'two', id, applicant_code from ins;

insert into public.scholarship_board_availability (board_member_label, cycle_year, slot_id) values
  ('TEST Board Member A', 2098, '2098-03-02-1000'),
  ('TEST Board Member B', 2098, '2098-03-02-1000'),
  ('TEST Board Member A', 2098, '2098-03-02-1030'),
  ('TEST Board Member C', 2098, '2098-03-03-1400');

COMMIT;

-- ---------------------------------------------------------------------
-- STEP 2: assert the seed data itself landed as designed (fail fast,
-- leave data in place for inspection on FAIL), then print the exact
-- expected run-interview-pairing dry_run result, then clean up
-- unconditionally -- there is no Edge Function call for this script to
-- gate cleanup on; a human verifies that separately (see HOW TO RUN
-- step 3 above), and this script's own job ends at "the seed data exists
-- and is shaped correctly."
-- ---------------------------------------------------------------------

DO $$
DECLARE
  v_count integer;
  v_one_id uuid;
  v_two_id uuid;
  v_three_id uuid;
  v_one_code text;
  v_two_code text;
  v_three_code text;
BEGIN
  SELECT applicant_id, applicant_code INTO v_one_id, v_one_code FROM _pairing_test_capture WHERE label = 'one';
  SELECT applicant_id, applicant_code INTO v_two_id, v_two_code FROM _pairing_test_capture WHERE label = 'two';
  SELECT applicant_id, applicant_code INTO v_three_id, v_three_code FROM _pairing_test_capture WHERE label = 'three';

  IF v_one_id IS NULL OR v_two_id IS NULL OR v_three_id IS NULL THEN
    RAISE EXCEPTION 'FAIL: one or more of the three test applicants was not captured (one=%, two=%, three=%)', v_one_id, v_two_id, v_three_id;
  END IF;

  -- Sanity: exactly 3 applicants, 1 cycle, 4 availability rows for 2098 --
  -- catches a partial/duplicate seed from a prior failed run before STEP
  -- 2's later checks produce confusing results against stale data.
  SELECT count(*) INTO v_count FROM public.scholarship_applicants WHERE cycle_year = 2098;
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'FAIL: expected exactly 3 seeded applicants for cycle_year 2098, found %', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.scholarship_cycles WHERE cycle_year = 2098;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL: expected exactly 1 seeded scholarship_cycles row for 2098, found %', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.scholarship_board_availability WHERE cycle_year = 2098;
  IF v_count <> 4 THEN
    RAISE EXCEPTION 'FAIL: expected exactly 4 seeded scholarship_board_availability rows for 2098, found %', v_count;
  END IF;

  SELECT count(DISTINCT board_member_label) INTO v_count FROM public.scholarship_board_availability WHERE cycle_year = 2098;
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'FAIL: expected exactly 3 distinct board_member_labels for 2098, found %', v_count;
  END IF;

  -- Sanity: none of the three applicants already has an interview row --
  -- if they did (e.g. a stale row from a prior interrupted run), the
  -- "no existing interview row" half of run-interview-pairing's
  -- eligibility filter would skip them, and the dry_run comparison below
  -- would not match this script's own description.
  SELECT count(*) INTO v_count
    FROM public.scholarship_interviews
    WHERE applicant_id IN (v_one_id, v_two_id, v_three_id);
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL: % of the 3 test applicants already has a scholarship_interviews row -- clean up manually before re-running', v_count;
  END IF;

  -- ===== Everything above passed -- print the exact expected dry_run
  -- shape for a human to compare against a real call to
  -- run-interview-pairing with { "dry_run": true } (as an admin
  -- session). =====
  -- NOTE on the format string below: Postgres RAISE uses bare % as a
  -- parameter placeholder -- there are deliberately 6 of them here
  -- (applicant_id, applicant_code for each of the three applicants, in
  -- that order), matching the 6 arguments passed after the string. This
  -- is written as ONE E'...' literal with real embedded newlines
  -- (typed directly, not as \n escapes split across separately-quoted,
  -- concatenated segments) specifically to avoid relying on how Postgres
  -- handles escape processing across concatenated string literals --
  -- that interaction is not something to gamble on in a script meant to
  -- actually run correctly.
  RAISE NOTICE E'SEED OK -- expected run-interview-pairing dry_run result for cycle_year 2098:
  paired_count: 2, unpaired_count: 1
  paired: [
    { applicant_id: %, applicant_code: %, scheduled_at: resolves "2098-03-02-1000" (America/New_York) to UTC,
      interviewer_one_label/interviewer_two_label: TEST Board Member A and TEST Board Member B in EITHER order
      (the only 2 members available at that slot -- SLOT_A is the only candidate_slot either applicant has),
      mode: Video, status: Scheduled },
    { applicant_id: %, applicant_code: %, scheduled_at/interviewers/mode/status: same as above (both candidate
      sets are identical, so both land on SLOT_A with the same 2 interviewers) }
  ] -- order between Applicant One and Applicant Two above matches submitted_at ascending (One before Two).
  unpaired: [
    { applicant_id: %, applicant_code: %, reason: "no overlapping availability for a 2-interviewer slot" }
  ] -- Applicant Three, listed first in submitted_at order (submitted before One and Two), none of its 4
  slots (2098-03-02-1030, 2098-03-03-1400, 2098-03-03-1430, 2098-03-04-0900) has 2+ distinct board members free.',
    v_one_id, v_one_code, v_two_id, v_two_code, v_three_id, v_three_code;

  -- ===== Clean up -- always runs once the checks above pass, regardless
  -- of whether the Edge Function has actually been called yet (it can't
  -- be called from this script -- see header comment). Children before
  -- parents. =====
  DELETE FROM public.scholarship_interviews WHERE applicant_id IN (v_one_id, v_two_id, v_three_id);
  DELETE FROM public.scholarship_applicants WHERE id IN (v_one_id, v_two_id, v_three_id);
  DELETE FROM public.scholarship_board_availability WHERE cycle_year = 2098;
  DELETE FROM public.scholarship_cycles WHERE cycle_year = 2098;

  SELECT count(*) INTO v_count FROM (
    SELECT 1 FROM public.scholarship_cycles WHERE cycle_year = 2098
    UNION ALL SELECT 1 FROM public.scholarship_applicants WHERE cycle_year = 2098
    UNION ALL SELECT 1 FROM public.scholarship_board_availability WHERE cycle_year = 2098
    UNION ALL SELECT 1 FROM public.scholarship_interviews WHERE applicant_id IN (v_one_id, v_two_id, v_three_id)
  ) remaining;

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL: cleanup left % row(s) behind for cycle_year 2098', v_count;
  END IF;

  RAISE NOTICE 'PASS -- seed data verified and described above, then cleaned up (cycle_year 2098, 0 rows remaining)';
END $$;
