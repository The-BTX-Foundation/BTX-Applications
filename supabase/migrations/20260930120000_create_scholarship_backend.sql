-- Creates the Scholarship backend: scholarship_cycles, scholarship_applicants,
-- scholarship_interviews, scholarship_scores, scholarship_board_votes, and
-- scholarship_decisions. This is the first real backend for the Scholarship
-- flow -- until now only the applicant-facing portal app (btx-frontend-portal,
-- apply flow Steps 1-7) and the internal Applicant Records / Scoring preview
-- pages (btx-frontend, sample data only, see "Add Applicant Records preview
-- page" and "Add applicant scoring detail page" commits) have existed, with
-- no table to actually back either one.
--
-- There was no earlier drafted scholarship_applications migration to base
-- scholarship_applicants on -- checked all branches, stashes, and both
-- frontend repos; none exists. scholarship_applicants' column list below is
-- instead derived directly from the portal apply flow's own field names
-- (src/stores/application.js: fullName, email, phone, gender, race,
-- attendsUMD, educationStatus, creditsLeft, major, howHeard, awardOptOuts,
-- certificationInterest, essayText, selectedSlots, agreedAccurate,
-- agreedTerms, agreedPrivacy -- see Step1BasicInfo.vue's isValidEmail for the
-- terpmail.umd.edu domain rule mirrored in scholarship_applicants' own unique
-- index below), converted to snake_case.
--
-- This migration deliberately does NOT: rewire the four existing preview
-- pages (Applicant Records, Scoring queue, Scoring detail, Awardee Workflow)
-- to read from these tables instead of their sample data, or update the
-- portal's submit-application flow (there is no submit-application Edge
-- Function yet -- Step7ReviewSubmit.vue's submit is still fully simulated
-- client-side) to write into this schema. Both are future work.
--
-- PII isolation: scholarship_applicants is the only one of the six tables
-- that holds applicant PII (name, email, phone, demographics, essay, file
-- names). The five operational tables (interviews, scores, board_votes,
-- decisions) hold only applicant_id + cycle_year + operational data --
-- interviewer/board-member identity is a free-text label (PLACEHOLDER, see
-- each table below), never a name/email/phone column. This split is what
-- the test script at the bottom of this round proves: admin-only access to
-- scholarship_applicants, wider admin/board/reviewer access to the other
-- five, and no PII column ever holding the test applicant's name or email
-- outside scholarship_applicants itself.
--
-- Grants intentionally omit the REFERENCES/TRIGGER/TRUNCATE/MAINTAIN-to-anon
-- grant every other table in this schema has (see
-- 20260815000000_baseline_missing_tables.sql) -- anon gets nothing on any of
-- these six tables, matching this round's explicit grant spec rather than
-- this project's usual default.

-- scholarship_cycles: one row per award cycle (e.g. 2026, 2027), driving
-- which cycle the portal's apply flow is currently open for and which
-- cycle_year the other five tables' rows belong to.
CREATE TABLE "public"."scholarship_cycles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cycle_year" integer NOT NULL,
    "label" "text",
    "status" "text" DEFAULT 'upcoming'::"text",
    "opens_at" "date",
    "closes_at" "date",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "scholarship_cycles_status_check" CHECK (("status" = ANY (ARRAY['upcoming'::"text", 'open'::"text", 'closed'::"text"])))
);

ALTER TABLE "public"."scholarship_cycles" OWNER TO "postgres";

ALTER TABLE ONLY "public"."scholarship_cycles"
    ADD CONSTRAINT "scholarship_cycles_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."scholarship_cycles"
    ADD CONSTRAINT "scholarship_cycles_cycle_year_key" UNIQUE ("cycle_year");

ALTER TABLE "public"."scholarship_cycles" ENABLE ROW LEVEL SECURITY;

-- Read access: admin/board/reviewer, same three-role pattern every other
-- non-PII table in this schema uses (see program_plan_tasks, program_plan_milestones).
CREATE POLICY "Admin, board, reviewer can view scholarship cycles" ON "public"."scholarship_cycles" FOR SELECT TO "authenticated" USING (((("auth"."jwt"() -> 'user_metadata'::"text") ->> 'role'::"text") = ANY (ARRAY['admin'::"text", 'board'::"text", 'reviewer'::"text"])));

-- No INSERT/UPDATE/DELETE policy for any role -- this round ships read-only
-- access; cycle creation/editing has no client-facing UI yet, so there is
-- no write path for any role to need.

