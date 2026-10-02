-- Scholarship Portal sign-in work, part 1 of 2: (A) a trigger that forces
-- every newly created auth.users row to land with role = 'applicant' in
-- user_metadata, and (B) a narrow view an authenticated applicant can read
-- their own application status from. Neither a sign-up flow nor an
-- applicant-facing session exists in the frontend yet -- this migration is
-- the backend half those will be wired up to.
--
-- DRAFTED, NOT EXECUTED: this file has not been run against any database.
-- See the review note at the bottom for a line-by-line read-back of why
-- the design is believed correct.
--
-- Role storage confirmed from this project's own existing RLS policies
-- (every "(auth.jwt() -> 'user_metadata' ->> 'role')" check across
-- 20260814000000_create_profiles.sql, 20260815000000_baseline_missing_
-- tables.sql, and 20260930120000_create_scholarship_backend.sql): role
-- lives in user_metadata, i.e. auth.users.raw_user_meta_data. That's the
-- column Part A's trigger mutates.

-- =============================================================================
-- PART A: role-safety trigger
-- =============================================================================

-- Forces every new auth.users row's user_metadata.role to the literal
-- value 'applicant', unconditionally -- no exceptions, no allowlist, no
-- special-casing based on anything in the request. Merges into
-- raw_user_meta_data (|| with the role key on the right, which wins on
-- conflict) rather than replacing it outright, so other signup-supplied
-- keys (e.g. a future full_name) survive -- the thing being forced
-- unconditionally is the role value itself, not the rest of the metadata
-- object.
--
-- This is a BEFORE INSERT trigger that mutates NEW.raw_user_meta_data
-- directly and returns NEW, not an AFTER INSERT trigger that issues a
-- separate UPDATE back onto auth.users. That choice is deliberate, not
-- arbitrary:
--   - The row being mutated IS the row being inserted (auth.users
--     itself) -- there's no second table involved. For a same-row
--     mutation, a BEFORE trigger that modifies NEW and returns it is the
--     standard, idiomatic Postgres pattern: the modified NEW is what
--     actually gets written, as part of the original INSERT, with no
--     extra statement. This project already uses exactly this pattern
--     for scholarship_applicants.applicant_code -- see
--     set_scholarship_applicant_code() in
--     20260930120000_create_scholarship_backend.sql, which also mutates
--     NEW directly in a BEFORE INSERT trigger rather than following up
--     with an UPDATE.
--   - AFTER INSERT + a separate UPDATE is the right shape when a trigger
--     needs to write to a DIFFERENT table -- that's what Supabase's own
--     canonical "create a profiles row on signup" docs example looks
--     like (AFTER INSERT, because NEW can't populate a different
--     table's row). There's no second table here, so an UPDATE would
--     just be a second, redundant write to the same row inside the same
--     transaction -- and it would re-fire any other BEFORE/AFTER UPDATE
--     trigger ever added to auth.users later, an extra trigger cascade
--     this schema has no reason to pay for.
--   - Not SECURITY DEFINER, and doesn't need to be -- unlike the
--     profiles example (which performs its own INSERT into a different
--     table and needs elevated rights to do that), this function only
--     computes a modified NEW and returns it. The actual write back to
--     auth.users is performed by whichever role issues the original
--     INSERT (e.g. supabase_auth_admin via GoTrue), which already has
--     write access to auth.users by definition -- it's the one
--     inserting.
-- Confidence: high. This isn't Supabase-specific; it's standard Postgres
-- trigger semantics, and raw_user_meta_data is a plain jsonb column
-- GoTrue does not rewrite after insert in normal sign-up/dashboard-create
-- flows (unlike raw_app_meta_data, which Supabase's own docs steer
-- people toward Auth Hooks for instead of a direct trigger, for that
-- reason). Not verified against a live database -- there is none to
-- check from here.
CREATE OR REPLACE FUNCTION "public"."set_new_user_role_to_applicant"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.raw_user_meta_data := coalesce(new.raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'applicant');
  return new;
end;
$$;

ALTER FUNCTION "public"."set_new_user_role_to_applicant"() OWNER TO "postgres";

-- Fires on INSERT only -- never UPDATE. Promoting an account to
-- admin/board/reviewer is, and must stay, a deliberate, manually-run
-- UPDATE statement against auth.users AFTER the account already exists
-- -- exactly how this project's four existing staff accounts were set
-- up. A trigger that also ran on UPDATE would stomp that promotion back
-- to 'applicant' the moment it ran, so this one is scoped to INSERT
-- only, on purpose.
--
-- Operational note for staff -- to make someone staff:
--   1) They sign up through the portal, or a staff member adds them
--      through the Supabase dashboard -- either way, this trigger forces
--      the new row to land with role = 'applicant'. There is no
--      self-service or automated path to any other role.
--   2) Afterward, run an UPDATE by hand in the SQL Editor to set their
--      real role (admin/board/reviewer) on their now-existing row.
--
-- This trigger only affects rows inserted from here forward. It does NOT
-- retroactively touch the four existing seeded staff accounts -- an
-- INSERT trigger cannot fire for rows that already exist, so those four
-- rows are untouched by this migration.
CREATE TRIGGER "set_new_user_role_to_applicant_trigger" BEFORE INSERT ON "auth"."users" FOR EACH ROW EXECUTE FUNCTION "public"."set_new_user_role_to_applicant"();

