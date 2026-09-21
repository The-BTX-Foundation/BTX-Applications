-- Adds a separate `deliverable` column to program_plan_tasks. Each WBS
-- sheet row is actually two related-but-distinct pieces of information --
-- a Task (the long description, already stored in task_name) and a
-- Deliverable (a short format label, e.g. "PPT / Form", "Web Page / API
-- Route") -- that 20260921120000_create_program_plan_tasks.sql collapsed
-- into task_name alone since it hadn't been read from the sheet yet. This
-- migration is written before that table has ever received a real sync
-- (still empty in production as of this change), so there's no backfill
-- concern -- existing rows (there are none) would simply get a null
-- deliverable.
ALTER TABLE public.program_plan_tasks ADD COLUMN IF NOT EXISTS deliverable text;

-- Re-issues replace_program_plan_tasks with `deliverable` added to the
-- insert -- copied from 20260921120000_create_program_plan_tasks.sql
-- verbatim otherwise (same replace-atomically semantics, same reasoning
-- for taking pre-normalized jsonb rather than raw sheet data). CREATE OR
-- REPLACE on the same name+signature updates the existing function in
-- place rather than creating a second overload.
CREATE OR REPLACE FUNCTION "public"."replace_program_plan_tasks"("p_plan_year" integer, "p_tasks" "jsonb") RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
declare
  inserted_count integer;
begin
  delete from public.program_plan_tasks where plan_year = p_plan_year;

  insert into public.program_plan_tasks
    (plan_year, milestone_code, milestone_name, task_name, deliverable, status, due_date, sort_order)
  select
    p_plan_year,
    task ->> 'milestone_code',
    task ->> 'milestone_name',
    task ->> 'task_name',
    task ->> 'deliverable',
    task ->> 'status',
    nullif(task ->> 'due_date', '')::date,
    coalesce((task ->> 'sort_order')::integer, 0)
  from jsonb_array_elements(p_tasks) as task;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

ALTER FUNCTION "public"."replace_program_plan_tasks"("p_plan_year" integer, "p_tasks" "jsonb") OWNER TO "postgres";

-- Same grants as the function's original creation -- CREATE OR REPLACE
-- doesn't touch existing grants, but they're re-issued here anyway so
-- this migration is a complete, self-contained statement of the
-- function's intended privileges rather than relying on a reader to
-- cross-reference the previous migration.
REVOKE ALL ON FUNCTION "public"."replace_program_plan_tasks"("p_plan_year" integer, "p_tasks" "jsonb") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."replace_program_plan_tasks"("p_plan_year" integer, "p_tasks" "jsonb") FROM "anon";
REVOKE ALL ON FUNCTION "public"."replace_program_plan_tasks"("p_plan_year" integer, "p_tasks" "jsonb") FROM "authenticated";
GRANT ALL ON FUNCTION "public"."replace_program_plan_tasks"("p_plan_year" integer, "p_tasks" "jsonb") TO "service_role";
