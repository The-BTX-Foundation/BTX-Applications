# Portal: Terpmail-only rule on the server

File: `20261010090000_portal_terpmail_rule.sql`. Drafted 2026-10-10. **Not applied.** Apply only after Dominick
approves it by naming the production project **awiaebtqalcmfafvktwh**. One transaction; safe to run twice.

## Why

Only the browser checks for `@terpmail.umd.edu` today. Anyone holding the public key can sign in through Supabase Auth
with any address, start an application and submit it. Once the custom email sender is on, that is open to anyone.

## What it changes

- **New table `portal_test_emails`**: non-Terpmail addresses allowed for testing previews (lower case). Nobody can read
  or change it from the app; it is filled by hand in the SQL editor. The migration adds **no** addresses (the repo is
  public).
- **New function `portal_email_allowed()`**: true when the signed-in email ends with `@terpmail.umd.edu` (any
  capitalisation) or is on that list. Signed-out callers can't run it.
- **Starting an application** now also needs an allowed address.
- **`submit_application`** now also needs one. New error: `terpmail_required`. Everything else in it is unchanged.
- **File uploads: no change needed.** Every upload rule already requires the person to own a draft application, and
  only allowed addresses can start one now.

Terpmail applicants see no difference.

## After applying: add the preview testers (by hand)

```sql
insert into public.portal_test_emails (email, note) values ('tester@example.com', 'preview tester');
```

Use the same addresses as `NEXT_PUBLIC_PORTAL_TEST_EMAILS` in Vercel. To remove one:
`delete from public.portal_test_emails where email = 'tester@example.com';`

## Check it worked

```sql
select policyname, with_check ilike '%portal_email_allowed%' from pg_policies
where tablename = 'applications' and policyname = 'applications_insert_own';      -- true

begin;   -- a gmail sign-in can't start an application
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000009","role":"authenticated",
  "email":"someone@gmail.com","app_metadata":{"role":"applicant"}}', true);
set local role authenticated;
select public.portal_email_allowed();                                    -- false
select count(*) from public.portal_test_emails;                          -- error: permission denied
rollback;
```

## Checked before handing over

Parsed with the Postgres 17 parser. A local dry run on Postgres 17 (PGlite), with the fresh start applied first and
this change applied twice, passed 14 of 14 checks:
- A Terpmail address can start, upload, submit, and submit again (it gets the same number back).
- A gmail address can't start, upload or submit.
- A listed gmail address can do all of it.
- Signed-out users can't do anything.
- Nobody can read the list.
- Look-alike domains are refused.

## Roll back

Re-run the `applications_insert_own` policy and `submit_application` from `20261009130000_portal_fresh_start.sql`
(with `drop policy if exists` / `create or replace`), then `drop function public.portal_email_allowed();` and
`drop table public.portal_test_emails;`.
