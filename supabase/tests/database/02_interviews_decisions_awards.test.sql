-- Interviews, release and decisions, photo and story. Run with: npx supabase test db
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

create function tests.submitted_app(p_email text, p_code text) returns uuid language plpgsql security definer set search_path = public, auth as $$
declare v uuid;
begin
  insert into public.applications (cycle_id, user_id, terpmail, full_name, status, applicant_code, submitted_at, agreed_true,
                                   answer_1, answer_2, answer_3)
  values ('11111111-1111-1111-1111-111111111111', tests.uid(p_email), p_email, 'Some One', 'submitted', p_code, now(), true,
          'a', 'b', 'c')
  returning id into v;
  return v;
end $$;
grant execute on all functions in schema tests to authenticated, anon;
create function tests.award_id() returns uuid language sql security definer set search_path = public as $$
  select id from public.scholarship_awards limit 1 $$;
grant execute on function tests.award_id() to authenticated;

update public.cycles set status = 'archived' where status = 'published';

-- ---- setup -------------------------------------------------------------------
select tests.new_user('admin@t.test', 'admin');
select tests.new_user('board@t.test', 'board');
select tests.new_user('board2@t.test', 'board');
select tests.new_user('ada@terpmail.umd.edu', 'applicant');
select tests.new_user('bea@terpmail.umd.edu', 'applicant');
select tests.new_user('cy@terpmail.umd.edu', 'applicant');
select tests.new_user('dee@terpmail.umd.edu', 'applicant');
insert into public.staff_profiles (user_id, display_name, initials) values
  (tests.uid('admin@t.test'), 'Dania Admin', 'DA'),
  (tests.uid('board@t.test'), 'Kelsey Davis', 'KD'),
  (tests.uid('board2@t.test'), 'Tomi Falodun', 'TF');

insert into public.cycles (id, term, year, status, award_name, award_amount_cents, opens_at, closes_at)
values ('11111111-1111-1111-1111-111111111111', 'Test Open', 2026, 'published', 'Legacy', 200000,
        now() - interval '1 day', now() + interval '2 days');
select tests.submitted_app('ada@terpmail.umd.edu', 'APP-2026-00001');
select tests.submitted_app('bea@terpmail.umd.edu', 'APP-2026-00002');
select tests.submitted_app('dee@terpmail.umd.edu', 'APP-2026-00003');
insert into public.applications (cycle_id, user_id, terpmail) values
  ('11111111-1111-1111-1111-111111111111', tests.uid('cy@terpmail.umd.edu'), 'cy@terpmail.umd.edu');   -- a draft

-- ---- interview slots: admins only --------------------------------------------
select tests.login('board@t.test');
set local role authenticated;
select throws_ok($$ insert into public.interview_slots (cycle_id, starts_at, ends_at)
  values ('11111111-1111-1111-1111-111111111111', now() + interval '3 days', now() + interval '3 days 30 minutes') $$,
  '42501', null, 'a board member cannot create interview slots');

reset role; select tests.login('admin@t.test'); set local role authenticated;
select lives_ok($$ insert into public.interview_slots (id, cycle_id, starts_at, ends_at) values
  ('51000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', now() + interval '3 days', now() + interval '3 days 30 minutes'),
  ('51000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', now() + interval '3 days 1 hour', now() + interval '3 days 90 minutes'),
  ('51000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', now() + interval '4 days', now() + interval '4 days 30 minutes') $$,
  'an admin creates interview slots');

-- ---- open_interview_slots and booking ----------------------------------------
reset role; select tests.login('ada@terpmail.umd.edu'); set local role authenticated;
select is((select count(*) from public.open_interview_slots('11111111-1111-1111-1111-111111111111')), 3::bigint,
  'a submitted applicant sees the 3 free slots');
select is((select count(*) from public.interview_slots), 0::bigint, 'an applicant does not read the slot table directly');
select is(public.switch_booking('51000000-0000-0000-0000-000000000001'), 'booked', 'switch_booking: first booking');
select is(public.switch_booking('51000000-0000-0000-0000-000000000001'), 'unchanged', 'switch_booking: same slot again');

reset role; select tests.login('bea@terpmail.umd.edu'); set local role authenticated;
select is((select count(*) from public.open_interview_slots('11111111-1111-1111-1111-111111111111')), 2::bigint,
  'a taken slot is no longer listed for others');
select is(public.switch_booking('51000000-0000-0000-0000-000000000001'), 'taken', 'switch_booking: someone else holds it');
select is(public.switch_booking('51000000-0000-0000-0000-000000000002', 'I need step-free access'), 'booked',
  'switch_booking with a note');
select throws_ok($$ select public.switch_booking('51000000-0000-0000-0000-000000000003', repeat('x', 1001)) $$,
  '22023', 'note_too_long', 'switch_booking refuses a note over 1,000 characters');

reset role; select tests.login('ada@terpmail.umd.edu'); set local role authenticated;
select is(public.switch_booking('51000000-0000-0000-0000-000000000003'), 'switched', 'switch_booking: moved to a new slot');
select is((select count(*) from public.interview_slots), 2::bigint, 'an applicant reads only slots she holds or held');

