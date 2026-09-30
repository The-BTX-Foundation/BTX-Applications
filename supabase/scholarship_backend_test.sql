-- Manual RLS-isolation test for the Scholarship backend
-- (20260930120000_create_scholarship_backend.sql).
--
-- HOW TO RUN:
--   1. Apply that migration first.
--   2. Paste this ENTIRE file into a single Supabase SQL Editor tab and run
--      it as one block. The temp table and the SET ROLE switches below are
--      session-scoped -- they must not cross a new tab (a new tab is a new
--      session), and running the file in more than one "Run" click within
--      the SAME tab is fine as long as you don't reconnect in between.
--   3. Read the result: this script makes no ambiguous assertions requiring
--      you to eyeball a row count. Everything in STEP 2 below runs inside
--      one PL/pgSQL block that RAISEs EXCEPTION the instant any check
--      fails, so the editor shows you exactly one of two things:
--        - a single 'PASS -- ...' NOTICE (see exact text at the bottom of
--          this file) if every check passed and cleanup ran, or
--        - a 'FAIL: ...' error naming the specific check that failed, with
--          the seed data (cycle_year 2099) left in place, untouched, for
--          you to inspect by hand -- cleanup only runs if every check
--          upstream of it passed.
--   4. If you get a FAIL: investigate with cycle_year = 2099 against the
--      six scholarship_* tables, then manually delete those rows yourself
--      (children before the parent, same order as STEP 3 below) before
--      re-running this whole file -- the setup step's UNIQUE constraints
--      (scholarship_cycles.cycle_year, the applicant's one-per-cycle email
--      index) will otherwise fail on a second run while old test data is
--      still sitting there.
--
-- There was no pre-existing convention in this repo for faking a JWT role
-- claim to test RLS by hand (checked all migrations -- none exist), so this
-- uses Supabase's standard approach: `set role authenticated` plus
-- `set_config('request.jwt.claims', ...)`, which is what auth.jwt() reads.
-- That role-switching technique is unchanged from this file's prior version
-- -- what changed is that the checks built on top of it are now assertions
-- instead of result sets to eyeball.
--
-- Test data uses cycle_year 2099 and the name "TEST Applicant" /
-- test.applicant@terpmail.umd.edu specifically so it can never collide with
-- or be mistaken for a real cycle/applicant.
--
-- Why two separate top-level blocks (STEP 1 setup, then one STEP 2 DO
-- block) instead of one: the Supabase SQL Editor sends this whole file as
-- one multi-statement batch, and without an explicit COMMIT, Postgres would
-- wrap the ENTIRE batch in a single implicit transaction -- meaning a later
-- RAISE EXCEPTION inside STEP 2 would roll back STEP 1's seed rows too,
-- defeating the "leave failing data in place for inspection" requirement.
-- The explicit COMMIT below forces the seed data to persist regardless of
-- what STEP 2 does afterward.

-- ---------------------------------------------------------------------
-- STEP 1: seed a fake cycle, applicant, and one linked row per operational
-- table. Runs as the SQL Editor's default connection, postgres -- a
-- superuser, so it bypasses RLS/grants regardless of the policies below;
-- this is expected and is how every writer in this schema besides the
-- future Edge Function would insert. Explicitly committed (see header
-- comment above) so this data survives even if STEP 2 fails.
-- ---------------------------------------------------------------------

BEGIN;

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

COMMIT;

-- ---------------------------------------------------------------------
-- STEP 2: assert every RLS-isolation check, fail fast on the first
-- mismatch, and only clean up if everything passed. One DO block (rather
-- than separate top-level statements) so control flow doesn't depend on
-- how the SQL Editor's client handles a failed statement mid-batch --
-- inside a single PL/pgSQL block, a RAISE EXCEPTION unconditionally skips
-- every statement after it in this block, including cleanup, no matter
-- what protocol-level batching the editor uses.
-- ---------------------------------------------------------------------

DO $$
DECLARE
  v_applicant_id uuid;
  v_applicant_code text;
  v_email text;
  v_count integer;
