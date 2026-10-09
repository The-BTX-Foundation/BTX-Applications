# Ops Hub database change: what it does

File: `20261010120000_ops_hub.sql`. Drafted 2026-10-10. **Not applied.**

It runs against the production Supabase project **awiaebtqalcmfafvktwh** ("BTX Student/Operations Hub"), after the
Portal fresh start (`20261009130000_portal_fresh_start.sql`, applied 2026-10-09). It is applied only after Dominick
approves it by naming that project. It runs as one transaction: if any step or the final check fails, nothing changes.

It only **adds**. No Portal table, rule or function is changed or removed. The `legacy` schema is read, not changed.

## Who can do what

Taken from the signed-off "People and roles" screen: *admins and board members can do everything, from tasks and chat
to scoring and budget approvals; only admins change roles; no one changes their own.*

| Role | Can |
|---|---|
| **admin** | Everything below, plus the admin-only setup: areas, task types, the scoring rubric, interviewer pairing and video links, area chat channels, other people's profiles. |
| **board** | Everything an admin can, except that admin-only setup. |
| **reviewer** | Scoring only: their own profile, the staff list, the rubric, summaries of the applications they interview, their own scores and private notes, and tasks assigned to them. No chat, money, programs, outreach, calendar or goals. |
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
| `budget_years` | One row per budget year | admin + board | Money > Budget period |
| `budget_categories` | Categories with the year's budget; `kind` marks the Scholarships / Sponsorships / ... line automatic spending goes to | admin + board | Budget by category |
| `budget_quarter_plans` | A quarter's plan and its approval (draft, awaiting approval, approved, declined, decline note, who decided and when) | admin + board | "Approve $4,830 for Q4", decline form |
| `budget_quarter_plan_lines` | The plan's amount per category | admin + board | Q4 plan column |
| `spending_entries` | Spending ("Log spending"), plus what sponsorships and award payments log automatically | admin + board | Recent spending, Spent so far |
| `funds_snapshots` | "Funds on hand" updates (amount, date, who) | admin + board | Funds on hand |
| `donors` | Donor name, email, kind, notes (personal data) | admin + board | Recent gifts |
| `gifts` | Gifts: date, amount, source, monthly or not, donor, grant | admin + board | Fundraising (all totals are counted from these) |
| `grants` | Grant name, funder, amount (or "up to"), stage, outcome, deadline, next step, owner | admin + board | Money > Grants |
| `programs` | The three programs (seeded): status, summary, pilot budget, students, cost each | admin + board | Programs pages |
| `certification_ideas` | Certification ideas, who suggested them, decided or not | admin + board | Certification ideas |
| `sponsorships` | One-off sponsorships (what for, students, amount, when) | admin + board | Programs > Sponsorships |
| `outreach_channels` | Instagram, Newsletter, LinkedIn, Campus events (seeded): target, status, owner | admin + board | Outreach plan |
| `posts` | Social posts: channel, title, date, owner, caption, image, status | admin + board | Instagram, Outreach plan |
| `newsletter_issues` | An issue: title, send date, intro, owner, status | admin + board | Newsletter |
| `newsletter_sections` | An issue's sections (they are its checklist): owner, status, "waits for" date | admin + board | Newsletter, email preview |
| `rubric_criteria` | A cycle's scoring criteria and weights | All staff read; admins write | Scoring |
| `board_availability` | Which interview slots each board member can take | admin + board read; you add and remove your own; admins anyone's | Interviews "Your availability", Today "Add times" |
| `interview_pairings` | The two interviewers for a slot, and the video link | admin + board read; a reviewer reads pairs they are in; **admins only** write | Interviews, "Re-run pairing", "Add the video links" |
| `interview_summaries` | Shared interview summary, quotes, length | admin + board; a reviewer reads summaries of applications they interview; admins and that application's two interviewers write | Scoring "Interview notes", Applicants, Selection |
| `scores` | One score per interviewer per application: picks per criterion (jsonb), weighted score, published | See "Scores" below | Scoring, Applicants, Selection |
| `score_private_notes` | "Your private notes" | The writer only | Scoring |
| `scholarship_awards` | Each award decision (main or extra, amount, who decided), letter / accepted / paid dates; also past awards entered by hand | admin + board | Selection, Awardees, Goals chart |
| `award_steps` | The five awardee steps per award (created automatically) | admin + board | Awardees "Awardee steps" |

**Scores.** You always see your own score. You can change it while it is a draft; publishing needs all criteria and
then locks it. You can only score an application you interview (you are one of the pair on its booked slot). Admin and
board see other people's scores only after **both** interviewers have published ("Scores stay private until both
interviewers publish"). Reviewers never see other people's scores.

### Views (all "security invoker": they only show what your own rules allow)

- `application_score_summary`: published count and combined score per application.
- `budget_category_totals`: budget, spent so far, and each quarter's plan per category.
- `chat_unread_counts`: your unread messages per channel.

### Functions

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
- Triggers: scores are checked and weighted automatically; approving or declining a quarter plan records who and
  when; ticking a task records who and when; recording an award creates its five steps.

## Seeded rows

