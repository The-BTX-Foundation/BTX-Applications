# BTX Platform

Monorepo for the BTX Foundation's two web apps, backed by a shared Supabase project.

## Apps

- `btx-frontend/` — **Ops Hub**: staff-facing dashboard (budgeting, fundraising, marketing, event tracking, program planning, scholarship review). See `btx-frontend/README.md`.
- `btx-frontend-portal/` — **Scholarship Portal**: public-facing application wizard for scholarship applicants, plus a staff preview. See `btx-frontend-portal/README.md`.
- `supabase/` — shared database migrations and Edge Functions used by both apps.

## Backend

Both apps talk to the same Supabase project via `@supabase/supabase-js`, using only the publishable (anon) key — all data access is enforced by Row Level Security policies defined in `supabase/migrations/`. The service role key is only ever used server-side, inside Edge Functions (`supabase/functions/`), and is never checked into this repo.

## Deploy

Each app is deployed to Vercel as its own project:
- The root `vercel.json` builds `btx-frontend` (Ops Hub).
- `btx-frontend-portal/vercel.json` builds the Portal as a separate project (Vercel "Root Directory" set to `btx-frontend-portal`).

## Roles

Every signed-in user's role lives in their Supabase Auth `user_metadata.role` and is read both by RLS policies (`auth.jwt() -> 'user_metadata' ->> 'role'`) and by application code. Known roles: `admin`, `board`, and `reviewer` (Ops Hub staff), and `applicant` (Portal, the default for self-service accounts).

## Code comments

Every function, and every non-obvious or RLS-dependent block, should have a short comment above it — see `CLAUDE.md`.
