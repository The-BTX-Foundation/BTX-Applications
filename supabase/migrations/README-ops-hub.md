# Ops Hub database change: what it does

File: `20261013090000_ops_hub.sql` (was `20261010120000_ops_hub.sql` on branch `db/ops-schema`; renamed so it sorts
after the short-answers migration). Drafted 2026-10-10, reconciled with the live schema 2026-10-12. **Not applied.**

It runs against the production Supabase project **awiaebtqalcmfafvktwh** ("BTX Student/Operations Hub"), after the
Portal fresh start (`20261009130000`) and the short answers (`20261012120000`), both applied. It is applied only after
Dominick approves it by naming that project. It runs as one transaction: if any step or the final check fails, nothing
changes. It is **safe to run twice** (`if not exists`, `create or replace`, every policy and trigger dropped first,
seed rows `on conflict do nothing`).

It **adds** the Ops Hub. It **changes three Portal read rules** for blind review (D2, below): the staff read rule on
`applications`, the staff read rule on `application_files`, and the staff read rule on the `applicant-documents`
storage bucket. The `legacy` schema is read, not changed.

## Owner's decisions applied (2026-10-12)

- **D1 Program plan:** only the 2026 plan moves in, without MS-006 and MS-010: 7 milestones, 11 tasks. The 2021 plan,
  MS-006 and MS-010 stay only in the `legacy` backup (the earlier draft imported them all as archived rows).
- **D2 Blind review is a database rule.** Board members and reviewers read applications through the view
  `application_reviews` (application number, initials "A.O.", year, credits left, major, program interests, the three
  short answers, submit time) and still see the resume and transcript. Only admins read the `applications` table
  itself (full name, Terpmail and secondary email, phone, gender, race, "how did you hear"). See "Blind review" below.
