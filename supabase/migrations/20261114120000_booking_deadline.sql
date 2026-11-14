-- =============================================================================
-- Booking deadline (2026-11-14). A cycle can set the moment interview booking
-- closes for students who have NOT booked: cycles.booking_closes_at (null = no
-- deadline). Until now the "book by" date in the booking email was only text.
--
-- After the deadline, for a student with no active booking:
--   - switch_booking() refuses with 'booking_closed' (errcode 22023);
--   - open_interview_slots() returns no rows (not an error);
--   - she can no longer send or change "None of these times work" free times
--     (interview_free_times insert/update policies).
-- A student who already holds an active booking keeps full control: she still
-- sees the open times, can switch, and can save a note on her own time.
--
-- Functions are redefined from their newest versions in
-- 20261013090300_interview_flow.sql (no later migration changes them); the free
-- times policies from 20261013090100_portal_journey.sql (no later migration
-- changes them). Every other condition is kept exactly as it was.
--
-- Additive. Safe to run twice. NOT applied by the build: an admin applies it
-- before go-live.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. The column
-- -----------------------------------------------------------------------------

alter table public.cycles add column if not exists booking_closes_at timestamptz;

comment on column public.cycles.booking_closes_at is
  'When interview booking closes for students who have not booked (null = no deadline). '
  'After it, a student with no active booking cannot book, sees no open times and cannot send free times; '
  'a student with an active booking can still switch times and add notes.';

-- -----------------------------------------------------------------------------
-- 2. Helper: has the cycle's booking deadline passed?
-- -----------------------------------------------------------------------------

-- True when the cycle sets a booking deadline and now() is at or past it. Security
-- definer so the free-times policies get the same answer whatever cycles the
-- caller can read under row-level security. Reveals one boolean about a cycle.
create or replace function public.booking_closed(p_cycle_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.cycles c
                 where c.id = p_cycle_id
                   and c.booking_closes_at is not null
                   and now() >= c.booking_closes_at);
$$;

revoke all on function public.booking_closed(uuid) from public, anon;
grant execute on function public.booking_closed(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. open_interview_slots: nothing to book once booking has closed for her
-- -----------------------------------------------------------------------------

-- The future, opened slots of a cycle that nobody holds, for the booking pages.
-- Same as the interview-flow version, plus: once the cycle's booking deadline has
-- passed, a caller with no active booking gets zero rows (she can no longer
-- book). A caller who holds a time still gets the list, so she can switch.
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
  -- Booking deadline: past it, only a student who already holds a time sees the list.
  if public.booking_closed(p_cycle_id)
     and not exists (select 1 from public.bookings b
                     join public.applications a on a.id = b.application_id
                     where a.user_id = auth.uid() and a.cycle_id = p_cycle_id and b.status = 'active') then
    return;
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

-- -----------------------------------------------------------------------------
-- 4. switch_booking: refuse a first booking after the deadline
-- -----------------------------------------------------------------------------

-- Same as the interview-flow version, plus: once the cycle's booking deadline has
-- passed, a caller with no active booking is refused with 'booking_closed'. A
-- caller who holds a time can still switch or save a note. Returns:
--   'booked'    first booking made
--   'switched'  moved to the new slot, old slot released
--   'unchanged' she already holds this slot
--   'taken'     someone else holds it; nothing changed, she keeps her old time
-- Errors: note_too_long, slot_not_found, slot_in_past, no_submitted_application,
-- booking_closed. Pairing happens in the bookings trigger (interview flow, g).
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

  -- Booking deadline: past it, only a student who already holds a time may act
  -- (switch, or save a note on her own time). Checked after her row is locked,
  -- so it sees her current booking.
  if public.booking_closed(v_slot.cycle_id)
     and not exists (select 1 from public.bookings b
                     where b.application_id = v_app and b.status = 'active') then
    raise exception 'booking_closed' using errcode = '22023';
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
-- 5. "None of these times work": closed with booking
-- -----------------------------------------------------------------------------

-- Same as the journey file's policies (application submitted, hers, no active
-- booking), plus: not after her cycle's booking deadline. The existing "no
-- active booking" rule already keeps students who hold a time out of this table,
-- so the deadline only changes things for students without one.
drop policy if exists interview_free_times_insert_own on public.interview_free_times;
drop policy if exists interview_free_times_update_own on public.interview_free_times;

create policy interview_free_times_insert_own on public.interview_free_times
  for insert to authenticated
  with check (
    (select public.app_role()) = 'applicant'
    and exists (select 1 from public.applications a
                where a.id = application_id and a.user_id = (select auth.uid()) and a.status = 'submitted')
    and not exists (select 1 from public.bookings b
                    where b.application_id = interview_free_times.application_id and b.status = 'active')
    -- booking deadline of her application's cycle (helper is security definer)
    and not exists (select 1 from public.applications a
                    where a.id = interview_free_times.application_id and public.booking_closed(a.cycle_id)));

create policy interview_free_times_update_own on public.interview_free_times
  for update to authenticated
  using (
    (select public.app_role()) = 'applicant'
    and exists (select 1 from public.applications a
                where a.id = application_id and a.user_id = (select auth.uid()) and a.status = 'submitted')
    and not exists (select 1 from public.bookings b
                    where b.application_id = interview_free_times.application_id and b.status = 'active')
    and not exists (select 1 from public.applications a
                    where a.id = interview_free_times.application_id and public.booking_closed(a.cycle_id)))
  with check (
    (select public.app_role()) = 'applicant'
    and exists (select 1 from public.applications a
                where a.id = application_id and a.user_id = (select auth.uid()) and a.status = 'submitted')
    and not exists (select 1 from public.bookings b
                    where b.application_id = interview_free_times.application_id and b.status = 'active')
    and not exists (select 1 from public.applications a
                    where a.id = interview_free_times.application_id and public.booking_closed(a.cycle_id)));

commit;
