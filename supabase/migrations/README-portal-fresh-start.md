# Portal fresh start: what the database change does

File: `20261009130000_portal_fresh_start.sql`. Drafted 2026-10-09. **Not applied.**

It runs against the production Supabase project **awiaebtqalcmfafvktwh** ("BTX Student/Operations Hub"). It is applied
only after Dominick approves it by naming that project. It runs as one transaction: if any step fails, nothing changes.

## Why

The old Vue apps are retired and will not be used again (Dominick, 2026-10-09). Everything they used in the database is
test data, except BTX's real program plan. The old access rules also had a security hole: they read each person's role
from `user_metadata`, which any signed-in person can edit, so anyone could make themselves an admin. This change removes
the old parts, keeps the program plan, and sets up the new Scholarship Portal with roles stored where users can't edit
them.

## Backup taken first

- `supabase/backups/2026-10-09-before-reset.json` holds every row of every old table, plus the list of sign-in accounts
  (id, email, created date and role only; no passwords, no tokens).
- **It lives only on this computer, at that path.** The folder is in `.gitignore` and is never committed.
- **It contains test personal data. Do not publish or share it.**
- Row counts in it match the live database on 2026-10-09 (see the table below).

## What gets removed

**21 tables** (rows on 2026-10-09; all test data except the two program plan tables, which are copied first):

| Table | Rows | Table | Rows |
|---|---|---|---|
| tasks_alerts | 28 | program_plan_milestones | 24 (copied to legacy) |
| profiles | 4 | program_plan_tasks | 81 (copied to legacy) |
| donor_impact | 5 | scholarship_cycles | 1 |
| marketing_tasks | 34 | scholarship_applicants | 1 |
| budgeting_tasks | 7 | scholarship_interviews | 0 |
| fundraising_tasks | 7 | scholarship_scores | 2 |
| fundraising_health | 3 | scholarship_board_votes | 0 |
| program_plan_progress | 2 | scholarship_decisions | 1 |
| event_tracker_events | 1 | scholarship_board_availability | 20 |
| budget_tracking | 3 | scholarship_submit_attempts | 4 |
| grant_pipeline | 1 | | |

**3 views:** scholarship_staff_decisions, my_application_status, scholarship_applicant_directory.

**4 functions:** replace_board_availability, replace_program_plan_tasks, set_new_user_role_to_applicant,
set_scholarship_applicant_code. Also the leftover sequence `scholarship_applicant_code_seq`.

**Kept on purpose:** `rls_auto_enable`. It isn't from the old apps. It is Supabase's own helper behind the `ensure_rls`
setting, which switches on access rules for every new table automatically. Removing it would remove that safety net.

**1 trigger** on the sign-in accounts table: `set_new_user_role_to_applicant_trigger` (it wrote the role into
`user_metadata`). A new one replaces it.

**2 old file rules** on storage ("Give users authenticated access to folder 1r70ast_0" and "_1"). They let any
signed-in account read and upload in the documents bucket.

**The 9 test sign-in accounts**, deleted by exact email and nothing else: admin@test.btx, board@test.btx,
board2@test.btx, reviewer@test.btx, applicant@test.btx, dania@test.btx, claude-sign-in-test@terpmail.umd.edu,
claude-width-test@terpmail.umd.edu, dlittleton@bookyachtsy.com. If the count isn't exactly 9 when it runs, the whole
change stops and nothing is applied. Dominick and staff sign in fresh afterwards and get their roles set again (below).

## What's kept, and where

BTX's real program plan (2021: 15 milestones and 67 tasks; 2026: 9 milestones and 14 tasks) is copied, every column
and row, into a new schema called **`legacy`**: `legacy.program_plan_milestones` and `legacy.program_plan_tasks`.
Nobody can read them through the apps. Only the service role (the server-side key) can read them, and nothing can
write to them. The change checks the copy is complete before it removes anything. When the future Ops Hub imports
them, it reads them with the service key (add `legacy` to the API's exposed schemas then, or read it through a
database connection).

## Roles, now

- A person's role is stored in `app_metadata`, which only the server can change. Users can still edit their own
  `user_metadata`, but nothing reads it anymore.
- Every new account starts as `applicant`. A new trigger sets that and strips any `role` someone tries to sneak into
  `user_metadata` at sign-up.
