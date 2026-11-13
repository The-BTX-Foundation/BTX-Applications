-- =============================================================================
-- Interview notes (2026-11-13). One notes box per interview question, plus one
-- "Overall notes" box, per interviewer, on the Ops Hub's page for one interview
-- (/scholarships/interviews/<slot>). Board feedback from the first real
-- interviews: there was only one notes box, so people numbered notes by hand.
--
-- DRAFT. NOT APPLIED. Apply only after Dominick approves it by naming the
-- production project. Additive: one table, one check trigger, its policies and
-- grants, and one trigger on interview_questions that keeps notes when a
-- question is removed. Nothing else changes. Safe to run twice.
--
-- The table: interview_notes
--   slot_id      the interview time (interview_slots.id); the interview page's id
--   question_id  the interview question (interview_questions.id); NULL = overall notes
--   author_id    who wrote it (staff_profiles.user_id, defaults to the signer)
--   body         the words, up to 10,000 characters ('' allowed: an emptied box)
--   One row per (slot, question, author) and one overall row per (slot, author):
--   two partial unique indexes, because NULL never equals NULL in a plain unique.
--   A question must belong to the same cycle as the interview time (trigger).
--   Removing a question keeps its notes: a trigger on interview_questions
--   (before delete) appends each author's notes on that question to the end of
--   that author's overall notes for the interview (headed by the question's
--   words), then removes the per-question row. question_id is also
--   "on delete set null" as a backstop. Merging in the trigger keeps the one
--   overall box per (slot, author) rule intact, so the page never sees two.
--
-- Who can do what (row-level security):
--   read    admins: every note. Board: the notes of an interview they are one of
--           the two interviewers on (interview_pairings), and their own notes
--           (so a write can return its row after a change of interviewer).
--   write   insert, update and delete only their own rows (author_id = the
--           signer), only while they are admin or board (public.is_staff()), and
--           only on an interview they are one of the two interviewers on
--           (admins: any interview).
--   Applicants, signed-out visitors and any other role: nothing.
-- =============================================================================

begin;

