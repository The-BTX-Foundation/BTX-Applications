-- Interview flow (20261013090300): free time ranges, prefs and private
-- conflicts, interview questions, proposed vs opened times, fair pairing at
-- booking, the Portal's free time ranges and the AI usage counter.
-- Run with: npx supabase test db
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
-- Candidate names for a slot and application, in the order pairing uses.
create function tests.cands(p_slot uuid, p_app uuid) returns text[] language sql security definer set search_path = public as $$
  select coalesce(array_agg(c.display_name order by c.n), '{}')
  from public.interview_candidates(p_slot, p_app) with ordinality as c(user_id, so_far, free_left, display_name, n) $$;
create function tests.pair(p_slot uuid) returns text[] language sql security definer set search_path = public as $$
  select array[(select display_name from public.staff_profiles where user_id = p.interviewer_a),
               (select display_name from public.staff_profiles where user_id = p.interviewer_b)]
  from public.interview_pairings p where p.slot_id = p_slot $$;
grant usage on schema tests to authenticated, anon;
grant execute on all functions in schema tests to authenticated, anon;

-- Keep any locally seeded cycle out of the way.
update public.cycles set status = 'archived' where status = 'published';

-- ---- setup -------------------------------------------------------------------
-- Interview days 2030-10-15 (d1), 16 (d2), 17 (d3): Eastern daylight time.
select tests.new_user('admin@t.test', 'admin');
select tests.new_user('ana@t.test', 'board');
select tests.new_user('ben@t.test', 'board');
select tests.new_user('cal@t.test', 'board');
select tests.new_user('dee@t.test', 'board');
select tests.new_user('stale@t.test', 'reviewer');
select tests.new_user('ada@terpmail.umd.edu', 'applicant');
select tests.new_user('bea@terpmail.umd.edu', 'applicant');
select tests.new_user('cy@terpmail.umd.edu', 'applicant');
insert into public.staff_profiles (user_id, display_name, initials) values
  (tests.uid('admin@t.test'), 'Zed Admin', 'ZA'),
  (tests.uid('ana@t.test'), 'Ana Board', 'AB'),
  (tests.uid('ben@t.test'), 'Ben Board', 'BB'),
  (tests.uid('cal@t.test'), 'Cal Board', 'CB'),
  (tests.uid('dee@t.test'), 'Dee Board', 'DB'),
  (tests.uid('stale@t.test'), 'Sam Stale', 'SS');
insert into public.cycles (id, term, year, status, award_name, award_amount_cents, opens_at, closes_at, interview_start, interview_end)
values ('11111111-1111-1111-1111-111111111111', 'Test Open', 2030, 'published', 'Legacy', 200000,
        now() - interval '1 day', now() + interval '2 days', '2030-10-15', '2030-10-17'),
       ('22222222-2222-2222-2222-222222222222', 'No rubric', 2031, 'draft', 'Legacy', 200000,
        null, null, null, null);
insert into public.applications (cycle_id, user_id, terpmail, full_name, status, applicant_code, submitted_at, agreed_true) values
  ('11111111-1111-1111-1111-111111111111', tests.uid('ada@terpmail.umd.edu'), 'ada@terpmail.umd.edu', 'Ada Okafor', 'submitted', 'APP-2030-00001', now(), true),
  ('11111111-1111-1111-1111-111111111111', tests.uid('bea@terpmail.umd.edu'), 'bea@terpmail.umd.edu', 'Bea Marie Lin', 'submitted', 'APP-2030-00002', now(), true),
  ('11111111-1111-1111-1111-111111111111', tests.uid('cy@terpmail.umd.edu'), 'cy@terpmail.umd.edu', 'Cy Doe', 'submitted', 'APP-2030-00003', now(), true);

-- ---- a. free time ranges -----------------------------------------------------
select tests.login('ana@t.test'); set local role authenticated;
select lives_ok($$ insert into public.board_free_ranges (cycle_id, user_id, day, start_min, end_min) values
  ('11111111-1111-1111-1111-111111111111', tests.uid('ana@t.test'), '2030-10-15', 540, 720),
  ('11111111-1111-1111-1111-111111111111', tests.uid('ana@t.test'), '2030-10-16', 600, 660),
  ('11111111-1111-1111-1111-111111111111', tests.uid('ana@t.test'), '2030-10-17', 600, 660) $$,
  'a board member adds her own free ranges');
