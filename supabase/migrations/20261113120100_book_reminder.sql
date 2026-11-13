-- =============================================================================
-- Student booking reminders (2026-11-13). Ops Hub's Interviews page gets a live
-- "Remind" for applicants who have not booked an interview time: an admin sends
-- the "Schedule your interview" email again, to one student or to all of them.
--
-- The email log learns one kind, 'book-reminder'. Its recipient key is
-- "<email>|<Eastern date>" and it joins the per-slot-and-recipient "never twice"
-- index, so a student gets at most one reminder a day (two admins pressing at
-- once, or a retry, cannot send it twice). The first booking email ('book') keeps
-- its own rule: once per application, ever.
--
-- Additive. Safe to run twice. NOT applied by the build: an admin applies it
-- before go-live. Until it is applied, "Remind" says so and sends nothing.
-- =============================================================================

begin;

alter table public.email_log drop constraint if exists email_log_kind_check;
alter table public.email_log add constraint email_log_kind_check
  check (kind in ('confirmation', 'book', 'won', 'not-picked', 'staff-invite',
                  'booked', 'reminder', 'prep', 'video-link', 'rebalance', 'cancel', 'availability-reminder',
                  'book-reminder'));

drop index if exists public.email_log_once_per_slot_recipient;
create unique index email_log_once_per_slot_recipient
  on public.email_log (kind, coalesce(application_id, '00000000-0000-0000-0000-000000000000'::uuid),
                       coalesce(slot_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(lower(recipient), ''))
  where kind in ('booked', 'reminder', 'prep', 'video-link', 'rebalance', 'cancel', 'availability-reminder',
                 'book-reminder');

commit;
