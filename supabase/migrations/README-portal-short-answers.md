# Portal short answers: what the database change does

File: `20261012120000_portal_short_answers.sql`. Drafted 2026-10-12. **Not applied.**

It runs against the production Supabase project **awiaebtqalcmfafvktwh** ("BTX Student/Operations Hub"). It is applied
only after Dominick approves it by naming that project. It runs as one transaction: if any step fails, nothing changes.

**Apply it BEFORE the Portal code merges.** The new step 3 saves `answer_1`, `answer_2` and `answer_3`. Until those
columns exist, every save on step 3 fails and nobody can submit.

## Why

Step 3 of the application was one optional essay, with the prompt set per cycle. It is now three required short-answer
questions, up to 250 words each. The questions are the same every cycle, so they live in code
(`packages/data/src/questions.ts`, `SHORT_ANSWER_QUESTIONS`), where the Portal and later the Ops Hub both read them.

## What it changes

- **`applications`**: three new columns, `answer_1`, `answer_2`, `answer_3` (text, at most 2,500 characters each). The
  250-word limit is checked in the Portal; the database only caps characters.
- **Who can write them**: applicants get insert and update rights on the three columns. The existing access rules
  still limit them to their own draft.
- **Publishing a cycle**: a cycle no longer needs an essay prompt to be published. It still needs the award name,
  amount, opening date and deadline.
- **`submit_application`**: the same as the live version (read 2026-10-12), plus three checks. A blank answer stops the
  submit with `missing_answers:answer_1,answer_2,answer_3` (only the blank ones are listed). The Portal turns these into
  "Short answers: answer question 2." links on the review page.
- **Old columns**: `applications.essay`, `cycles.essay_prompt` and `cycles.essay_use` stay, with a note that they are
  unused since 2026-10-12. A later cleanup migration drops them. Nothing is removed here.

## Watch out: the unapplied Terpmail draft

The draft `20261010090000_portal_terpmail_rule.sql` (branch `db/portal-terpmail`, not applied) also replaces
`submit_application`. Before that draft is applied, update its function body to keep the three answer checks from this
file. Otherwise applying it removes them and applications can be submitted with blank answers.

## Check it worked (run in the SQL editor after applying)

```sql
-- 1. The three columns and their limits.
select conname, pg_get_constraintdef(oid) from pg_constraint
where conrelid = 'public.applications'::regclass and conname like 'applications_answer_%';   -- expect 3 rows, <= 2500

-- 2. The publish rule no longer mentions essay_prompt.
select pg_get_constraintdef(oid) from pg_constraint where conname = 'cycles_published_needs_settings';

-- 3. The submit function checks the answers.
select prosrc ilike '%answer_3%' from pg_proc where proname = 'submit_application';            -- expect true
```

## How to roll back

Run, in one transaction: re-create `submit_application` from this file's body minus the three `answer_` lines (that is
the live version from before this change), put back the old publish rule (add `and essay_prompt is not null`), and drop the three
columns. Dropping the columns deletes any answers saved in them, so only roll back before applicants start using step 3.
