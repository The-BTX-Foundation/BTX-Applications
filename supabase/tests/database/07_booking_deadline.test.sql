-- Booking deadline (20261114120000): cycles.booking_closes_at closes booking for
-- students with no active booking (switch_booking refuses 'booking_closed',
-- open_interview_slots returns nothing, free times are refused). A student who
-- already holds a time keeps full control. Null = no deadline.
-- Run with: npx supabase test db
-- now() is fixed for the whole transaction, so deadlines are set relative to it.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

-- ---- helpers (rolled back with the test) -----------------------------------
create schema tests;
-- Makes a signed-in user (role in app metadata unless applicant).
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
-- Acts as that user for the rest of the transaction (JWT claims).
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
-- Sets the test cycle's deadline (runs as owner, whatever role the test is in).
create function tests.deadline(p_at timestamptz) returns void language sql security definer set search_path = public as $$
  update public.cycles set booking_closes_at = p_at where id = '11111111-1111-1111-1111-111111111111' $$;
grant usage on schema tests to authenticated, anon;
grant execute on all functions in schema tests to authenticated, anon;

-- Keep any locally seeded cycle out of the way.
update public.cycles set status = 'archived' where status = 'published';

-- ---- setup -------------------------------------------------------------------
select tests.new_user('ada@terpmail.umd.edu', 'applicant'); -- books before the deadline
select tests.new_user('bea@terpmail.umd.edu', 'applicant'); -- never books
select tests.new_user('cy@terpmail.umd.edu', 'applicant');  -- sends free times
insert into public.cycles (id, term, year, status, award_name, award_amount_cents, opens_at, closes_at, interview_start, interview_end)
values ('11111111-1111-1111-1111-111111111111', 'Test Open', 2030, 'published', 'Legacy', 200000,
        now() - interval '1 day', now() + interval '2 days', '2030-10-15', '2030-10-17');
insert into public.applications (cycle_id, user_id, terpmail, full_name, status, applicant_code, submitted_at, agreed_true) values
  ('11111111-1111-1111-1111-111111111111', tests.uid('ada@terpmail.umd.edu'), 'ada@terpmail.umd.edu', 'Ada Okafor', 'submitted', 'APP-2030-00001', now(), true),
  ('11111111-1111-1111-1111-111111111111', tests.uid('bea@terpmail.umd.edu'), 'bea@terpmail.umd.edu', 'Bea Lin', 'submitted', 'APP-2030-00002', now(), true),
  ('11111111-1111-1111-1111-111111111111', tests.uid('cy@terpmail.umd.edu'), 'cy@terpmail.umd.edu', 'Cy Doe', 'submitted', 'APP-2030-00003', now(), true);