Areas (4), task types (10), one chat channel per area (4), programs (Certification program, Mentorship program,
Sponsorships), outreach channels (Instagram, Newsletter, LinkedIn, Campus events; no targets or owners). No sample data:
no money figures, people, tasks or posts.

## The program plan import

Every row of `legacy.program_plan_milestones` (24) and `legacy.program_plan_tasks` (81) is copied into
`plan_milestones` and `tasks`, **with its year kept** (2021: 15 milestones and 67 tasks; 2026: 9 and 14).
`legacy.*` stays as it is.

Dominick decided on 2026-10-07 (`apps/SHEETS-SYNC.md`) that only the 2026 plan moves into the app, and that the
fellowship partner onboarding (MS-006) and the CBC symposium (MS-010) stay out unless they are real programs. So those
rows are imported with **`archived = true`**: hidden on every screen, still in the database, and brought back by
changing one flag. What shows: 7 milestones (MS-001, 002, 003, 004, 005, 007, 009) and their 11 tasks.

Clean-ups: the code moves out of the name ("NSBE Travel Sponsorship (MS-001)" becomes name "NSBE Travel Sponsorship",
code "MS-001"); line breaks in the 2021 names become spaces. Status: Complete = done, In progress = in progress, Not
started = open. Each milestone gets an area (outreach for MS-002 and 003; scholarships for 004, 007, 009, 010; money for
the 2021 fundraisers; programs otherwise) and, where it fits, a program (MS-001 Sponsorships, MS-005 Certification, the
2021 mentorship milestones Mentorship). The change stops if the counts don't match.

## Checked before handing over

- Every statement and every PL/pgSQL body parses with the Postgres 17 parser (`@libpg-query/parser` 17.8.0): 193
  statements, 12 PL/pgSQL bodies, 0 errors.
- Dry run on a local Postgres 17 (PGlite) with a stand-in for Supabase's `auth` and `storage`, the exact 24 live
  milestone names and the live task counts: the fresh start and then this change both applied, and 47 of 47
  role checks passed (the same checks as below, plus chat, money and award flows).
- Not run against the real project (that is the apply step).

## Check it worked (run in the SQL editor after applying)

```sql
-- 1. All tables in public have access rules on; 47 tables expected (7 Portal + 40 Ops Hub).
select count(*), bool_and(relrowsecurity) from pg_class
where relnamespace = 'public'::regnamespace and relkind = 'r';            -- 47, true

-- 2. The import.
select plan_year, count(*), count(*) filter (where not archived) from public.plan_milestones group by 1 order by 1;
-- 2021: 15, 0   2026: 9, 7
select count(*), count(*) filter (where not archived) from public.tasks where legacy_id is not null;   -- 81, 11

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

## What I was unsure of (for Dominick)

1. **The legacy import.** The brief said import both years; the 2026-10-07 decision said only 2026 (minus MS-006 and
   MS-010) moves in. I did both: everything is imported with its year, and the rows the decision leaves out are
   archived (hidden). If you'd rather not have the 2021 rows in the app at all, delete the archived rows after
   applying, or I drop them from the import.
2. **Blind review isn't enforced by the database.** The Portal rule already lets every staff member read submitted
   applications in full (name, email, phone), so "applicants show as a code and initials" is only the app's
   choice. Making it a database rule means changing a Portal rule. That is a separate, small change for later.
3. **Board can delete anything in the team areas** (a gift, a grant, someone else's task). That follows "board can do
   everything". If deletes should be admin-only, it is a one-line change per table.
4. **Availability is per interview slot**, as the brief asked. The Figma grid shows Morning / Afternoon / Evening
   blocks; the app will group slots into those blocks. If availability is given before the slots exist, it needs a
   blocks table instead.
5. **Tie votes** ("a tie goes to a vote") have no table; the decision note on the award records the outcome. Add a
   votes table only if the board wants each vote recorded.
6. **Reviewers**: the current People screen shows only admin and board, but the role still exists. I gave reviewers
   scoring only. A reviewer can edit any field of a task assigned to them, not just tick it.
7. **Not stored yet**: post images (needs a storage bucket), newsletter subscriber numbers and sending (an email
   tool), the "Add the BTX calendar to Google Calendar" feed, and the Portal reading its own video link (needs a small
   function for applicants, since pairings are staff-only).
8. **Scores can't be un-published** from the app; only the service key can. Say if an admin should be able to.
9. **Profiles**: a staff member creates their own profile on first sign-in. Their role must already be set in
   `app_metadata`. Removing a profile is blocked while that person has a published score or an interview pair.

## How to roll back

Nothing outside this change depends on it yet. To undo: drop the 3 views, the 40 tables (with `cascade`) and the
functions this file creates (`scores_check`, `application_scores_released`, `score_progress`, `staff_directory`,
`is_channel_member`, `open_direct_channel`, `budget_plan_stamp`, `tasks_stamp_done`, `award_steps_create`,
`log_sponsorship`, `mark_award_funds_sent`). The program plan stays safe in `legacy` either way. Any data entered in the
Ops Hub after applying would be lost, so back it up first.
