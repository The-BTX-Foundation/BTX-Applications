-- Applications: own-only, open published cycle only, staff can't apply, staff
-- (admin and board) read submitted applications in full (D2: no blind review),
-- and there is no reviewer role (D6). Run with: npx supabase test db
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

-- ---- setup -------------------------------------------------------------------
select tests.new_user('admin@t.test', 'admin');
select tests.new_user('board@t.test', 'board');
-- There is no reviewer role (D6): an account with role 'reviewer' is not staff.
select tests.new_user('stale@t.test', 'reviewer');
select tests.new_user('ada@terpmail.umd.edu', 'applicant');
select tests.new_user('bea@terpmail.umd.edu', 'applicant');

select is((select raw_app_meta_data ->> 'role' from auth.users where email = 'ada@terpmail.umd.edu'),
          'applicant', 'auth trigger: a new account gets app_metadata.role = applicant');

insert into public.cycles (id, term, year, status, award_name, award_amount_cents, opens_at, closes_at)
values ('11111111-1111-1111-1111-111111111111', 'Test Open', 2026, 'published', 'Legacy', 200000,
        now() - interval '1 day', now() + interval '2 days'),
       ('22222222-2222-2222-2222-222222222222', 'Test Draft', 2026, 'draft', 'Legacy', 200000,
        now() - interval '1 day', now() + interval '2 days'),
       ('33333333-3333-3333-3333-333333333333', 'Test Closed', 2025, 'archived', 'Legacy', 200000,
        now() - interval '30 days', now() - interval '1 day');

-- ---- applicant: own application, open published cycle only -------------------
select tests.login('ada@terpmail.umd.edu');
set local role authenticated;

select lives_ok($$
  insert into public.applications (cycle_id, full_name, phone, gender, race, heard_from, year_in_school,
    credits_left, major, answer_1, answer_2, answer_3, agreed_true)
  values ('11111111-1111-1111-1111-111111111111', 'Ada Okafor',
    '301-555-0101', 'Woman', 'Black', 'Instagram', 'Junior', 40, 'Mechanical Engineering',
    'One.', 'Two.', 'Three.', true) $$,
  'applicant starts her own draft in the open published cycle');

select throws_ok($$
  insert into public.applications (cycle_id, full_name) values ('22222222-2222-2222-2222-222222222222', 'Ada') $$,
  '42501', null, 'applicant cannot apply to a draft (unpublished) cycle');

select throws_ok($$
  insert into public.applications (cycle_id, full_name) values ('33333333-3333-3333-3333-333333333333', 'Ada') $$,
  '42501', null, 'applicant cannot apply to a closed cycle');

select throws_ok($$
  insert into public.applications (cycle_id, user_id, full_name)
  values ('11111111-1111-1111-1111-111111111111', tests.uid('bea@terpmail.umd.edu'), 'Not Bea') $$,
  '42501', null, 'applicant cannot create an application for someone else');

select throws_ok($$ select public.submit_application(tests.app_id('ada@terpmail.umd.edu')) $$,
  'P0001', 'missing_files', 'submit needs both PDFs');

insert into public.application_files (application_id, kind, storage_path, filename, size_bytes)
values (tests.app_id('ada@terpmail.umd.edu'), 'resume',
        tests.uid('ada@terpmail.umd.edu') || '/' || tests.app_id('ada@terpmail.umd.edu') || '/resume.pdf', 'Ada_Okafor_resume.pdf', 1000),
       (tests.app_id('ada@terpmail.umd.edu'), 'transcript',
        tests.uid('ada@terpmail.umd.edu') || '/' || tests.app_id('ada@terpmail.umd.edu') || '/transcript.pdf', 'transcript.pdf', 1000);

update public.applications set answer_2 = '  ' where id = tests.app_id('ada@terpmail.umd.edu');
select throws_ok($$ select public.submit_application(tests.app_id('ada@terpmail.umd.edu')) $$,
  'P0001', 'missing_answers:answer_2', 'submit needs all three short answers');
update public.applications set answer_2 = 'Two.' where id = tests.app_id('ada@terpmail.umd.edu');

select is(public.submit_application(tests.app_id('ada@terpmail.umd.edu')), 'APP-2026-00001',
  'applicant submits her own application and gets a number');

update public.applications set major = 'Changed' where id = tests.app_id('ada@terpmail.umd.edu');
select is((select major from public.applications where id = tests.app_id('ada@terpmail.umd.edu')),
  'Mechanical Engineering', 'a submitted application can no longer be edited');

-- Bea can't see or submit Ada's.
select tests.login('bea@terpmail.umd.edu');
select is((select count(*) from public.applications), 0::bigint, 'another applicant sees no one else''s application');
select throws_ok($$ select public.submit_application(tests.app_id('ada@terpmail.umd.edu')) $$,
  'P0002', 'not_found', 'another applicant cannot submit someone else''s application');

