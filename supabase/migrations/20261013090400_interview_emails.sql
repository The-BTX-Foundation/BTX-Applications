-- =============================================================================
-- Interview emails (2026-10-13). The email log learns the interview-flow kinds:
-- 'booked', 'reminder', 'prep', 'video-link', 'rebalance' and 'cancel'. These are
-- sent per slot and per person, so the log now also records the slot and the
-- recipient, and the "never twice" rule for them is once per (kind, application,
-- slot, recipient). The old kinds keep their rule: once per application.
-- Additive. Safe to run twice.
-- =============================================================================

begin;

-- The check on kind: the old five plus the six new ones.
alter table public.email_log drop constraint if exists email_log_kind_check;
alter table public.email_log add constraint email_log_kind_check
  check (kind in ('confirmation', 'book', 'won', 'not-picked', 'staff-invite',
                  'booked', 'reminder', 'prep', 'video-link', 'rebalance', 'cancel'));

alter table public.email_log add column if not exists slot_id uuid references public.interview_slots (id) on delete set null;
alter table public.email_log add column if not exists recipient text;

-- The old rule (once per kind and application) covers only the old kinds; a student gets a 'booked' email for
-- every slot she books.
drop index if exists public.email_log_once_per_application;
create unique index email_log_once_per_application
  on public.email_log (kind, application_id)
  where application_id is not null
    and kind in ('confirmation', 'book', 'won', 'not-picked', 'staff-invite');

-- The new rule. coalesce makes a missing application, slot or recipient count as one value, so a null cannot slip
-- past the index.
create unique index if not exists email_log_once_per_slot_recipient
  on public.email_log (kind, coalesce(application_id, '00000000-0000-0000-0000-000000000000'::uuid),
                       coalesce(slot_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(lower(recipient), ''))
  where kind in ('booked', 'reminder', 'prep', 'video-link', 'rebalance', 'cancel');

commit;
