-- =============================================================================
-- Portal fresh start (2026-10-09)
--
-- DRAFT. NOT APPLIED. Apply only after Dominick approves it by naming the
-- production project (awiaebtqalcmfafvktwh, "BTX Student/Operations Hub").
-- Plain-English guide: supabase/migrations/README-portal-fresh-start.md
--
-- What this does, in one transaction:
--   a. Copies BTX's real program plan (milestones + tasks, 2021 and 2026) into
--      a new read-only `legacy` schema.
--   b. Removes everything the retired Vue apps used: 3 views, 21 tables,
--      4 functions, 1 sequence, the auth.users trigger, 2 old storage policies.
--   c. Deletes the 9 test sign-in accounts (exact email list, nothing else).
--   d. Moves roles to app_metadata (users cannot edit it) and reads them with
--      public.app_role(). No rule anywhere reads user_metadata.
--   e. Creates the Portal's tables: cycles, applications, application_files,
--      notify_signups, interview_slots, bookings (+ a private code counter).
--   f. submit_application(): the only way an application becomes submitted.
--   g. Storage rules for the private `applicant-documents` bucket.
--   h. Every function: set search_path = '', fully-qualified names.
--   i. A final check that raises (and rolls everything back) if any policy or
--      view still mentions user_metadata, or a rule below is broken.
--
-- Kept on purpose: public.rls_auto_enable(). It is NOT an old-app function; it
-- powers Supabase's `ensure_rls` event trigger, which turns RLS on for every
-- new table in public. Dropping it would also need dropping that event
-- trigger and would remove a safety net.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- a. Keep the real program plan in a read-only `legacy` schema
-- -----------------------------------------------------------------------------

create schema legacy;

-- Nobody but the service role (and the database owner) can even see the schema.
revoke all on schema legacy from public, anon, authenticated;
grant usage on schema legacy to service_role;

-- Straight copies, every column, every row (both plan years).
create table legacy.program_plan_milestones as
  select * from public.program_plan_milestones;
create table legacy.program_plan_tasks as
  select * from public.program_plan_tasks;

alter table legacy.program_plan_milestones add primary key (id);
alter table legacy.program_plan_tasks add primary key (id);

-- RLS on with no policies: only the service role (which bypasses RLS) reads it.
alter table legacy.program_plan_milestones enable row level security;
alter table legacy.program_plan_tasks enable row level security;

revoke all on legacy.program_plan_milestones, legacy.program_plan_tasks
  from public, anon, authenticated, service_role;
grant select on legacy.program_plan_milestones, legacy.program_plan_tasks
  to service_role;

comment on schema legacy is
  'Read-only copies of data from the retired Vue apps (2026-10-09). Program plan only; for the future Ops Hub to import.';

-- Stop here if the copy is not complete (live counts on 2026-10-09: 24 and 81).
do $$
declare
  v_ms_src  bigint;
  v_ms_copy bigint;
  v_tk_src  bigint;
  v_tk_copy bigint;
begin
  select count(*) into v_ms_src  from public.program_plan_milestones;
  select count(*) into v_ms_copy from legacy.program_plan_milestones;
  select count(*) into v_tk_src  from public.program_plan_tasks;
  select count(*) into v_tk_copy from legacy.program_plan_tasks;
  if v_ms_src <> v_ms_copy or v_tk_src <> v_tk_copy or v_ms_copy = 0 or v_tk_copy = 0 then
    raise exception 'legacy copy incomplete: milestones %/%, tasks %/%',
      v_ms_copy, v_ms_src, v_tk_copy, v_tk_src;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- b. Remove what the retired Vue apps used
-- -----------------------------------------------------------------------------

drop view if exists public.scholarship_staff_decisions;
drop view if exists public.my_application_status;
drop view if exists public.scholarship_applicant_directory;

-- The old trigger put the role in user_metadata. Replaced in step d.
drop trigger if exists set_new_user_role_to_applicant_trigger on auth.users;

