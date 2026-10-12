-- Ops Hub: money deletes (D3), availability blocks (D4), scoring under blind
-- review, storage buckets. Run with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

-- ---- helpers (rolled back with the test) -----------------------------------
create schema tests;
create function tests.new_user(p_email text, p_role text) returns uuid language plpgsql security definer set search_path = public, auth as $$
declare v uuid := gen_random_uuid();
begin
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', v, 'authenticated', 'authenticated', p_email,
          '{"provider":"email"}', '{}', now(), now());
  if p_role <> 'applicant' then
    update auth.users set raw_app_meta_data = raw_app_meta_data || jsonb_build_object('role', p_role) where id = v;
  end if;
  return v;
end $$;
create function tests.login(p_email text) returns void language plpgsql security definer set search_path = public, auth as $$
declare u auth.users%rowtype;
begin
  select * into u from auth.users where email = p_email;
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', u.id, 'role', 'authenticated', 'email', u.email,
    'app_metadata', u.raw_app_meta_data)::text, true);
end $$;
create function tests.uid(p_email text) returns uuid language sql security definer set search_path = public, auth as $$
  select id from auth.users where email = p_email $$;
create function tests.app_id(p_email text) returns uuid language sql security definer set search_path = public, auth as $$
  select a.id from public.applications a join auth.users u on u.id = a.user_id where u.email = p_email limit 1 $$;
grant usage on schema tests to authenticated, anon;
grant execute on all functions in schema tests to authenticated, anon;

-- Keep any locally seeded cycle out of the way.
update public.cycles set status = 'archived' where status = 'published';

update public.cycles set status = 'archived' where status = 'published';

-- ---- setup -------------------------------------------------------------------
select tests.new_user('admin@t.test', 'admin');
select tests.new_user('board@t.test', 'board');
select tests.new_user('board2@t.test', 'board');
select tests.new_user('reviewer@t.test', 'reviewer');
select tests.new_user('ada@terpmail.umd.edu', 'applicant');
insert into public.staff_profiles (user_id, display_name, initials) values
  (tests.uid('admin@t.test'), 'Dania Admin', 'DA'),
  (tests.uid('board@t.test'), 'Kelsey Davis', 'KD'),
  (tests.uid('board2@t.test'), 'Tomi Falodun', 'TF'),
  (tests.uid('reviewer@t.test'), 'Rae Viewer', 'RV');
insert into public.cycles (id, term, year, status, award_name, award_amount_cents, opens_at, closes_at, interview_start, interview_end)
values ('11111111-1111-1111-1111-111111111111', 'Test Open', 2026, 'published', 'Legacy', 200000,
        now() - interval '1 day', now() + interval '2 days', current_date + 3, current_date + 5);

-- ---- buckets -----------------------------------------------------------------
select is((select count(*) from storage.buckets where id in ('applicant-documents', 'award-photos') and not public), 2::bigint,
  'both private buckets exist');

-- ---- money: board adds and edits, only admins delete (D3) ----------------------
select tests.login('board@t.test'); set local role authenticated;
select lives_ok($$ insert into public.budget_years (year) values (2026) $$, 'board adds a budget year');
select lives_ok($$ insert into public.budget_categories (id, year, name, kind, budget_cents) values
  ('c0000000-0000-0000-0000-000000000001', 2026, 'Scholarships', 'scholarships', 400000),
  ('c0000000-0000-0000-0000-000000000002', 2026, 'Sponsorships', 'sponsorships', 300000) $$, 'board adds budget categories');
select lives_ok($$ insert into public.budget_quarter_plans (id, year, quarter) values ('d0000000-0000-0000-0000-000000000001', 2026, 4) $$,
  'board drafts a quarter plan');