reset role; select tests.login('bea@terpmail.umd.edu'); set local role authenticated;
select is((select count(*) from public.open_interview_slots('11111111-1111-1111-1111-111111111111')), 1::bigint,
  'the released slot is free again');

reset role;
select is((select note from public.bookings where slot_id = '51000000-0000-0000-0000-000000000002' and status = 'active'),
  'I need step-free access', 'the booking note is saved');

select tests.login('board@t.test'); set local role authenticated;
select throws_ok($$ select * from public.open_interview_slots('11111111-1111-1111-1111-111111111111') $$,
  '42501', 'no_submitted_application', 'a board member cannot use the applicant slot list');
reset role; select tests.login('cy@terpmail.umd.edu'); set local role authenticated;
select throws_ok($$ select * from public.open_interview_slots('11111111-1111-1111-1111-111111111111') $$,
  '42501', 'no_submitted_application', 'a draft applicant cannot list slots');
select throws_ok($$ select public.switch_booking('51000000-0000-0000-0000-000000000001') $$,
  '42501', 'no_submitted_application', 'a draft applicant cannot book');

-- ---- free times ("none of these work") ---------------------------------------
reset role; select tests.login('ada@terpmail.umd.edu'); set local role authenticated;
select throws_ok($$ insert into public.interview_free_times (application_id, days, windows)
  values (tests.app_id('ada@terpmail.umd.edu'), array['Mon'], array['morning']) $$,
  '42501', null, 'free times are refused while she holds an interview time');
reset role; select tests.login('dee@terpmail.umd.edu'); set local role authenticated;
select lives_ok($$ insert into public.interview_free_times (application_id, days, windows, note)
  values (tests.app_id('dee@terpmail.umd.edu'), array['Mon','Wed'], array['evening'], 'After 6') $$,
  'a submitted applicant without a time sends her free times');

-- ---- my_interview and the video link (D7) ------------------------------------
reset role; select tests.login('ada@terpmail.umd.edu'); set local role authenticated;
select is(public.my_interview('11111111-1111-1111-1111-111111111111') -> 'interviewers', '[]'::jsonb,
  'my_interview: no interviewers before pairing');
select is(public.my_interview('11111111-1111-1111-1111-111111111111') ->> 'videoUrl', null,
  'my_interview: no video link before pairing');

reset role; select tests.login('board@t.test'); set local role authenticated;
select throws_ok($$ insert into public.interview_pairings (slot_id, interviewer_a, interviewer_b, video_url)
  values ('51000000-0000-0000-0000-000000000003', tests.uid('board@t.test'), tests.uid('board2@t.test'), 'https://meet.example/x') $$,
  '42501', null, 'a board member cannot pair interviewers or set the link');
reset role; select tests.login('admin@t.test'); set local role authenticated;
select lives_ok($$ insert into public.interview_pairings (slot_id, interviewer_a, interviewer_b, video_url)
  values ('51000000-0000-0000-0000-000000000003', tests.uid('board@t.test'), tests.uid('board2@t.test'), 'https://meet.example/abc') $$,
  'an admin pairs two interviewers and adds the video link');

reset role; select tests.login('ada@terpmail.umd.edu'); set local role authenticated;
select is(public.my_interview('11111111-1111-1111-1111-111111111111') ->> 'videoUrl', 'https://meet.example/abc',
  'my_interview returns her video link');
select is(public.my_interview('11111111-1111-1111-1111-111111111111') -> 'interviewers',
  '["Kelsey Davis", "Tomi Falodun"]'::jsonb, 'my_interview returns the two interviewer names');
select is(public.my_interview('11111111-1111-1111-1111-111111111111') ->> 'slotId', '51000000-0000-0000-0000-000000000003',
  'my_interview returns her own slot');
reset role; select tests.login('bea@terpmail.umd.edu'); set local role authenticated;
select is(public.my_interview('11111111-1111-1111-1111-111111111111') ->> 'videoUrl', null,
  'another student does not get that link');

-- ---- decisions: nothing before release, then won / not picked ----------------
reset role; select tests.login('admin@t.test'); set local role authenticated;
select lives_ok($$ insert into public.scholarship_awards (cycle_id, application_id, award_name, amount_cents, kind, decision_note)
  values ('11111111-1111-1111-1111-111111111111', tests.app_id('ada@terpmail.umd.edu'), 'Legacy', 200000, 'main',
          'Tie with APP-2026-00002, decided by board vote') $$, 'an admin records the winner');
select is((select count(*) from public.award_steps where award_id = tests.award_id()), 5::bigint,
  'recording an award creates its five steps');

reset role; select tests.login('ada@terpmail.umd.edu'); set local role authenticated;
select is(public.my_decision('11111111-1111-1111-1111-111111111111'), null, 'my_decision: nothing before release (winner)');
reset role; select tests.login('bea@terpmail.umd.edu'); set local role authenticated;
select is(public.my_decision('11111111-1111-1111-1111-111111111111'), null, 'my_decision: nothing before release (not picked)');