drop table if exists
  public.tasks_alerts,
  public.profiles,
  public.donor_impact,
  public.marketing_tasks,
  public.budgeting_tasks,
  public.fundraising_tasks,
  public.fundraising_health,
  public.program_plan_progress,
  public.event_tracker_events,
  public.budget_tracking,
  public.grant_pipeline,
  public.program_plan_milestones,
  public.program_plan_tasks,
  public.scholarship_cycles,
  public.scholarship_applicants,
  public.scholarship_interviews,
  public.scholarship_scores,
  public.scholarship_board_votes,
  public.scholarship_decisions,
  public.scholarship_board_availability,
  public.scholarship_submit_attempts
  cascade;

drop function if exists public.replace_board_availability(text, integer, jsonb);
drop function if exists public.replace_program_plan_tasks(integer, jsonb);
drop function if exists public.set_new_user_role_to_applicant();
drop function if exists public.set_scholarship_applicant_code();

-- Not owned by any table, so the cascade above leaves it behind.
drop sequence if exists public.scholarship_applicant_code_seq;

-- The old storage rules let ANY signed-in account read/upload under private/.
drop policy if exists "Give users authenticated access to folder 1r70ast_0" on storage.objects;
drop policy if exists "Give users authenticated access to folder 1r70ast_1" on storage.objects;

-- -----------------------------------------------------------------------------
-- c. Delete the 9 test accounts (and only them)
-- -----------------------------------------------------------------------------

-- Deletes exactly the listed emails; auth's own tables (identities, sessions,
-- one-time tokens, ...) cascade. Raises if the count is not 9, so a surprise
-- (an account already gone, or a duplicate) stops the whole migration.
do $$
declare
  v_deleted integer;
begin
  delete from auth.users
  where email in (
    'admin@test.btx',
    'board@test.btx',
    'board2@test.btx',
    'reviewer@test.btx',
    'applicant@test.btx',
    'dania@test.btx',
    'claude-sign-in-test@terpmail.umd.edu',
    'claude-width-test@terpmail.umd.edu',
    'dlittleton@bookyachtsy.com'
  );
  get diagnostics v_deleted = row_count;
  if v_deleted <> 9 then
    raise exception 'expected to delete 9 test accounts, deleted %', v_deleted;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- d. Roles live in app_metadata (only the service role can write it)
-- -----------------------------------------------------------------------------

-- Returns the caller's role from the signed token's app_metadata:
-- 'applicant', 'admin', 'board', 'reviewer', or null when signed out.
-- Users can edit their own user_metadata, never app_metadata, so this is safe.
-- Note: a role change shows up after the user's token refreshes (up to 1 hour).
create function public.app_role()
returns text
language sql
stable
set search_path = ''
as $$
  select auth.jwt() -> 'app_metadata' ->> 'role';
$$;

-- True when the caller is BTX staff (admin, board member or reviewer).
create function public.is_staff()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(public.app_role() in ('admin', 'board', 'reviewer'), false);
$$;

revoke all on function public.app_role(), public.is_staff() from public;
grant execute on function public.app_role(), public.is_staff()
  to anon, authenticated, service_role;

-- Runs before every new sign-in account is written: every account starts as an
-- applicant (in app_metadata), and any 'role' a sign-up tried to put in
-- user_metadata is removed. Staff roles are set later, only by the service
-- role (Admin API updateUserById with app_metadata), never at sign-up.
create function public.set_new_user_app_role()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.raw_app_meta_data :=
    coalesce(new.raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'applicant');
  new.raw_user_meta_data := coalesce(new.raw_user_meta_data, '{}'::jsonb) - 'role';
  return new;
end;
$$;

revoke all on function public.set_new_user_app_role() from public, anon, authenticated;
grant execute on function public.set_new_user_app_role() to supabase_auth_admin;

create trigger set_new_user_app_role
  before insert on auth.users
  for each row execute function public.set_new_user_app_role();

-- Keeps updated_at current on any row update.
create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.touch_updated_at() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- e. Portal tables
-- -----------------------------------------------------------------------------

