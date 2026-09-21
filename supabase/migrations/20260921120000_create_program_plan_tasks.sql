-- Creates program_plan_tasks: one row per WBS deliverable (task) beneath a
-- program_plan_milestones row, so Program Planning can show real
-- per-milestone deliverable status instead of only the plan-level
-- tasks_complete/tasks_in_progress/tasks_not_started counters on
-- program_plan_progress. Populated by the new sync-program-plan-tasks
-- Edge Function from the same Program Planning Apps Script that already
-- feeds program_plan_progress/program_plan_milestones -- see that
-- function's own comment for the exact payload shape.
--
-- Schema, RLS, and grants intentionally mirror program_plan_milestones as
-- closely as this table's own shape allows: same admin/board/reviewer
-- SELECT policy, no INSERT/UPDATE/DELETE policies (the only writer is the
-- Edge Function's service-role RPC below, which bypasses RLS entirely),
-- and the same "this project keeps hitting missing-grant errors" lesson
-- from 20260901185148_grant_service_role_donor_impact.sql -- explicit
-- grants are spelled out here up front rather than relying on defaults.
--
-- Unlike program_plan_milestones (which keys on plan_year+milestone_name
-- and upserts one row per sync), this table has no natural per-row unique
-- key -- a milestone can have several same-named deliverables in
-- principle, and the WBS sheet has no deliverable-level ID of its own.
-- The sync semantics are "replace this plan_year's entire task list" (see
-- replace_program_plan_tasks below) rather than an upsert, so no UNIQUE
-- constraint is needed for a conflict target.
CREATE TABLE public.program_plan_tasks (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "plan_year" integer NOT NULL,
    -- Nullable: a deliverable that doesn't match any known milestone code
    -- is still synced (see the Edge Function's own comment on "unassigned"
    -- deliverables) rather than dropped, so the UI can surface it instead
    -- of silently losing data.
    "milestone_code" "text",
    "milestone_name" "text",
    "task_name" "text" NOT NULL,
    "status" "text" NOT NULL,
    "due_date" "date",
    -- Display order within a milestone's deliverable list -- the WBS
    -- sheet's own row order, not alphabetical or date order.
    "sort_order" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "program_plan_tasks_status_check" CHECK (("status" = ANY (ARRAY['Not started'::"text", 'In progress'::"text", 'Complete'::"text"])))
);

ALTER TABLE "public"."program_plan_tasks" OWNER TO "postgres";

ALTER TABLE ONLY "public"."program_plan_tasks"
    ADD CONSTRAINT "program_plan_tasks_pkey" PRIMARY KEY ("id");

-- The only query pattern this table serves (fetch every deliverable for a
-- plan year, matched client-side to its milestone) always filters on
-- plan_year first.
CREATE INDEX "program_plan_tasks_plan_year_idx" ON "public"."program_plan_tasks" USING "btree" ("plan_year");

ALTER TABLE "public"."program_plan_tasks" ENABLE ROW LEVEL SECURITY;

-- Read access: same three roles (admin/board/reviewer) as every other
-- program-data table, matching ProgramPlanning.vue's canView gate exactly
-- so the client-side gate and server-side RLS never disagree about who
-- can see this table's rows.
CREATE POLICY "Admin, board, reviewer can view program plan tasks" ON "public"."program_plan_tasks" FOR SELECT TO "authenticated" USING (((("auth"."jwt"() -> 'user_metadata'::"text") ->> 'role'::"text") = ANY (ARRAY['admin'::"text", 'board'::"text", 'reviewer'::"text"])));

-- No INSERT/UPDATE/DELETE policy for any role, including admin -- unlike
-- program_plan_milestones (which keeps vestigial admin write policies "in
-- case a direct write path is ever added"), this table's only writer is
-- meant to be the replace_program_plan_tasks function below, called by
-- the Edge Function as service_role (which bypasses RLS regardless of
-- policies). Omitting them entirely here is a deliberate tightening, not
-- an oversight -- there's no admin-facing write UI for this table to
-- eventually need one for.

-- Table-level grants -- narrow, matching the RLS policy above exactly:
-- authenticated gets SELECT only (RLS still filters which rows), anon
-- gets nothing (this table is never read pre-login), service_role gets
-- everything the sync function's RPC needs. Spelled out explicitly rather
-- than relying on schema-level defaults, per this project's own history
-- of a sync function's first live run failing on exactly this gap (see
-- 20260901185148_grant_service_role_donor_impact.sql).
GRANT SELECT ON TABLE "public"."program_plan_tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."program_plan_tasks" TO "service_role";

-- Replaces one plan_year's entire deliverable list in a single
-- transaction (a Postgres function body already runs as one implicit
-- transaction, so no explicit BEGIN/COMMIT is needed) -- the delete and
-- the inserts either both happen or neither does, so a mid-sync failure
-- can never leave a plan year with a half-old-half-new task list. Takes
-- the normalized rows as a jsonb array rather than accepting raw sheet
-- data directly: the Edge Function is what validates/normalizes
-- status/milestone_code/due_date (see its own comment on why that
-- validation belongs there, not here), so this function trusts its input
-- and only handles the replace-atomically part.
CREATE OR REPLACE FUNCTION "public"."replace_program_plan_tasks"("p_plan_year" integer, "p_tasks" "jsonb") RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
declare
  inserted_count integer;
begin
  delete from public.program_plan_tasks where plan_year = p_plan_year;

  insert into public.program_plan_tasks
    (plan_year, milestone_code, milestone_name, task_name, status, due_date, sort_order)
  select
    p_plan_year,
    task ->> 'milestone_code',
    task ->> 'milestone_name',
    task ->> 'task_name',
    task ->> 'status',
    nullif(task ->> 'due_date', '')::date,
    coalesce((task ->> 'sort_order')::integer, 0)
  from jsonb_array_elements(p_tasks) as task;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

ALTER FUNCTION "public"."replace_program_plan_tasks"("p_plan_year" integer, "p_tasks" "jsonb") OWNER TO "postgres";

-- Execute access: service_role only. Revoked from public/anon/authenticated
-- explicitly rather than assuming a fresh function has no grants -- Postgres
-- grants EXECUTE on new functions to PUBLIC by default, which would let any
-- authenticated (or even anonymous, depending on API exposure) caller wipe
-- and replace an entire plan year's deliverables.
REVOKE ALL ON FUNCTION "public"."replace_program_plan_tasks"("p_plan_year" integer, "p_tasks" "jsonb") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."replace_program_plan_tasks"("p_plan_year" integer, "p_tasks" "jsonb") FROM "anon";
REVOKE ALL ON FUNCTION "public"."replace_program_plan_tasks"("p_plan_year" integer, "p_tasks" "jsonb") FROM "authenticated";
GRANT ALL ON FUNCTION "public"."replace_program_plan_tasks"("p_plan_year" integer, "p_tasks" "jsonb") TO "service_role";