select throws_ok($$ insert into public.board_free_ranges (cycle_id, user_id, day, start_min, end_min) values
  ('11111111-1111-1111-1111-111111111111', tests.uid('ben@t.test'), '2030-10-15', 600, 660) $$,
  '42501', null, 'a board member cannot add someone else''s ranges');
select throws_ok($$ insert into public.board_free_ranges (cycle_id, user_id, day, start_min, end_min) values
  ('11111111-1111-1111-1111-111111111111', tests.uid('ana@t.test'), '2030-10-15', 1410, 1470) $$,
  '23514', null, 'a range stays inside the day');

reset role; select tests.login('admin@t.test'); set local role authenticated;
select lives_ok($$ insert into public.board_free_ranges (cycle_id, user_id, day, start_min, end_min) values
  ('11111111-1111-1111-1111-111111111111', tests.uid('ben@t.test'), '2030-10-15', 600, 660),
  ('11111111-1111-1111-1111-111111111111', tests.uid('ben@t.test'), '2030-10-16', 600, 660),
  ('11111111-1111-1111-1111-111111111111', tests.uid('cal@t.test'), '2030-10-15', 540, 630),
  ('11111111-1111-1111-1111-111111111111', tests.uid('cal@t.test'), '2030-10-16', 600, 660),
  ('11111111-1111-1111-1111-111111111111', tests.uid('dee@t.test'), '2030-10-15', 660, 780),
  ('11111111-1111-1111-1111-111111111111', tests.uid('dee@t.test'), '2030-10-17', 600, 660) $$,
  'an admin adds ranges for board members');

reset role; select tests.login('ana@t.test'); set local role authenticated;
select is((select count(*) from public.board_free_ranges), 9::bigint, 'board members read everyone''s ranges');
update public.board_free_ranges set end_min = 690 where user_id = tests.uid('ben@t.test');
delete from public.board_free_ranges where user_id = tests.uid('ben@t.test');
reset role;
select is((select count(*) from public.board_free_ranges where user_id = tests.uid('ben@t.test') and end_min = 660), 2::bigint,
  'a board member cannot change or remove someone else''s ranges');

select tests.login('ada@terpmail.umd.edu'); set local role authenticated;
select is((select count(*) from public.board_free_ranges), 0::bigint, 'an applicant reads no ranges');
reset role; select tests.login('stale@t.test'); set local role authenticated;
select is((select count(*) from public.board_free_ranges), 0::bigint, 'role reviewer reads no ranges (D6)');

-- ---- b. preferences ----------------------------------------------------------
reset role; select tests.login('ana@t.test'); set local role authenticated;
select lives_ok($$ insert into public.board_interview_prefs (cycle_id, user_id, max_interviews, availability_text, availability_sent_at)
  values ('11111111-1111-1111-1111-111111111111', tests.uid('ana@t.test'), 4, 'Tue 9 to 12', now()) $$,
  'a board member saves her limit and sends');
select throws_ok($$ insert into public.board_interview_prefs (cycle_id, user_id, max_interviews)
  values ('11111111-1111-1111-1111-111111111111', tests.uid('ben@t.test'), 2) $$,
  '42501', null, 'a board member cannot set someone else''s limit');
select throws_ok($$ update public.board_interview_prefs set max_interviews = 0 where user_id = tests.uid('ana@t.test') $$,
  '23514', null, 'a limit is 1 to 50');
reset role; select tests.login('admin@t.test'); set local role authenticated;
select lives_ok($$ insert into public.board_interview_prefs (cycle_id, user_id) values
  ('11111111-1111-1111-1111-111111111111', tests.uid('ben@t.test')) $$, 'an admin saves prefs for someone');
reset role; select tests.login('cal@t.test'); set local role authenticated;
select is((select count(*) from public.board_interview_prefs), 2::bigint, 'staff read everyone''s prefs (who has sent, each limit)');
update public.board_interview_prefs set max_interviews = 1 where user_id = tests.uid('ana@t.test');
reset role;
select is((select max_interviews from public.board_interview_prefs where user_id = tests.uid('ana@t.test')), 4::smallint,
  'a board member cannot change someone else''s limit');
select tests.login('ada@terpmail.umd.edu'); set local role authenticated;
select is((select count(*) from public.board_interview_prefs), 0::bigint, 'an applicant reads no prefs');