-- Bea starts a draft of her own (never submitted).
select lives_ok($$
  insert into public.applications (cycle_id, full_name, major)
  values ('11111111-1111-1111-1111-111111111111', 'Bea Draft', 'Physics') $$,
  'a second applicant starts her own draft');
select is((select count(*) from public.applications), 1::bigint, 'an applicant reads only her own application');
select is((select full_name from public.applications), 'Bea Draft', 'that one row is her own');

select tests.login('ada@terpmail.umd.edu');
select is((select count(*) from public.applications), 1::bigint, 'Ada reads only her own application, not Bea''s draft');

-- The PDFs in storage (written as the database owner, the way the upload lands).
reset role;
insert into storage.objects (bucket_id, name, owner)
values ('applicant-documents',
        tests.uid('ada@terpmail.umd.edu') || '/' || tests.app_id('ada@terpmail.umd.edu') || '/resume.pdf',
        tests.uid('ada@terpmail.umd.edu')),
       ('applicant-documents',
        tests.uid('bea@terpmail.umd.edu') || '/' || tests.app_id('bea@terpmail.umd.edu') || '/resume.pdf',
        tests.uid('bea@terpmail.umd.edu'));

-- ---- staff cannot start an application ---------------------------------------
reset role;
select tests.login('board@t.test');
set local role authenticated;
select throws_ok($$
  insert into public.applications (cycle_id, full_name) values ('11111111-1111-1111-1111-111111111111', 'Board Person') $$,
  '42501', null, 'a board account cannot start an application');

-- ---- D2: no blind review. Board reads submitted applications in full -------
select is((select count(*) from public.applications), 1::bigint,
  'board reads the one submitted application, not the draft');
select is((select full_name from public.applications where id = tests.app_id('ada@terpmail.umd.edu')),
  'Ada Okafor', 'board reads the applicant''s full name');
select is((select terpmail || ' ' || phone || ' ' || answer_3 from public.applications
           where id = tests.app_id('ada@terpmail.umd.edu')),
  'ada@terpmail.umd.edu 301-555-0101 Three.', 'board reads the full application');
select is((select count(*) from public.applications where full_name = 'Bea Draft'), 0::bigint,
  'board cannot read someone''s draft');
select is((select count(*) from public.application_files), 2::bigint, 'board sees the resume and transcript rows');
select is((select count(*) from storage.objects where bucket_id = 'applicant-documents'), 1::bigint,
  'board reads the submitted application''s PDF in storage, not the draft''s');
select hasnt_view('public', 'application_reviews', 'the blind-review view is gone');
select hasnt_function('public', 'blind_applications', array['uuid'], 'the blind-review function is gone');
select policies_are('public', 'applications',
  array['applications_select_own', 'applications_select_staff', 'applications_insert_own',
        'applications_update_own_draft'],
  'applications has the own and staff read rules only (no admin-only split)');

reset role;
select tests.login('admin@t.test');
set local role authenticated;
select is((select full_name || ' ' || terpmail || ' ' || phone || ' ' || gender || ' ' || race
           from public.applications where id = tests.app_id('ada@terpmail.umd.edu')),
          'Ada Okafor ada@terpmail.umd.edu 301-555-0101 Woman Black', 'admin reads name, email, phone, gender and race');
select is((select count(*) from public.applications where full_name = 'Bea Draft'), 0::bigint,
  'admin cannot read someone''s draft');
select is((select count(*) from public.application_files), 2::bigint, 'admin sees the submitted files');
select is((select count(*) from storage.objects where bucket_id = 'applicant-documents'), 1::bigint,
  'admin reads the submitted PDF in storage, not the draft''s');

-- ---- D6: there is no reviewer role ---------------------------------------------
reset role;
select tests.login('stale@t.test');
set local role authenticated;
select is(public.is_staff(), false, 'role reviewer is not staff (admin and board only)');
select is((select count(*) from public.applications), 0::bigint, 'role reviewer reads no applications');
select is((select count(*) from public.application_files), 0::bigint, 'role reviewer sees no application files');
select is((select count(*) from storage.objects where bucket_id = 'applicant-documents'), 0::bigint,
  'role reviewer reads no PDFs');

reset role;
select is((select count(*) from pg_policies where schemaname in ('public', 'storage')
           and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ilike '%reviewer%'), 0::bigint,
  'no policy in public or storage mentions reviewer');
select is((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname in ('public', 'storage') and p.prosrc ilike '%reviewer%'), 0::bigint,
  'no function in public or storage mentions reviewer');

-- ---- signed out --------------------------------------------------------------
set local role anon;
select throws_ok($$ select count(*) from public.applications where full_name is not null $$, '42501', null,
  'signed-out users cannot read applications');

reset role;
select * from finish();
rollback;
