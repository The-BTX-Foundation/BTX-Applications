-- Staff-facing decisions view (public.scholarship_staff_decisions) and the
-- rate-limit bookkeeping table (scholarship_submit_attempts) for
-- submit-application's first hardening pass (honeypot + per-IP rate limit +
-- allow-list validation, see that function's own updated comments).
--
-- DRAFTED, NOT EXECUTED: this file has not been run against any database,
-- matching every other migration since 20260930120000 -- there is no live
-- database available from here to run it against.

-- =============================================================================
-- PART A: public.scholarship_staff_decisions
-- =============================================================================

-- public.scholarship_staff_decisions: a second staff-facing read surface,
-- alongside scholarship_applicant_directory (20261002140000_scholarship_
-- applicant_directory.sql) and my_application_status (20261002120000_
-- scholarship_applicant_role_and_status_view.sql). Where the directory view
-- answers "who applied" (code/cycle/initials, no decision data), this view
-- answers "where did their application land" (stage/scholarship_type/
-- award_amount/final_score) for the same staff audience -- joined to the
-- directory view's own three identifying columns rather than reading
-- scholarship_applicants directly, so this view never gains access to any
-- column the directory view itself doesn't already expose (no full_name,
-- terpmail_email, phone, or any other PII/free-text column).
--
-- Same privilege model as the directory view, same reasoning -- not
-- re-derived here, see that migration's own comment for the full
-- security_invoker='false'/BYPASSRLS explanation. The short version: both
-- scholarship_decisions (role IN admin/board/reviewer) and
-- scholarship_applicant_directory (same role check, in its own WHERE
-- clause) would hand a board/reviewer caller zero rows under plain RLS --
-- owner-rights views bypass RLS on what they read, so the WHERE clause
-- below is the only thing that actually gates this view, not RLS on either
-- underlying object.
CREATE VIEW "public"."scholarship_staff_decisions" WITH ("security_invoker"='false') AS
 SELECT "dir"."applicant_code",
    "dir"."cycle_year",
    "dir"."initials",
    "d"."stage",
    "d"."scholarship_type",
    "d"."award_amount",
    "d"."final_score"
   FROM "public"."scholarship_decisions" "d"
     JOIN "public"."scholarship_applicant_directory" "dir" ON ("dir"."applicant_id" = "d"."applicant_id")
  -- Same "comes from the JWT, not a request field" role gate as
  -- scholarship_applicant_directory's own WHERE clause, applied directly
  -- here too rather than relied on solely through the join: this view reads
  -- scholarship_decisions itself (not only the already-gated directory
  -- view), and scholarship_decisions' own RLS is equally bypassed by owner
  -- rights, so it needs its own explicit gate, same as every other view in
  -- this schema.
  WHERE ((("auth"."jwt"() -> 'user_metadata'::"text") ->> 'role'::"text") = ANY (ARRAY['admin'::"text", 'board'::"text", 'reviewer'::"text"]));

ALTER VIEW "public"."scholarship_staff_decisions" OWNER TO "postgres";

GRANT SELECT ON TABLE "public"."scholarship_staff_decisions" TO "authenticated";
GRANT ALL ON TABLE "public"."scholarship_staff_decisions" TO "service_role";

-- Confirming the actual access surface, same precision this schema's other
-- views insist on: this migration adds no GRANT on scholarship_decisions or
-- scholarship_applicant_directory themselves -- authenticated already has a
-- pre-existing SELECT grant on scholarship_decisions
-- (20260930120000_create_scholarship_backend.sql) and on the directory view
-- (20261002140000_scholarship_applicant_directory.sql); neither is new here.
-- A caller whose role is not admin/board/reviewer gets a successful query
-- with zero rows back from this view, same shape as its sibling views,
-- never a permission error.

-- =============================================================================
-- PART B: public.scholarship_submit_attempts
-- =============================================================================

-- scholarship_submit_attempts: one row per POST to submit-application,
-- keyed by a hash of the caller's IP (never the raw IP -- see the Edge
-- Function's hashIp() for why), used to compute a rolling 10-minute attempt
-- count per caller. service_role-only end to end: this table has no SELECT
-- policy or grant for anon/authenticated, so no client of any kind can read
-- or write it directly -- only submit-application itself (running as
-- service role, which bypasses RLS) ever touches it.
CREATE TABLE "public"."scholarship_submit_attempts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ip_hash" "text" NOT NULL,
    "attempted_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."scholarship_submit_attempts" OWNER TO "postgres";

ALTER TABLE ONLY "public"."scholarship_submit_attempts"
    ADD CONSTRAINT "scholarship_submit_attempts_pkey" PRIMARY KEY ("id");

-- Every lookup submit-application makes is "this ip_hash, within the last 10
-- minutes" -- an index on ip_hash alone would still force a scan across that
-- hash's entire history as the table grows; leading on ip_hash with
-- attempted_at as the second column lets that range condition use the index
-- too.
CREATE INDEX "scholarship_submit_attempts_ip_hash_attempted_at_idx" ON "public"."scholarship_submit_attempts" USING "btree" ("ip_hash", "attempted_at");

ALTER TABLE "public"."scholarship_submit_attempts" ENABLE ROW LEVEL SECURITY;

-- No policy for any role -- unlike every other table in this schema, this
-- one has no SELECT policy at all, not even for admin/board/reviewer: it
-- holds no applicant data, only rate-limit bookkeeping, and is meant to be
-- opaque to every client role. service_role bypasses RLS regardless of
-- policies present, which is the only access this table needs.

GRANT ALL ON TABLE "public"."scholarship_submit_attempts" TO "service_role";

-- Deliberately no GRANT to anon or authenticated on this table at all --
-- not even SELECT -- matching the "anon gets nothing" convention this
-- schema already uses for the six scholarship_* tables
-- (20260930120000_create_scholarship_backend.sql), extended here to
-- authenticated too since no staff role has any legitimate reason to read
-- raw rate-limit rows.

-- =============================================================================
-- REVIEW NOTE -- reviewed, not executed. No statement in this file has been
-- run against any database.
-- =============================================================================
--
-- scholarship_staff_decisions: INNER JOIN, not LEFT -- scholarship_decisions
-- rows always have a matching scholarship_applicants row (FK, NOT NULL
-- applicant_id), and submit-application inserts a scholarship_decisions row
-- in the same request that creates the scholarship_applicants row
-- (compensating with a delete if that second insert fails -- see
-- submit-application's own comment), so every scholarship_decisions row
-- should always find a match in scholarship_applicant_directory. A decision
-- row somehow left orphaned by a future bug elsewhere would silently
-- disappear from this view rather than surfacing as a NULL-filled row --
-- worth knowing if "decisions I can't see that I know exist" ever comes up
-- during testing.
--
-- scholarship_submit_attempts: no retention/cleanup policy. This table
-- grows forever as written here -- rows older than 10 minutes are never
-- consulted again by the count query, but nothing deletes them. Out of
-- scope for this pass (not asked for), flagged here rather than silently
-- left out.