BEGIN
  SELECT applicant_id, applicant_code INTO v_applicant_id, v_applicant_code
    FROM _scholarship_test_capture;

  -- Sanity checks on STEP 1's trigger behavior, still running as postgres
  -- (no role switch yet) -- these aren't RLS checks, but they were
  -- eyeball-the-result steps in this file's prior version too.
  IF v_applicant_code IS NULL OR v_applicant_code !~ '^APP-2099-[0-9]{5}$' THEN
    RAISE EXCEPTION 'FAIL: applicant_code was not generated in the expected APP-2099-##### shape (got: %)', v_applicant_code;
  END IF;

  SELECT terpmail_email INTO v_email FROM public.scholarship_applicants WHERE id = v_applicant_id;
  IF v_email IS DISTINCT FROM lower(v_email) THEN
    RAISE EXCEPTION 'FAIL: terpmail_email was not lowercased by the trigger (got: %)', v_email;
  END IF;

  -- ===== ADMIN session -- expect 1 row from every one of the six tables
  -- (full PII visibility on scholarship_applicants included). =====
  SET ROLE authenticated;
  PERFORM set_config('request.jwt.claims', '{"user_metadata": {"role": "admin"}}', false);

  SELECT count(*) INTO v_count FROM public.scholarship_applicants WHERE cycle_year = 2099;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL: admin role saw % of 1 expected row(s) in scholarship_applicants', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.scholarship_interviews WHERE cycle_year = 2099;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL: admin role saw % of 1 expected row(s) in scholarship_interviews', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.scholarship_scores WHERE cycle_year = 2099;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL: admin role saw % of 1 expected row(s) in scholarship_scores', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.scholarship_board_votes WHERE cycle_year = 2099;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL: admin role saw % of 1 expected row(s) in scholarship_board_votes', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.scholarship_decisions WHERE cycle_year = 2099;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL: admin role saw % of 1 expected row(s) in scholarship_decisions', v_count;
  END IF;

  RESET ROLE;

  -- ===== BOARD session -- expect 0 rows from scholarship_applicants (PII
  -- must stay hidden) and 1 row from each of the five operational tables. =====
  SET ROLE authenticated;
  PERFORM set_config('request.jwt.claims', '{"user_metadata": {"role": "board"}}', false);

  SELECT count(*) INTO v_count FROM public.scholarship_applicants WHERE cycle_year = 2099;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL: board role could read % row(s) from scholarship_applicants (expected 0)', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.scholarship_interviews WHERE cycle_year = 2099;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL: board role saw % of 1 expected row(s) in scholarship_interviews', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.scholarship_scores WHERE cycle_year = 2099;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL: board role saw % of 1 expected row(s) in scholarship_scores', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.scholarship_board_votes WHERE cycle_year = 2099;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL: board role saw % of 1 expected row(s) in scholarship_board_votes', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.scholarship_decisions WHERE cycle_year = 2099;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL: board role saw % of 1 expected row(s) in scholarship_decisions', v_count;
  END IF;

  RESET ROLE;

  -- ===== REVIEWER session -- same expectation as BOARD above. =====
  SET ROLE authenticated;
  PERFORM set_config('request.jwt.claims', '{"user_metadata": {"role": "reviewer"}}', false);

  SELECT count(*) INTO v_count FROM public.scholarship_applicants WHERE cycle_year = 2099;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL: reviewer role could read % row(s) from scholarship_applicants (expected 0)', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.scholarship_interviews WHERE cycle_year = 2099;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL: reviewer role saw % of 1 expected row(s) in scholarship_interviews', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.scholarship_scores WHERE cycle_year = 2099;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL: reviewer role saw % of 1 expected row(s) in scholarship_scores', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.scholarship_board_votes WHERE cycle_year = 2099;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL: reviewer role saw % of 1 expected row(s) in scholarship_board_votes', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.scholarship_decisions WHERE cycle_year = 2099;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL: reviewer role saw % of 1 expected row(s) in scholarship_decisions', v_count;
  END IF;

  RESET ROLE;

  -- ===== PII-LEAK scan -- grep-style check of every text/jsonb column on
  -- the five operational tables for the test applicant's name or email.
  -- Runs as postgres (role already reset above), which bypasses RLS, so
  -- this checks the underlying stored data itself, not what a role can
  -- see -- board/reviewer already see 100% of these tables' rows, so the
  -- role in effect here doesn't change which rows are scanned, only
  -- whether RLS could hide a leak from us (it can't, for this data). =====
  SELECT count(*) INTO v_count
    FROM public.scholarship_interviews
    WHERE applicant_id = v_applicant_id
      AND (
        coalesce(co_interviewer_label, '') ILIKE '%TEST Applicant%'
        OR coalesce(co_interviewer_label, '') ILIKE '%test.applicant@terpmail.umd.edu%'
        OR coalesce(meeting_link, '') ILIKE '%TEST Applicant%'
        OR coalesce(meeting_link, '') ILIKE '%test.applicant@terpmail.umd.edu%'
      );
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL: scholarship_interviews leaked the test applicant''s name/email into % row(s)', v_count;
  END IF;

  SELECT count(*) INTO v_count
    FROM public.scholarship_scores
    WHERE applicant_id = v_applicant_id
      AND (
        coalesce(interviewer_label, '') ILIKE '%TEST Applicant%'
        OR coalesce(interviewer_label, '') ILIKE '%test.applicant@terpmail.umd.edu%'
        OR coalesce(general_notes, '') ILIKE '%TEST Applicant%'
        OR coalesce(general_notes, '') ILIKE '%test.applicant@terpmail.umd.edu%'
        OR coalesce(criterion_scores::text, '') ILIKE '%TEST Applicant%'
        OR coalesce(criterion_scores::text, '') ILIKE '%test.applicant@terpmail.umd.edu%'
        OR coalesce(notes::text, '') ILIKE '%TEST Applicant%'
        OR coalesce(notes::text, '') ILIKE '%test.applicant@terpmail.umd.edu%'
      );
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL: scholarship_scores leaked the test applicant''s name/email into % row(s)', v_count;
  END IF;

  SELECT count(*) INTO v_count
    FROM public.scholarship_board_votes
    WHERE applicant_id = v_applicant_id
      AND (
        coalesce(board_member_label, '') ILIKE '%TEST Applicant%'
        OR coalesce(board_member_label, '') ILIKE '%test.applicant@terpmail.umd.edu%'
      );
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL: scholarship_board_votes leaked the test applicant''s name/email into % row(s)', v_count;
  END IF;

  SELECT count(*) INTO v_count
    FROM public.scholarship_decisions
    WHERE applicant_id = v_applicant_id
      AND (
        coalesce(scholarship_type, '') ILIKE '%TEST Applicant%'
        OR coalesce(scholarship_type, '') ILIKE '%test.applicant@terpmail.umd.edu%'
      );
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL: scholarship_decisions leaked the test applicant''s name/email into % row(s)', v_count;
  END IF;

  -- ===== Every check passed -- clean up, children before the parent.
  -- Runs as postgres (RLS-bypassing), since none of these tables have a
  -- DELETE policy for any client role. =====
  DELETE FROM public.scholarship_decisions WHERE applicant_id = v_applicant_id;
  DELETE FROM public.scholarship_board_votes WHERE applicant_id = v_applicant_id;
  DELETE FROM public.scholarship_scores WHERE applicant_id = v_applicant_id;
  DELETE FROM public.scholarship_interviews WHERE applicant_id = v_applicant_id;
  DELETE FROM public.scholarship_applicants WHERE id = v_applicant_id;
  DELETE FROM public.scholarship_cycles WHERE cycle_year = 2099;

  -- Confirm cleanup actually worked before declaring success -- if this
  -- somehow left rows behind, fail loudly instead of reporting PASS.
  SELECT count(*) INTO v_count FROM (
    SELECT 1 FROM public.scholarship_cycles WHERE cycle_year = 2099
    UNION ALL SELECT 1 FROM public.scholarship_applicants WHERE cycle_year = 2099
    UNION ALL SELECT 1 FROM public.scholarship_interviews WHERE cycle_year = 2099
    UNION ALL SELECT 1 FROM public.scholarship_scores WHERE cycle_year = 2099
    UNION ALL SELECT 1 FROM public.scholarship_board_votes WHERE cycle_year = 2099
    UNION ALL SELECT 1 FROM public.scholarship_decisions WHERE cycle_year = 2099
  ) remaining;

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL: cleanup left % row(s) behind across the six scholarship tables for cycle_year 2099', v_count;
  END IF;

  -- The literal last thing this file does if every check above passed --
  -- this NOTICE is what the SQL Editor shows after a single successful
  -- run of the whole pasted file.
  RAISE NOTICE 'PASS -- all RLS isolation checks passed; test data cleaned up (cycle_year 2099, 0 rows remaining across all six tables)';
END $$;
