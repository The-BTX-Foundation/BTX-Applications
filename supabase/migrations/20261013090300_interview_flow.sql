-- =============================================================================
-- Interview flow: free time ranges, proposed times, fair pairing at booking,
-- interview questions, the Portal's "None of these times work" ranges, and a
-- daily AI usage counter (drafted 2026-10-13)
--
-- DRAFT. NOT APPLIED. Applied right after 20261013090000_ops_hub.sql,
-- 20261013090100_portal_journey.sql and 20261013090200_email_log.sql, in the
-- same approval (none of the four is in production yet). Production project:
-- awiaebtqalcmfafvktwh. Guide: README-ops-hub.md, section "Interview flow".
--
-- Owner's decisions (2026-10-12/13): one staff role, board member ('admin' =
-- board member with admin rights, 'board' = without). The new interview flow
-- replaces the Morning / Afternoon / Evening blocks (D4) with free time ranges.
--
-- What this does, in one transaction (safe to run twice):
--   a. board_free_ranges: each board member's free time ranges per day of the
--      interview window, in Eastern wall-clock minutes (multiples of 30).
--      Replaces board_availability (the blocks), which is dropped. It was only
--      ever created by the unapplied ops_hub file, so no data is lost.
--   b. board_interview_prefs: per person and cycle, an optional "Most N
--      interviews" limit, what they typed, and when they pressed Send.
--   c. board_conflicts: "students I know". PRIVATE: only the person who wrote
--      a name can read it, admins included. conflicted_board_members() (server
--      only) says which board members know an applicant, never the names.
--   d. interview_slots.opened_at: null = a proposed time the Ops Hub made, not
--      offered to students yet. Existing slots are opened (opened_at =
--      created_at). open_interview_slots() lists only opened slots, and
--      switch_booking() refuses an un-opened one as if it did not exist.
--   e. interview_questions per cycle, grouped by rubric criterion (null = "To
--      close", not scored). Staff read; admins write. The 12 starter questions
--      are added to every cycle that has a rubric and no questions;
--      seed_starter_questions() adds them for new cycles.
--   f. interview_free_times.ranges and .said: the student's free time ranges
--      per day and what she typed. days and windows become optional.
--   g. Fair pairing when a student books: interview_candidates(),
--      pick_interviewers() and a trigger on bookings. Order: fewest interviews
--      so far, then fewer free minutes left, then name A to Z. It respects each
--      person's limit, never double-books anyone, and never assigns someone to
--      a student they know. Releasing a booking removes that slot's pairing.
--   h. ai_usage + ai_take(): a per-user, per-day counter for the AI reader.
--   i. A final check that raises (and rolls everything back) if a rule below
--      is broken.
-- Every function: set search_path = ''. Roles only through app_role()/is_staff().
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- a. Free time ranges (replace the Morning / Afternoon / Evening blocks)
-- -----------------------------------------------------------------------------

-- The blocks table goes, with its policies and index. Nothing else in the
-- database reads it (the ops_hub final check that names it ran in that file).
drop table if exists public.board_availability cascade;

-- One row = "I'm free on this day from start to end" (Eastern time). Minutes
-- from midnight, multiples of 30: 9:00 AM = 540, 12:30 PM = 750, midnight
-- at the end of the day = 1440. Given before the interview times exist.
create table if not exists public.board_free_ranges (
  cycle_id   uuid not null references public.cycles (id) on delete cascade,
  user_id    uuid not null references public.staff_profiles (user_id) on delete cascade,
  day        date not null,
  start_min  smallint not null,
  end_min    smallint not null,
  created_at timestamptz not null default now(),
  primary key (cycle_id, user_id, day, start_min),
  constraint board_free_ranges_in_day check (0 <= start_min and start_min < end_min and end_min <= 1440),
  constraint board_free_ranges_half_hours check (start_min % 30 = 0 and end_min % 30 = 0)
);

create index if not exists board_free_ranges_user on public.board_free_ranges (user_id);
create index if not exists board_free_ranges_cycle_day on public.board_free_ranges (cycle_id, day);

-- -----------------------------------------------------------------------------
-- b. Interview preferences per person and cycle
-- -----------------------------------------------------------------------------

-- "Most N interviews" (null = no limit), what they typed in the availability
-- box, and when they pressed Send (admins see who has sent).
create table if not exists public.board_interview_prefs (
  cycle_id             uuid not null references public.cycles (id) on delete cascade,
  user_id              uuid not null references public.staff_profiles (user_id) on delete cascade,
  max_interviews       smallint check (max_interviews between 1 and 50),
  availability_text    text check (char_length(availability_text) <= 2000),
  availability_sent_at timestamptz,
  updated_at           timestamptz not null default now(),
  primary key (cycle_id, user_id)
);

drop trigger if exists board_interview_prefs_touch on public.board_interview_prefs;
create trigger board_interview_prefs_touch before update on public.board_interview_prefs
  for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- c. "Students I know" (private)
-- -----------------------------------------------------------------------------

-- A name a board member typed so they are kept off that student's interview.
-- Only the writer reads it. Pairing reads it through conflicted_board_members().
create table if not exists public.board_conflicts (
  id         uuid primary key default gen_random_uuid(),
  cycle_id   uuid not null references public.cycles (id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.staff_profiles (user_id) on delete cascade,
  name       text not null check (char_length(btrim(name)) between 1 and 120),
  created_at timestamptz not null default now()
);

create index if not exists board_conflicts_cycle on public.board_conflicts (cycle_id);
create index if not exists board_conflicts_user on public.board_conflicts (user_id);

-- A name made comparable: lower case, trimmed, runs of spaces made one, and
-- accents removed when the unaccent extension is installed ("José" = "jose").
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'unaccent') then
    create extension if not exists unaccent with schema extensions;
  end if;
end;
$$;

create or replace function public.normalize_person_name(p_name text)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v text := lower(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')));
begin
  if to_regprocedure('extensions.unaccent(regdictionary, text)') is not null then
    v := extensions.unaccent('extensions.unaccent'::regdictionary, v);
  end if;
  return v;
end;
$$;

revoke all on function public.normalize_person_name(text) from public, anon;
grant execute on function public.normalize_person_name(text) to authenticated, service_role;

-- The board members who listed this applicant as someone they know: the same
-- full name, or the same first and last word ("Ada N. Okafor" = "Ada Okafor").
-- Returns ids only, never the names. Server side only (pairing and the
-- service role): signed-in users cannot call it.
create or replace function public.conflicted_board_members(p_application_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  with app as (
    select a.cycle_id, public.normalize_person_name(a.full_name) as n
    from public.applications a
    where a.id = p_application_id
  ),
  names as (
    select c.user_id, public.normalize_person_name(c.name) as n
    from public.board_conflicts c
    join app on app.cycle_id = c.cycle_id
  )
  select distinct names.user_id
  from names, app
  where app.n <> ''
    and names.n <> ''
    and (names.n = app.n
         or (split_part(names.n, ' ', 1) = split_part(app.n, ' ', 1)
             and (string_to_array(names.n, ' '))[cardinality(string_to_array(names.n, ' '))]
               = (string_to_array(app.n, ' '))[cardinality(string_to_array(app.n, ' '))]));
$$;

revoke all on function public.conflicted_board_members(uuid) from public, anon, authenticated;
grant execute on function public.conflicted_board_members(uuid) to service_role;

-- -----------------------------------------------------------------------------
-- d. Proposed vs opened interview times
-- -----------------------------------------------------------------------------

-- null = proposed by the Ops Hub and still under review; students never see
-- it. Slots that already exist were offered already, so they stay open.
-- The backfill runs only when the column is first added, so running this file
-- again never opens a time that is still under review.
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'interview_slots'
                   and column_name = 'opened_at') then
    alter table public.interview_slots add column opened_at timestamptz;
    update public.interview_slots set opened_at = created_at;
  end if;
end;
$$;

-- The future, opened slots of a cycle that nobody holds, for the booking pages.
-- Same as the journey file's version, plus "opened only".
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
      and s.opened_at is not null
      and s.starts_at > now()
      and not exists (select 1 from public.bookings b where b.slot_id = s.id and b.status = 'active')
    order by s.starts_at;
end;
$$;

revoke all on function public.open_interview_slots(uuid) from public, anon;
grant execute on function public.open_interview_slots(uuid) to authenticated, service_role;

-- Same as the journey file's switch_booking(p_new_slot, p_note), plus: a slot
-- that is not opened yet is refused as slot_not_found, so a student cannot
-- book (or learn about) a proposed time. Returns:
--   'booked'    first booking made
--   'switched'  moved to the new slot, old slot released
--   'unchanged' she already holds this slot
--   'taken'     someone else holds it; nothing changed, she keeps her old time
-- Pairing happens in the bookings trigger (section g).
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
  if not found or v_slot.opened_at is null then
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
-- e. Interview questions
-- -----------------------------------------------------------------------------

-- The questions interviewers ask, per cycle, grouped by rubric criterion.
-- criterion_key null = "To close" (not scored). A key must be one of the
-- cycle's rubric keys; renaming a key carries its questions along, removing a
-- criterion removes its questions.
create table if not exists public.interview_questions (
  id            uuid primary key default gen_random_uuid(),
  cycle_id      uuid not null references public.cycles (id) on delete cascade,
  criterion_key text,
  position      smallint not null default 0,
  text          text not null check (char_length(btrim(text)) between 1 and 500),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint interview_questions_criterion foreign key (cycle_id, criterion_key)
    references public.rubric_criteria (cycle_id, key) on update cascade on delete cascade
);

create index if not exists interview_questions_cycle on public.interview_questions (cycle_id, criterion_key, position);

drop trigger if exists interview_questions_touch on public.interview_questions;
create trigger interview_questions_touch before update on public.interview_questions
  for each row execute function public.touch_updated_at();

-- The 12 starter questions, in order, keyed by rubric key (null = "To close").
create or replace function public.starter_questions()
returns table (criterion_key text, "position" smallint, text text)
language sql
immutable
set search_path = ''
as $$
  select q.k, q.p::smallint, q.t
  from (values
    ('community',     1,  'Tell us about a community you’re part of and what you’ve given back to it.'),
    ('community',     2,  'Why does community matter to you as an engineer?'),
    ('resilience',    3,  'Tell us about a time something went wrong at school or work. What did you do next?'),
    ('resilience',    4,  'Walk us through a hard problem you solved, step by step.'),
    ('leadership',    5,  'Describe a team project where you had to step up. What did you learn?'),
    ('leadership',    6,  'Tell us about a disagreement on a team and how it ended.'),
    ('financial',     7,  'What would this scholarship make possible for you this year?'),
    ('communication', 8,  'Explain an engineering idea you like to someone outside engineering.'),
    ('passion',       9,  'What got you into engineering, and what keeps you in it?'),
    ('passion',       10, 'Where do you want to be in five years?'),
    (null,            11, 'Is there anything you’d like us to know that your application didn’t show?'),
    (null,            12, 'What questions do you have for us?')
  ) as q(k, p, t);
$$;

revoke all on function public.starter_questions() from public, anon;
grant execute on function public.starter_questions() to authenticated, service_role;

-- Admin only: adds the starter questions to a cycle that has none. Questions
-- for a criterion the cycle's rubric does not have are skipped. Returns how
-- many were added (0 when the cycle already has questions).
-- Errors: not_allowed, cycle_not_found, rubric_missing (set up the rubric first).
create or replace function public.seed_starter_questions(p_cycle_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_added integer;
begin
  if coalesce(public.app_role() = 'admin', false) is not true
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from public.cycles c where c.id = p_cycle_id) then
    raise exception 'cycle_not_found' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.rubric_criteria r where r.cycle_id = p_cycle_id) then
    raise exception 'rubric_missing' using errcode = 'P0001';
  end if;
  -- Lock the cycle so two clicks do not add the questions twice.
  perform 1 from public.cycles c where c.id = p_cycle_id for update;
  if exists (select 1 from public.interview_questions q where q.cycle_id = p_cycle_id) then
    return 0;
  end if;
  insert into public.interview_questions (cycle_id, criterion_key, position, text)
  select p_cycle_id, s.criterion_key, s.position, s.text
  from public.starter_questions() s
  where s.criterion_key is null
     or exists (select 1 from public.rubric_criteria r where r.cycle_id = p_cycle_id and r.key = s.criterion_key);
  get diagnostics v_added = row_count;
  return v_added;
end;
$$;

revoke all on function public.seed_starter_questions(uuid) from public, anon;
grant execute on function public.seed_starter_questions(uuid) to authenticated, service_role;

-- Every existing cycle with a rubric and no questions gets the starters.
insert into public.interview_questions (cycle_id, criterion_key, position, text)
select c.id, s.criterion_key, s.position, s.text
from public.cycles c
cross join public.starter_questions() s
where exists (select 1 from public.rubric_criteria r where r.cycle_id = c.id)
  and not exists (select 1 from public.interview_questions q where q.cycle_id = c.id)
  and (s.criterion_key is null
       or exists (select 1 from public.rubric_criteria r where r.cycle_id = c.id and r.key = s.criterion_key));

-- -----------------------------------------------------------------------------
-- f. "None of these times work" as time ranges (Portal)
-- -----------------------------------------------------------------------------

-- ranges: [{"day":"2026-10-15","start":"18:00","end":"20:00"}, ...] (Eastern).
-- said: what she typed. The old days + windows answer still works; a row needs
-- one or the other.
alter table public.interview_free_times add column if not exists ranges jsonb not null default '[]'::jsonb;
alter table public.interview_free_times add column if not exists said text;
alter table public.interview_free_times alter column days drop not null;
alter table public.interview_free_times alter column windows drop not null;

alter table public.interview_free_times drop constraint if exists interview_free_times_ranges_array;
alter table public.interview_free_times add constraint interview_free_times_ranges_array
  check (jsonb_typeof(ranges) = 'array');
alter table public.interview_free_times drop constraint if exists interview_free_times_said_length;
alter table public.interview_free_times add constraint interview_free_times_said_length
  check (char_length(said) <= 1000);
alter table public.interview_free_times drop constraint if exists interview_free_times_some_answer;
alter table public.interview_free_times add constraint interview_free_times_some_answer
  check ((case when jsonb_typeof(ranges) = 'array' then jsonb_array_length(ranges) >= 1 else false end)
         or (days is not null and windows is not null));

grant insert (ranges, said) on public.interview_free_times to authenticated;
grant update (ranges, said) on public.interview_free_times to authenticated;

-- -----------------------------------------------------------------------------
-- g. Fair pairing when a student books
-- -----------------------------------------------------------------------------

-- The board members who could interview in a slot, with the two numbers the
-- order uses. A candidate is an admin or board account with a staff profile
-- who:
--   - has a free range on the slot's Eastern date covering the whole slot,
--   - is under their "Most N interviews" limit (pairings in this cycle),
--   - is not someone who listed this applicant as a student they know,
--   - holds no other pairing in an overlapping slot.
-- interviews_so_far: their pairings in the cycle (this slot's own excluded).
-- free_minutes_left: their free minutes in the cycle from this slot's start
--   on, minus 30 for each pairing they already hold from that point (never
--   below 0). Fewer means "use them now, they have less room later".
-- Ordered the way pick_interviewers() picks. Admins (for rebalancing), the
-- service role and the bookings trigger may call it.
create or replace function public.interview_candidates(p_slot_id uuid, p_application_id uuid)
returns table (user_id uuid, interviews_so_far int, free_minutes_left int, display_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_slot  public.interview_slots%rowtype;
  v_local timestamp;
  v_day   date;
  v_smin  int;
  v_emin  int;
begin
  if pg_trigger_depth() = 0
     and coalesce(public.app_role() = 'admin', false) is not true
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  select * into v_slot from public.interview_slots s where s.id = p_slot_id;
  if not found then
    raise exception 'slot_not_found' using errcode = 'P0002';
  end if;
  v_local := v_slot.starts_at at time zone 'America/New_York';
  v_day   := v_local::date;
  v_smin  := extract(hour from v_local)::int * 60 + extract(minute from v_local)::int;
  v_emin  := v_smin + ceil(extract(epoch from (v_slot.ends_at - v_slot.starts_at)) / 60)::int;

  return query
    with staff as (
      select sp.user_id as uid, sp.display_name as name
      from public.staff_profiles sp
      join auth.users u on u.id = sp.user_id
      where u.raw_app_meta_data ->> 'role' in ('admin', 'board')
    ),
    held as (
      -- Every pairing in this cycle except this slot's own, once per interviewer.
      select x.uid, s.starts_at, s.ends_at
      from public.interview_pairings p
      join public.interview_slots s on s.id = p.slot_id
      cross join lateral (values (p.interviewer_a), (p.interviewer_b)) as x(uid)
      where s.cycle_id = v_slot.cycle_id and p.slot_id <> v_slot.id
    ),
    counts as (
      select h.uid,
             count(*)::int as n,
             (count(*) filter (where h.starts_at >= v_slot.starts_at))::int as later
      from held h
      group by h.uid
    ),
    ranges as (
      select r.user_id as uid,
             ((r.day + make_interval(mins => r.start_min)) at time zone 'America/New_York') as rs,
             ((r.day + make_interval(mins => r.end_min)) at time zone 'America/New_York') as re
      from public.board_free_ranges r
      where r.cycle_id = v_slot.cycle_id
    ),
    free as (
      select g.uid,
             floor(sum(extract(epoch from (g.re - greatest(g.rs, v_slot.starts_at))) / 60))::int as mins
      from ranges g
      where g.re > v_slot.starts_at
      group by g.uid
    )
    select st.uid,
           coalesce(c.n, 0),
           greatest(0, coalesce(f.mins, 0) - 30 * coalesce(c.later, 0)),
           st.name
    from staff st
    left join counts c on c.uid = st.uid
    left join free f on f.uid = st.uid
    left join public.board_interview_prefs bp on bp.cycle_id = v_slot.cycle_id and bp.user_id = st.uid
    where exists (select 1 from public.board_free_ranges r
                  where r.cycle_id = v_slot.cycle_id and r.user_id = st.uid and r.day = v_day
                    and r.start_min <= v_smin and r.end_min >= v_emin)
      and (bp.max_interviews is null or coalesce(c.n, 0) < bp.max_interviews)
      and (p_application_id is null
           or not exists (select 1 from public.conflicted_board_members(p_application_id) as k(uid)
                          where k.uid = st.uid))
      and not exists (select 1 from held h
                      where h.uid = st.uid and h.starts_at < v_slot.ends_at and v_slot.starts_at < h.ends_at)
    order by 2 asc, 3 asc, 4 asc, 1 asc;
end;
$$;

revoke all on function public.interview_candidates(uuid, uuid) from public, anon;
grant execute on function public.interview_candidates(uuid, uuid) to authenticated, service_role;

-- The two people to pair: the first two candidates (fewest interviews so far,
-- then fewer free minutes left, then name A to Z). Fewer than 2 when not
-- enough people can do it.
create or replace function public.pick_interviewers(p_slot_id uuid, p_application_id uuid)
returns uuid[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v uuid[];
begin
  if pg_trigger_depth() = 0
     and coalesce(public.app_role() = 'admin', false) is not true
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select coalesce(array_agg(c.user_id order by c.interviews_so_far, c.free_minutes_left, c.display_name, c.user_id), '{}')
    into v
  from (select * from public.interview_candidates(p_slot_id, p_application_id) x
        order by x.interviews_so_far, x.free_minutes_left, x.display_name, x.user_id
        limit 2) c;
  return v;
end;
$$;

revoke all on function public.pick_interviewers(uuid, uuid) from public, anon;
grant execute on function public.pick_interviewers(uuid, uuid) to authenticated, service_role;

-- When a booking becomes active and its slot has no pair, the two picked
-- people are paired (paired_by null = automatic). With fewer than 2, nothing
-- is written and the Ops Hub shows "needs two interviewers". When a booking
-- is released and nobody else holds the slot, the slot's pairing goes.
-- Security definer: it runs the same whether an applicant books through
-- switch_booking() or the service role writes the booking.
create or replace function public.bookings_auto_pair()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pick uuid[];
begin
  if new.status = 'active' and (tg_op = 'INSERT' or old.status is distinct from 'active') then
    if not exists (select 1 from public.interview_pairings p where p.slot_id = new.slot_id) then
      v_pick := public.pick_interviewers(new.slot_id, new.application_id);
      if cardinality(v_pick) >= 2 then
        insert into public.interview_pairings (slot_id, interviewer_a, interviewer_b, paired_by)
        values (new.slot_id, v_pick[1], v_pick[2], null)
        on conflict (slot_id) do nothing;
      end if;
    end if;
  elsif new.status = 'released' and tg_op = 'UPDATE' and old.status = 'active' then
    if not exists (select 1 from public.bookings b
                   where b.slot_id = new.slot_id and b.status = 'active' and b.id <> new.id) then
      delete from public.interview_pairings p where p.slot_id = new.slot_id;
    end if;
  end if;
  return null;
end;
$$;

revoke all on function public.bookings_auto_pair() from public, anon, authenticated;

drop trigger if exists bookings_auto_pair on public.bookings;
create trigger bookings_auto_pair after insert or update of status on public.bookings
  for each row execute function public.bookings_auto_pair();

-- -----------------------------------------------------------------------------
-- h. AI usage limits
-- -----------------------------------------------------------------------------

-- How many times a person used an AI feature on an Eastern calendar day.
-- Nobody reads it but the service role; ai_take() writes it.
create table if not exists public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day     date not null,
  kind    text not null check (kind ~ '^[a-z_]{2,40}$'),
  count   integer not null default 0 check (count >= 0),
  primary key (user_id, day, kind)
);

-- Takes one use of p_kind for the signed-in caller today (Eastern). Returns
-- true and counts it while the caller is under p_daily_limit; returns false
-- (and counts nothing) once the limit is reached.
-- Errors: not_signed_in, invalid_kind.
create or replace function public.ai_take(p_kind text, p_daily_limit int)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_day date := (now() at time zone 'America/New_York')::date;
  v_n   integer;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  if p_kind is null or p_kind !~ '^[a-z_]{2,40}$' then
    raise exception 'invalid_kind' using errcode = '22023';
  end if;
  if coalesce(p_daily_limit, 0) < 1 then
    return false;
  end if;
  insert into public.ai_usage as u (user_id, day, kind, count)
  values (v_uid, v_day, p_kind, 1)
  on conflict (user_id, day, kind) do update
    set count = u.count + 1
    where u.count < p_daily_limit
  returning u.count into v_n;
  return v_n is not null;
end;
$$;

revoke all on function public.ai_take(text, int) from public, anon;
grant execute on function public.ai_take(text, int) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Grants and row rules
-- -----------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['board_free_ranges', 'board_interview_prefs', 'board_conflicts',
                           'interview_questions', 'ai_usage'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end;
$$;

grant select, insert, update, delete on public.board_free_ranges to authenticated;
grant select, insert, update, delete on public.board_interview_prefs to authenticated;
grant select, insert, delete on public.board_conflicts to authenticated;
grant select, insert, update, delete on public.interview_questions to authenticated;
-- ai_usage: nothing for signed-in users; ai_take() writes it.

-- ---- board_free_ranges -----------------------------------------------------
-- Staff see everyone's ranges (proposing times needs them). A board member
-- adds, changes and removes their own; admins anyone's.
drop policy if exists board_free_ranges_select_staff on public.board_free_ranges;
create policy board_free_ranges_select_staff on public.board_free_ranges
  for select to authenticated
  using ((select public.is_staff()));

drop policy if exists board_free_ranges_insert_own on public.board_free_ranges;
create policy board_free_ranges_insert_own on public.board_free_ranges
  for insert to authenticated
  with check (
    (select public.is_staff())
    and (user_id = (select auth.uid()) or (select public.app_role()) = 'admin'));

drop policy if exists board_free_ranges_update_own on public.board_free_ranges;
create policy board_free_ranges_update_own on public.board_free_ranges
  for update to authenticated
  using (
    (select public.is_staff())
    and (user_id = (select auth.uid()) or (select public.app_role()) = 'admin'))
  with check (
    (select public.is_staff())
    and (user_id = (select auth.uid()) or (select public.app_role()) = 'admin'));

drop policy if exists board_free_ranges_delete_own on public.board_free_ranges;
create policy board_free_ranges_delete_own on public.board_free_ranges
  for delete to authenticated
  using (
    (select public.is_staff())
    and (user_id = (select auth.uid()) or (select public.app_role()) = 'admin'));

-- ---- board_interview_prefs -------------------------------------------------
-- Staff read all (admins see who has sent and each limit); own write; admins any.
drop policy if exists board_interview_prefs_select_staff on public.board_interview_prefs;
create policy board_interview_prefs_select_staff on public.board_interview_prefs
  for select to authenticated
  using ((select public.is_staff()));

drop policy if exists board_interview_prefs_insert_own on public.board_interview_prefs;
create policy board_interview_prefs_insert_own on public.board_interview_prefs
  for insert to authenticated
  with check (
    (select public.is_staff())
    and (user_id = (select auth.uid()) or (select public.app_role()) = 'admin'));

drop policy if exists board_interview_prefs_update_own on public.board_interview_prefs;
create policy board_interview_prefs_update_own on public.board_interview_prefs
  for update to authenticated
  using (
    (select public.is_staff())
    and (user_id = (select auth.uid()) or (select public.app_role()) = 'admin'))
  with check (
    (select public.is_staff())
    and (user_id = (select auth.uid()) or (select public.app_role()) = 'admin'));

drop policy if exists board_interview_prefs_delete_own on public.board_interview_prefs;
create policy board_interview_prefs_delete_own on public.board_interview_prefs
  for delete to authenticated
  using (
    (select public.is_staff())
    and (user_id = (select auth.uid()) or (select public.app_role()) = 'admin'));

-- ---- board_conflicts: the owner only, admins included ------------------------
drop policy if exists board_conflicts_select_own on public.board_conflicts;
create policy board_conflicts_select_own on public.board_conflicts
  for select to authenticated
  using ((select public.is_staff()) and user_id = (select auth.uid()));

drop policy if exists board_conflicts_insert_own on public.board_conflicts;
create policy board_conflicts_insert_own on public.board_conflicts
  for insert to authenticated
  with check ((select public.is_staff()) and user_id = (select auth.uid()));

drop policy if exists board_conflicts_delete_own on public.board_conflicts;
create policy board_conflicts_delete_own on public.board_conflicts
  for delete to authenticated
  using ((select public.is_staff()) and user_id = (select auth.uid()));

-- ---- interview_questions: staff read, admins write -----------------------------
drop policy if exists interview_questions_select_staff on public.interview_questions;
create policy interview_questions_select_staff on public.interview_questions
  for select to authenticated
  using ((select public.is_staff()));

drop policy if exists interview_questions_write_admin on public.interview_questions;
create policy interview_questions_write_admin on public.interview_questions
  for all to authenticated
  using ((select public.app_role()) = 'admin')
  with check ((select public.app_role()) = 'admin');

-- ---- ai_usage: no rows for anyone but the service role -----------------------
-- (Signed-in users have no privilege on it either; this keeps "every table has
-- a policy" true.)
drop policy if exists ai_usage_none on public.ai_usage;
create policy ai_usage_none on public.ai_usage
  for select to authenticated
  using (false);

-- -----------------------------------------------------------------------------
-- i. Final check: raises (and rolls everything back) if a rule is broken
-- -----------------------------------------------------------------------------

do $$
declare
  v_bad text;
begin
  -- The new tables exist with RLS on.
  select string_agg(t, ', ') into v_bad
  from unnest(array['board_free_ranges', 'board_interview_prefs', 'board_conflicts',
                    'interview_questions', 'ai_usage']) as t
  where not exists (select 1 from pg_class c
                    where c.relnamespace = 'public'::regnamespace and c.relname = t
                      and c.relkind = 'r' and c.relrowsecurity);
  if v_bad is not null then
    raise exception 'missing or without RLS: %', v_bad;
  end if;

  -- The blocks table is gone.
  if to_regclass('public.board_availability') is not null then
    raise exception 'board_availability still exists (replaced by board_free_ranges)';
  end if;

  -- No policy mentions a reviewer (D6).
  select string_agg(schemaname || '.' || tablename || ':' || policyname, ', ') into v_bad
  from pg_policies
  where schemaname in ('public', 'storage')
    and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ilike '%reviewer%';
  if v_bad is not null then
    raise exception 'reviewer role still mentioned (D6): %', v_bad;
  end if;

  -- Conflicts are owner-only: no select policy on them may skip the owner check.
  if exists (select 1 from pg_policies
             where schemaname = 'public' and tablename = 'board_conflicts'
               and cmd in ('SELECT', 'ALL') and coalesce(qual, '') not ilike '%auth.uid()%') then
    raise exception 'board_conflicts can be read by someone other than the owner';
  end if;

  -- The conflict matcher is server side only.
  if has_function_privilege('authenticated', 'public.conflicted_board_members(uuid)', 'execute')
     or has_function_privilege('anon', 'public.conflicted_board_members(uuid)', 'execute') then
    raise exception 'conflicted_board_members() is callable by signed-in users';
  end if;

  -- Every cycle with a rubric has interview questions.
  select string_agg(c.id::text, ', ') into v_bad
  from public.cycles c
  where exists (select 1 from public.rubric_criteria r where r.cycle_id = c.id)
    and not exists (select 1 from public.interview_questions q where q.cycle_id = c.id);
  if v_bad is not null then
    raise exception 'cycles with a rubric but no interview questions: %', v_bad;
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

  -- anon has no privilege on the new tables.
  select string_agg(table_name, ', ') into v_bad
  from information_schema.role_table_grants
  where table_schema = 'public' and grantee = 'anon'
    and table_name in ('board_free_ranges', 'board_interview_prefs', 'board_conflicts',
                       'interview_questions', 'ai_usage');
  if v_bad is not null then
    raise exception 'anon has privileges on: %', v_bad;
  end if;

  -- Signed-in users have no privilege on the AI counter.
  if exists (select 1 from information_schema.role_table_grants
             where table_schema = 'public' and table_name = 'ai_usage' and grantee = 'authenticated') then
    raise exception 'signed-in users can touch ai_usage directly';
  end if;
end;
$$;

commit;
