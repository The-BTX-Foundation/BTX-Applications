-- Interview-pairing backend: fixes scholarship_interviews for real
-- pairing (Part A), adds scholarship_board_availability (Part B), and
-- adds the atomic-replace function the save-board-availability Edge
-- Function calls (Part C). The actual pairing algorithm lives in the
-- run-interview-pairing Edge Function, not here -- this migration only
-- provides the schema it reads/writes and the one write path
-- (replace_board_availability) a different Edge Function needs.
--
-- DRAFTED, NOT EXECUTED: this file has not been run against any
-- database. See each Edge Function's own file for the same note applied
-- to itself.

-- =============================================================================
-- PART A: fix scholarship_interviews for real interview pairing
-- =============================================================================

-- Splits the single free-text co_interviewer_label into two real columns,
-- one per interviewer -- pairing always assigns exactly two distinct
-- board members (see run-interview-pairing's own algorithm comment), and
-- one "co_interviewer" string can't represent a pair without re-parsing
-- free text later.
--
-- co_interviewer_label IS dropped here, in the same migration that adds
-- its replacements -- a revision of this file's own earlier draft, which
-- kept it in place marked deprecated. Re-checked every reference to this
-- column in the repo (same check as before): exactly one,
-- supabase/scholarship_backend_test.sql, which this round's own
-- companion change updates to use interviewer_one_label/
-- interviewer_two_label instead (see that file's own updated INSERT and
-- PII-leak scan). With that test updated in the same round, there is no
-- longer any reference to co_interviewer_label anywhere in this repo.
-- There was never any real data behind it either -- this table has never
-- been run against a live database (see this file's own
-- "DRAFTED, NOT EXECUTED" note, and 20260930120000_create_scholarship_
-- backend.sql's identical note) -- so a clean drop costs nothing here,
-- before any real interview row has ever existed, and is simpler than
-- carrying a deprecated, permanently-unused column forward indefinitely.
ALTER TABLE "public"."scholarship_interviews"
    ADD COLUMN "interviewer_one_label" "text",
    ADD COLUMN "interviewer_two_label" "text",
    DROP COLUMN "co_interviewer_label";

COMMENT ON COLUMN "public"."scholarship_interviews"."interviewer_one_label" IS 'PLACEHOLDER: free-text label, not a real account/user reference -- same caveat as this table''s other free-text label columns (no named board-member/interviewer accounts exist yet). Set by run-interview-pairing.';
COMMENT ON COLUMN "public"."scholarship_interviews"."interviewer_two_label" IS 'PLACEHOLDER: free-text label, not a real account/user reference -- see interviewer_one_label above.';

-- Closes a real gap: as created on 2026-09-30, this table had no UNIQUE
-- constraint on applicant_id at all -- first flagged in this project's
-- own review of that fact in
-- 20261002120000_scholarship_applicant_role_and_status_view.sql ("...has
-- no unique constraint on applicant_id (unlike scholarship_decisions,
-- which does)... nothing in the current schema or process creates more
-- than one interview per applicant per cycle today, but this view does
-- not itself enforce that"). This is that enforcement. Without it,
-- run-interview-pairing's own "does this applicant already have an
-- interview row" check (step 1 of its algorithm) would have no reliable
-- way to distinguish "already paired" from "paired twice by two
-- overlapping runs," and re-running the function could duplicate
-- interviews without limit. One applicant can still have interviews
-- across multiple DIFFERENT cycle_years in principle (this constraint is
-- on applicant_id alone, not (applicant_id, cycle_year)) -- matching
-- scholarship_decisions' own applicant_id-only UNIQUE constraint, since
-- scholarship_applicants itself is one row per (email, cycle_year), so a
-- reapplying applicant already gets a brand-new applicant_id each cycle
-- rather than reusing the old one.
ALTER TABLE "public"."scholarship_interviews"
    ADD CONSTRAINT "scholarship_interviews_applicant_id_key" UNIQUE ("applicant_id");

-- =============================================================================
-- PART B: scholarship_board_availability (new table)
-- =============================================================================

-- One row per (board member, cycle, slot) they're free for -- the input
-- save-board-availability writes and run-interview-pairing reads to
-- build its slot_id -> available-members map. No PII columns, same
-- pattern as every operational table in 20260930120000_create_
-- scholarship_backend.sql: board_member_label is a free-text placeholder,
-- not a real account/user reference, for the same reason that file's
-- co_interviewer_label/interviewer_label/board_member_label columns are
-- (no named board-member accounts exist yet).
CREATE TABLE "public"."scholarship_board_availability" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    -- PLACEHOLDER: free-text label, not a real account/user reference --
    -- see this table's own header comment above.
    "board_member_label" "text" NOT NULL,
    "cycle_year" integer NOT NULL,
    -- The exact id shape minted by btx-frontend-portal/src/lib/
    -- interviewSlots.js (INTERVIEW_SLOTS[].id, "YYYY-MM-DD-HHMM") --
    -- stored as opaque text here, not parsed/validated at the database
    -- layer. run-interview-pairing is what resolves a slot_id to a real
    -- timestamptz (see that function's own comment on why, and on the
    -- timezone convention it applies).
    "slot_id" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."scholarship_board_availability" OWNER TO "postgres";

ALTER TABLE ONLY "public"."scholarship_board_availability"
    ADD CONSTRAINT "scholarship_board_availability_pkey" PRIMARY KEY ("id");

-- One availability row per board member per slot per cycle -- a second
-- save for the same member/cycle/slot is a correction, not a second
-- booking, which is exactly what replace_board_availability's
-- delete-then-insert below is for rather than relying on this constraint
-- as an upsert target.
ALTER TABLE ONLY "public"."scholarship_board_availability"
    ADD CONSTRAINT "scholarship_board_availability_member_cycle_slot_key" UNIQUE ("board_member_label", "cycle_year", "slot_id");

-- The only query pattern this table serves (run-interview-pairing loading
-- every availability row for one cycle) always filters on cycle_year
-- first -- same rationale as program_plan_tasks_plan_year_idx in
-- 20260921120000_create_program_plan_tasks.sql. Not served by the UNIQUE
-- constraint's own index above, which leads with board_member_label, not
-- cycle_year.
CREATE INDEX "scholarship_board_availability_cycle_year_idx" ON "public"."scholarship_board_availability" USING "btree" ("cycle_year");

ALTER TABLE "public"."scholarship_board_availability" ENABLE ROW LEVEL SECURITY;

-- Read access: admin/board/reviewer -- same three-role pattern every
-- other non-PII operational table in this schema uses.
CREATE POLICY "Admin, board, reviewer can view scholarship board availability" ON "public"."scholarship_board_availability" FOR SELECT TO "authenticated" USING (((("auth"."jwt"() -> 'user_metadata'::"text") ->> 'role'::"text") = ANY (ARRAY['admin'::"text", 'board'::"text", 'reviewer'::"text"])));

-- No INSERT/UPDATE/DELETE policy for any role, including admin -- same
-- deliberate tightening as program_plan_tasks: the only writer this
-- table is meant to have is replace_board_availability() below, called
-- by save-board-availability as service_role (which bypasses RLS
-- regardless of policies). There is no direct-write UI for this table to
-- eventually need a policy for -- board members submit availability
-- through the Edge Function, not a raw table write.
GRANT SELECT ON TABLE "public"."scholarship_board_availability" TO "authenticated";
GRANT ALL ON TABLE "public"."scholarship_board_availability" TO "service_role";
-- anon gets nothing -- omitted entirely, same as every table in this
-- schema (see 20260930120000_create_scholarship_backend.sql's own header
-- comment on why anon is excluded from this schema's grants).

-- =============================================================================
-- PART C: replace_board_availability (atomic full replace)
-- =============================================================================

-- Replaces one board member's entire slot list for one cycle in a single
-- transaction (a Postgres function body already runs as one implicit
-- transaction, so no explicit BEGIN/COMMIT is needed) -- same "atomic
-- full replace" pattern and rationale as replace_program_plan_tasks in
-- 20260921120000_create_program_plan_tasks.sql: the delete and the
-- inserts either both happen or neither does, so a mid-save failure can
-- never leave a board member with a half-old-half-new availability list.
-- Takes the slot list as a jsonb array of plain strings (not objects --
-- p_slots is a flat list of slot_id values, so this uses
-- jsonb_array_elements_text, not jsonb_array_elements), trusting that
-- save-board-availability has already validated/normalized the input,
-- same division of responsibility as replace_program_plan_tasks (the
-- Edge Function validates, this function only replaces).
CREATE OR REPLACE FUNCTION "public"."replace_board_availability"("p_board_member_label" "text", "p_cycle_year" integer, "p_slots" "jsonb") RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
declare
  inserted_count integer;
begin
  delete from public.scholarship_board_availability
    where board_member_label = p_board_member_label
      and cycle_year = p_cycle_year;

  insert into public.scholarship_board_availability (board_member_label, cycle_year, slot_id)
  select p_board_member_label, p_cycle_year, slot
  from jsonb_array_elements_text(p_slots) as slot;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

ALTER FUNCTION "public"."replace_board_availability"("p_board_member_label" "text", "p_cycle_year" integer, "p_slots" "jsonb") OWNER TO "postgres";

-- Execute access: service_role only. Revoked from public/anon/authenticated
-- explicitly rather than assuming a fresh function has no grants --
-- Postgres grants EXECUTE on new functions to PUBLIC by default, which
-- would let any authenticated (or even anonymous, depending on API
-- exposure) caller wipe and replace any board member's entire
-- availability list. Same explicit revoke-then-grant pattern as
-- replace_program_plan_tasks.
REVOKE ALL ON FUNCTION "public"."replace_board_availability"("p_board_member_label" "text", "p_cycle_year" integer, "p_slots" "jsonb") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."replace_board_availability"("p_board_member_label" "text", "p_cycle_year" integer, "p_slots" "jsonb") FROM "anon";
REVOKE ALL ON FUNCTION "public"."replace_board_availability"("p_board_member_label" "text", "p_cycle_year" integer, "p_slots" "jsonb") FROM "authenticated";
GRANT ALL ON FUNCTION "public"."replace_board_availability"("p_board_member_label" "text", "p_cycle_year" integer, "p_slots" "jsonb") TO "service_role";