-- Four opened future times: S1..S4.
insert into public.interview_slots (id, cycle_id, starts_at, ends_at, opened_at) values
  ('52000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '2030-10-15 10:00 America/New_York', '2030-10-15 10:30 America/New_York', now()),
  ('52000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', '2030-10-15 11:00 America/New_York', '2030-10-15 11:30 America/New_York', now()),
  ('52000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', '2030-10-16 10:00 America/New_York', '2030-10-16 10:30 America/New_York', now()),
  ('52000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', '2030-10-17 10:00 America/New_York', '2030-10-17 10:30 America/New_York', now());

select has_column('public', 'cycles', 'booking_closes_at', 'cycles has booking_closes_at');
select is((select booking_closes_at from public.cycles where id = '11111111-1111-1111-1111-111111111111'), null::timestamptz,
  'a new cycle has no deadline (null)');

-- ---- null deadline: everything works -----------------------------------------
select tests.login('bea@terpmail.umd.edu'); set local role authenticated;
select is((select count(*) from public.open_interview_slots('11111111-1111-1111-1111-111111111111')), 4::bigint,
  'no deadline: an unbooked student sees the open times');
select is(public.booking_closed('11111111-1111-1111-1111-111111111111'), false, 'no deadline: booking is not closed');

-- ---- before the deadline: everything works -----------------------------------
reset role; select tests.deadline(now() + interval '1 hour');
select tests.login('ada@terpmail.umd.edu'); set local role authenticated;
select is((select count(*) from public.open_interview_slots('11111111-1111-1111-1111-111111111111')), 4::bigint,
  'before the deadline: an unbooked student sees the open times');
select is(public.switch_booking('52000000-0000-0000-0000-000000000001'), 'booked', 'before the deadline: Ada books S1');
reset role; select tests.login('cy@terpmail.umd.edu'); set local role authenticated;
select lives_ok($$ insert into public.interview_free_times (application_id, ranges, said)
  values (tests.app_id('cy@terpmail.umd.edu'), '[{"day":"2030-10-16","start":"18:00","end":"20:00"}]', 'Wednesday after 6') $$,
  'before the deadline: an unbooked student sends free times');
select lives_ok($$ update public.interview_free_times set said = 'Wednesday evening'
  where application_id = tests.app_id('cy@terpmail.umd.edu') $$,
  'before the deadline: and changes them');
select is((select said from public.interview_free_times where application_id = tests.app_id('cy@terpmail.umd.edu')), 'Wednesday evening',
  'the change was saved');

-- ---- after the deadline: unbooked students are closed out ---------------------
reset role; select tests.deadline(now() - interval '1 minute');
select tests.login('bea@terpmail.umd.edu'); set local role authenticated;
select is(public.booking_closed('11111111-1111-1111-1111-111111111111'), true, 'after the deadline: booking is closed');
select is((select count(*) from public.open_interview_slots('11111111-1111-1111-1111-111111111111')), 0::bigint,
  'after the deadline: an unbooked student sees zero open times (no error)');
select throws_ok($$ select public.switch_booking('52000000-0000-0000-0000-000000000002') $$,
  '22023', 'booking_closed', 'after the deadline: switch_booking refuses an unbooked student');
select throws_ok($$ select public.switch_booking('52000000-0000-0000-0000-000000000001') $$,
  '22023', 'booking_closed', 'after the deadline: an unbooked student is refused even on a taken time');
reset role;
select is((select count(*) from public.bookings where application_id = tests.app_id('bea@terpmail.umd.edu')), 0::bigint,
  'the refused student holds no booking');

-- The free-times policies refuse insert and update for unbooked students.
select tests.login('bea@terpmail.umd.edu'); set local role authenticated;
select throws_ok($$ insert into public.interview_free_times (application_id, ranges, said)
  values (tests.app_id('bea@terpmail.umd.edu'), '[{"day":"2030-10-16","start":"18:00","end":"20:00"}]', 'Wednesday') $$,
  '42501', null, 'after the deadline: an unbooked student cannot send free times');
reset role; select tests.login('cy@terpmail.umd.edu'); set local role authenticated;
update public.interview_free_times set said = 'Thursday instead' where application_id = tests.app_id('cy@terpmail.umd.edu');
reset role;
select is((select said from public.interview_free_times where application_id = tests.app_id('cy@terpmail.umd.edu')), 'Wednesday evening',
  'after the deadline: an unbooked student cannot change free times she sent earlier');

-- ---- after the deadline: a booked student keeps full control ------------------
select tests.login('ada@terpmail.umd.edu'); set local role authenticated;
select is((select count(*) from public.open_interview_slots('11111111-1111-1111-1111-111111111111')), 3::bigint,
  'after the deadline: a booked student still sees the open times (all but her own)');
select is(public.switch_booking('52000000-0000-0000-0000-000000000003'), 'switched', 'after the deadline: a booked student can switch');
select is(public.switch_booking('52000000-0000-0000-0000-000000000003', 'Lab until 6'), 'unchanged',
  'after the deadline: a booked student can save a note on her own time');
reset role;
select is((select note from public.bookings where application_id = tests.app_id('ada@terpmail.umd.edu') and status = 'active'), 'Lab until 6',
  'the note was saved');
select is((select slot_id from public.bookings where application_id = tests.app_id('ada@terpmail.umd.edu') and status = 'active'),
  '52000000-0000-0000-0000-000000000003'::uuid, 'she holds the new time');

-- A booked student was never allowed free times (the existing "no active booking" rule); the deadline does not change that.
select tests.login('ada@terpmail.umd.edu'); set local role authenticated;
select throws_ok($$ insert into public.interview_free_times (application_id, ranges, said)
  values (tests.app_id('ada@terpmail.umd.edu'), '[{"day":"2030-10-16","start":"18:00","end":"20:00"}]', 'Wednesday') $$,
  '42501', null, 'a booked student still cannot send free times (unchanged rule)');

-- ---- the deadline lifted (null again): unbooked students can book -------------
reset role; select tests.deadline(null);
select tests.login('bea@terpmail.umd.edu'); set local role authenticated;
select is((select count(*) from public.open_interview_slots('11111111-1111-1111-1111-111111111111')), 3::bigint,
  'deadline cleared: the unbooked student sees open times again');
select is(public.switch_booking('52000000-0000-0000-0000-000000000002'), 'booked', 'deadline cleared: the unbooked student books');

-- ---- grants ------------------------------------------------------------------
reset role;
select ok(not has_function_privilege('anon', 'public.booking_closed(uuid)', 'execute'), 'anon cannot call booking_closed');
select ok(has_function_privilege('authenticated', 'public.switch_booking(uuid, text)', 'execute'), 'signed-in users still call switch_booking');
select ok(not has_function_privilege('anon', 'public.open_interview_slots(uuid)', 'execute'), 'anon still cannot call open_interview_slots');

select * from finish();
rollback;