- **D3 Money deletes are admin-only:** budget years, categories, quarter plans and plan lines, spending, funds on hand,
  donors, gifts, grants and sponsorships (a sponsorship's delete also deletes its spending). Board members still read,
  add and edit them.
- **D4 Availability is Morning / Afternoon / Evening per day,** given before interview times exist:
  `board_availability` is now (cycle, person, day, block), not (slot, person).
- **D5 No votes table.** A tie vote is written in the award's `decision_note`.
- **D6 Reviewers score only** (as drafted).
- **D7 Video link per interview:** `interview_pairings.video_url`, set by an admin when pairing. The Portal reads it
  through `my_interview` (journey file).
- **D8 No "unpublish score"** in the app (as drafted: only the service key can).
- **D9 Staff are created by an admin from the Ops Hub,** server side with the service key, role set in `app_metadata`
  at creation. No schema change: admins may already insert anyone's `staff_profiles` row.

## Who can do what

Taken from the signed-off "People and roles" screen: *admins and board members can do everything, from tasks and chat
to scoring and budget approvals; only admins change roles; no one changes their own.*

| Role | Can |
|---|---|
| **admin** | Everything below, plus the admin-only setup: areas, task types, the scoring rubric, interviewer pairing and video links, area chat channels, other people's profiles. |
| **board** | Everything an admin can, except that admin-only setup and deleting money records (D3). Reads applications blind (D2). |
| **reviewer** | Scoring only: their own profile, the staff list, the rubric, the blind application view, summaries of the applications they interview, their own scores and private notes, and tasks assigned to them. No chat, money, programs, outreach, calendar, goals or availability. |
| **applicant / signed out** | Nothing in this change. |

Every rule reads the role only through `public.app_role()` or `public.is_staff()` (from `app_metadata`, which only
the server can write). Nothing reads `user_metadata`. Roles are still changed with the service key (Admin API), never
from the app's own database calls.

"admin + board" below means: read, add, edit and delete all rows.

## Tables (40), one line each

| Table | What it holds | Who reads / writes | Screen |
|---|---|---|---|
| `staff_profiles` | Name, title, initials per staff member (role is NOT here) | All staff read. You add and edit your own; admins anyone's; admins delete | People and roles, every avatar |
| `areas` | Scholarships, Money, Programs, Outreach (seeded) | All staff read; admins write | Sidebar, area pills |
| `task_types` | Task, Request, Approval, Post, Scoring, Meeting, Decision, Document, Goal, Follow-up (seeded) | All staff read; admins write | The line under each task title |
| `checklists` | A named list of steps tied to a cycle, program, quarter plan, post or meeting (steps are tasks) | admin + board | Cycle checklist, Q4 budget, Setup checklist, Year-end giving, Getting started with grants, Where it stands, Post checklist, Selection agenda |
| `plan_milestones` | Plan milestones by year (code, name, area, program, due, done, archived) | admin + board | Programs pages, Calendar |
| `tasks` | Every task and checklist step: type, area, status, due, note, group owner, links to cycle / application / milestone / grant / checklist | admin + board; reviewers read and update tasks assigned to them | Today, Tasks, every checklist |
| `task_assignees` | Who owns a task (one or more people) | admin + board; reviewers read their own rows | Owner column |
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
| `board_availability` | Morning / Afternoon / Evening blocks per day a board member is free, per cycle (D4) | admin + board read; you add and remove your own; admins anyone's | Interviews "Your availability", Today "Add times" |
| `interview_pairings` | The two interviewers for a slot, and the video link | admin + board read; a reviewer reads pairs they are in; **admins only** write | Interviews, "Re-run pairing", "Add the video links" |
| `interview_summaries` | Shared interview summary, quotes, length | admin + board; a reviewer reads summaries of applications they interview; admins and that application's two interviewers write | Scoring "Interview notes", Applicants, Selection |
| `scores` | One score per interviewer per application: picks per criterion (jsonb), weighted score, published | See "Scores" below | Scoring, Applicants, Selection |
| `score_private_notes` | "Your private notes" | The writer only | Scoring |
| `scholarship_awards` | Each award decision (main or extra, amount, who decided, decision note incl. a tie vote), letter / accepted / paid dates; also past awards entered by hand | admin + board | Selection, Awardees, Goals chart |
| `award_steps` | The five awardee steps per award (created automatically) | admin + board | Awardees "Awardee steps" |

**Scores.** You always see your own score. You can change it while it is a draft; publishing needs all criteria and
then locks it. You can only score an application you interview (you are one of the pair on its booked slot). Admin and
board see other people's scores only after **both** interviewers have published ("Scores stay private until both
interviewers publish"). Reviewers never see other people's scores.

### Blind review (D2)

Everyone signed in is the same database role, so a column rule can't tell a board member from an admin. So:

- `applications`: the staff read rule (`applications_select_staff`) is replaced by `applications_select_admin`.
  Applicants still read their own (unchanged).
- `blind_applications(application id or null)`: security definer; returns the blind columns of submitted
  applications to staff, nothing to anyone else.
- `application_reviews`: a security-invoker view over it. **The Ops Hub must read this instead of `applications`**
  (today `apps/ops/lib/applicants.ts` on `ops/hub` reads `applications.full_name`; for a board member that now returns
  no rows).
- `is_submitted_application(id)`: true/false only; the staff file rules use it, so board members keep seeing the
  resume and transcript.
- The score check and "Funds sent" read the application through `blind_applications`, so they work for board members.
- Not blind: file names. A PDF named "Ada_Okafor_resume.pdf" shows the name. The Portal could rename uploads.

### Views (all "security invoker": they only show what your own rules allow)

- `application_score_summary`: published count and combined score per application.
- `budget_category_totals`: budget, spent so far, and each quarter's plan per category.
- `chat_unread_counts`: your unread messages per channel.
- `application_reviews`: the blind application list (D2).

### Functions

- `blind_applications(id)`, `is_submitted_application(id)`: blind review (D2).
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
- pgTAP tests in `supabase/tests/database/` (`npx supabase test db`): applications and blind review, interviews and
  decisions, money deletes, availability and scoring. All pass.
- Not run against the real project (that is the apply step).

## Check it worked (run in the SQL editor after applying)

```sql
-- 1. All tables in public have access rules on; 47 expected (7 Portal + 40 Ops Hub; 49 after the journey file).
select count(*), bool_and(relrowsecurity) from pg_class
where relnamespace = 'public'::regnamespace and relkind = 'r';            -- 47, true

-- 2. The import (D1).
select plan_year, count(*) from public.plan_milestones group by 1;        -- 2026: 7
select count(*) from public.tasks where legacy_id is not null;            -- 11

-- 3b. Blind review (D2): no staff-wide read rule on applications.
select policyname from pg_policies where tablename = 'applications' and cmd = 'SELECT';
-- applications_select_admin, applications_select_own

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

-- Reviewer: rubric and staff list yes; chat, money, tasks no.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated",
  "app_metadata":{"role":"reviewer"}}', true);
set local role authenticated;
select count(*) from public.areas;                                  -- 4
select count(*) from public.chat_channels;                          -- 0
select count(*) from public.budget_categories;                      -- 0
select count(*) from public.tasks;                                  -- 0 (unless assigned)
select * from public.score_progress(gen_random_uuid());             -- error: not_allowed
rollback;

-- Board: full team access, but no admin setup.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000003","role":"authenticated",
  "app_metadata":{"role":"board"}}', true);
set local role authenticated;
select count(*) from public.chat_channels;                          -- 4
select count(*) from public.tasks where not archived;               -- 11 (the imported 2026 plan)
select count(*) from public.applications;                           -- 0 (blind review: use application_reviews)
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

The earlier draft's open questions are closed by D1 to D9 above: the import is 2026-only; blind review is enforced by
the database; money deletes are admin-only; availability is per day and block; no votes table; reviewers score only;
the video link is per interview and the Portal reads it; no un-publish; staff are created server side.

Still true from the draft: post images, newsletter sending and subscriber numbers, and the calendar feed are not
stored yet. A reviewer can edit any field of a task assigned to them, not just tick it. A staff profile can't be
removed while that person has a published score or an interview pair.

## How to roll back

Roll back the journey file first (it reads the Ops Hub tables). Then, in one transaction:

1. Put back the three Portal read rules from `20261009130000_portal_fresh_start.sql`:
   `applications_select_staff`, `application_files_select_staff` and the storage rule
   `applicant_documents_select_staff` (drop the new versions first), and drop `applications_select_admin`.
2. Drop the 4 views, the 40 tables (with `cascade`) and the functions this file creates (`scores_check`,
   `application_scores_released`, `score_progress`, `staff_directory`, `is_channel_member`, `open_direct_channel`,
   `budget_plan_stamp`, `undo_budget_decision`, `tasks_stamp_done`, `award_steps_create`, `log_sponsorship`,
   `mark_award_funds_sent`, `blind_applications`, `is_submitted_application`). The program plan stays safe in `legacy` either way. Any data entered in the
Ops Hub after applying would be lost, so back it up first.