-- =============================================================================
-- PART B: applicant-facing status view
-- =============================================================================

-- public.my_application_status: the one thing an authenticated applicant
-- can read about their own application. Exposes only applicant_code,
-- cycle_year, scholarship_decisions.stage (the raw value -- not mapped to
-- the portal's eventual four-step confirmation-screen labels; that
-- mapping is a frontend concern, not a database one), and
-- scholarship_interviews.scheduled_at/mode/status.
--
-- scholarship_type and award_amount are in the column list but gated by
-- the CASE below: NULL unless stage is a terminal state (awarded,
-- waitlisted, declined). An applicant can never learn their award type
-- or amount while in_review, because the view itself never returns those
-- values for that stage -- there's no separate code path to forget to
-- gate.
--
-- NO full_name, terpmail_email, phone, essay_text, or any other PII
-- column from scholarship_applicants. scholarship_scores and
-- scholarship_board_votes are not referenced anywhere in this view --
-- no score, vote, or interviewer/board-member identity of any kind is
-- reachable through it.
CREATE VIEW "public"."my_application_status" WITH ("security_invoker"='false') AS
 SELECT "a"."applicant_code",
    "a"."cycle_year",
    "d"."stage",
    -- Terminal-state gate: scholarship_type/award_amount only pass
    -- through once a real decision has been made. During in_review (or
    -- if no scholarship_decisions row exists yet at all, in which case
    -- "d"."stage" is null and matches neither branch) both come back
    -- NULL, not omitted -- the columns are always present, the values
    -- aren't.
    CASE
        WHEN ("d"."stage" = ANY (ARRAY['awarded'::"text", 'waitlisted'::"text", 'declined'::"text"])) THEN "d"."scholarship_type"
        ELSE NULL::"text"
    END AS "scholarship_type",
    CASE
        WHEN ("d"."stage" = ANY (ARRAY['awarded'::"text", 'waitlisted'::"text", 'declined'::"text"])) THEN "d"."award_amount"
        ELSE NULL::numeric
    END AS "award_amount",
    "i"."scheduled_at",
    "i"."mode",
    "i"."status"
   FROM (("public"."scholarship_applicants" "a"
     LEFT JOIN "public"."scholarship_decisions" "d" ON (("d"."applicant_id" = "a"."id")))
     LEFT JOIN "public"."scholarship_interviews" "i" ON ((("i"."applicant_id" = "a"."id") AND ("i"."cycle_year" = "a"."cycle_year"))))
  -- The ONLY access control on this view: the caller's own verified JWT
  -- email, never a client-supplied parameter. auth.jwt() ->> 'email'
  -- comes from the session's signed JWT (issued by GoTrue after
  -- authentication) -- there is no query parameter, body field, or
  -- header this reads instead, so an applicant has no way to widen this
  -- to anyone else's row.
  WHERE ("lower"("a"."terpmail_email") = "lower"(("auth"."jwt"() ->> 'email'::"text")));

ALTER VIEW "public"."my_application_status" OWNER TO "postgres";

-- Why this view has to run with the OWNER's privileges
-- (security_invoker = 'false', set explicitly above rather than left to
-- default) instead of the INVOKER's (security_invoker = 'true'):
--
-- An applicant has zero RLS-granted access to scholarship_applicants,
-- scholarship_decisions, or scholarship_interviews -- every existing
-- policy on those three tables requires role = 'admin' or role IN
-- ('admin', 'board', 'reviewer') (see
-- 20260930120000_create_scholarship_backend.sql). If this view ran with
-- security_invoker = 'true', Postgres would evaluate those same RLS
-- policies AS the querying applicant, who matches none of them, and the
-- view would return zero rows for every applicant -- not "this
-- applicant's one row," but nothing, for anyone.
--
-- With security_invoker = 'false', the view's reads against its
-- underlying tables run as the VIEW'S OWNER, "postgres" -- the same role
-- every table and function in this schema is already owned by (see
-- every ALTER ... OWNER TO "postgres" in
-- 20260930120000_create_scholarship_backend.sql). In Supabase's setup
-- "postgres" has BYPASSRLS, so RLS on the three underlying tables is
-- bypassed entirely for this view's own internal reads. It is the
-- view's WHERE clause above -- not RLS -- that narrows the result down
-- to exactly one applicant's row(s).
--
-- Confidence on the Postgres/Supabase version not silently defaulting
-- against this: high, but not verified against a live database (there
-- is none to check from here -- see the review note at the bottom of
-- this file). Supabase has provisioned new projects on Postgres 15+
-- since 2023, well before this project's earliest migration. Postgres's
-- behavior for a view that omits security_invoker entirely has always
-- been the pre-15 owner-privilege behavior shown above -- version 15
-- only added the option to opt INTO invoker privileges, it did not flip
-- the default. security_invoker = 'false' is written explicitly above,
-- rather than left implicit, specifically so this view's correctness
-- doesn't quietly depend on that default continuing to hold.
GRANT SELECT ON TABLE "public"."my_application_status" TO "authenticated";

