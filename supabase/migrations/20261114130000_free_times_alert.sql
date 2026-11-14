-- =============================================================================
-- "Asked for other times" alert (2026-11-14). When a student with no interview
-- time sends the times she is free from the Portal ("None of these times work",
-- route apps/portal/app/api/free-times), the board gets a push and
-- info@thebtxfoundation.org gets one email: "<Name> asked for other interview times".
--
-- The email log learns one kind, 'free-times'. Its recipient key is
-- "info@thebtxfoundation.org|<Eastern date>" and it joins the per-slot-and-recipient
-- "never twice" index, so two saves at the same moment cannot both email. The
-- route also skips the alert when one for the same student went out in the last
-- 24 hours.
--
-- interview_free_times also gets a size guard: one answer holds at most 60 ranges
-- (the Portal route refuses more; existing rows hold far fewer, so it validates).
--
-- Additive. Safe to run twice. NOT applied by the build: an admin applies it
-- before go-live. Until it is applied, the email's log row is refused, so the
-- email is not sent (the student's save and the pushes still work).
-- =============================================================================

begin;

alter table public.email_log drop constraint if exists email_log_kind_check;
alter table public.email_log add constraint email_log_kind_check
  check (kind in ('confirmation', 'book', 'won', 'not-picked', 'staff-invite',
                  'booked', 'reminder', 'prep', 'video-link', 'rebalance', 'cancel', 'availability-reminder',
                  'book-reminder', 'free-times'));

drop index if exists public.email_log_once_per_slot_recipient;
create unique index email_log_once_per_slot_recipient
  on public.email_log (kind, coalesce(application_id, '00000000-0000-0000-0000-000000000000'::uuid),
                       coalesce(slot_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(lower(recipient), ''))
  where kind in ('booked', 'reminder', 'prep', 'video-link', 'rebalance', 'cancel', 'availability-reminder',
                 'book-reminder', 'free-times');

alter table public.interview_free_times drop constraint if exists interview_free_times_ranges_max;
alter table public.interview_free_times add constraint interview_free_times_ranges_max
  check (ranges is null or jsonb_array_length(ranges) <= 60);

commit;