- Staff roles (`admin`, `board`, `reviewer`) are set only with the service key, after the person has signed in once:
  Supabase Admin API `updateUserById(id, { app_metadata: { role: 'admin' } })`, or in SQL as the database owner:
  `update auth.users set raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}' where email = '...';`
- A role change takes effect when the person's sign-in refreshes (within an hour, or right away after signing out and
  in again).
- Every access rule calls `public.app_role()` (or `public.is_staff()` = admin, board or reviewer).

## New tables, and who can do what

| Table | What it holds | Who can do what |
|---|---|---|
| `cycles` | One row per semester: award name and amount (in cents), opening time, deadline (date and hour), interview dates, decision date, next cycle's month, essay prompt and how it's used, requirements list, photo/story due date, how it's paid, meet-the-board event on/off and date, sign-in code lifetime, status (draft / published / archived) | Anyone, even signed out, reads published and archived cycles (the landing needs them). Staff also read drafts. Only admins create, edit or delete. A cycle can't be published while the name, amount, opening date, deadline or essay prompt is empty. Only one cycle can be published at a time. Open or closed is worked out from the opening time and deadline. |
| `applications` | One per applicant per cycle: every answer from the 5 steps (name, phone, secondary email, gender, race, how they heard, year, credits left, major, certification and mentoring interest, essay, stay-in-touch, "my answers are true"), the step she's on, draft or submitted, the application number, submitted time | An applicant creates her own draft (only while the cycle is open), reads her own application, and edits it only while it's a draft. She can't set the status, submitted time or number herself. Staff read submitted applications, never drafts. Nobody but the service key deletes. |
| `application_files` | The resume and transcript: which kind, where it's stored, file name, size, upload time. One of each per application. | An applicant reads her own; adds, replaces and removes only while her application is a draft, and only in her own folder. Staff read files of submitted applications. |
| `notify_signups` | "Email me when applications open / when the next cycle opens" addresses, with the cycle and which kind | Nobody writes directly. Signed-out visitors call `request_cycle_email(email, kind)`, which checks the address and saves it (one row per address; asking again refreshes it). Only admins read the list. |
| `interview_slots` | Interview times for a cycle; each holds one interview | Signed-in users read them. Only admins add, change or remove them. |
| `bookings` | Which submitted application holds which slot; released ones stay as history | An applicant reads her own; staff read all. Nobody writes directly: only `switch_booking`. |
| `application_code_counters` | The last application number used per year | Nobody but the database functions. |

### Functions

- `submit_application(application_id)`: the only way an application becomes submitted. Checks she owns it, the cycle is
  open and before its deadline, every required answer is filled, both PDFs are uploaded and "My answers are true" is
  ticked. Then it marks it submitted, stamps the time and gives it the next number for that year (`APP-2026-00001`,
  `APP-2026-00002`, ...). It returns the number. Submitting twice returns the same number. Error messages the app can
  turn into screen text: `not_found`, `cycle_closed`, `missing_answers:<fields>`, `missing_files`, `not_agreed`.
- `switch_booking(new_slot)`: books the slot for her submitted application. If she already holds a slot, it books the new
  one and releases the old one in the same step, so two students can never hold one slot. Returns `booked`, `switched`,
  `unchanged`, or `taken` (someone else has it; she keeps her old time and sees "was just taken").
- `request_cycle_email(email, kind)`: saves a landing-page address; `kind` is `applications_open` or `next_cycle`.
- `app_role()`, `is_staff()`: read the role for the access rules.

### Files (storage)

The `applicant-documents` bucket stays private. Files go at `{user id}/{application id}/{file name}.pdf`. An applicant
can upload, read, replace and delete only in her own folder and only while that application is a draft. Staff can read
files of submitted applications. The bucket itself also refuses files over 10 MB or not PDF (as it does today); the app
checks size and type first so the applicant sees a clear message.

## Edge Functions to delete afterwards (by hand)

SQL can't remove these. After the change is applied they point at tables that no longer exist. Delete all 13 in the
Supabase dashboard (Edge Functions page), and remove their folders from `supabase/functions/` in the repo:

1. sync-donor-impact
2. sync-fundraising-health
3. sync-program-plan-progress
4. sync-event-tracker-events
5. sync-budget-tracking
6. sync-grant-pipeline
7. sync-program-plan-milestones
8. sync-program-plan-tasks
9. save-board-availability
10. run-interview-pairing
11. submit-application
12. save-score
13. cast-vote (deployed only; it has no folder in the repo)