select lives_ok($$ insert into public.budget_quarter_plan_lines (plan_id, category_id, amount_cents)
  values ('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 100000) $$, 'board adds a plan line');
select lives_ok($$ update public.budget_quarter_plan_lines set amount_cents = 120000
  where plan_id = 'd0000000-0000-0000-0000-000000000001' $$, 'board edits a plan line');
select lives_ok($$ insert into public.gifts (id, gift_on, amount_cents, source) values ('e0000000-0000-0000-0000-000000000001', current_date, 5000, 'individual') $$,
  'board logs a gift');
select lives_ok($$ insert into public.grants (id, name) values ('f0000000-0000-0000-0000-000000000001', 'Test grant') $$, 'board adds a grant');
select lives_ok($$ insert into public.spending_entries (id, spent_on, description, category_id, amount_cents)
  values ('a0000000-0000-0000-0000-000000000001', current_date, 'Flyers', 'c0000000-0000-0000-0000-000000000001', 2500) $$, 'board logs spending');
select lives_ok($$ select public.log_sponsorship('NSBE convention', 'conference', 5, 275000, 'Spring 2026', current_date) $$,
  'board logs a sponsorship (and its spending)');

delete from public.gifts;
delete from public.grants;
delete from public.spending_entries;
delete from public.budget_quarter_plan_lines;
delete from public.budget_quarter_plans;
delete from public.budget_categories;
delete from public.budget_years;
delete from public.sponsorships;
reset role;
select is((select count(*) from public.gifts), 1::bigint, 'board cannot delete a gift');
select is((select count(*) from public.grants), 1::bigint, 'board cannot delete a grant');
select is((select count(*) from public.spending_entries), 2::bigint, 'board cannot delete spending');
select is((select count(*) from public.budget_quarter_plan_lines), 1::bigint, 'board cannot delete a budget line');
select is((select count(*) from public.budget_categories), 2::bigint, 'board cannot delete a budget category');
select is((select count(*) from public.sponsorships), 1::bigint, 'board cannot delete a sponsorship (it would delete spending)');

select tests.login('board@t.test'); set local role authenticated;
select lives_ok($$ insert into public.tasks (id, title, area) values ('b0000000-0000-0000-0000-000000000001', 'Board task', 'money') $$,
  'board adds a task');
delete from public.tasks where id = 'b0000000-0000-0000-0000-000000000001';
reset role;
select is((select count(*) from public.tasks where id = 'b0000000-0000-0000-0000-000000000001'), 0::bigint,
  'board still deletes non-money records (a task), as drafted');

select tests.login('admin@t.test'); set local role authenticated;
delete from public.gifts;
delete from public.grants;
delete from public.budget_quarter_plan_lines;
delete from public.sponsorships;
delete from public.spending_entries;
reset role;
select is((select count(*) from public.gifts) + (select count(*) from public.grants)
          + (select count(*) from public.budget_quarter_plan_lines) + (select count(*) from public.spending_entries)
          + (select count(*) from public.sponsorships), 0::bigint, 'an admin deletes money records');

select tests.login('reviewer@t.test'); set local role authenticated;
select is((select count(*) from public.budget_categories), 0::bigint, 'a reviewer sees no money records (D6)');
select is((select count(*) from public.chat_channels), 0::bigint, 'a reviewer sees no chat (D6)');

-- ---- availability: Morning / Afternoon / Evening per day (D4) ------------------
reset role; select tests.login('board@t.test'); set local role authenticated;
select lives_ok($$ insert into public.board_availability (cycle_id, user_id, day, block) values
  ('11111111-1111-1111-1111-111111111111', tests.uid('board@t.test'), current_date + 3, 'morning'),
  ('11111111-1111-1111-1111-111111111111', tests.uid('board@t.test'), current_date + 3, 'evening') $$,
  'a board member gives availability per day and block, before any slot exists');
select throws_ok($$ insert into public.board_availability (cycle_id, user_id, day, block) values
  ('11111111-1111-1111-1111-111111111111', tests.uid('board@t.test'), current_date + 4, 'night') $$,
  '23514', null, 'only morning, afternoon or evening');
select throws_ok($$ insert into public.board_availability (cycle_id, user_id, day, block) values
  ('11111111-1111-1111-1111-111111111111', tests.uid('board2@t.test'), current_date + 4, 'morning') $$,
  '42501', null, 'a board member cannot give someone else''s availability');
reset role; select tests.login('reviewer@t.test'); set local role authenticated;
select throws_ok($$ insert into public.board_availability (cycle_id, user_id, day, block) values
  ('11111111-1111-1111-1111-111111111111', tests.uid('reviewer@t.test'), current_date + 4, 'morning') $$,
  '42501', null, 'a reviewer does not give availability (scoring only)');
reset role; select tests.login('admin@t.test'); set local role authenticated;
select lives_ok($$ insert into public.board_availability (cycle_id, user_id, day, block) values
  ('11111111-1111-1111-1111-111111111111', tests.uid('board2@t.test'), current_date + 4, 'afternoon') $$,
  'an admin enters availability for a board member');

-- ---- scoring still works for board members under blind review -----------------
reset role;
insert into public.rubric_criteria (cycle_id, key, name, weight, position) values
  ('11111111-1111-1111-1111-111111111111', 'community', 'Community engagement and values', 20, 1),
  ('11111111-1111-1111-1111-111111111111', 'communication', 'Communication skills', 10, 2);
insert into public.applications (id, cycle_id, user_id, terpmail, full_name, status, applicant_code, submitted_at, agreed_true)
values ('aa000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', tests.uid('ada@terpmail.umd.edu'),
        'ada@terpmail.umd.edu', 'Ada Okafor', 'submitted', 'APP-2026-00001', now(), true);
insert into public.interview_slots (id, cycle_id, starts_at, ends_at)
values ('51000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', now() + interval '3 days', now() + interval '3 days 30 minutes');
insert into public.bookings (application_id, slot_id) values ('aa000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001');
insert into public.interview_pairings (slot_id, interviewer_a, interviewer_b)
values ('51000000-0000-0000-0000-000000000001', tests.uid('board@t.test'), tests.uid('board2@t.test'));

select tests.login('board@t.test'); set local role authenticated;
select lives_ok($$ insert into public.scores (application_id, criteria)
  values ('aa000000-0000-0000-0000-000000000001', '{"community": 4, "communication": 1}') $$,
  'an interviewer scores the application (rubric check reads it blind)');
select is((select weighted_score from public.scores where scorer_id = tests.uid('board@t.test')), 3.00::numeric(4,2),
  'the weighted score is worked out');
select lives_ok($$ update public.scores set published = true where scorer_id = tests.uid('board@t.test') $$, 'the interviewer publishes');
update public.scores set published = false where scorer_id = tests.uid('board@t.test');
reset role;
select is((select published from public.scores where application_id = 'aa000000-0000-0000-0000-000000000001'), true,
  'a published score cannot be un-published from the app (D8)');

select tests.login('reviewer@t.test'); set local role authenticated;
select throws_ok($$ insert into public.scores (application_id, criteria)
  values ('aa000000-0000-0000-0000-000000000001', '{"community": 4}') $$,
  '42501', null, 'staff who do not interview the applicant cannot score');

reset role; select tests.login('board2@t.test'); set local role authenticated;
select is((select count(*) from public.scores), 0::bigint, 'the other interviewer sees no score until both publish');

reset role;
select * from finish();
rollback;
