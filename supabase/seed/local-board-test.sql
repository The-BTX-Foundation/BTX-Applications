-- =============================================================================
-- LOCAL ONLY: board walkthrough seed. Not a migration. NEVER run on production.
--
-- What it adds to a local database (supabase start, ports 553xx):
--   * a published TEST cycle with short dates counted from now():
--       opens now, closes in 2 days, interviews day 3 to day 5, decision day 7
--   * the six scoring criteria the Ops Hub expects for that cycle
--     (apps/ops/mock/scores.ts RUBRIC: 20, 20, 20, 20, 10, 10)
--   * the 12 starter interview questions for that cycle
--   * three sign-in accounts with their roles in app_metadata:
--       admin@btx.test (admin), board@btx.test (board), applicant@btx.test (applicant)
--     All three share the local test password below (TEST_PASSWORD). Email
--     codes and magic links land in the local mail catcher (Mailpit), never a
--     real inbox.
--
-- `npx supabase db reset` does NOT load this file: config.toml only seeds
-- ./seed.sql, which does not exist. Load it by hand after a reset:
--
--   docker exec -i supabase_db_btx-platform-v2 psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 < supabase/seed/local-board-test.sql
--
-- Safe to run twice (fixed ids, "on conflict do nothing"). It refuses to run on
-- a database that has the real program plan or any non-.test account.
-- =============================================================================

begin;

-- Guard: stop on anything that looks like a real database.
do $$
begin
  if exists (select 1 from legacy.program_plan_milestones)
     or exists (select 1 from auth.users where email not like '%.test') then
    raise exception 'local-board-test.sql: this database has real data; refusing to seed';
  end if;
end;
$$;

-- ---- accounts ----------------------------------------------------------------
-- TEST_PASSWORD (local only): btx-local-walkthrough
do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('a0000000-0000-4000-8000-000000000001'::uuid, 'admin@btx.test',     'admin'),
      ('a0000000-0000-4000-8000-000000000002'::uuid, 'board@btx.test',     'board'),
      ('a0000000-0000-4000-8000-000000000003'::uuid, 'applicant@btx.test', 'applicant')
    ) as v(id, email, role)
  loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change)
    values (
      '00000000-0000-0000-0000-000000000000', r.id, 'authenticated', 'authenticated', r.email,
      extensions.crypt('btx-local-walkthrough', extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', '{}', now(), now(),
      '', '', '', '')
    on conflict (id) do nothing;

    insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), r.id, r.id::text, 'email',
            jsonb_build_object('sub', r.id::text, 'email', r.email, 'email_verified', true), now(), now(), now())
    on conflict (provider_id, provider) do nothing;

    -- The sign-up trigger made everyone an applicant; staff roles are set here
    -- the way the Ops Hub sets them (app_metadata, server side).
    update auth.users
       set raw_app_meta_data = raw_app_meta_data || jsonb_build_object('role', r.role)
     where id = r.id;
  end loop;
end;
$$;

insert into public.staff_profiles (user_id, display_name, title, initials) values
  ('a0000000-0000-4000-8000-000000000001', 'Test Admin', 'Admin (local test)', 'TA'),
  ('a0000000-0000-4000-8000-000000000002', 'Test Board Member', 'Board (local test)', 'TB')
on conflict (user_id) do nothing;

-- ---- the TEST cycle ------------------------------------------------------------
-- Only one cycle can be published: archive any other published one first.
update public.cycles set status = 'archived'
 where status = 'published' and id <> 'c7000000-0000-4000-8000-000000000001';

insert into public.cycles (
  id, term, year, status, award_name, award_amount_cents,
  opens_at, closes_at, interview_start, interview_end, decision_date,
  next_cycle_month, requirements, payment_note)
values (
  'c7000000-0000-4000-8000-000000000001', 'TEST cycle', extract(year from now())::smallint, 'published',
  'Legacy Scholarship', 200000,
  now(), now() + interval '2 days',
  current_date + 3, current_date + 5, current_date + 7,
  'October',
  '["Full-time Clark School undergraduate working toward a B.S. in engineering",
    "12 or more credits left in your program",
    "GPA of 2.5 or higher when you apply"]'::jsonb,
  '[How it''s paid]')
on conflict (id) do nothing;

-- ---- scoring rubric (apps/ops/mock/scores.ts RUBRIC) ----------------------------
insert into public.rubric_criteria (cycle_id, key, name, weight, position) values
  ('c7000000-0000-4000-8000-000000000001', 'community',     'Community engagement and values', 20, 1),
  ('c7000000-0000-4000-8000-000000000001', 'resilience',    'Resilience and problem-solving',  20, 2),
  ('c7000000-0000-4000-8000-000000000001', 'leadership',    'Leadership and teamwork',         20, 3),
  ('c7000000-0000-4000-8000-000000000001', 'financial',     'Financial need and impact',       20, 4),
  ('c7000000-0000-4000-8000-000000000001', 'communication', 'Communication skills',            10, 5),
  ('c7000000-0000-4000-8000-000000000001', 'passion',       'Passion and motivation',          10, 6)
on conflict (cycle_id, key) do nothing;

-- ---- interview questions: the 12 starters (20261013090300_interview_flow.sql) ---
insert into public.interview_questions (cycle_id, criterion_key, position, text)
select 'c7000000-0000-4000-8000-000000000001', s.criterion_key, s.position, s.text
from public.starter_questions() s
where not exists (select 1 from public.interview_questions q
                  where q.cycle_id = 'c7000000-0000-4000-8000-000000000001');

commit;