create table if not exists public.interview_notes (
  id          uuid primary key default gen_random_uuid(),
  slot_id     uuid not null references public.interview_slots (id) on delete cascade,
  question_id uuid references public.interview_questions (id) on delete set null,
  author_id   uuid not null default auth.uid() references public.staff_profiles (user_id) on delete cascade,
  body        text not null default '' check (char_length(body) <= 10000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- One box per question per author, and one overall box per author.
create unique index if not exists interview_notes_one_per_question
  on public.interview_notes (slot_id, question_id, author_id) where question_id is not null;
create unique index if not exists interview_notes_one_overall
  on public.interview_notes (slot_id, author_id) where question_id is null;
create index if not exists interview_notes_author on public.interview_notes (author_id);
create index if not exists interview_notes_question on public.interview_notes (question_id);

drop trigger if exists interview_notes_touch on public.interview_notes;
create trigger interview_notes_touch before update on public.interview_notes
  for each row execute function public.touch_updated_at();

-- A note's question must be one of the interview's own cycle's questions, and a
-- note never moves to another interview, question or author.
create or replace function public.interview_notes_check()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (new.slot_id is distinct from old.slot_id
      or new.question_id is distinct from old.question_id
      or new.author_id is distinct from old.author_id) then
    raise exception 'interview_notes: only the words can change' using errcode = '22023';
  end if;
  if new.question_id is not null and not exists (
      select 1
      from public.interview_questions q
      join public.interview_slots s on s.cycle_id = q.cycle_id
      where q.id = new.question_id and s.id = new.slot_id) then
    raise exception 'interview_notes: that question is not in this interview''s cycle' using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function public.interview_notes_check() from public, anon, authenticated;

drop trigger if exists interview_notes_check on public.interview_notes;
create trigger interview_notes_check before insert or update on public.interview_notes
  for each row execute function public.interview_notes_check();

-- Grants: nothing for anon or public; signed-in users get table privileges and
-- RLS decides the rows; the service role gets everything.
alter table public.interview_notes enable row level security;
revoke all on public.interview_notes from public, anon, authenticated;
grant select, insert, update, delete on public.interview_notes to authenticated;
grant all on public.interview_notes to service_role;

-- Read: admins all; board the interviews they are on, and their own rows.
drop policy if exists interview_notes_select on public.interview_notes;
create policy interview_notes_select on public.interview_notes
  for select to authenticated
  using (
    (select public.app_role()) = 'admin'
    or ((select public.is_staff()) and (
      author_id = (select auth.uid())
      or exists (
        select 1 from public.interview_pairings p
        where p.slot_id = interview_notes.slot_id
          and (select auth.uid()) in (p.interviewer_a, p.interviewer_b)))));

-- Write: own rows only, while admin or board, and only on an interview the
-- writer is one of the two interviewers on (admins: any interview).
drop policy if exists interview_notes_insert_own on public.interview_notes;
create policy interview_notes_insert_own on public.interview_notes
  for insert to authenticated
  with check ((select public.is_staff()) and author_id = (select auth.uid())
    and ((select public.app_role()) = 'admin' or exists (
      select 1 from public.interview_pairings p
      where p.slot_id = interview_notes.slot_id
        and (select auth.uid()) in (p.interviewer_a, p.interviewer_b))));

drop policy if exists interview_notes_update_own on public.interview_notes;
create policy interview_notes_update_own on public.interview_notes
  for update to authenticated
  using ((select public.is_staff()) and author_id = (select auth.uid())
    and ((select public.app_role()) = 'admin' or exists (
      select 1 from public.interview_pairings p
      where p.slot_id = interview_notes.slot_id
        and (select auth.uid()) in (p.interviewer_a, p.interviewer_b))))
  with check ((select public.is_staff()) and author_id = (select auth.uid())
    and ((select public.app_role()) = 'admin' or exists (
      select 1 from public.interview_pairings p
      where p.slot_id = interview_notes.slot_id
        and (select auth.uid()) in (p.interviewer_a, p.interviewer_b))));

drop policy if exists interview_notes_delete_own on public.interview_notes;
create policy interview_notes_delete_own on public.interview_notes
  for delete to authenticated
  using ((select public.is_staff()) and author_id = (select auth.uid())
    and ((select public.app_role()) = 'admin' or exists (
      select 1 from public.interview_pairings p
      where p.slot_id = interview_notes.slot_id
        and (select auth.uid()) in (p.interviewer_a, p.interviewer_b))));

-- Removing a question keeps its notes: each author's words on it move to the end
-- of that author's overall notes for the same interview (made if missing), headed
-- by the question, cut at the 10,000-character limit; then the per-question row
-- goes. Runs as the table owner so every author's notes move, whoever removes the
-- question (only admins can remove questions). The per-question rows are
-- deleted, never re-pointed: the check trigger refuses a change of question, and
-- a second overall row would break the one-overall-box rule.
create or replace function public.interview_notes_keep_on_question_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  n record;
  piece text;
begin
  for n in
    select id, slot_id, author_id, body
    from public.interview_notes
    where question_id = old.id
  loop
    if btrim(n.body) <> '' then
      piece := old.text || E'\n' || n.body;
      update public.interview_notes o
        set body = left(case when btrim(o.body) = '' then piece else o.body || E'\n\n' || piece end, 10000)
        where o.slot_id = n.slot_id and o.author_id = n.author_id and o.question_id is null;
      if not found then
        insert into public.interview_notes (slot_id, question_id, author_id, body)
          values (n.slot_id, null, n.author_id, left(piece, 10000));
      end if;
    end if;
    delete from public.interview_notes where id = n.id;
  end loop;
  return old;
end;
$$;

revoke all on function public.interview_notes_keep_on_question_delete() from public, anon, authenticated;

drop trigger if exists interview_notes_keep_on_question_delete on public.interview_questions;
create trigger interview_notes_keep_on_question_delete before delete on public.interview_questions
  for each row execute function public.interview_notes_keep_on_question_delete();

commit;