-- ---- cycles: one row per semester's application cycle ------------------------
-- Every setting in BUILD-PLAN.md "Facts that are cycle settings". Empty settings
-- show as [placeholders] in the Portal. Open/closed is worked out from
-- opens_at/closes_at; `status` only says whether the cycle is visible.
create table public.cycles (
  id                    uuid primary key default gen_random_uuid(),
  term                  text not null unique check (char_length(term) between 3 and 40),     -- 'Fall 2026'
  year                  smallint not null check (year between 2024 and 2100),                -- year in the application number
  status                text not null default 'draft'
                          check (status in ('draft', 'published', 'archived')),
  award_name            text check (char_length(award_name) <= 120),                         -- 'Legacy Scholarship'
  award_amount_cents    integer check (award_amount_cents > 0),
  opens_at              timestamptz,
  closes_at             timestamptz,                                                         -- deadline date AND hour
  interview_start       date,
  interview_end         date,
  decision_date         date,
  next_cycle_month      text check (next_cycle_month in (
                          'January', 'February', 'March', 'April', 'May', 'June', 'July',
                          'August', 'September', 'October', 'November', 'December')),
  essay_prompt          text check (char_length(essay_prompt) <= 2000),
  essay_use             text check (char_length(essay_use) <= 2000),
  requirements          jsonb not null default '[]'::jsonb
                          check (jsonb_typeof(requirements) = 'array'),                      -- list of strings
  photo_due             date,
  payment_note          text check (char_length(payment_note) <= 2000),
  event_enabled         boolean not null default false,
  event_at              timestamptz,
  code_lifetime_minutes integer check (code_lifetime_minutes between 1 and 1440),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint cycles_dates_in_order check (closes_at is null or opens_at is null or closes_at > opens_at),
  constraint cycles_interviews_in_order check (
    interview_end is null or interview_start is null or interview_end >= interview_start),
  -- The Ops Hub guard, enforced here too: a cycle can't be published while a
  -- required setting is empty (name, amount, open date, deadline, essay prompt).
  constraint cycles_published_needs_settings check (
    status <> 'published' or (
      award_name is not null and award_amount_cents is not null
      and opens_at is not null and closes_at is not null and essay_prompt is not null))
);

-- Only one cycle is shown to applicants at a time.
create unique index cycles_one_published on public.cycles (status) where status = 'published';

create trigger cycles_touch before update on public.cycles
  for each row execute function public.touch_updated_at();

alter table public.cycles enable row level security;

revoke all on public.cycles from public, anon, authenticated;
grant select on public.cycles to anon, authenticated;
grant insert, update, delete on public.cycles to authenticated;   -- RLS limits writes to admins
grant all on public.cycles to service_role;

-- Anyone (signed out too) sees published and archived cycles; the landing needs them.
create policy cycles_select_public on public.cycles
  for select to anon, authenticated
  using (status <> 'draft');

-- Staff also see drafts (being set up in the Ops Hub).
create policy cycles_select_staff on public.cycles
  for select to authenticated
  using ((select public.is_staff()));

-- Only admins create, edit or delete cycles.
create policy cycles_insert_admin on public.cycles
  for insert to authenticated
  with check ((select public.app_role()) = 'admin');

create policy cycles_update_admin on public.cycles
  for update to authenticated
  using ((select public.app_role()) = 'admin')
  with check ((select public.app_role()) = 'admin');

create policy cycles_delete_admin on public.cycles
  for delete to authenticated
  using ((select public.app_role()) = 'admin');