-- ---- c. private "students I know" --------------------------------------------
reset role; select tests.login('ana@t.test'); set local role authenticated;
select lives_ok($$ insert into public.board_conflicts (cycle_id, name) values
  ('11111111-1111-1111-1111-111111111111', '  ada   OKAFOR ') $$, 'a board member lists a student she knows');
select throws_ok($$ insert into public.board_conflicts (cycle_id, user_id, name) values
  ('11111111-1111-1111-1111-111111111111', tests.uid('ben@t.test'), 'Someone') $$,
  '42501', null, 'nobody lists names for someone else');
select throws_ok($$ insert into public.board_conflicts (cycle_id, name) values
  ('11111111-1111-1111-1111-111111111111', '   ') $$, '23514', null, 'a name is not blank');
select is((select count(*) from public.board_conflicts), 1::bigint, 'she reads her own list');
reset role; select tests.login('ben@t.test'); set local role authenticated;
select lives_ok($$ insert into public.board_conflicts (cycle_id, name) values
  ('11111111-1111-1111-1111-111111111111', 'Bea Lin') $$, 'another board member lists a name');
select is((select count(*) from public.board_conflicts), 1::bigint, 'a board member reads only his own list');
delete from public.board_conflicts where name ilike '%okafor%';
reset role; select tests.login('cal@t.test'); set local role authenticated;
select lives_ok($$ insert into public.board_conflicts (cycle_id, name) values
  ('11111111-1111-1111-1111-111111111111', 'Cý Dóe') $$, 'names with accents are fine');
reset role; select tests.login('admin@t.test'); set local role authenticated;
select is((select count(*) from public.board_conflicts), 0::bigint, 'an admin cannot read anyone else''s list');
delete from public.board_conflicts;
select throws_ok($$ select public.conflicted_board_members(tests.app_id('ada@terpmail.umd.edu')) $$,
  '42501', null, 'signed-in users cannot run the conflict match');
reset role;
select is((select count(*) from public.board_conflicts), 3::bigint, 'nobody deletes someone else''s names');

select is(array(select public.conflicted_board_members(tests.app_id('ada@terpmail.umd.edu'))),
  array[tests.uid('ana@t.test')], 'conflict match: the same full name, any case and spacing');
select is(array(select public.conflicted_board_members(tests.app_id('bea@terpmail.umd.edu'))),
  array[tests.uid('ben@t.test')], 'conflict match: the same first and last name ("Bea Lin" = "Bea Marie Lin")');
select is(array(select public.conflicted_board_members(tests.app_id('cy@terpmail.umd.edu'))),
  case when to_regprocedure('extensions.unaccent(regdictionary, text)') is not null
       then array[tests.uid('cal@t.test')] else array[]::uuid[] end,
  'conflict match: accents do not matter (when unaccent is installed)');

-- ---- e. interview questions ----------------------------------------------------
insert into public.rubric_criteria (cycle_id, key, name, weight, position) values
  ('11111111-1111-1111-1111-111111111111', 'community',     'Community engagement and values', 20, 1),
  ('11111111-1111-1111-1111-111111111111', 'resilience',    'Resilience and problem-solving',  20, 2),
  ('11111111-1111-1111-1111-111111111111', 'leadership',    'Leadership and teamwork',         20, 3),
  ('11111111-1111-1111-1111-111111111111', 'financial',     'Financial need and impact',       20, 4),
  ('11111111-1111-1111-1111-111111111111', 'communication', 'Communication skills',            10, 5),
  ('11111111-1111-1111-1111-111111111111', 'passion',       'Passion and motivation',          10, 6);

select tests.login('ana@t.test'); set local role authenticated;
select throws_ok($$ select public.seed_starter_questions('11111111-1111-1111-1111-111111111111') $$,
  '42501', 'not_allowed', 'a board member without admin rights cannot add the starters');
reset role; select tests.login('admin@t.test'); set local role authenticated;
select is(public.seed_starter_questions('11111111-1111-1111-1111-111111111111'), 12, 'an admin adds the 12 starter questions');
select is(public.seed_starter_questions('11111111-1111-1111-1111-111111111111'), 0, 'only when the cycle has none');
select throws_ok($$ select public.seed_starter_questions('22222222-2222-2222-2222-222222222222') $$,
  'P0001', 'rubric_missing', 'a cycle without a rubric gets no starters');