reset role; select tests.login('ada@terpmail.umd.edu'); set local role authenticated;
select throws_ok($$ insert into public.award_stories (award_id, story, consent) values (tests.award_id(), 'Hi', true) $$,
  '42501', null, 'the winner cannot send a story before release');

reset role; select tests.login('board@t.test'); set local role authenticated;
update public.cycles set decisions_released_at = now() - interval '1 minute'
 where id = '11111111-1111-1111-1111-111111111111';
reset role;
select is((select decisions_released_at from public.cycles where id = '11111111-1111-1111-1111-111111111111'), null,
  'a board member cannot release decisions');

select tests.login('admin@t.test'); set local role authenticated;
update public.cycles set decisions_released_at = now() + interval '1 day' where id = '11111111-1111-1111-1111-111111111111';
reset role; select tests.login('ada@terpmail.umd.edu'); set local role authenticated;
select is(public.my_decision('11111111-1111-1111-1111-111111111111'), null, 'my_decision: nothing while the release time is in the future');

reset role; select tests.login('admin@t.test'); set local role authenticated;
update public.cycles set decisions_released_at = now() - interval '1 minute' where id = '11111111-1111-1111-1111-111111111111';
reset role;
select isnt((select decisions_released_at from public.cycles where id = '11111111-1111-1111-1111-111111111111'), null,
  'an admin releases the decisions for the cycle');

select tests.login('ada@terpmail.umd.edu'); set local role authenticated;
select is(public.my_decision('11111111-1111-1111-1111-111111111111') ->> 'kind', 'won', 'my_decision: the winner sees won');
select is((public.my_decision('11111111-1111-1111-1111-111111111111') ->> 'amountCents')::int, 200000, 'my_decision: amount');
select is((public.my_decision('11111111-1111-1111-1111-111111111111') ->> 'storySent')::boolean, false, 'my_decision: story not sent yet');
reset role; select tests.login('bea@terpmail.umd.edu'); set local role authenticated;
select is(public.my_decision('11111111-1111-1111-1111-111111111111'), '{"kind": "not-picked"}'::jsonb,
  'my_decision: an interviewed applicant without an award sees not picked');
reset role; select tests.login('dee@terpmail.umd.edu'); set local role authenticated;
select is(public.my_decision('11111111-1111-1111-1111-111111111111') ->> 'kind', 'not-picked',
  'my_decision: every other submitted applicant sees not picked (no row needed)');
reset role; select tests.login('cy@terpmail.umd.edu'); set local role authenticated;
select is(public.my_decision('11111111-1111-1111-1111-111111111111'), null, 'my_decision: a draft gets nothing');

-- ---- photo and story ----------------------------------------------------------
reset role; select tests.login('bea@terpmail.umd.edu'); set local role authenticated;
select throws_ok($$ insert into public.award_stories (award_id, story, consent) values (tests.award_id(), 'Not mine', true) $$,
  '42501', null, 'someone else cannot write the winner''s story');
select throws_ok($$ insert into storage.objects (bucket_id, name)
  values ('award-photos', tests.uid('bea@terpmail.umd.edu') || '/' || tests.award_id() || '/me.jpg') $$,
  '42501', null, 'someone else cannot upload a photo for the award');

reset role; select tests.login('ada@terpmail.umd.edu'); set local role authenticated;
select throws_ok($$ insert into storage.objects (bucket_id, name)
  values ('award-photos', tests.uid('bea@terpmail.umd.edu') || '/' || tests.award_id() || '/me.jpg') $$,
  '42501', null, 'the winner cannot upload into another person''s folder');
select lives_ok($$ insert into storage.objects (bucket_id, name)
  values ('award-photos', tests.uid('ada@terpmail.umd.edu') || '/' || tests.award_id() || '/me.jpg') $$,
  'the winner uploads her photo into her own award folder');
select lives_ok($$ insert into public.award_stories (award_id, story, consent) values (tests.award_id(), 'BTX helped me.', true) $$,
  'the winner saves her story');
select throws_ok($$ update public.award_stories set sent_at = now() where award_id = tests.award_id() $$,
  '23514', null, 'sending needs a photo');
select throws_ok($$ update public.award_stories set story = repeat('word ', 101) where award_id = tests.award_id() $$,
  '23514', null, 'the story is at most 100 words');
select lives_ok($$ update public.award_stories
  set photo_path = tests.uid('ada@terpmail.umd.edu') || '/' || tests.award_id() || '/me.jpg', sent_at = now()
  where award_id = tests.award_id() $$, 'the winner sends photo, story and consent');
select is((public.my_decision('11111111-1111-1111-1111-111111111111') ->> 'storySent')::boolean, true, 'my_decision: story sent');

reset role; select tests.login('board@t.test'); set local role authenticated;
select is((select count(*) from public.award_stories), 1::bigint, 'staff read the story');

reset role; set local role anon;
select throws_ok($$ select public.my_decision('11111111-1111-1111-1111-111111111111') $$, '42501', null,
  'signed-out users cannot call my_decision');

reset role;
select * from finish();
rollback;
