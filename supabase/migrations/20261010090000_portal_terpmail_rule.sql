-- =============================================================================
-- Portal: Terpmail-only rule on the server (2026-10-10)
--
-- DRAFT. NOT APPLIED. Apply only after Dominick approves it by naming the
-- production project (awiaebtqalcmfafvktwh). Guide: README-portal-terpmail-rule.md
--
-- Today only the browser checks for @terpmail.umd.edu. Anyone with the public
-- key can sign in with any address through Supabase Auth and then start and
-- submit an application. This adds the same rule in the database:
--   a. public.portal_test_emails: hand-filled allow-list for preview testers
--      (no addresses seeded here; the repo is public).
--   b. public.portal_email_allowed(): true when the caller's signed-in email
--      ends with @terpmail.umd.edu or is on that list.
--   c. The applications insert rule also requires it.
--   d. submit_application() also requires it (error 'terpmail_required').
-- Storage uploads need no change: every applicant-documents upload rule
-- already requires the caller to own a draft application, and drafts can now
-- only be started by an allowed address.
-- Re-running it is safe (if not exists / or replace / drop policy if exists).
-- =============================================================================

begin;

-- a. Allow-list for non-Terpmail test addresses (previews). Filled by hand:
--    insert into public.portal_test_emails (email, note) values ('x@gmail.com', 'preview tester');
create table if not exists public.portal_test_emails (
  email      text primary key check (email = lower(btrim(email)) and char_length(email) between 3 and 254),
  note       text check (char_length(note) <= 200),
  created_at timestamptz not null default now()
);

-- RLS on with no policies, and no privileges: only the service role, the
-- database owner and the function below can read it.
alter table public.portal_test_emails enable row level security;
revoke all on public.portal_test_emails from public, anon, authenticated;
grant all on public.portal_test_emails to service_role;

-- b. True when the caller's signed-in email (from the signed token, lower-cased)
-- is a Terpmail address or on the test allow-list. Security definer so it can
-- read the allow-list, which callers cannot. Signed out (no email) = false.
create or replace function public.portal_email_allowed()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    lower(btrim(auth.jwt() ->> 'email')) like '%@terpmail.umd.edu'
    or exists (select 1 from public.portal_test_emails t
               where t.email = lower(btrim(auth.jwt() ->> 'email'))),
    false);
$$;

revoke all on function public.portal_email_allowed() from public, anon;
grant execute on function public.portal_email_allowed() to authenticated, service_role;

-- c. An applicant starts her own draft, only while the cycle is published and
-- open, and only from an allowed address. Same rule as before plus the last line.
drop policy if exists applications_insert_own on public.applications;
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
        and now() < c.closes_at)
    and (select public.portal_email_allowed()));

-- d. submit_application, unchanged except for the address check right after
-- the ownership check. Errors (message text, for the app to map to screen copy):
--   not_found, terpmail_required, cycle_closed, missing_answers:<columns>,
--   missing_files, not_agreed
create or replace function public.submit_application(p_application_id uuid)
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

  -- Only a Terpmail (or allow-listed test) address may submit.
  if not public.portal_email_allowed() then
    raise exception 'terpmail_required' using errcode = '42501';
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

-- Final check: the new pieces are locked down; rolls everything back if not.
do $$
begin
  if not (select relrowsecurity from pg_class where oid = 'public.portal_test_emails'::regclass) then
    raise exception 'portal_test_emails has no RLS';
  end if;
  if exists (select 1 from information_schema.role_table_grants
             where table_schema = 'public' and table_name = 'portal_test_emails'
               and grantee in ('anon', 'authenticated', 'PUBLIC')) then
    raise exception 'portal_test_emails is granted to anon/authenticated';
  end if;
  if has_function_privilege('anon', 'public.portal_email_allowed()', 'execute') then
    raise exception 'anon can execute portal_email_allowed';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'applications'
                 and policyname = 'applications_insert_own'
                 and with_check ilike '%portal_email_allowed%') then
    raise exception 'applications insert rule is missing the address check';
  end if;
end;
$$;

commit;