-- ---- applications: one per applicant per cycle --------------------------------
-- Holds every answer from the 5 steps. Applicants never write status,
-- submitted_at or applicant_code (no column privilege); submit_application()
-- sets them.
create table public.applications (
  id                     uuid primary key default gen_random_uuid(),
  cycle_id               uuid not null references public.cycles (id) on delete restrict,
  -- Filled from the caller's token on insert; applicants can't choose them.
  user_id                uuid not null default auth.uid() references auth.users (id) on delete cascade,
  terpmail               text not null default (auth.jwt() ->> 'email') check (char_length(terpmail) <= 254),
  -- Step 1: Basic info
  full_name              text check (char_length(full_name) <= 200),
  secondary_email        text check (char_length(secondary_email) <= 254),
  phone                  text check (char_length(phone) <= 40),
  gender                 text check (char_length(gender) <= 60),
  race                   text check (char_length(race) <= 120),
  heard_from             text check (char_length(heard_from) <= 200),               -- "How did you hear about this scholarship?"
  year_in_school         text check (year_in_school in ('Freshman', 'Sophomore', 'Junior', 'Senior')),
  credits_left           smallint check (credits_left between 0 and 300),
  major                  text check (char_length(major) <= 120),
  -- Step 2: This fall's scholarship + other BTX programs (optional)
  interest_certification boolean not null default false,
  interest_mentoring     boolean not null default false,
  -- Step 3: Essay (optional; the 500-word limit is checked in the app)
  essay                  text check (char_length(essay) <= 6000),
  -- Step 5: Review and submit
  stay_in_touch          boolean not null default false,                             -- newsletter consent
  agreed_true            boolean not null default false,                             -- "My answers are true" (required)
  -- Progress and status
  current_step           smallint not null default 1 check (current_step between 1 and 5),
  status                 text not null default 'draft' check (status in ('draft', 'submitted')),
  applicant_code         text unique,                                                -- APP-2026-00016
  submitted_at           timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint applications_one_per_cycle unique (user_id, cycle_id),
  constraint applications_status_fields check (
    (status = 'draft' and applicant_code is null and submitted_at is null)
    or (status = 'submitted' and applicant_code is not null and submitted_at is not null and agreed_true))
);

create index applications_cycle_status on public.applications (cycle_id, status);

create trigger applications_touch before update on public.applications
  for each row execute function public.touch_updated_at();

alter table public.applications enable row level security;

revoke all on public.applications from public, anon, authenticated;
grant select on public.applications to authenticated;
-- Applicants may write only the answer columns (plus which cycle, on insert).
grant insert (
  cycle_id, full_name, secondary_email, phone, gender, race, heard_from, year_in_school,
  credits_left, major, interest_certification, interest_mentoring, essay, stay_in_touch,
  agreed_true, current_step
) on public.applications to authenticated;
grant update (
  full_name, secondary_email, phone, gender, race, heard_from, year_in_school,
  credits_left, major, interest_certification, interest_mentoring, essay, stay_in_touch,
  agreed_true, current_step
) on public.applications to authenticated;
grant all on public.applications to service_role;

-- An applicant reads her own application, draft or submitted (the status page
-- shows the application number after submitting).
create policy applications_select_own on public.applications
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Staff read submitted applications only, never drafts.
create policy applications_select_staff on public.applications
  for select to authenticated
  using ((select public.is_staff()) and status = 'submitted');

-- An applicant starts her own draft, only while the cycle is published and open.
create policy applications_insert_own on public.applications
  for insert to authenticated
  with check (
    (select public.app_role()) = 'applicant'
    and user_id = (select auth.uid())
    and terpmail = (select auth.jwt() ->> 'email')
    and status = 'draft'
    and exists (
      select 1 from public.cycles c
      where c.id = cycle_id
        and c.status = 'published'
        and now() >= c.opens_at
        and now() < c.closes_at));

-- An applicant edits her own application only while it is a draft.
create policy applications_update_own_draft on public.applications
  for update to authenticated
  using (user_id = (select auth.uid()) and status = 'draft')
  with check (user_id = (select auth.uid()) and status = 'draft');

-- No delete policy: applicants can't delete applications (service role can).

-- ---- application_files: the resume and transcript PDFs ------------------------
-- One current file per kind; "Replace" updates the row (or deletes and re-adds).
-- storage_path is `{user id}/{application id}/{file name}` in applicant-documents.
create table public.application_files (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  kind           text not null check (kind in ('resume', 'transcript')),
  storage_path   text not null unique check (char_length(storage_path) <= 512),
  filename       text not null check (char_length(filename) between 1 and 255),
  size_bytes     integer not null check (size_bytes > 0 and size_bytes <= 10485760),   -- 10 MB
  uploaded_at    timestamptz not null default now(),
  constraint application_files_one_per_kind unique (application_id, kind),
  -- The file must sit in the applicant's own folder, under this application.
  constraint application_files_path_matches check (
    split_part(storage_path, '/', 2) = application_id::text)
);