select is((select count(*) from public.interview_questions where cycle_id = '11111111-1111-1111-1111-111111111111' and criterion_key is null), 2::bigint, 'two "To close" questions');
select is((select text from public.interview_questions where cycle_id = '11111111-1111-1111-1111-111111111111' and position = 1), 'Tell us about a community you’re part of and what you’ve given back to it.',
  'the first starter question');
reset role; select tests.login('ben@t.test'); set local role authenticated;
select is((select count(*) from public.interview_questions where cycle_id = '11111111-1111-1111-1111-111111111111'), 12::bigint, 'board members read the questions');
select throws_ok($$ insert into public.interview_questions (cycle_id, criterion_key, position, text)
  values ('11111111-1111-1111-1111-111111111111', 'community', 3, 'Mine') $$,
  '42501', null, 'a board member cannot add a question');
update public.interview_questions set text = 'Changed' where cycle_id = '11111111-1111-1111-1111-111111111111' and position = 1;
delete from public.interview_questions where cycle_id = '11111111-1111-1111-1111-111111111111';
reset role;
select is((select count(*) from public.interview_questions where text = 'Changed'), 0::bigint, 'a board member cannot edit a question');
select is((select count(*) from public.interview_questions where cycle_id = '11111111-1111-1111-1111-111111111111'), 12::bigint, 'a board member cannot remove a question');
select tests.login('ada@terpmail.umd.edu'); set local role authenticated;
select is((select count(*) from public.interview_questions), 0::bigint, 'an applicant reads no questions');
reset role; select tests.login('admin@t.test'); set local role authenticated;
select throws_ok($$ insert into public.interview_questions (cycle_id, criterion_key, position, text)
  values ('11111111-1111-1111-1111-111111111111', 'nope', 3, 'Mine') $$,
  '23503', null, 'a question''s criterion must be a rubric key');
select lives_ok($$ insert into public.interview_questions (cycle_id, criterion_key, position, text)
  values ('11111111-1111-1111-1111-111111111111', 'community', 13, 'What club would you start?') $$,
  'an admin adds a question');
select lives_ok($$ update public.interview_questions set position = 0 where text = 'What club would you start?' $$,
  'an admin reorders a question');
select lives_ok($$ delete from public.interview_questions where text = 'What club would you start?' $$,
  'an admin removes a question');