-- Matches this schema's existing per-object convention (every table in
-- 20260930120000_create_scholarship_backend.sql grants service_role ALL
-- alongside its authenticated grant) -- not a new privilege this
-- migration is introducing, just the same pairing applied to the new
-- view.
GRANT ALL ON TABLE "public"."my_application_status" TO "service_role";

-- Confirming the actual access surface the grant above creates, since
-- "grant select to authenticated" can sound broader than it is:
--
-- This migration adds no GRANT on scholarship_applicants,
-- scholarship_decisions, or scholarship_interviews -- the three tables
-- this view reads from -- and none at all on scholarship_scores or
-- scholarship_board_votes, which this view doesn't reference. The only
-- object this migration grants SELECT to authenticated on is the view
-- itself.
--
-- One nuance worth stating precisely rather than glossing over:
-- 20260930120000_create_scholarship_backend.sql already granted
-- "authenticated" table-level SELECT on all five of those tables (every
-- "GRANT SELECT ON TABLE ... TO authenticated" line in that file). That
-- pre-existing grant is not new and this migration does not touch it,
-- so it would be inaccurate to say authenticated has NO grant at all on
-- those tables. What actually stops an applicant from reading them
-- directly isn't the absence of a grant -- it's that every RLS policy on
-- all five requires role = 'admin' (scholarship_applicants) or role IN
-- ('admin', 'board', 'reviewer') (the other four), and this migration's
-- own trigger guarantees an applicant's role is always 'applicant',
-- which matches none of those policies. An applicant querying
-- scholarship_applicants directly gets a successful query with zero
-- rows back, not a permission error -- same effective result as "no
-- access," different mechanism. Net effect: this view is still the only
-- door an applicant has onto this data, and the WHERE clause above means
-- even that door opens onto exactly one applicant's own row(s).

-- =============================================================================
-- REVIEW NOTE -- reviewed, not executed. No statement in this file has
-- been run against any database, and nothing here has been deployed.
-- There is no real applicant auth session or sign-up flow in the
-- frontend yet to test this against even if it had been run.
-- =============================================================================
--
-- Read back line by line:
--  - Trigger: BEFORE INSERT on auth.users (confirmed above -- not
--    BEFORE INSERT OR UPDATE), unconditional role overwrite via jsonb
--    merge, function is not SECURITY DEFINER (confirmed it doesn't need
--    to be -- see Part A). Matches the operational flow comment: every
--    new row lands as 'applicant'; promotion is a manual UPDATE run
--    afterward, against an existing row, which this trigger cannot
--    intercept since it only fires on INSERT. The four existing seeded
--    accounts are rows that already exist, so this migration cannot
--    retroactively affect them.
--  - View: two LEFT JOINs, not INNER -- a brand-new applicant with no
--    scholarship_decisions or scholarship_interviews row yet still gets
--    one row back from this view (with those columns null) rather than
--    disappearing from the result entirely. WHERE is the sole access
--    control, keyed off auth.jwt() ->> 'email', which is only ever the
--    caller's own verified session email -- never a parameter a client
--    supplies. scholarship_type/award_amount are gated by a CASE on
--    "d"."stage" baked into the column list itself, not by a separate
--    join or policy, so there's no path that returns either of them
--    during in_review.
--  - One caveat worth flagging rather than hiding: scholarship_interviews
--    has no unique constraint on applicant_id (unlike
--    scholarship_decisions, which has UNIQUE (applicant_id)), so if an
--    applicant ever ends up with more than one scholarship_interviews
--    row in the same cycle, this view returns one row per interview,
--    not one row per applicant. Nothing in the current schema or
--    process creates more than one interview per applicant per cycle
--    today, but this view does not itself enforce that it stays that
--    way -- a future migration adding that uniqueness guarantee (or this
--    view picking the single most recent interview explicitly) would
--    close the gap if it ever becomes a real possibility.