alter table public.application_files enable row level security;

revoke all on public.application_files from public, anon, authenticated;
grant select, delete on public.application_files to authenticated;
grant insert (application_id, kind, storage_path, filename, size_bytes)
  on public.application_files to authenticated;
grant update (storage_path, filename, size_bytes, uploaded_at)
  on public.application_files to authenticated;
grant all on public.application_files to service_role;

-- An applicant sees the files of her own application (any status).
create policy application_files_select_own on public.application_files
  for select to authenticated
  using (exists (
    select 1 from public.applications a
    where a.id = application_id and a.user_id = (select auth.uid())));

-- Staff see the files of submitted applications.
create policy application_files_select_staff on public.application_files
  for select to authenticated
  using ((select public.is_staff()) and exists (
    select 1 from public.applications a
    where a.id = application_id and a.status = 'submitted'));

-- An applicant adds a file to her own draft, in her own storage folder.
create policy application_files_insert_own_draft on public.application_files
  for insert to authenticated
  with check (
    split_part(storage_path, '/', 1) = (select auth.uid())::text
    and exists (
      select 1 from public.applications a
      where a.id = application_id and a.user_id = (select auth.uid()) and a.status = 'draft'));

-- An applicant replaces a file on her own draft (path stays in her folder).
create policy application_files_update_own_draft on public.application_files
  for update to authenticated
  using (exists (
    select 1 from public.applications a
    where a.id = application_id and a.user_id = (select auth.uid()) and a.status = 'draft'))
  with check (
    split_part(storage_path, '/', 1) = (select auth.uid())::text
    and exists (
      select 1 from public.applications a
      where a.id = application_id and a.user_id = (select auth.uid()) and a.status = 'draft'));

-- An applicant removes a file from her own draft.
create policy application_files_delete_own_draft on public.application_files
  for delete to authenticated
  using (exists (
    select 1 from public.applications a
    where a.id = application_id and a.user_id = (select auth.uid()) and a.status = 'draft'));

