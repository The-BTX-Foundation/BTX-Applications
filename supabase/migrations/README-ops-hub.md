# Ops Hub database change: what it does

File: `20261013090000_ops_hub.sql` (was `20261010120000_ops_hub.sql` on branch `db/ops-schema`; renamed so it sorts
after the short-answers migration). Drafted 2026-10-10, reconciled with the live schema 2026-10-12. **Not applied.**

It runs against the production Supabase project **awiaebtqalcmfafvktwh** ("BTX Student/Operations Hub"), after the
Portal fresh start (`20261009130000`) and the short answers (`20261012120000`), both applied. It is applied only after
Dominick approves it by naming that project. It runs as one transaction: if any step or the final check fails, nothing
changes. It is **safe to run twice** (`if not exists`, `create or replace`, every policy and trigger dropped first,
seed rows `on conflict do nothing`).

It **adds** the Ops Hub. It **redefines `public.is_staff()`** as admin or board only (D6), and keeps the Portal's staff
read rules on submitted applications, their files and the `applicant-documents` bucket (D2: no blind review). The
`legacy` schema is read, not changed.

## Owner's decisions applied (2026-10-12)

- **D1 Program plan:** only the 2026 plan moves in, without MS-006 and MS-010: 7 milestones, 11 tasks. The 2021 plan,
  MS-006 and MS-010 stay only in the `legacy` backup (the earlier draft imported them all as archived rows).
- **D2: no blind review; board members see names (owner, 2026-10-12).** Admins and board members read every submitted
  application in full (name included), its files and its PDFs. Nobody reads someone else's draft; applicants read only
  their own. See "Reading applications" below.