Also switch off the Google Sheets side that calls the `sync-*` functions, so it stops logging errors.

## Check it worked (run in the SQL editor after applying)

```sql
-- 1. Only the Portal's tables are left in public, all with access rules on.
select relname, relrowsecurity from pg_class
where relnamespace = 'public'::regnamespace and relkind = 'r' order by 1;
-- expect: application_code_counters, application_files, applications, bookings, cycles,
--         interview_slots, notify_signups; all true

-- 2. The program plan is safe.
select plan_year, count(*) from legacy.program_plan_milestones group by 1 order by 1;  -- 2021: 15, 2026: 9
select plan_year, count(*) from legacy.program_plan_tasks group by 1 order by 1;       -- 2021: 67, 2026: 14

-- 3. No access rule reads user_metadata.
select schemaname, tablename, policyname from pg_policies
where (coalesce(qual,'') || coalesce(with_check,'')) ilike '%user_meta%';             -- expect 0 rows

-- 4. The test accounts are gone.
select count(*) from auth.users;                                                       -- expect 0 (until people sign in)

-- 5. Every policy, one line each.
select schemaname, tablename, policyname, cmd, roles from pg_policies
where schemaname in ('public','storage') order by 1, 2, 3;
```

**Escalation test** (the security hole must be closed). Sign in on a preview as a normal Terpmail test account, then in
the browser console (or a small script with the anon key and that session):

```js
await supabase.auth.updateUser({ data: { role: 'admin' } });   // edits user_metadata: allowed, but must do nothing
await supabase.auth.refreshSession();
(await supabase.auth.getSession()).data.session.user.app_metadata.role;  // expect 'applicant'
await supabase.from('notify_signups').select('*');                       // expect [] (admins only)
await supabase.from('cycles').insert({ term: 'Hack', year: 2026 });      // expect a permission error
await supabase.from('applications').select('*');                         // expect only her own row(s)
```

The same test in SQL, as the database owner, pretending to be that user:

```sql
begin;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated",
    "app_metadata":{"role":"applicant"},"user_metadata":{"role":"admin"}}', true);
select public.app_role();                                 -- expect 'applicant'
select count(*) from public.notify_signups;               -- expect 0 (no rows visible)
insert into public.cycles (term, year) values ('Hack', 2026);   -- expect: new row violates row-level security policy
rollback;
```

## How to roll back

There is no automatic undo: the old tables are gone once this is applied. To bring the data back:

1. The program plan is already in `legacy.program_plan_milestones` and `legacy.program_plan_tasks`. Copy it back with
   `create table public.program_plan_milestones as select * from legacy.program_plan_milestones;` (and the same for tasks).
2. The old table definitions are in the old migration files in `supabase/migrations/` (2026-08-14 to 2026-10-02, still
   in git history). Re-run them on a branch database first.
3. The old rows are in the local backup `supabase/backups/2026-10-09-before-reset.json`; load each table's rows with
   `insert into ... select * from jsonb_populate_recordset(null::public.<table>, '<rows json>')`.
4. The 9 test accounts are not restorable (no passwords were kept). Make new test accounts if needed.

If the change fails partway while applying, nothing is changed: it is one transaction. One step that could fail on
Supabase: removing the old trigger on the sign-in accounts table needs owner rights on that table. If it fails, the
message names the trigger; nothing is applied, and the fix is to run that one `drop trigger` from the dashboard's SQL
editor (which runs with higher rights) and apply again.

## Still to build (week 2, after launch)

- Which interview times are still free, for the booking page (a function that lists open slots without showing who
  booked the others).
- The booking deadline ("Schedule by [date]") as a cycle setting, and a check in `switch_booking` against it.
- Board availability, pairing two board members per interview, scores, the decision and votes.
- Award and decline pages, photo and story, payment.
- More application statuses after submitted (interview booked, decided), and staff actions on applications.
- A rate limit on `request_cycle_email` (today: address check and one row per address only).
- Restricting applicant sign-up to `@terpmail.umd.edu` in the database too (today the app enforces it).
- The Ops Hub's "Cycle settings" screen that edits `cycles`.