-- ---- notify_signups: "Email me when applications open / the next cycle opens" --
-- Written only by request_cycle_email(); nobody inserts directly.
create table public.notify_signups (
  id           bigint generated always as identity primary key,
  email        text not null unique
                 check (char_length(email) <= 254
                        and email = lower(email)
                        and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  cycle_id     uuid references public.cycles (id) on delete set null,
  kind         text not null check (kind in ('applications_open', 'next_cycle')),
  created_at   timestamptz not null default now(),
  requested_at timestamptz not null default now()          -- last time they asked
);

alter table public.notify_signups enable row level security;

revoke all on public.notify_signups from public, anon, authenticated;
grant select on public.notify_signups to authenticated;   -- RLS: admins only
grant all on public.notify_signups to service_role;

-- Only admins read the list (to send the emails).
create policy notify_signups_select_admin on public.notify_signups
  for select to authenticated
  using ((select public.app_role()) = 'admin');

-- Saves a signed-out visitor's address for "Email me when ...".
-- kind: 'applications_open' (before-open landing) or 'next_cycle' (closed landing).
-- Ties it to the current published cycle. Asking again only refreshes the row.
-- Returns nothing either way, so it can't be used to check who signed up.
create function public.request_cycle_email(p_email text, p_kind text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_cycle uuid;
begin
  if char_length(v_email) > 254
     or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'invalid_email' using errcode = '22023';
  end if;
  if p_kind is null or p_kind not in ('applications_open', 'next_cycle') then
    raise exception 'invalid_kind' using errcode = '22023';
  end if;

  select c.id into v_cycle
  from public.cycles c
  where c.status = 'published'
  limit 1;

  insert into public.notify_signups (email, cycle_id, kind)
  values (v_email, v_cycle, p_kind)
  on conflict (email) do update
    set kind = excluded.kind,
        cycle_id = excluded.cycle_id,
        requested_at = now();
end;
$$;

revoke all on function public.request_cycle_email(text, text) from public;
grant execute on function public.request_cycle_email(text, text) to anon, authenticated, service_role;

-- ---- interview_slots + bookings (week 2; included because they are cheap) -----
-- Each slot holds one interview. Admins create slots.
create table public.interview_slots (
  id         uuid primary key default gen_random_uuid(),
  cycle_id   uuid not null references public.cycles (id) on delete cascade,
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  capacity   smallint not null default 1 check (capacity = 1),
  created_at timestamptz not null default now(),
  constraint interview_slots_in_order check (ends_at > starts_at),
  constraint interview_slots_unique_time unique (cycle_id, starts_at)
);

alter table public.interview_slots enable row level security;

revoke all on public.interview_slots from public, anon, authenticated;
grant select, insert, update, delete on public.interview_slots to authenticated;  -- RLS: writes admin only
grant all on public.interview_slots to service_role;

-- Signed-in users see the slot list (which ones are free comes in week 2).
create policy interview_slots_select_signed_in on public.interview_slots
  for select to authenticated
  using (true);

create policy interview_slots_insert_admin on public.interview_slots
  for insert to authenticated
  with check ((select public.app_role()) = 'admin');

create policy interview_slots_update_admin on public.interview_slots
  for update to authenticated
  using ((select public.app_role()) = 'admin')
  with check ((select public.app_role()) = 'admin');

create policy interview_slots_delete_admin on public.interview_slots
  for delete to authenticated
  using ((select public.app_role()) = 'admin');

-- A booking ties a submitted application to a slot. Released bookings stay as
-- history. Written only by switch_booking().
create table public.bookings (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  slot_id        uuid not null references public.interview_slots (id) on delete restrict,
  status         text not null default 'active' check (status in ('active', 'released')),
  created_at     timestamptz not null default now(),
  released_at    timestamptz,
  constraint bookings_released_at check ((status = 'released') = (released_at is not null))
);

-- Two students can never hold the same slot; a student holds at most one slot.
create unique index bookings_one_active_per_slot
  on public.bookings (slot_id) where status = 'active';
create unique index bookings_one_active_per_application
  on public.bookings (application_id) where status = 'active';

alter table public.bookings enable row level security;

revoke all on public.bookings from public, anon, authenticated;
grant select on public.bookings to authenticated;
grant all on public.bookings to service_role;

-- An applicant sees her own bookings.
create policy bookings_select_own on public.bookings
  for select to authenticated
  using (exists (
    select 1 from public.applications a
    where a.id = application_id and a.user_id = (select auth.uid())));

-- Staff see all bookings.
create policy bookings_select_staff on public.bookings
  for select to authenticated
  using ((select public.is_staff()));

-- Books p_new_slot for the caller's submitted application in that slot's cycle.
-- If she already holds a slot, the new one is booked and the old one released
-- in the same step (a switch). Returns:
--   'booked'    first booking made
--   'switched'  moved to the new slot, old slot released
--   'unchanged' she already holds this slot
--   'taken'     someone else holds it; nothing changed, she keeps her old time
create function public.switch_booking(p_new_slot uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slot public.interview_slots%rowtype;
  v_app  uuid;
  v_old  uuid;
begin
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

  -- Already holding it, or someone else is.
  if exists (select 1 from public.bookings b
             where b.slot_id = p_new_slot and b.status = 'active' and b.application_id = v_app) then
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

    insert into public.bookings (application_id, slot_id) values (v_app, p_new_slot);
  exception when unique_violation then
    return 'taken';
  end;

  return case when v_old is null then 'booked' else 'switched' end;
end;
$$;

revoke all on function public.switch_booking(uuid) from public, anon;
grant execute on function public.switch_booking(uuid) to authenticated, service_role;

-- ---- application number counter (private) ----------------------------------
-- One counter per cycle year: APP-2026-00001, APP-2026-00002, ... Works like a
-- per-year sequence but is created on demand and never skips numbers.
create table public.application_code_counters (
  year        smallint primary key,
  last_number integer not null default 0 check (last_number >= 0)
);

alter table public.application_code_counters enable row level security;
revoke all on public.application_code_counters from public, anon, authenticated;
grant all on public.application_code_counters to service_role;
-- No policies: only submit_application() (security definer) touches it.

-- -----------------------------------------------------------------------------
-- f. submit_application
-- -----------------------------------------------------------------------------

-- Submits the caller's own draft and returns its application number.
-- Checks: she owns it; the cycle is published and before its deadline; every
-- required answer is filled; both PDFs are uploaded; "My answers are true" is
-- ticked. Submitting twice returns the same number.
-- Errors (message text, for the app to map to screen copy):
--   not_found, cycle_closed, missing_answers:<columns>, missing_files, not_agreed
create function public.submit_application(p_application_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_app     public.applications%rowtype;
  v_cycle   public.cycles%rowtype;
  v_missing text[] := '{}';
  v_files   integer;
  v_number  integer;
  v_code    text;
begin
  -- Lock the row so a double click can't submit twice.
  select * into v_app from public.applications where id = p_application_id for update;
  if not found or v_app.user_id is distinct from auth.uid() then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if v_app.status = 'submitted' then
    return v_app.applicant_code;
  end if;

  select * into v_cycle from public.cycles where id = v_app.cycle_id;
  if v_cycle.status <> 'published' or now() < v_cycle.opens_at or now() >= v_cycle.closes_at then
    raise exception 'cycle_closed' using errcode = 'P0001';
  end if;

  -- Required answers (secondary email and essay are optional).
  if coalesce(btrim(v_app.full_name), '') = ''      then v_missing := v_missing || 'full_name'::text; end if;
  if coalesce(btrim(v_app.phone), '') = ''          then v_missing := v_missing || 'phone'::text; end if;
  if coalesce(btrim(v_app.gender), '') = ''         then v_missing := v_missing || 'gender'::text; end if;
  if coalesce(btrim(v_app.race), '') = ''           then v_missing := v_missing || 'race'::text; end if;
  if coalesce(btrim(v_app.heard_from), '') = ''     then v_missing := v_missing || 'heard_from'::text; end if;
  if v_app.year_in_school is null                   then v_missing := v_missing || 'year_in_school'::text; end if;
  if v_app.credits_left is null                     then v_missing := v_missing || 'credits_left'::text; end if;
  if coalesce(btrim(v_app.major), '') = ''          then v_missing := v_missing || 'major'::text; end if;
  if cardinality(v_missing) > 0 then
    raise exception 'missing_answers:%', array_to_string(v_missing, ',') using errcode = 'P0001';
  end if;

  select count(distinct f.kind) into v_files
  from public.application_files f
  where f.application_id = v_app.id and f.kind in ('resume', 'transcript');
  if v_files < 2 then
    raise exception 'missing_files' using errcode = 'P0001';
  end if;

  if not v_app.agreed_true then
    raise exception 'not_agreed' using errcode = 'P0001';
  end if;

  -- Next number for the cycle's year (row lock makes this safe under load).
  insert into public.application_code_counters as c (year, last_number)
  values (v_cycle.year, 1)
  on conflict (year) do update set last_number = c.last_number + 1
  returning c.last_number into v_number;

  v_code := format('APP-%s-%s', v_cycle.year, lpad(v_number::text, 5, '0'));

  update public.applications
     set status = 'submitted',
         submitted_at = now(),
         applicant_code = v_code,
         current_step = 5
   where id = v_app.id;

  return v_code;
end;
$$;

revoke all on function public.submit_application(uuid) from public, anon;
grant execute on function public.submit_application(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- g. Storage: private bucket `applicant-documents`
-- -----------------------------------------------------------------------------
-- Path layout: {user id}/{application id}/{file name}.pdf
-- The bucket itself also caps files at 10 MB and PDF only (as it does today);
-- the app checks size and type first so the applicant gets a clear message.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('applicant-documents', 'applicant-documents', false, 10485760, array['application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = 10485760,
      allowed_mime_types = array['application/pdf'];

-- An applicant reads files in her own folder, for an application that is still a draft.
create policy applicant_documents_select_own_draft on storage.objects
  for select to authenticated
  using (
    bucket_id = 'applicant-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.applications a
      where a.id::text = (storage.foldername(name))[2]
        and a.user_id = (select auth.uid())
        and a.status = 'draft'));

-- An applicant uploads into her own folder, under her own draft.
create policy applicant_documents_insert_own_draft on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'applicant-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.applications a
      where a.id::text = (storage.foldername(name))[2]
        and a.user_id = (select auth.uid())
        and a.status = 'draft'));

-- An applicant overwrites (upsert) a file in her own folder, under her own draft.
create policy applicant_documents_update_own_draft on storage.objects
  for update to authenticated
  using (
    bucket_id = 'applicant-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.applications a
      where a.id::text = (storage.foldername(name))[2]
        and a.user_id = (select auth.uid())
        and a.status = 'draft'))
  with check (
    bucket_id = 'applicant-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.applications a
      where a.id::text = (storage.foldername(name))[2]
        and a.user_id = (select auth.uid())
        and a.status = 'draft'));

-- An applicant deletes a file in her own folder, under her own draft.
create policy applicant_documents_delete_own_draft on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'applicant-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.applications a
      where a.id::text = (storage.foldername(name))[2]
        and a.user_id = (select auth.uid())
        and a.status = 'draft'));

