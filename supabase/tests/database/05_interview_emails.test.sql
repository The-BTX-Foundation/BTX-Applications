-- Interview emails (20261013090400): the email log takes the six new kinds, and "never twice" holds per
-- (kind, application, slot, recipient) for them and per (kind, application) for the old kinds.
-- Run with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

create schema tests;
create function tests.new_user(p_email text) returns uuid language plpgsql security definer set search_path = public, auth as $$
declare v uuid := gen_random_uuid();
begin
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', v, 'authenticated', 'authenticated', p_email, '{"provider":"email"}', '{}', now(), now());
  return v;
end $$;

insert into public.cycles (id, term, year, status, award_name, award_amount_cents, opens_at, closes_at, interview_start, interview_end)
values ('33333333-3333-3333-3333-333333333333', 'Mail Test', 2032, 'draft', 'Legacy', 200000, null, null, '2032-10-15', '2032-10-17');
insert into public.applications (id, cycle_id, user_id, terpmail, full_name, status, applicant_code, submitted_at, agreed_true)
values ('aaaaaaaa-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', tests.new_user('mail1@terpmail.umd.edu'),
        'mail1@terpmail.umd.edu', 'Mia One', 'submitted', 'APP-2032-00001', now(), true);
insert into public.interview_slots (id, cycle_id, starts_at, ends_at, opened_at) values
  ('bbbbbbbb-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', '2032-10-15 14:00+00', '2032-10-15 14:30+00', now()),
  ('bbbbbbbb-0000-0000-0000-000000000002', '33333333-3333-3333-3333-333333333333', '2032-10-15 15:00+00', '2032-10-15 15:30+00', now());

select lives_ok($$ insert into public.email_log (kind, cycle_id, application_id, slot_id, recipient, to_address) values
  ('prep', '33333333-3333-3333-3333-333333333333', 'aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'a@x.org', 'a@x.org') $$,
  'a prep email is logged with its slot and recipient');
select lives_ok($$ insert into public.email_log (kind, cycle_id, application_id, slot_id, recipient, to_address) values
  ('prep', '33333333-3333-3333-3333-333333333333', 'aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'b@x.org', 'b@x.org') $$,
  'the second interviewer gets their own prep email');
select throws_ok($$ insert into public.email_log (kind, cycle_id, application_id, slot_id, recipient, to_address) values
  ('prep', '33333333-3333-3333-3333-333333333333', 'aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'A@x.org', 'A@x.org') $$,
  '23505', null, 'the same prep email to the same person is refused (case does not matter)');
select lives_ok($$ insert into public.email_log (kind, cycle_id, application_id, slot_id, recipient, to_address) values
  ('booked', '33333333-3333-3333-3333-333333333333', 'aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'mail1@terpmail.umd.edu', 'mail1@terpmail.umd.edu'),
  ('booked', '33333333-3333-3333-3333-333333333333', 'aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002', 'mail1@terpmail.umd.edu', 'mail1@terpmail.umd.edu') $$,
  'a student can be told about each slot she books');
select throws_ok($$ insert into public.email_log (kind, cycle_id, application_id, slot_id, recipient, to_address) values
  ('booked', '33333333-3333-3333-3333-333333333333', 'aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002', 'mail1@terpmail.umd.edu', 'mail1@terpmail.umd.edu') $$,
  '23505', null, 'but not twice about the same slot');
select throws_ok($$ insert into public.email_log (kind, cycle_id, application_id, slot_id, recipient, to_address) values
  ('video-link', '33333333-3333-3333-3333-333333333333', null, null, null, 'x@x.org'),
  ('video-link', '33333333-3333-3333-3333-333333333333', null, null, null, 'x@x.org') $$,
  '23505', null, 'null slot, application and recipient still count as one value');

-- the old kinds keep their rule
select lives_ok($$ insert into public.email_log (kind, cycle_id, application_id, to_address) values
  ('book', '33333333-3333-3333-3333-333333333333', 'aaaaaaaa-0000-0000-0000-000000000001', 'mail1@terpmail.umd.edu') $$,
  'an old kind is logged as before');
select throws_ok($$ insert into public.email_log (kind, cycle_id, application_id, to_address) values
  ('book', '33333333-3333-3333-3333-333333333333', 'aaaaaaaa-0000-0000-0000-000000000001', 'mail1@terpmail.umd.edu') $$,
  '23505', null, 'an old kind is still once per application');
select throws_ok($$ insert into public.email_log (kind, to_address) values ('nonsense', 'x@x.org') $$,
  '23514', null, 'an unknown kind is refused');

-- deleting a slot keeps the log row
delete from public.email_log where kind = 'video-link';
delete from public.interview_slots where id = 'bbbbbbbb-0000-0000-0000-000000000002';
select is((select count(*) from public.email_log where kind = 'booked' and slot_id is null), 1::bigint, 'a deleted slot leaves its log row with no slot');

select * from finish();
rollback;