GRANT SELECT ON TABLE "public"."scholarship_cycles" TO "authenticated";
GRANT ALL ON TABLE "public"."scholarship_cycles" TO "service_role";

-- Backing sequence for scholarship_applicants.applicant_code. A single
-- global sequence (not one per cycle_year) is intentional -- per-cycle
-- numbering would need a partitioned or per-cycle sequence, and the
-- existing Applicant Records / Scoring preview pages' sample IDs
-- (APP-014, APP-041, APP-052, ...) already show non-contiguous numbers, so
-- gaps from a shared sequence are consistent with what those pages already
-- expect.
CREATE SEQUENCE "public"."scholarship_applicant_code_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE "public"."scholarship_applicant_code_seq" OWNER TO "postgres";

-- scholarship_applicants: the only PII-bearing table of the six. Column
-- list/constraints mirror the portal apply flow's own fields (see header
-- comment) rather than a prior migration, since none was ever drafted.
CREATE TABLE "public"."scholarship_applicants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "applicant_code" "text" NOT NULL,
    "cycle_year" integer NOT NULL,
    "full_name" "text",
    "terpmail_email" "text",
    "phone" "text",
    "gender" "text",
    "race" "text",
    "attends_umd" boolean,
    "education_status" "text",
    "credits_left" integer,
    "major" "text",
    "how_heard" "text",
    "award_opt_outs" "text"[] DEFAULT '{}'::"text"[],
    "certification_interest" boolean DEFAULT false,
    "essay_text" "text",
    "selected_slots" "text"[] DEFAULT '{}'::"text"[],
    "resume_filename" "text",
    "transcript_filename" "text",
    "agreed_accurate" boolean NOT NULL,
    "agreed_terms" boolean NOT NULL,
    "agreed_privacy" boolean NOT NULL,
    "submitted_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."scholarship_applicants" OWNER TO "postgres";

ALTER TABLE ONLY "public"."scholarship_applicants"
    ADD CONSTRAINT "scholarship_applicants_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."scholarship_applicants"
    ADD CONSTRAINT "scholarship_applicants_applicant_code_key" UNIQUE ("applicant_code");

-- One application per email per cycle -- lower(terpmail_email) so the
-- dedup guarantee holds regardless of casing a writer sends, matching the
-- trigger below which also normalizes the stored value to lowercase.
-- Expression-based, so it has to be a unique index rather than a plain
-- table UNIQUE constraint.
CREATE UNIQUE INDEX "scholarship_applicants_cycle_year_lower_email_idx" ON "public"."scholarship_applicants" USING "btree" ("cycle_year", "lower"("terpmail_email"));

-- Generates applicant_code as 'APP-<cycle_year>-<5-digit sequence number>',
-- always overwriting whatever (if anything) was supplied on insert --
-- applicant_code must never be client-supplied, since a writer could
-- otherwise forge or collide codes. Also normalizes terpmail_email to
-- lowercase here (rather than trusting the future writer to do it) so the
-- unique index above always sees the same casing it was built against.
CREATE OR REPLACE FUNCTION "public"."set_scholarship_applicant_code"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.applicant_code := 'APP-' || new.cycle_year || '-' || lpad(nextval('public.scholarship_applicant_code_seq')::text, 5, '0');
  if new.terpmail_email is not null then
    new.terpmail_email := lower(new.terpmail_email);
  end if;
  return new;
end;
$$;

ALTER FUNCTION "public"."set_scholarship_applicant_code"() OWNER TO "postgres";

CREATE TRIGGER "set_scholarship_applicant_code_trigger" BEFORE INSERT ON "public"."scholarship_applicants" FOR EACH ROW EXECUTE FUNCTION "public"."set_scholarship_applicant_code"();

ALTER TABLE "public"."scholarship_applicants" ENABLE ROW LEVEL SECURITY;

-- Read access: admin ONLY, unlike every other table below -- this is the
-- one table with applicant PII (name, email, phone, demographics, essay,
-- file names), so board/reviewer access (which the other five tables
-- grant) is deliberately excluded here.
CREATE POLICY "Admin can view scholarship applicants" ON "public"."scholarship_applicants" FOR SELECT TO "authenticated" USING (((("auth"."jwt"() -> 'user_metadata'::"text") ->> 'role'::"text") = 'admin'::"text"));

-- No INSERT/UPDATE/DELETE policy for any role -- the only writer this round
-- is meant to have is a future submit-application Edge Function running as
-- service_role (not built yet; see header comment), which bypasses RLS
-- regardless of policies.

