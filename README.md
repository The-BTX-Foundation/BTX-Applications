# BTX Platform

Monorepo for the BTX Foundation's two web apps, backed by one shared Supabase project.

## Apps

- **`btx-frontend/`** — **Ops Hub**: staff-facing dashboard (budgeting, fundraising, marketing, event tracking, program planning, scholarship review). A standalone Vue/Vite app with its own `package.json`.
- **`btx-frontend-portal/`** — **Scholarship Portal**: public-facing application wizard for scholarship applicants, plus a staff preview of that flow. Also a standalone Vue/Vite app with its own `package.json`.
- **`supabase/`** — the database migrations and Edge Functions shared by both apps above.

Each app is its own npm project — `cd` into it before running `npm install`/`npm run ...`; there is no root-level `package.json`.

## Prerequisites

- Node matching the `engines` field in each app's `package.json` (currently `^22.18.0 || >=24.12.0`)
- npm
- Access to the project's Supabase instance (URL + publishable key) for local dev

## Local setup

For either app:

```sh
cd btx-frontend          # or: cd btx-frontend-portal
npm install
cp .env.example .env.local   # fill in VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY
npm run dev
```

See each app's own `.env.example` for the full list of variables it reads, with a comment explaining each one.

## npm scripts

- **btx-frontend**: `dev`, `build`, `preview`, `lint` (oxlint + eslint, auto-fix), `format` (prettier)
- **btx-frontend-portal**: `dev`, `build`, `preview`

## Deploys

Two separate Vercel projects, each auto-deploying on push to `master`:

- **Ops Hub** — the root `vercel.json` (`buildCommand: cd btx-frontend && npm install --legacy-peer-deps && npm run build`, `outputDirectory: btx-frontend/dist`). Vercel project's Root Directory is the repo root.
- **Scholarship Portal** — `btx-frontend-portal/vercel.json`, self-contained within that folder. Vercel project's Root Directory is `btx-frontend-portal`.

## Roles

Every signed-in user's role lives in their Supabase Auth `user_metadata.role` and is read both by RLS policies (`auth.jwt() -> 'user_metadata' ->> 'role'`) and by application code — never from a client-supplied field. Known roles:

- `admin`, `board`, `reviewer` — Ops Hub staff (also used for the Portal's staff preview gate)
- `applicant` — Portal self-service accounts; enforced as the default by a role-safety trigger, not just a client-side assumption

## Database changes

Schema changes in this repo are **not** made by hand-writing a migration file and running it against the live database first. The actual workflow:

1. Apply the change live via the Supabase SQL Editor.
2. Write the equivalent SQL into a new timestamped file under `supabase/migrations/`, matching what was actually applied.
3. Reconcile local migration history with the live database using `supabase migration repair` (which records the migration as applied without re-running its SQL) — see the comment at the top of `supabase/migrations/20260815000000_baseline_missing_tables.sql` for a worked example of why this order matters.

Never run an untested migration file directly against the live database.

## Edge Function secrets

Every Edge Function in `supabase/functions/` gets `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` injected automatically by the Supabase platform — these are never set manually and never committed to this repo.

Each `sync-*` function additionally checks its own distinct `*_SYNC_SECRET` value (e.g. `SYNC_SECRET`, `BUDGET_TRACKING_SYNC_SECRET`, `FUNDRAISING_SYNC_SECRET`, `PROGRAM_PLAN_SYNC_SECRET`, ...) against an `x-sync-secret` request header, since those endpoints are called server-to-server with no user session to carry a JWT. These secrets are set with `supabase secrets set <NAME>=<value>` and live only in the Supabase project's own secrets store — never in this repo, never in a `.env` file.

## Code comments

Every function, and every non-obvious or RLS-dependent block, should have a short comment above it — see `CLAUDE.md`.