- **D3 Money deletes are admin-only:** budget years, categories, quarter plans and plan lines, spending, funds on hand,
  donors, gifts, grants and sponsorships (a sponsorship's delete also deletes its spending). Board members still read,
  add and edit them.
- **D4 Availability is Morning / Afternoon / Evening per day,** given before interview times exist:
  `board_availability` is now (cycle, person, day, block), not (slot, person). *Replaced 2026-10-13 by free time
  ranges: see "Interview flow" at the end.*
- **D5 No votes table.** The board discusses and decides; the ranking by combined score is information only, and an
  admin can record the main or an extra award for any submitted applicant. How it was decided (for example a vote)
  can go in the award's `decision_note`. Still enforced: one main award per cycle, one award per applicant.
- **D6 No reviewer role** (owner, 2026-10-12). Staff are admins and board members only. This file redefines
  `public.is_staff()` as admin or board, and its final check fails if any policy, function, view or constraint in
  `public` or `storage` still mentions a reviewer. Any other role (including an old `reviewer` value) is treated as
  not staff.
- **D7 Video link per interview:** `interview_pairings.video_url`, set by an admin when pairing. The Portal reads it
  through `my_interview` (journey file).
- **D8 No "unpublish score"** in the app (as drafted: only the service key can).
- **D9 Staff are created by an admin from the Ops Hub,** server side with the service key, role set in `app_metadata`
  at creation. No schema change: admins may already insert anyone's `staff_profiles` row.

## Who can do what

One staff role, board member. A board member with admin rights has app_metadata.role 'admin'. (The database values
`admin` and `board` do not change; the Ops Hub shows them as "Board member · admin rights" and "Board member".)

Taken from the signed-off Board members screen: *every board member can do everything, from tasks and chat to scoring
and selection; admin rights add a few extra controls; no one removes their own.*

| Role | Can |
|---|---|
| **admin** | Everything below, plus the admin-only setup: areas, task types, the scoring rubric, interviewer pairing and video links, area chat channels, other people's profiles. |
| **board** | Everything an admin can, except that admin-only setup and deleting money records (D3). Reads submitted applications in full, names included (D2). |
| **applicant / signed out / any other role** | Nothing in this change. |

Every rule reads the role only through `public.app_role()` or `public.is_staff()` (from `app_metadata`, which only
the server can write). Nothing reads `user_metadata`. Roles are still changed with the service key (Admin API), never
from the app's own database calls.

"admin + board" below means: read, add, edit and delete all rows.

## Tables (40), one line each

| Table | What it holds | Who reads / writes | Screen |
|---|---|---|---|
| `staff_profiles` | Name, title, initials per staff member (role is NOT here) | All staff read. You add and edit your own; admins anyone's; admins delete | People and roles, every avatar |
| `areas` | Scholarships, Finance (slug money), Programs, Outreach (seeded) | All staff read; admins write | Sidebar, area pills |
| `task_types` | Task, Request, Approval, Post, Scoring, Meeting, Decision, Document, Goal, Follow-up (seeded) | All staff read; admins write | The line under each task title |
| `checklists` | A named list of steps tied to a cycle, program, quarter plan, post or meeting (steps are tasks) | admin + board | Cycle checklist, Q4 budget, Setup checklist, Year-end giving, Getting started with grants, Where it stands, Post checklist, Selection agenda |
| `plan_milestones` | Plan milestones by year (code, name, area, program, due, done, archived) | admin + board | Programs pages, Calendar |
| `tasks` | Every task and checklist step: type, area, status, due, note, group owner, links to cycle / application / milestone / grant / checklist | admin + board | Today, Tasks, every checklist |
| `task_assignees` | Who owns a task (one or more people) | admin + board | Owner column |
| `task_comments` | Comments on a task | admin + board read; you write, edit and delete only your own | Comments panel |
| `calendar_events` | Events added in the app: meetings, planning calls, the selection meeting, deadlines | admin + board | Calendar ("Add event") |
| `goals` | A year's goals: title, what it counts, target, status | admin + board | Goals, Today "Year goals" |
| `year_figures` | Past years' numbers entered by hand (money raised, applicants, ...) | admin + board | Goals "Year over year" |
| `chat_channels` | One channel per area (seeded) plus direct conversations | admin + board see area channels and direct ones they are in; admins add area channels; direct ones come only from `open_direct_channel()` | Board chat |
| `chat_channel_members` | Who is in a direct conversation | Members see; nobody writes directly | Board chat "Direct" |
| `chat_messages` | Messages; bot posts have no author and can point at a task | admin + board read visible channels; you post, edit and delete only your own; only the service role posts as the bot | Board chat, area chats |
| `chat_read_markers` | When you last read each channel | Your own only | Unread counts |
| `chat_pins` | Pinned links (a task, checklist, event or web link) | admin + board | Board chat "Pinned" |
| `budget_years` | One row per budget year | admin + board; **only admins delete** | Money > Budget period |
| `budget_categories` | Categories with the year's budget; `kind` marks the Scholarships / Sponsorships / ... line automatic spending goes to | admin + board; **only admins delete** | Budget by category |
| `budget_quarter_plans` | A quarter's plan and its approval (draft, awaiting approval, approved, declined, decline note, who decided and when) | admin + board; **only admins delete** | "Approve $4,830 for Q4", decline form |
| `budget_quarter_plan_lines` | The plan's amount per category | admin + board; **only admins delete** | Q4 plan column |
| `spending_entries` | Spending ("Log spending"), plus what sponsorships and award payments log automatically | admin + board; **only admins delete** | Recent spending, Spent so far |
| `funds_snapshots` | "Funds on hand" updates (amount, date, who) | admin + board; **only admins delete** | Funds on hand |
| `donors` | Donor name, email, kind, notes (personal data) | admin + board; **only admins delete** | Recent gifts |
| `gifts` | Gifts: date, amount, source, monthly or not, donor, grant | admin + board; **only admins delete** | Fundraising (all totals are counted from these) |
| `grants` | Grant name, funder, amount (or "up to"), stage, outcome, deadline, next step, owner | admin + board; **only admins delete** | Money > Grants |
| `programs` | The three programs (seeded): status, summary, pilot budget, students, cost each | admin + board | Programs pages |
| `certification_ideas` | Certification ideas, who suggested them, decided or not | admin + board | Certification ideas |
| `sponsorships` | One-off sponsorships (what for, students, amount, when) | admin + board; **only admins delete** | Programs > Sponsorships |
| `outreach_channels` | Instagram, Newsletter, LinkedIn, Campus events (seeded): target, status, owner | admin + board | Outreach plan |
| `posts` | Social posts: channel, title, date, owner, caption, image, status | admin + board | Instagram, Outreach plan |
| `newsletter_issues` | An issue: title, send date, intro, owner, status | admin + board | Newsletter |
| `newsletter_sections` | An issue's sections (they are its checklist): owner, status, "waits for" date | admin + board | Newsletter, email preview |
| `rubric_criteria` | A cycle's scoring criteria and weights | All staff read; admins write | Scoring |
| `board_availability` | Morning / Afternoon / Evening blocks per day a board member is free, per cycle (D4). **Dropped by the interview flow file below** and replaced by `board_free_ranges`. | admin + board read; you add and remove your own; admins anyone's | Interviews "Your availability", Today "Add times" |
| `interview_pairings` | The two interviewers for a slot, and the video link | admin + board read; **admins only** write | Interviews, "Re-run pairing", "Add the video links" |
| `interview_summaries` | Shared interview summary, quotes, length | admin + board read; admins and that application's two interviewers write | Scoring "Interview notes", Applicants, Selection |
| `scores` | One score per interviewer per application: picks per criterion (jsonb), weighted score, published | See "Scores" below | Scoring, Applicants, Selection |
| `score_private_notes` | "Your private notes" | The writer only | Scoring |
| `scholarship_awards` | Each award decision (main or extra, amount, who decided, decision note incl. a tie vote), letter / accepted / paid dates; also past awards entered by hand | admin + board | Selection, Awardees, Goals chart |
| `award_steps` | The five awardee steps per award (created automatically) | admin + board | Awardees "Awardee steps" |

**Scores.** You always see your own score. You can change it while it is a draft; publishing needs all criteria and
then locks it. You can only score an application you interview (you are one of the pair on its booked slot). Admin and
board see other people's scores only after **both** interviewers have published ("Scores stay private until both
interviewers publish").

### Reading applications (D2: no blind review)

- `applications`: `applications_select_staff` (from the Portal file) is kept: admins and board members read submitted
  applications in full. Applicants still read their own (unchanged). An earlier draft's admin-only rule, the
  `application_reviews` view and `blind_applications()` are dropped if present, and the final check fails if they
  come back.
- `is_submitted_application(id)`: true/false only; the staff file rules on `application_files` and the
  `applicant-documents` bucket use it.
- The score check and "Funds sent" read the application under the caller's own rules, so they work for board members.
- The final check signs in as a board member for a moment and fails unless that account reads the `full_name` of every
  submitted application.

### Views (all "security invoker": they only show what your own rules allow)

- `application_score_summary`: published count and combined score per application.
- `budget_category_totals`: budget, spent so far, and each quarter's plan per category.
- `chat_unread_counts`: your unread messages per channel.

### Functions

- `is_submitted_application(id)`: used by the staff file rules (D2).
- `staff_directory()`: each staff member's role and last sign-in, for People and roles. Staff only.
- `score_progress(cycle)`: who has a draft or published score on what, **without the scores**, for "Not started,
  Chariah published" and "Waiting on Marcus Davis". Admin and board only.
- `application_scores_released(application)`: true once both scores are published (used by the scores rule).
- `open_direct_channel(person)`: opens or returns the direct chat with another admin or board member.
- `is_channel_member(channel)`: used by the chat rules.
- `log_sponsorship(...)`: saves a sponsorship and logs the same amount under that year's Sponsorships category, in
  one step ("Nobody logs it twice").
- `mark_award_funds_sent(award, date)`: ticks "Funds sent", sets the paid date and logs the amount under that year's
  Scholarships category, in one step. Refuses a second payment.
- `undo_budget_decision(p_plan_id)`: takes back an approval or a decline. The plan returns exactly to how it was
  before the decision (status, who sent it and when, decline note) and the decision stamp is cleared. Only the person
  who decided, or an admin. No time limit. Errors: `not_found`, `not_decided`, `not_allowed`. An approval can't be
  taken back with a plain update (`use_undo_budget_decision`); a declined plan sent again by its drafter is a real
  resubmission and is stamped with the new sender and time.
- Triggers: scores are checked and weighted automatically; approving or declining a quarter plan records who and
  when (and keeps the previous state for undo); ticking a task records who and when; recording an award creates its five steps.

## Seeded rows

Areas (4), task types (10), one chat channel per area (4), programs (Certification program, Mentorship program,
Sponsorships), outreach channels (Instagram, Newsletter, LinkedIn, Campus events; no targets or owners). No sample data:
no money figures, people, tasks or posts.

## The program plan import (D1)

Only the 2026 plan moves in, without MS-006 (fellowship partner onboarding) and MS-010 (CBC symposium): **7
milestones (MS-001, 002, 003, 004, 005, 007, 009) and their 11 tasks**. The 2021 plan and those two stay only in
`legacy.*`, which is not changed. The change stops unless exactly 7 and 11 arrive. On a brand-new local database the
`legacy` tables are empty, so nothing is imported and the count check is skipped.

Clean-ups: the code moves out of the name ("NSBE Travel Sponsorship (MS-001)" becomes name "NSBE Travel Sponsorship",
code "MS-001"); line breaks become spaces. Status: Complete = done, In progress = in progress, Not started = open.
Areas: outreach for MS-002 and 003; scholarships for 004, 007, 009; programs otherwise. Programs: MS-001 Sponsorships,
MS-005 Certification. Rows already imported (same `legacy_id`) are skipped on a second run.

## Checked before handing over (2026-10-12)

- Local Supabase stack (Postgres 17, `npx supabase db reset`): every migration on `master`, then this file and the
  journey file, apply cleanly in order. Both files were then run a second time on top: no errors.
- Import dry run on the local stack with stand-in legacy rows (9 milestones and 14 tasks for 2026): 7 and 11 imported,
  none archived, check passed.
- pgTAP tests in `supabase/tests/database/` (`npx supabase test db`): applications (staff read rules), interviews and
  decisions, money deletes, availability and scoring, no reviewer role, names visible to board members. All pass.
- Not run against the real project (that is the apply step).

## Check it worked (run in the SQL editor after applying)

```sql
-- 1. All tables in public have access rules on; 47 expected (7 Portal + 40 Ops Hub; 49 after the journey file).
select count(*), bool_and(relrowsecurity) from pg_class
where relnamespace = 'public'::regnamespace and relkind = 'r';            -- 47, true

-- 2. The import (D1).
select plan_year, count(*) from public.plan_milestones group by 1;        -- 2026: 7
select count(*) from public.tasks where legacy_id is not null;            -- 11

-- 3b. No blind review (D2): staff read submitted applications.
select policyname from pg_policies where tablename = 'applications' and cmd = 'SELECT';
-- applications_select_own, applications_select_staff

-- 3. No rule reads user_metadata.
select schemaname, tablename, policyname from pg_policies
where (coalesce(qual,'') || coalesce(with_check,'')) ilike '%user_meta%';  -- 0 rows

-- 4. Supabase's own checks.
-- Dashboard > Advisors > Security and Performance: no new errors.
```

### Role checks (as the database owner, pretending to be each person; nothing is saved)

Replace the ids with real ones once people have signed in, or keep the made-up ones: the checks still work.

```sql
-- Applicant: sees nothing, can't write, and a user_metadata "admin" changes nothing.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated",
  "app_metadata":{"role":"applicant"},"user_metadata":{"role":"admin"}}', true);
set local role authenticated;
select count(*) from public.staff_profiles;                         -- 0
select count(*) from public.tasks;                                  -- 0
insert into public.tasks (title, area) values ('x', 'money');       -- error: row-level security
rollback;

-- Signed out: no access at all.
begin;
set local role anon;
select count(*) from public.tasks;                                  -- error: permission denied
rollback;

-- Any role other than admin or board (D6): not staff, so nothing.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated",
  "app_metadata":{"role":"reviewer"}}', true);
set local role authenticated;
select public.is_staff();                                           -- false
select count(*) from public.areas;                                  -- 0
select count(*) from public.staff_profiles;                         -- 0
select count(*) from public.rubric_criteria;                        -- 0
select * from public.score_progress(gen_random_uuid());             -- error: not_allowed
rollback;

-- Board: full team access, but no admin setup.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000003","role":"authenticated",
  "app_metadata":{"role":"board"}}', true);
set local role authenticated;
select count(*) from public.chat_channels;                          -- 4
select count(*) from public.tasks where not archived;               -- 11 (the imported 2026 plan)
select count(full_name) from public.applications;                   -- every submitted application (D2)
delete from public.gifts;                                           -- DELETE 0 (money deletes are admin-only)
insert into public.areas (slug, name) values ('hack', 'Hack');      -- error: row-level security
rollback;

-- Admin: admin setup allowed.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000004","role":"authenticated",
  "app_metadata":{"role":"admin"}}', true);
set local role authenticated;
insert into public.areas (slug, name) values ('test_area', 'Test') returning slug;   -- works
rollback;
```

## Settled by the owner's decisions (2026-10-12)

The earlier draft's open questions are closed by D1 to D9 above: the import is 2026-only; no blind review (board
members see names); money deletes are admin-only; availability is per day and block; no votes table; no reviewer role;
the video link is per interview and the Portal reads it; no un-publish; staff are created server side.