-- Staff read the files of submitted applications.
create policy applicant_documents_select_staff on storage.objects
  for select to authenticated
  using (
    bucket_id = 'applicant-documents'
    and (select public.is_staff())
    and exists (
      select 1 from public.applications a
      where a.id::text = (storage.foldername(name))[2]
        and a.status = 'submitted'));

-- -----------------------------------------------------------------------------
-- i. Final checks: any failure raises and rolls back the whole migration
-- -----------------------------------------------------------------------------
do $$
declare
  v_bad text;
begin
  -- No policy (public or storage) may read user_metadata.
  select string_agg(schemaname || '.' || tablename || ':' || policyname, ', ') into v_bad
  from pg_policies
  where schemaname in ('public', 'storage')
    and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ilike '%user_meta%';
  if v_bad is not null then
    raise exception 'policies still read user_metadata: %', v_bad;
  end if;

  -- No view in public may read user_metadata.
  select string_agg(viewname, ', ') into v_bad
  from pg_views
  where schemaname = 'public' and definition ilike '%user_meta%';
  if v_bad is not null then
    raise exception 'views still read user_metadata: %', v_bad;
  end if;

  -- No security definer views in public (every view must be security_invoker).
  select string_agg(c.relname, ', ') into v_bad
  from pg_class c
  where c.relnamespace = 'public'::regnamespace
    and c.relkind in ('v', 'm')
    and not coalesce(c.reloptions @> array['security_invoker=true'], false);
  if v_bad is not null then
    raise exception 'views without security_invoker: %', v_bad;
  end if;

  -- Every table in public has RLS on.
  select string_agg(c.relname, ', ') into v_bad
  from pg_class c
  where c.relnamespace = 'public'::regnamespace
    and c.relkind in ('r', 'p')
    and not c.relrowsecurity;
  if v_bad is not null then
    raise exception 'tables without RLS: %', v_bad;
  end if;

  -- Every function in public pins search_path to '' (rls_auto_enable is
  -- Supabase's own and pins it to pg_catalog).
  select string_agg(p.proname, ', ') into v_bad
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and p.proname <> 'rls_auto_enable'
    and not coalesce(p.proconfig @> array['search_path=""'], false);
  if v_bad is not null then
    raise exception 'functions without search_path = '''': %', v_bad;
  end if;

  -- The only things left in public are the Portal's.
  select string_agg(c.relname, ', ') into v_bad
  from pg_class c
  where c.relnamespace = 'public'::regnamespace
    and c.relkind in ('r', 'p', 'v', 'm')
    and c.relname not in ('cycles', 'applications', 'application_files', 'notify_signups',
                          'interview_slots', 'bookings', 'application_code_counters');
  if v_bad is not null then
    raise exception 'unexpected objects left in public: %', v_bad;
  end if;
end;
$$;

commit;
