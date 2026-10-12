-- =============================================================================
-- Portal short answers (2026-10-12)
--
-- DRAFT. NOT APPLIED. Apply only after Dominick approves it by naming the
-- production project (awiaebtqalcmfafvktwh, "BTX Student/Operations Hub").
-- Apply it BEFORE the Portal code that uses answer_1..answer_3 merges.
-- Plain-English guide: supabase/migrations/README-portal-short-answers.md
--
-- What this does, in one transaction:
--   a. Adds three required short-answer columns to applications
--      (answer_1, answer_2, answer_3), replacing the optional essay.
--   b. Lets applicants write the new columns (column privileges).
--   c. A cycle no longer needs an essay prompt to publish: the three questions
--      live in code (packages/data/src/questions.ts, SHORT_ANSWER_QUESTIONS).
--   d. submit_application(): the live definition (read 2026-10-12), plus three
--      required checks for the answers.
--   e. Marks the old essay columns as unused. Nothing is dropped here; the
--      later cleanup migration drops them.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- a. Three short-answer columns (the 250-word limit is checked in the app)
-- -----------------------------------------------------------------------------

alter table public.applications
  add column answer_1 text constraint applications_answer_1_check check (char_length(answer_1) <= 2500),
  add column answer_2 text constraint applications_answer_2_check check (char_length(answer_2) <= 2500),
  add column answer_3 text constraint applications_answer_3_check check (char_length(answer_3) <= 2500);

comment on column public.applications.answer_1 is
  'Step 3, question 1 of 3 (SHORT_ANSWER_QUESTIONS[0] in packages/data/src/questions.ts). Required to submit.';
comment on column public.applications.answer_2 is
  'Step 3, question 2 of 3 (SHORT_ANSWER_QUESTIONS[1] in packages/data/src/questions.ts). Required to submit.';
comment on column public.applications.answer_3 is
  'Step 3, question 3 of 3 (SHORT_ANSWER_QUESTIONS[2] in packages/data/src/questions.ts). Required to submit.';

-- -----------------------------------------------------------------------------
-- b. Applicants may write the new answer columns (RLS still limits them to
--    their own draft)
-- -----------------------------------------------------------------------------

grant insert (answer_1, answer_2, answer_3) on public.applications to authenticated;
grant update (answer_1, answer_2, answer_3) on public.applications to authenticated;

-- -----------------------------------------------------------------------------
-- c. Publishing a cycle no longer needs an essay prompt
-- -----------------------------------------------------------------------------

-- The Ops Hub guard, enforced here too: a cycle can't be published while a
-- required setting is empty (name, amount, open date, deadline).
alter table public.cycles drop constraint cycles_published_needs_settings;
alter table public.cycles add constraint cycles_published_needs_settings check (
  status <> 'published' or (
    award_name is not null and award_amount_cents is not null
    and opens_at is not null and closes_at is not null));

-- -----------------------------------------------------------------------------
-- d. submit_application: the live body, plus the three answers
-- -----------------------------------------------------------------------------

-- Submits the caller's own draft and returns its application number. Same as the
-- live definition (pg_get_functiondef, 2026-10-12) except for the three answer
-- checks after `major`. `create or replace` keeps the function's grants.
-- Errors: not_found, cycle_closed, missing_answers:<columns>, missing_files, not_agreed
CREATE OR REPLACE FUNCTION public.submit_application(p_application_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_app public.applications%rowtype;
  v_cycle public.cycles%rowtype;
  v_missing text[] := '{}';
  v_files integer;
  v_number integer;
  v_code text;
begin
  select * into v_app from public.applications where id = p_application_id for update;
  if not found or v_app.user_id is distinct from auth.uid() then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_app.status = 'submitted' then return v_app.applicant_code; end if;
  select * into v_cycle from public.cycles where id = v_app.cycle_id;
  if v_cycle.status <> 'published' or now() < v_cycle.opens_at or now() >= v_cycle.closes_at then raise exception 'cycle_closed' using errcode = 'P0001'; end if;
  if coalesce(btrim(v_app.full_name), '') = '' then v_missing := v_missing || 'full_name'::text; end if;
  if coalesce(btrim(v_app.phone), '') = '' then v_missing := v_missing || 'phone'::text; end if;
  if coalesce(btrim(v_app.gender), '') = '' then v_missing := v_missing || 'gender'::text; end if;
  if coalesce(btrim(v_app.race), '') = '' then v_missing := v_missing || 'race'::text; end if;
  if coalesce(btrim(v_app.heard_from), '') = '' then v_missing := v_missing || 'heard_from'::text; end if;
  if v_app.year_in_school is null then v_missing := v_missing || 'year_in_school'::text; end if;
  if v_app.credits_left is null then v_missing := v_missing || 'credits_left'::text; end if;
  if coalesce(btrim(v_app.major), '') = '' then v_missing := v_missing || 'major'::text; end if;
  -- Step 3: all three short answers are required.
  if coalesce(btrim(v_app.answer_1), '') = '' then v_missing := v_missing || 'answer_1'::text; end if;
  if coalesce(btrim(v_app.answer_2), '') = '' then v_missing := v_missing || 'answer_2'::text; end if;
  if coalesce(btrim(v_app.answer_3), '') = '' then v_missing := v_missing || 'answer_3'::text; end if;
  if cardinality(v_missing) > 0 then raise exception 'missing_answers:%', array_to_string(v_missing, ',') using errcode = 'P0001'; end if;
  select count(distinct f.kind) into v_files from public.application_files f where f.application_id = v_app.id and f.kind in ('resume', 'transcript');
  if v_files < 2 then raise exception 'missing_files' using errcode = 'P0001'; end if;
  if not v_app.agreed_true then raise exception 'not_agreed' using errcode = 'P0001'; end if;
  insert into public.application_code_counters as c (year, last_number) values (v_cycle.year, 1)
  on conflict (year) do update set last_number = c.last_number + 1 returning c.last_number into v_number;
  v_code := format('APP-%s-%s', v_cycle.year, lpad(v_number::text, 5, '0'));
  update public.applications set status = 'submitted', submitted_at = now(), applicant_code = v_code, current_step = 5 where id = v_app.id;
  return v_code;
end;
$function$;

-- -----------------------------------------------------------------------------
-- e. The old essay columns are unused from today (dropped in a later cleanup)
-- -----------------------------------------------------------------------------

comment on column public.applications.essay is
  'Unused since 2026-10-12: replaced by answer_1..answer_3. Drop in the later cleanup migration.';
comment on column public.cycles.essay_prompt is
  'Unused since 2026-10-12: the questions live in code (SHORT_ANSWER_QUESTIONS). Drop in the later cleanup migration.';
comment on column public.cycles.essay_use is
  'Unused since 2026-10-12: the questions live in code (SHORT_ANSWER_QUESTIONS). Drop in the later cleanup migration.';

commit;
