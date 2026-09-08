-- Creates program_plan_milestones: one row per (plan_year, milestone_name),
-- tracking whether that milestone's tasks are all complete. Populated by the
-- new sync-program-plan-milestones Edge Function from the Program Planning
-- Apps Script, which already computes this per-milestone detail in memory
-- (bucket.milestoneNames/bucket.milestoneComplete) while building the
-- existing program_plan_progress aggregate row -- this table is that same
-- detail, finally sent onward instead of being discarded after Logger.log.
--
-- Schema, RLS, and grants intentionally mirror program_plan_progress /
-- event_tracker_events / grant_pipeline exactly: same admin/board/reviewer
-- SELECT policy, same admin-only INSERT/UPDATE, no DELETE policy anywhere
-- in this project's schema, and the same natural composite-key pattern
-- (event_tracker_events keys on event_date+category+event_name,
-- grant_pipeline on grant_name+funder -- this table keys on
-- plan_year+milestone_name, since that pair is what the Apps Script already
-- uses to identify a milestone within a year).
CREATE TABLE public.program_plan_milestones (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "plan_year" integer NOT NULL,
    "milestone_name" "text" NOT NULL,
    "is_complete" boolean NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."program_plan_milestones" OWNER TO "postgres";

ALTER TABLE ONLY "public"."program_plan_milestones"
    ADD CONSTRAINT "program_plan_milestones_pkey" PRIMARY KEY ("id");

-- Composite unique key: the sync's upsert conflict target, and what lets a
-- milestone be renamed/re-synced idempotently within its own plan_year
-- without colliding with the same-named milestone in a different year.
ALTER TABLE ONLY "public"."program_plan_milestones"
    ADD CONSTRAINT "program_plan_milestones_plan_year_milestone_name_key" UNIQUE ("plan_year", "milestone_name");

ALTER TABLE "public"."program_plan_milestones" ENABLE ROW LEVEL SECURITY;

-- Read access: same three roles (admin/board/reviewer) as every other
-- program-data table, matching ProgressToGoal.vue's canView gate exactly so
-- the client-side gate and server-side RLS never disagree about who can see
-- this table's rows.
CREATE POLICY "Admin, board, reviewer can view program plan milestones" ON "public"."program_plan_milestones" FOR SELECT USING (((("auth"."jwt"() -> 'user_metadata'::"text") ->> 'role'::"text") = ANY (ARRAY['admin'::"text", 'board'::"text", 'reviewer'::"text"])));

-- Write access: admin-only INSERT/UPDATE, same as program_plan_progress --
-- vestigial in the same way (the actual writer is the Edge Function running
-- as service_role, which bypasses RLS entirely), kept only for schema
-- consistency across this table family in case an admin-facing write path
-- is ever added directly against this table.
CREATE POLICY "Admin can insert program plan milestones" ON "public"."program_plan_milestones" FOR INSERT WITH CHECK (((("auth"."jwt"() -> 'user_metadata'::"text") ->> 'role'::"text") = 'admin'::"text"));

CREATE POLICY "Admin can update program plan milestones" ON "public"."program_plan_milestones" FOR UPDATE USING (((("auth"."jwt"() -> 'user_metadata'::"text") ->> 'role'::"text") = 'admin'::"text"));

-- No DELETE policy -- matches every other table in this schema (none of
-- them have one). The Edge Function's stale-milestone cleanup still works
-- without one: it runs as service_role, which bypasses RLS (including the
-- absence of a DELETE policy) the same way it bypasses the INSERT/UPDATE
-- policies above.

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."program_plan_milestones" TO "anon";
-- No DELETE here, matching every other table's authenticated grant exactly
-- -- there's no DELETE policy for authenticated to use it under anyway
-- (see above), so granting it would be dead privilege, not a real capability.
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."program_plan_milestones" TO "authenticated";

-- Proactive service_role grant -- see 20260901185148_grant_service_role_donor_impact.sql
-- for why this can't be skipped: a newly created table's baseline
-- service_role grant is REFERENCES/TRIGGER/TRUNCATE/MAINTAIN only, which
-- isn't enough for an upsert or delete even though service_role bypasses
-- RLS (RLS bypass and table-level GRANTs are separate Postgres checks).
-- donor_impact's first live sync run failed on exactly this gap; granting
-- it here up front avoids repeating that. DELETE is included (unlike the
-- other tables' service_role grants) because this is the first sync
-- function that needs to remove rows -- the stale-milestone cleanup below.
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE "public"."program_plan_milestones" TO "service_role";
