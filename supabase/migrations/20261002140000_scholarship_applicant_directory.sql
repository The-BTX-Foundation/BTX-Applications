-- Staff-facing applicant directory: public.scholarship_applicant_directory,
-- a narrow, admin/board/reviewer-only read surface onto
-- scholarship_applicants. Mirrors my_application_status
-- (20261002120000_scholarship_applicant_role_and_status_view.sql) in
-- approach -- same privilege model, same "the view is the only door"
-- framing -- but for the opposite audience: my_application_status is one
-- applicant reading their own single row by email; this is staff reading
-- a directory of many applicants' non-PII identifying fields by role.
--
-- DRAFTED, NOT EXECUTED: this file has not been run against any
-- database.

-- public.scholarship_applicant_directory: exposes ONLY id (as
-- applicant_id), applicant_code, cycle_year, a derived "initials" field
-- (see the LATERAL subquery and CASE below for exactly how), and
-- submitted_at. NO full_name, terpmail_email, phone, gender, race,
-- attends_umd, education_status, credits_left, major, how_heard,
-- award_opt_outs, certification_interest, essay_text, selected_slots,
-- resume_filename, transcript_filename, or any of the three agreed_*
-- consent flags -- every PII and free-text/file-name column on
-- scholarship_applicants is left out. initials is the one field here
-- DERIVED from a PII column (full_name) rather than a plain passthrough
-- -- see the CASE expression's own comments for why it can't leak more
-- than two letters back out.
CREATE VIEW "public"."scholarship_applicant_directory" WITH ("security_invoker"='false') AS
 SELECT "a"."id" AS "applicant_id",
    "a"."applicant_code",
    "a"."cycle_year",
    -- Initials: uppercase first letter of the first word + uppercase
    -- first letter of the last word, after trimming and collapsing
    -- internal whitespace to single spaces. "w" is a LATERAL subquery
    -- that does the trim/collapse/split once per row into a "words"
    -- array, computed once here rather than repeating the
    -- trim/regexp_replace/string_to_array chain in every branch below.
    -- COALESCE(a.full_name, '') folds a NULL name into the same
    -- zero-words outcome as a blank/whitespace-only name -- both produce
    -- a zero-length "words" array, which the first WHEN below catches
    -- and maps to NULL initials rather than erroring or guessing.
    -- Examples: "Jane Public" -> "JP"; "Jane Q Public" (a middle name/
    -- initial) -> "JP" (the middle word is deliberately skipped -- only
    -- the first and last words are read); "Cher" (one word) -> "C" (the
    -- single-word fallback, first WHEN below); "  Jane   Public  "
    -- (irregular whitespace) -> "JP" (trimmed/collapsed before
    -- splitting, same result as the clean version); NULL or "" or "   "
    -- -> NULL (no name to derive anything from).
    CASE
        WHEN "array_length"("w"."words", 1) IS NULL THEN NULL::"text"
        WHEN "array_length"("w"."words", 1) = 1 THEN "upper"("left"("w"."words"[1], 1))
        ELSE ("upper"("left"("w"."words"[1], 1)) || "upper"("left"("w"."words"["array_length"("w"."words", 1)], 1)))
    END AS "initials",
    "a"."submitted_at"
   FROM "public"."scholarship_applicants" "a"
   CROSS JOIN LATERAL ( SELECT "string_to_array"("regexp_replace"("btrim"(COALESCE("a"."full_name", ''::"text")), '\s+'::"text", ' '::"text", 'g'::"text"), ' '::"text") AS "words") "w"
  -- The ONLY access control on this view: the caller's own role, read
  -- from their verified JWT, never a client-supplied parameter -- same
  -- "comes from the JWT, not a request field" guarantee as
  -- my_application_status's own WHERE clause, just checked against role
  -- instead of email. A caller whose role is anything other than admin,
  -- board, or reviewer (including 'applicant', which every self-service
  -- or dashboard-created account defaults to -- see the role-safety
  -- trigger in 20261002120000_scholarship_applicant_role_and_status_view.sql)
  -- gets a successful query back with zero rows, never an error -- same
  -- "zero rows, not a permission error" shape every RLS policy and this
  -- view's sibling already produce elsewhere in this schema.
  WHERE ((("auth"."jwt"() -> 'user_metadata'::"text") ->> 'role'::"text") = ANY (ARRAY['admin'::"text", 'board'::"text", 'reviewer'::"text"]));

ALTER VIEW "public"."scholarship_applicant_directory" OWNER TO "postgres";

-- Why this view has to run with the OWNER's privileges
-- (security_invoker = 'false', set explicitly rather than left to
-- default) instead of the INVOKER's (security_invoker = 'true'): same
-- underlying mechanism as my_application_status's own identical choice
-- (see that view's migration comment for the full Postgres-version-
-- default/BYPASSRLS explanation -- not re-derived here). The one thing
-- worth stating precisely for THIS view, rather than just pointing at
-- the other one, is exactly which roles actually need the owner-rights
-- escape hatch here:
--   - scholarship_applicants' only existing RLS policy ("Admin can view
--     scholarship applicants", 20260930120000_create_scholarship_
--     backend.sql) is ADMIN-ONLY -- unlike every other operational table
--     in that schema, board and reviewer have NO policy on
--     scholarship_applicants at all, by design (it's the one table with
--     real PII). So an admin caller querying scholarship_applicants
--     directly already sees every row today, with or without this view.
--   - A board or reviewer caller, however, gets zero rows from
--     scholarship_applicants directly, full stop -- no policy matches
--     their role. If this view ran with security_invoker = 'true', a
--     board/reviewer caller would hit that same zero-row wall through
--     the view too, defeating the point of a shared staff directory.
--   - With security_invoker = 'false', the view's own read of
--     scholarship_applicants runs as "postgres" (BYPASSRLS), so all
--     three roles -- admin, board, reviewer -- reach the same rows
--     through the same mechanism, uniformly, regardless of which of them
--     already had some direct RLS access and which had none. The view's
--     own WHERE clause (role IN ('admin','board','reviewer')) is what
--     actually gates this, not RLS on the base table.
GRANT SELECT ON TABLE "public"."scholarship_applicant_directory" TO "authenticated";
GRANT ALL ON TABLE "public"."scholarship_applicant_directory" TO "service_role";

-- Confirming the actual access surface this grant creates -- same
-- precision my_application_status's own migration insisted on, not
-- glossed over here either:
--
-- This migration adds no GRANT on scholarship_applicants itself.
-- "authenticated" already has a pre-existing table-level SELECT grant on
-- it (from 20260930120000_create_scholarship_backend.sql) -- that grant
-- is not new and this migration does not touch it. What it actually gets
-- a caller, today, depends entirely on their role and RLS: an applicant
-- gets zero rows (no policy matches 'applicant'); a board or reviewer
-- caller also gets zero rows (the one policy on this table is
-- admin-only); an admin caller gets every row, full PII included. This
-- view changes none of that direct-query behavior -- it's a second,
-- separate, much narrower read surface (five non-PII-ish columns, one of
-- them a two-letter derived value, versus the full row) that all three
-- staff roles reach the same way. Two doors, same base table, different
-- audiences: my_application_status is the only door an applicant has
-- onto their own single row; this view is the only UNIFORM door staff
-- have onto a directory of many rows (admin also still has their
-- pre-existing direct door, unchanged by this migration).