Still true from the draft: post images, newsletter sending and subscriber numbers, and the calendar feed are not
stored yet. A staff profile can't be
removed while that person has a published score or an interview pair.

## How to roll back

Roll back the journey file first (it reads the Ops Hub tables). Then, in one transaction:

1. Put back the three Portal read rules from `20261009130000_portal_fresh_start.sql`:
   `applications_select_staff`, `application_files_select_staff` and the storage rule
   `applicant_documents_select_staff` (drop the new versions first), and drop `applications_select_admin`.
2. Drop the 3 views, the 40 tables (with `cascade`) and the functions this file creates (`scores_check`,
   `application_scores_released`, `score_progress`, `staff_directory`, `is_channel_member`, `open_direct_channel`,
   `budget_plan_stamp`, `undo_budget_decision`, `tasks_stamp_done`, `award_steps_create`, `log_sponsorship`,
   `mark_award_funds_sent`, `is_submitted_application`). Leave `is_staff()` as this file
   redefines it (admin or board, D6). The program plan stays safe in `legacy` either way. Any data entered in the
Ops Hub after applying would be lost, so back it up first.

---

# Interview flow (`20261013090300_interview_flow.sql`)

Drafted 2026-10-13. **Not applied.** Applied right after this file, the journey file and the email log, in the same
approval (none of the four is in production yet). One transaction, safe to run twice, ends with a check that rolls
everything back if a rule is broken.

