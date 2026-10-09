-- =============================================================================
-- Portal journey: the database pieces the after-submit screens need (2026-10-10)
--
-- DRAFT. NOT APPLIED. Applied right after 20261010120000_ops_hub.sql, in the
-- same approval (it reads the Ops Hub tables scholarship_awards,
-- interview_pairings and staff_profiles). Production project:
-- awiaebtqalcmfafvktwh. Guide: README-portal-journey.md
--
--   1. Free slots only: open_interview_slots(cycle). Applicants no longer read
--      every interview_slots row, only slots they hold or held.
--   2. "None of these times work": table interview_free_times.
--   3. "Anything we should know?": bookings.note, saved through
--      switch_booking(p_new_slot, p_note default null). Calls without p_note
--      behave exactly as before.
--   4. Her decision: cycles.decisions_released_at + my_decision(cycle).
--   5. Her interview: my_interview(cycle) (time, interviewer names, video link).
--   6. Photo and story: table award_stories + private bucket award-photos.
--   7. "Pick a time by": nothing new (the Portal uses cycles.interview_end).
-- Every function: set search_path = ''. Roles only through app_role()/is_staff().
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Free slots only
-- -----------------------------------------------------------------------------

-- The future slots of a cycle that nobody holds, for the booking pages. Only an
-- applicant with a submitted application in that cycle may call it; it returns
-- only the times, never who holds what. Security definer because applicants
-- cannot read other people's bookings.
-- Error: no_submitted_application (same word switch_booking uses).
create or replace function public.open_interview_slots(p_cycle_id uuid)
returns table (id uuid, starts_at timestamptz, ends_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- Role and eligibility check: a signed-in applicant with a submitted application here.
  if coalesce(public.app_role() = 'applicant', false) is not true
     or not exists (select 1 from public.applications a
                    where a.user_id = auth.uid() and a.cycle_id = p_cycle_id and a.status = 'submitted') then
    raise exception 'no_submitted_application' using errcode = '42501';
  end if;
  return query
    select s.id, s.starts_at, s.ends_at
    from public.interview_slots s
    where s.cycle_id = p_cycle_id
      and s.starts_at > now()
      and not exists (select 1 from public.bookings b where b.slot_id = s.id and b.status = 'active')
    order by s.starts_at;
end;
$$;

revoke all on function public.open_interview_slots(uuid) from public, anon;
grant execute on function public.open_interview_slots(uuid) to authenticated, service_role;

-- Applicants used to read every slot (and so every taken time). Now staff read
-- all slots, and an applicant reads only slots she holds or held (the Portal
-- needs her own slot's time). The free list comes from open_interview_slots().
drop policy if exists interview_slots_select_signed_in on public.interview_slots;
drop policy if exists interview_slots_select_staff on public.interview_slots;
drop policy if exists interview_slots_select_own_booking on public.interview_slots;

create policy interview_slots_select_staff on public.interview_slots
  for select to authenticated
  using ((select public.is_staff()));

-- The bookings subquery runs under the caller's bookings rules (her own only).
create policy interview_slots_select_own_booking on public.interview_slots
  for select to authenticated
  using (exists (select 1 from public.bookings b where b.slot_id = interview_slots.id));

-- -----------------------------------------------------------------------------
-- 2. "None of these times work"
-- -----------------------------------------------------------------------------

-- Her free days and times when no slot fits. One row per application.
-- days: 'Mon'..'Sun'; windows: 'morning' | 'afternoon' | 'evening' (the
-- Portal's WEEKDAYS and WINDOWS ids).
create table if not exists public.interview_free_times (
  application_id uuid primary key references public.applications (id) on delete cascade,
  days           text[] not null
                   check (cardinality(days) between 1 and 7
                          and days <@ array['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']),
  windows        text[] not null
                   check (cardinality(windows) between 1 and 3
                          and windows <@ array['morning', 'afternoon', 'evening']),
  note           text check (char_length(note) <= 1000),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

drop trigger if exists interview_free_times_touch on public.interview_free_times;
create trigger interview_free_times_touch before update on public.interview_free_times
  for each row execute function public.touch_updated_at();

alter table public.interview_free_times enable row level security;
revoke all on public.interview_free_times from public, anon, authenticated;
grant select on public.interview_free_times to authenticated;
grant insert (application_id, days, windows, note) on public.interview_free_times to authenticated;
grant update (days, windows, note) on public.interview_free_times to authenticated;
grant all on public.interview_free_times to service_role;

drop policy if exists interview_free_times_select_own on public.interview_free_times;
drop policy if exists interview_free_times_select_staff on public.interview_free_times;
drop policy if exists interview_free_times_insert_own on public.interview_free_times;
drop policy if exists interview_free_times_update_own on public.interview_free_times;

-- She reads her own answer.
create policy interview_free_times_select_own on public.interview_free_times
  for select to authenticated
  using (exists (select 1 from public.applications a
                 where a.id = application_id and a.user_id = (select auth.uid())));

-- Staff read all answers.
create policy interview_free_times_select_staff on public.interview_free_times
  for select to authenticated
  using ((select public.is_staff()));

-- She sends or changes her answer while her application is submitted and she
-- holds no interview time.
create policy interview_free_times_insert_own on public.interview_free_times
  for insert to authenticated
  with check (
    (select public.app_role()) = 'applicant'
    and exists (select 1 from public.applications a
                where a.id = application_id and a.user_id = (select auth.uid()) and a.status = 'submitted')
    and not exists (select 1 from public.bookings b
                    where b.application_id = interview_free_times.application_id and b.status = 'active'));

create policy interview_free_times_update_own on public.interview_free_times
  for update to authenticated
  using (
    (select public.app_role()) = 'applicant'
    and exists (select 1 from public.applications a
                where a.id = application_id and a.user_id = (select auth.uid()) and a.status = 'submitted')
    and not exists (select 1 from public.bookings b
                    where b.application_id = interview_free_times.application_id and b.status = 'active'))
  with check (
    (select public.app_role()) = 'applicant'
    and exists (select 1 from public.applications a
                where a.id = application_id and a.user_id = (select auth.uid()) and a.status = 'submitted')
    and not exists (select 1 from public.bookings b
                    where b.application_id = interview_free_times.application_id and b.status = 'active'));

-- -----------------------------------------------------------------------------
-- 3. "Anything we should know?" on change your time
-- -----------------------------------------------------------------------------

alter table public.bookings add column if not exists note text;
alter table public.bookings drop constraint if exists bookings_note_length;
alter table public.bookings add constraint bookings_note_length check (char_length(note) <= 1000);

-- The one-argument version is replaced by one with a defaulted note, so
-- existing calls (rpc('switch_booking', { p_new_slot })) resolve to it and
-- behave exactly as before. Two overloads would make such calls ambiguous.
drop function if exists public.switch_booking(uuid);

-- Books p_new_slot for the caller's submitted application in that slot's cycle.
-- If she already holds a slot, the new one is booked and the old one released
-- in the same step (a switch). p_note ("Anything we should know?") is saved on
-- the new booking; when she keeps the same slot, a non-empty note replaces the
-- old one. Returns:
--   'booked'    first booking made
--   'switched'  moved to the new slot, old slot released
--   'unchanged' she already holds this slot
--   'taken'     someone else holds it; nothing changed, she keeps her old time
create or replace function public.switch_booking(p_new_slot uuid, p_note text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slot public.interview_slots%rowtype;
  v_app  uuid;
  v_old  uuid;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if char_length(v_note) > 1000 then
    raise exception 'note_too_long' using errcode = '22023';
  end if;

  -- Lock the slot so two people switching onto it at once queue up.
  select * into v_slot from public.interview_slots where id = p_new_slot for update;
  if not found then
    raise exception 'slot_not_found' using errcode = 'P0002';
  end if;
  if v_slot.starts_at <= now() then
    raise exception 'slot_in_past' using errcode = '22023';
  end if;

  -- The caller's own submitted application in this cycle (locked, so her own
  -- two quick clicks also queue up).
  select a.id into v_app
  from public.applications a
  where a.user_id = auth.uid()
    and a.cycle_id = v_slot.cycle_id
    and a.status = 'submitted'
  for update;
  if v_app is null then
    raise exception 'no_submitted_application' using errcode = '42501';
  end if;

  -- Already holding it (a new note still gets saved), or someone else is.
  if exists (select 1 from public.bookings b
             where b.slot_id = p_new_slot and b.status = 'active' and b.application_id = v_app) then
    if v_note is not null then
      update public.bookings set note = v_note
       where slot_id = p_new_slot and status = 'active' and application_id = v_app;
    end if;
    return 'unchanged';
  end if;
  if exists (select 1 from public.bookings b
             where b.slot_id = p_new_slot and b.status = 'active') then
    return 'taken';
  end if;

  -- Release the old slot and book the new one together. If the insert still
  -- collides, this inner block undoes the release, so she keeps her old time.
  begin
    update public.bookings
       set status = 'released', released_at = now()
     where application_id = v_app and status = 'active'
     returning slot_id into v_old;

    insert into public.bookings (application_id, slot_id, note) values (v_app, p_new_slot, v_note);
  exception when unique_violation then
    return 'taken';
  end;

  return case when v_old is null then 'booked' else 'switched' end;
end;
$$;

revoke all on function public.switch_booking(uuid, text) from public, anon;
grant execute on function public.switch_booking(uuid, text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4. Her decision
-- -----------------------------------------------------------------------------

-- Set by an admin when the letters go out (the cycles rules already limit
-- edits to admins). Until it is set and in the past, no applicant sees a result.
alter table public.cycles add column if not exists decisions_released_at timestamptz;

-- The caller's own result for a cycle, as JSON, or null:
--   {"kind":"won","awardId":..,"awardName":"Legacy","amountCents":200000,"storySent":false}
--   {"kind":"not-picked"}
-- null when: the decisions are not released yet, or she has no submitted
-- application in the cycle. Security definer because applicants cannot read
-- scholarship_awards. Reads only her own application.
create or replace function public.my_decision(p_cycle_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_released timestamptz;
  v_app      uuid;
  v_award    public.scholarship_awards%rowtype;
begin
  select c.decisions_released_at into v_released from public.cycles c where c.id = p_cycle_id;
  if v_released is null or v_released > now() then
    return null;
  end if;

  select a.id into v_app from public.applications a
  where a.user_id = auth.uid() and a.cycle_id = p_cycle_id and a.status = 'submitted';
  if v_app is null then
    return null;
  end if;

  select * into v_award from public.scholarship_awards w
  where w.application_id = v_app and w.kind in ('main', 'extra');
  if not found then
    return jsonb_build_object('kind', 'not-picked');
  end if;

  return jsonb_build_object(
    'kind', 'won',
    'awardId', v_award.id,
    'awardName', v_award.award_name,
    'amountCents', v_award.amount_cents,
    'storySent', exists (select 1 from public.award_stories s
                         where s.award_id = v_award.id and s.sent_at is not null));
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. Her interview
-- -----------------------------------------------------------------------------

-- The caller's own interview in a cycle, as JSON, or null when she holds no time:
--   {"slotId":..,"startsAt":..,"endsAt":..,"interviewers":["Kelsey Davis","Tomi Falodun"],"videoUrl":"https://..."}
-- interviewers is [] and videoUrl null until an admin pairs the slot and adds
-- the link. Security definer because applicants cannot read pairings or staff
-- profiles. Reads only her own active booking.
create or replace function public.my_interview(p_cycle_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_slot public.interview_slots%rowtype;
  v_pair public.interview_pairings%rowtype;
begin
  select s.* into v_slot
  from public.bookings b
  join public.applications a on a.id = b.application_id
  join public.interview_slots s on s.id = b.slot_id
  where a.user_id = auth.uid()
    and a.cycle_id = p_cycle_id
    and a.status = 'submitted'
    and b.status = 'active';
  if not found then
    return null;
  end if;

  select * into v_pair from public.interview_pairings p where p.slot_id = v_slot.id;

  return jsonb_build_object(
    'slotId', v_slot.id,
    'startsAt', v_slot.starts_at,
    'endsAt', v_slot.ends_at,
    'interviewers', coalesce((
      select jsonb_agg(sp.display_name order by sp.display_name)
      from public.staff_profiles sp
      where sp.user_id in (v_pair.interviewer_a, v_pair.interviewer_b)), '[]'::jsonb),
    'videoUrl', v_pair.video_url);
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. Photo and story
-- -----------------------------------------------------------------------------

-- True when the award (given as text, so storage paths can be passed straight
-- in) is a current award on the caller's own application and the cycle's
-- decisions are released. Security definer: applicants cannot read
-- scholarship_awards. Returns only true/false.
create or replace function public.holds_award(p_award_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.scholarship_awards w
    join public.applications a on a.id = w.application_id
    join public.cycles c on c.id = w.cycle_id
    where w.id::text = p_award_id
      and w.kind in ('main', 'extra')
      and a.user_id = auth.uid()
      and c.decisions_released_at is not null
      and c.decisions_released_at <= now());
$$;

-- The winner's photo and story, one row per award. sent_at is set when she
-- presses "Send to BTX" (that is the Portal's storySent). photo_path is
-- `{user id}/{award id}/{file name}` in the award-photos bucket.
create table if not exists public.award_stories (
  award_id   uuid primary key references public.scholarship_awards (id) on delete cascade,
  story      text check (char_length(story) <= 1500
                         and cardinality(regexp_split_to_array(btrim(story), '\s+')) <= 100),
  photo_path text check (char_length(photo_path) <= 512 and split_part(photo_path, '/', 2) = award_id::text),
  consent    boolean not null default false,   -- "BTX can show my photo and story on its website."
  sent_at    timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Sending needs a photo, a story and her consent (the screen's own checks).
  constraint award_stories_sent_complete check (
    sent_at is null or (photo_path is not null and coalesce(btrim(story), '') <> '' and consent))
);

drop trigger if exists award_stories_touch on public.award_stories;
create trigger award_stories_touch before update on public.award_stories
  for each row execute function public.touch_updated_at();

alter table public.award_stories enable row level security;
revoke all on public.award_stories from public, anon, authenticated;
grant select on public.award_stories to authenticated;
grant insert (award_id, story, photo_path, consent, sent_at) on public.award_stories to authenticated;
grant update (story, photo_path, consent, sent_at) on public.award_stories to authenticated;
grant all on public.award_stories to service_role;

drop policy if exists award_stories_select_own on public.award_stories;
drop policy if exists award_stories_select_staff on public.award_stories;
drop policy if exists award_stories_insert_own on public.award_stories;
drop policy if exists award_stories_update_own on public.award_stories;

-- She reads her own.
create policy award_stories_select_own on public.award_stories
  for select to authenticated
  using ((select public.app_role()) = 'applicant' and public.holds_award(award_id::text));

-- Staff read all.
create policy award_stories_select_staff on public.award_stories
  for select to authenticated
  using ((select public.is_staff()));

-- She writes her own while she holds the award; the photo must sit in her own folder.
create policy award_stories_insert_own on public.award_stories
  for insert to authenticated
  with check (
    (select public.app_role()) = 'applicant'
    and public.holds_award(award_id::text)
    and (photo_path is null or split_part(photo_path, '/', 1) = (select auth.uid())::text));

create policy award_stories_update_own on public.award_stories
  for update to authenticated
  using ((select public.app_role()) = 'applicant' and public.holds_award(award_id::text))
  with check (
    (select public.app_role()) = 'applicant'
    and public.holds_award(award_id::text)
    and (photo_path is null or split_part(photo_path, '/', 1) = (select auth.uid())::text));

-- Private bucket for the photo: JPG or PNG, 10 MB (the screen's own limits).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('award-photos', 'award-photos', false, 10485760, array['image/jpeg', 'image/png'])
on conflict (id) do update
  set public = false,
      file_size_limit = 10485760,
      allowed_mime_types = array['image/jpeg', 'image/png'];

drop policy if exists award_photos_select_own on storage.objects;
drop policy if exists award_photos_insert_own on storage.objects;
drop policy if exists award_photos_update_own on storage.objects;
drop policy if exists award_photos_delete_own on storage.objects;
drop policy if exists award_photos_select_staff on storage.objects;

-- The winner reads, uploads, replaces and deletes photos only in
-- {her user id}/{her award id}/, and only while she holds that award.
-- Same shape as the applicant-documents rules.
create policy award_photos_select_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'award-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.holds_award((storage.foldername(name))[2]));

create policy award_photos_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'award-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.holds_award((storage.foldername(name))[2]));

create policy award_photos_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'award-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.holds_award((storage.foldername(name))[2]))
  with check (
    bucket_id = 'award-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.holds_award((storage.foldername(name))[2]));

create policy award_photos_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'award-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.holds_award((storage.foldername(name))[2]));

-- Staff read every award photo.
create policy award_photos_select_staff on storage.objects
  for select to authenticated
  using (bucket_id = 'award-photos' and (select public.is_staff()));

-- Function grants (functions above): signed-in callers only.
revoke all on function public.my_decision(uuid), public.my_interview(uuid), public.holds_award(text)
  from public, anon;
grant execute on function public.my_decision(uuid), public.my_interview(uuid), public.holds_award(text)
  to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Final checks: any failure raises and rolls back this file
-- -----------------------------------------------------------------------------
do $$
declare
  v_bad text;
begin
  -- Exactly one switch_booking, the two-argument one.
  if (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'switch_booking') <> 1
     or to_regprocedure('public.switch_booking(uuid, text)') is null then
    raise exception 'switch_booking must exist once, as (uuid, text)';
  end if;

  -- Applicants no longer read every slot.
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'interview_slots'
             and policyname = 'interview_slots_select_signed_in') then
    raise exception 'old open slot rule still present';
  end if;

  -- New tables: RLS on, nothing for anon.
  select string_agg(c.relname, ', ') into v_bad
  from pg_class c
  where c.oid in ('public.interview_free_times'::regclass, 'public.award_stories'::regclass)
    and not c.relrowsecurity;
  if v_bad is not null then
    raise exception 'tables without RLS: %', v_bad;
  end if;
  if exists (select 1 from information_schema.role_table_grants
             where table_schema = 'public' and table_name in ('interview_free_times', 'award_stories')
               and grantee in ('anon', 'PUBLIC')) then
    raise exception 'anon has privileges on a journey table';
  end if;

  -- anon can run none of the new functions.
  select string_agg(f, ', ') into v_bad
  from unnest(array['public.open_interview_slots(uuid)', 'public.switch_booking(uuid, text)',
                    'public.my_decision(uuid)', 'public.my_interview(uuid)', 'public.holds_award(text)']) f
  where has_function_privilege('anon', f, 'execute');
  if v_bad is not null then
    raise exception 'anon can execute: %', v_bad;
  end if;

  -- The photo bucket is private.
  if not exists (select 1 from storage.buckets where id = 'award-photos' and public = false) then
    raise exception 'award-photos bucket missing or public';
  end if;

  -- No policy reads user_metadata.
  select string_agg(schemaname || '.' || tablename || ':' || policyname, ', ') into v_bad
  from pg_policies
  where schemaname in ('public', 'storage')
    and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ilike '%user_meta%';
  if v_bad is not null then
    raise exception 'policies read user_metadata: %', v_bad;
  end if;

  -- Every function in public pins search_path to ''.
  select string_agg(p.proname, ', ') into v_bad
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and p.proname <> 'rls_auto_enable'
    and not coalesce(p.proconfig @> array['search_path=""'], false);
  if v_bad is not null then
    raise exception 'functions without search_path = '''': %', v_bad;
  end if;
end;
$$;

commit;