GRANT SELECT ON TABLE "public"."scholarship_applicants" TO "authenticated";
GRANT ALL ON TABLE "public"."scholarship_applicants" TO "service_role";
GRANT ALL ON SEQUENCE "public"."scholarship_applicant_code_seq" TO "service_role";

-- scholarship_interviews: one row per scheduled/held interview. No
-- name/email/phone columns -- applicant_id is the only link back to PII,
-- and only scholarship_applicants (admin-only) can resolve it to a person.
CREATE TABLE "public"."scholarship_interviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "applicant_id" "uuid" NOT NULL,
    "cycle_year" integer NOT NULL,
    "scheduled_at" timestamp with time zone,
    -- PLACEHOLDER: a free-text label, not a real account/user reference --
    -- there are no named board-member or interviewer accounts yet for this
    -- to point to. Replace with a proper FK once those accounts exist.
    "co_interviewer_label" "text",
    "mode" "text",
    "status" "text" DEFAULT 'Scheduled'::"text",
    "meeting_link" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "scholarship_interviews_mode_check" CHECK (("mode" = ANY (ARRAY['Video'::"text", 'In person'::"text"]))),
    CONSTRAINT "scholarship_interviews_status_check" CHECK (("status" = ANY (ARRAY['Scheduled'::"text", 'Completed'::"text", 'No-show'::"text"])))
);

ALTER TABLE "public"."scholarship_interviews" OWNER TO "postgres";

ALTER TABLE ONLY "public"."scholarship_interviews"
    ADD CONSTRAINT "scholarship_interviews_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."scholarship_interviews"
    ADD CONSTRAINT "scholarship_interviews_applicant_id_fkey" FOREIGN KEY ("applicant_id") REFERENCES "public"."scholarship_applicants"("id");

ALTER TABLE "public"."scholarship_interviews" ENABLE ROW LEVEL SECURITY;

-- Read access: admin/board/reviewer -- wider than scholarship_applicants
-- because this table carries no PII, only operational scheduling data.
CREATE POLICY "Admin, board, reviewer can view scholarship interviews" ON "public"."scholarship_interviews" FOR SELECT TO "authenticated" USING (((("auth"."jwt"() -> 'user_metadata'::"text") ->> 'role'::"text") = ANY (ARRAY['admin'::"text", 'board'::"text", 'reviewer'::"text"])));

-- No INSERT/UPDATE/DELETE policy for any role this round -- interview
-- scheduling has no client-facing write UI yet.

GRANT SELECT ON TABLE "public"."scholarship_interviews" TO "authenticated";
GRANT ALL ON TABLE "public"."scholarship_interviews" TO "service_role";

-- scholarship_scores: one row per (applicant, interviewer) scoring pass. No
-- PII columns -- interviewer_label is a free-text placeholder, same caveat
-- as scholarship_interviews.co_interviewer_label above.
CREATE TABLE "public"."scholarship_scores" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "applicant_id" "uuid" NOT NULL,
    "cycle_year" integer NOT NULL,
    -- PLACEHOLDER: free-text label, not a real account/user reference -- see
    -- scholarship_interviews.co_interviewer_label above.
    "interviewer_label" "text",
    "criterion_scores" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "notes" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "general_notes" "text",
    "weighted_total" numeric(3,1),
    "status" "text" DEFAULT 'draft'::"text",
    "scored_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "scholarship_scores_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'published'::"text"])))
);

ALTER TABLE "public"."scholarship_scores" OWNER TO "postgres";

ALTER TABLE ONLY "public"."scholarship_scores"
    ADD CONSTRAINT "scholarship_scores_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."scholarship_scores"
    ADD CONSTRAINT "scholarship_scores_applicant_id_fkey" FOREIGN KEY ("applicant_id") REFERENCES "public"."scholarship_applicants"("id");

ALTER TABLE ONLY "public"."scholarship_scores"
    ADD CONSTRAINT "scholarship_scores_applicant_id_interviewer_label_key" UNIQUE ("applicant_id", "interviewer_label");

ALTER TABLE "public"."scholarship_scores" ENABLE ROW LEVEL SECURITY;

-- Read access: admin/board/reviewer -- same non-PII rationale as
-- scholarship_interviews above.
CREATE POLICY "Admin, board, reviewer can view scholarship scores" ON "public"."scholarship_scores" FOR SELECT TO "authenticated" USING (((("auth"."jwt"() -> 'user_metadata'::"text") ->> 'role'::"text") = ANY (ARRAY['admin'::"text", 'board'::"text", 'reviewer'::"text"])));

-- No INSERT/UPDATE/DELETE policy for any role this round -- scoring has no
-- client-facing write UI yet (ScoreApplicant.vue is sample data only).