**Owner's decisions (2026-10-12/13):** one staff role, board member (`admin` = with admin rights, `board` = without).
The new interview flow replaces the Morning / Afternoon / Evening blocks with free time ranges.

## What it changes

| Change | What it is | Who can do what |
|---|---|---|
| `board_free_ranges` (new) | A board member's free time on a day of the interview window, Eastern time, in minutes from midnight in half hours (9:00 = 540, end of day = 1440) | Staff read all; you add, change and remove your own; admins anyone's |
| `board_availability` (dropped) | The old blocks. It only ever existed in the unapplied Ops Hub file, so nothing is lost | |
| `board_interview_prefs` (new) | Per person and cycle: "Most N interviews" (blank = no limit, else 1 to 50), what they typed, when they pressed Send | Staff read all (admins see who has sent and each limit); you write your own; admins anyone's |
| `board_conflicts` (new) | "Students I know": names a board member types so they are kept off those interviews | **Only the writer** reads, adds or removes them. Admins cannot read them either |
| `interview_slots.opened_at` (new column) | Blank = a proposed time still under review; students never see it. Existing times are set as opened | Admins (the slot rules are unchanged) |
| `interview_questions` (new) | A cycle's interview questions, grouped by rubric criterion (blank = "To close", not scored). A criterion must be one of the cycle's rubric keys | Staff read; admins add, edit, remove and reorder |
| `interview_free_times.ranges`, `.said` (new columns) | The student's "None of these times work" answer as ranges per day (`[{"day":"2026-10-15","start":"18:00","end":"20:00"}]`) and what she typed. `days` and `windows` become optional; a row needs ranges or both of them | The Portal rules are unchanged |
| `ai_usage` (new) | How often each person used an AI feature on an Eastern day | Nobody but the service role; `ai_take()` writes it |