-- ---- d. proposed vs opened times ---------------------------------------------
-- S1 d1 10:00, S2 d1 10:15 (overlaps S1), S3 d2 10:00, S4 d3 10:00,
-- S7 d1 11:00, S8 d1 12:00, SP d1 13:00 (proposed, not opened).
reset role;
insert into public.interview_slots (id, cycle_id, starts_at, ends_at, opened_at) values
  ('51000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '2030-10-15 10:00 America/New_York', '2030-10-15 10:30 America/New_York', now()),
  ('51000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', '2030-10-15 10:15 America/New_York', '2030-10-15 10:45 America/New_York', now()),
  ('51000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', '2030-10-16 10:00 America/New_York', '2030-10-16 10:30 America/New_York', now()),
  ('51000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', '2030-10-17 10:00 America/New_York', '2030-10-17 10:30 America/New_York', now()),
  ('51000000-0000-0000-0000-000000000007', '11111111-1111-1111-1111-111111111111', '2030-10-15 11:00 America/New_York', '2030-10-15 11:30 America/New_York', now()),
  ('51000000-0000-0000-0000-000000000008', '11111111-1111-1111-1111-111111111111', '2030-10-15 12:00 America/New_York', '2030-10-15 12:30 America/New_York', now());
select tests.login('admin@t.test'); set local role authenticated;
select lives_ok($$ insert into public.interview_slots (id, cycle_id, starts_at, ends_at) values
  ('5100000a-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111', '2030-10-15 13:00 America/New_York', '2030-10-15 13:30 America/New_York') $$,
  'an admin adds a proposed time (not opened)');
select is((select opened_at from public.interview_slots where id = '5100000a-0000-0000-0000-00000000000a'), null::timestamptz,
  'a new time starts as proposed');

reset role; select tests.login('ada@terpmail.umd.edu'); set local role authenticated;
select is((select count(*) from public.open_interview_slots('11111111-1111-1111-1111-111111111111')), 6::bigint,
  'students see only opened times');
select is((select count(*) from public.open_interview_slots('11111111-1111-1111-1111-111111111111')
           where id = '5100000a-0000-0000-0000-00000000000a'), 0::bigint, 'a proposed time is not listed');
select throws_ok($$ select public.switch_booking('5100000a-0000-0000-0000-00000000000a') $$,
  'P0002', 'slot_not_found', 'switch_booking refuses a proposed time');

-- ---- g. candidates -----------------------------------------------------------
reset role; select tests.login('ana@t.test'); set local role authenticated;
select throws_ok($$ select * from public.interview_candidates('51000000-0000-0000-0000-000000000001', null) $$,
  '42501', 'not_allowed', 'only admins read the candidates');
reset role; select tests.login('admin@t.test'); set local role authenticated;
-- Free minutes from d1 10:00: Ana 120 + 60 + 60 = 240, Ben 60 + 60 = 120, Cal 30 + 60 = 90. Dee is free from 11:00.
select is(tests.cands('51000000-0000-0000-0000-000000000001', null), array['Cal Board', 'Ben Board', 'Ana Board'],
  'with equal interviews, fewer free minutes left comes first');
select is((select array_agg(free_minutes_left order by free_minutes_left) from public.interview_candidates('51000000-0000-0000-0000-000000000001', null)),
  array[90, 120, 240], 'free minutes left count from the slot''s start on');
-- d1 10:15-10:45: Cal is free only until 10:30 (partial overlap is not enough).
select is(tests.cands('51000000-0000-0000-0000-000000000002', null), array['Ben Board', 'Ana Board'],
  'a range must cover the whole slot');
-- d2 10:00: Ana 60 + 60, Ben 60, Cal 60.
select is(tests.cands('51000000-0000-0000-0000-000000000003', null), array['Ben Board', 'Cal Board', 'Ana Board'],
  'equal free minutes go by name A to Z');
select is(tests.cands('51000000-0000-0000-0000-000000000003', tests.app_id('ada@terpmail.umd.edu')), array['Ben Board', 'Cal Board'],
  'someone who knows the student is left out (same name)');
select is(tests.cands('51000000-0000-0000-0000-000000000003', tests.app_id('bea@terpmail.umd.edu')), array['Cal Board', 'Ana Board'],
  'someone who knows the student is left out (first and last name)');
select is(public.pick_interviewers('51000000-0000-0000-0000-000000000001', null),
  array[tests.uid('cal@t.test'), tests.uid('ben@t.test')], 'pick_interviewers returns the first two');

-- ---- g. the bookings trigger ---------------------------------------------------
reset role; select tests.login('ada@terpmail.umd.edu'); set local role authenticated;
select is(public.switch_booking('51000000-0000-0000-0000-000000000001'), 'booked', 'Ada books d1 10:00');
reset role;
select is(tests.pair('51000000-0000-0000-0000-000000000001'), array['Cal Board', 'Ben Board'],
  'booking pairs the two people automatically (Ana knows Ada)');
select is((select paired_by from public.interview_pairings where slot_id = '51000000-0000-0000-0000-000000000001'), null::uuid,
  'an automatic pair has no paired_by');

select tests.login('admin@t.test'); set local role authenticated;
select is(tests.cands('51000000-0000-0000-0000-000000000002', null), array['Ana Board'],
  'nobody is put in two interviews at once');
-- d2 10:00 now: Ana 0 so far (120 free), Ben 1 (60), Cal 1 (60).
select is(tests.cands('51000000-0000-0000-0000-000000000003', null), array['Ana Board', 'Ben Board', 'Cal Board'],
  'the fewest interviews so far comes before fewer free minutes');
select is((select array_agg(interviews_so_far order by display_name) from public.interview_candidates('51000000-0000-0000-0000-000000000003', null)),
  array[0, 1, 1], 'interviews so far are counted per cycle');
reset role;
update public.board_interview_prefs set max_interviews = 1 where user_id = tests.uid('ben@t.test');
select tests.login('admin@t.test'); set local role authenticated;
select is(tests.cands('51000000-0000-0000-0000-000000000003', null), array['Ana Board', 'Cal Board'],
  'someone at their limit is left out');

-- Switching: Ada moves to d2 10:00. Her old pair goes; Ben is under his limit again.
reset role; select tests.login('ada@terpmail.umd.edu'); set local role authenticated;
select is(public.switch_booking('51000000-0000-0000-0000-000000000003'), 'switched', 'Ada switches to d2 10:00');
reset role;
select is((select count(*) from public.interview_pairings where slot_id = '51000000-0000-0000-0000-000000000001'), 0::bigint,
  'the released slot loses its pair');
select is(tests.pair('51000000-0000-0000-0000-000000000003'), array['Ben Board', 'Cal Board'],
  'the new slot is paired (Ana knows Ada)');

-- Fewer than two: only Dee is free at d1 12:00.
select tests.login('bea@terpmail.umd.edu'); set local role authenticated;
select is(public.switch_booking('51000000-0000-0000-0000-000000000008'), 'booked', 'Bea books d1 12:00');
reset role;
select is((select count(*) from public.interview_pairings where slot_id = '51000000-0000-0000-0000-000000000008'), 0::bigint,
  'with fewer than two free people, no pair is written');

-- A booking written by the service role is paired too.
insert into public.bookings (application_id, slot_id) values (tests.app_id('cy@terpmail.umd.edu'), '51000000-0000-0000-0000-000000000004');
select is(tests.pair('51000000-0000-0000-0000-000000000004'), array['Ana Board', 'Dee Board'],
  'a booking written server side is paired the same way');

-- ---- f. "None of these times work" as ranges ---------------------------------
update public.bookings set status = 'released', released_at = now() where slot_id = '51000000-0000-0000-0000-000000000004';
select is((select count(*) from public.interview_pairings where slot_id = '51000000-0000-0000-0000-000000000004'), 0::bigint,
  'releasing a booking directly also removes the pair');
select tests.login('cy@terpmail.umd.edu'); set local role authenticated;
select lives_ok($$ insert into public.interview_free_times (application_id, ranges, said)
  values (tests.app_id('cy@terpmail.umd.edu'),
          '[{"day":"2030-10-16","start":"18:00","end":"20:00"}]', 'Wednesday after 6') $$,
  'a student sends free time ranges only');
select lives_ok($$ update public.interview_free_times set ranges = '[{"day":"2030-10-17","start":"09:00","end":"10:00"}]', said = 'Thursday morning'
  where application_id = tests.app_id('cy@terpmail.umd.edu') $$, 'and changes them');
select throws_ok($$ update public.interview_free_times set ranges = '[]' where application_id = tests.app_id('cy@terpmail.umd.edu') $$,
  '23514', null, 'an answer needs at least one range (or the old days and windows)');
select throws_ok($$ update public.interview_free_times set ranges = '{"day":"x"}' where application_id = tests.app_id('cy@terpmail.umd.edu') $$,
  '23514', null, 'ranges is a list');
reset role;
select is((select days from public.interview_free_times where application_id = tests.app_id('cy@terpmail.umd.edu')), null::text[],
  'days and windows are optional now');

-- ---- h. AI usage -------------------------------------------------------------
select tests.login('ana@t.test'); set local role authenticated;
select is(public.ai_take('reader', 2), true, 'first use today');
select is(public.ai_take('reader', 2), true, 'second use today');
select is(public.ai_take('reader', 2), false, 'over the daily limit');
select is(public.ai_take('summary', 2), true, 'each kind has its own count');
select throws_ok($$ select count(*) from public.ai_usage $$, '42501', null, 'signed-in users cannot read the counter');
select throws_ok($$ select public.ai_take('Bad Kind!', 2) $$, '22023', 'invalid_kind', 'the kind is a short code');
reset role;
select is((select count from public.ai_usage where user_id = tests.uid('ana@t.test') and kind = 'reader'), 2,
  'a refused use is not counted');
select set_config('request.jwt.claims', '', true);
set local role anon;
select throws_ok($$ select public.ai_take('reader', 2) $$, '42501', null, 'signed out: no AI');
reset role;

-- ---- i. the migration's own rules ----------------------------------------------
select is(to_regclass('public.board_availability'), null::regclass, 'board_availability is gone');
select is((select count(*) from pg_policies where schemaname = 'public'
           and (coalesce(qual, '') || coalesce(with_check, '')) ilike '%reviewer%'), 0::bigint, 'no policy mentions a reviewer');

select * from finish();
rollback;