GRANT SELECT ON TABLE "public"."scholarship_scores" TO "authenticated";
GRANT ALL ON TABLE "public"."scholarship_scores" TO "service_role";

-- scholarship_board_votes: one row per (applicant, board member) vote. No
-- PII columns -- board_member_label is the same free-text placeholder
-- pattern as the two tables above.
CREATE TABLE "public"."scholarship_board_votes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "applicant_id" "uuid" NOT NULL,
    "cycle_year" integer NOT NULL,
    -- PLACEHOLDER: free-text label, not a real account/user reference -- see
    -- scholarship_interviews.co_interviewer_label above.
    "board_member_label" "text",
    "decision" "text",
    "voted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "scholarship_board_votes_decision_check" CHECK (("decision" = ANY (ARRAY['agreed'::"text", 'waitlist'::"text", 'decline'::"text"])))
);

ALTER TABLE "public"."scholarship_board_votes" OWNER TO "postgres";

ALTER TABLE ONLY "public"."scholarship_board_votes"
    ADD CONSTRAINT "scholarship_board_votes_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."scholarship_board_votes"
    ADD CONSTRAINT "scholarship_board_votes_applicant_id_fkey" FOREIGN KEY ("applicant_id") REFERENCES "public"."scholarship_applicants"("id");

ALTER TABLE ONLY "public"."scholarship_board_votes"
    ADD CONSTRAINT "scholarship_board_votes_applicant_id_board_member_label_key" UNIQUE ("applicant_id", "board_member_label");

ALTER TABLE "public"."scholarship_board_votes" ENABLE ROW LEVEL SECURITY;

-- Read access: admin/board/reviewer -- same non-PII rationale as the other
-- operational tables above.
CREATE POLICY "Admin, board, reviewer can view scholarship board votes" ON "public"."scholarship_board_votes" FOR SELECT TO "authenticated" USING (((("auth"."jwt"() -> 'user_metadata'::"text") ->> 'role'::"text") = ANY (ARRAY['admin'::"text", 'board'::"text", 'reviewer'::"text"])));

-- No INSERT/UPDATE/DELETE policy for any role this round -- board voting
-- has no client-facing write UI yet.

GRANT SELECT ON TABLE "public"."scholarship_board_votes" TO "authenticated";
GRANT ALL ON TABLE "public"."scholarship_board_votes" TO "service_role";

-- scholarship_decisions: one row per applicant (unique applicant_id), the
-- final outcome. No PII columns -- same pattern as the other operational
-- tables.
CREATE TABLE "public"."scholarship_decisions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "applicant_id" "uuid" NOT NULL,
    "cycle_year" integer NOT NULL,
    "stage" "text",
    "scholarship_type" "text",
    "award_amount" numeric,
    "final_score" numeric(3,1),
    "decided_at" timestamp with time zone,
    CONSTRAINT "scholarship_decisions_stage_check" CHECK (("stage" = ANY (ARRAY['in_review'::"text", 'awarded'::"text", 'waitlisted'::"text", 'declined'::"text"])))
);

ALTER TABLE "public"."scholarship_decisions" OWNER TO "postgres";

ALTER TABLE ONLY "public"."scholarship_decisions"
    ADD CONSTRAINT "scholarship_decisions_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."scholarship_decisions"
    ADD CONSTRAINT "scholarship_decisions_applicant_id_key" UNIQUE ("applicant_id");

ALTER TABLE ONLY "public"."scholarship_decisions"
    ADD CONSTRAINT "scholarship_decisions_applicant_id_fkey" FOREIGN KEY ("applicant_id") REFERENCES "public"."scholarship_applicants"("id");

ALTER TABLE "public"."scholarship_decisions" ENABLE ROW LEVEL SECURITY;

-- Read access: admin/board/reviewer -- same non-PII rationale as the other
-- operational tables above.
CREATE POLICY "Admin, board, reviewer can view scholarship decisions" ON "public"."scholarship_decisions" FOR SELECT TO "authenticated" USING (((("auth"."jwt"() -> 'user_metadata'::"text") ->> 'role'::"text") = ANY (ARRAY['admin'::"text", 'board'::"text", 'reviewer'::"text"])));

-- No INSERT/UPDATE/DELETE policy for any role this round -- decisioning has
-- no client-facing write UI yet.

GRANT SELECT ON TABLE "public"."scholarship_decisions" TO "authenticated";
GRANT ALL ON TABLE "public"."scholarship_decisions" TO "service_role";