## Functions

- `open_interview_slots(cycle)`: now lists **opened** times only. Otherwise unchanged.
- `switch_booking(slot, note)`: refuses a time that is not opened (`slot_not_found`, as if it did not exist).
  Otherwise unchanged.
- `interview_candidates(slot, application)` returns `(user_id, interviews_so_far, free_minutes_left, display_name)`:
  the admin and board accounts who are free for the whole slot (one range covering it on its Eastern date), under
  their limit, not someone who listed this student, and not in another interview at an overlapping time. Ordered the
  way pairing picks: fewest interviews so far, then fewer free minutes left, then name A to Z.
  *Interviews so far* counts their pairs in the cycle (this slot's own left out). *Free minutes left* is their free
  minutes in the cycle from this slot's start on, minus 30 for each pair they hold from that point (never below 0):
  the person with less room later goes first. Admins, the service role and the bookings trigger only.
- `pick_interviewers(slot, application)`: the first two candidates (fewer when not enough).
- Trigger `bookings_auto_pair` on `bookings`: when a booking becomes active and its slot has no pair, the two picked
  people are paired (`paired_by` blank = automatic). With fewer than two, nothing is written and the Ops Hub shows
  "needs two interviewers". When a booking is released and nobody else holds the slot, the slot's pair is removed.
  It works the same for a student booking through `switch_booking()` and a server-side write.
- `conflicted_board_members(application)`: the board members who listed this applicant (same full name, or same first
  and last word, ignoring case, extra spaces and accents). Returns ids only, never names. Server side only.
- `normalize_person_name(text)`: the name tidy-up it uses. The file installs the `unaccent` extension when the server
  offers it; without it, accents are simply not ignored.
- `starter_questions()` and `seed_starter_questions(cycle)`: the 12 starter questions. The second is admin only, adds
  them to a cycle that has none (skipping criteria the rubric lacks) and returns how many it added; it refuses a cycle
  with no rubric (`rubric_missing`). The file itself adds them to every existing cycle that has a rubric.
- `ai_take(kind, daily_limit)`: signed-in users only. Counts one use of `kind` for the caller today (Eastern) and
  returns true, or returns false without counting once the limit is reached.

## Check it worked

```sql
select to_regclass('public.board_availability');                         -- null
select count(*) from public.interview_slots where opened_at is null;      -- 0 right after applying
select c.id, count(q.id) from public.cycles c
  join public.rubric_criteria r on r.cycle_id = c.id
  left join public.interview_questions q on q.cycle_id = c.id group by c.id;   -- 12 each
```

The pgTAP tests in `supabase/tests/database/04_interview_flow.test.sql` cover the rules, the candidates, the trigger
and `ai_take`.

## How to roll back

In one transaction: drop the trigger `bookings_auto_pair` and the functions `bookings_auto_pair`,
`pick_interviewers`, `interview_candidates`, `conflicted_board_members`, `normalize_person_name`,
`seed_starter_questions`, `starter_questions` and `ai_take`; put back `open_interview_slots` and `switch_booking` from
`20261013090100_portal_journey.sql`; drop the tables `board_free_ranges`, `board_interview_prefs`, `board_conflicts`,
`interview_questions` and `ai_usage`; drop `interview_slots.opened_at`, `interview_free_times.ranges` and `.said`
(first delete any rows that have no `days` and `windows`, then set those two back to not null). The old blocks table
comes back only by re-running the Ops Hub file's `board_availability` section.
