# BTX Platform

Monorepo for the BTX Foundation's web apps, backed by one shared Supabase project (`btx-platform`).

The two old Vue apps (the Ops Hub in `btx-frontend/` and the Portal in `btx-frontend-portal/`) were removed when the
rebuild started. They stay in the git history. The Ops Hub is rebuilt after the Portal launches; the design for both is
the Figma file "BTX Apps".

## Layout

- **`apps/portal/`**: the Scholarship Portal (applicants). Next.js (App Router, TypeScript), plain CSS, no Tailwind.
- **`packages/ui/`**: design tokens (`tokens.css`), shared component styles and the shared React components
  (top bar, buttons, fields, step progress, bottom bar, dates drawing).
- **`packages/data/`**: the Supabase client helpers and the place for generated database types.
- **`supabase/`**: database migrations and Edge Functions. Untouched by the rebuild so far.

An Ops Hub app will be added as `apps/ops/` later and share `packages/ui` and `packages/data`.

## Prerequisites

- Node 22.18 or newer (built with Node 26), npm 10 or newer
- For real sign-in: the Supabase project URL and publishable key. Without them the Portal runs against a local mock.

## Local setup

```sh
npm install                              # installs every workspace from the repo root
cp apps/portal/.env.example apps/portal/.env.local   # optional: add the Supabase URL and publishable key
npm run dev                              # Portal on http://localhost:3000
```

## npm scripts (run from the repo root)

- `npm run dev`: start the Portal dev server
- `npm run build`: production build of the Portal
- `npm run start`: serve the production build
- `npm run lint`: lint the Portal

## Deploys

Each app is its own Vercel project with its own Root Directory (`apps/portal` for the Portal). Every change goes
branch, preview, pull request, merge. Nothing here deploys by itself yet.

## Roles

Every signed-in user's role lives in their Supabase Auth `user_metadata.role` and is read both by RLS policies
(`auth.jwt() -> 'user_metadata' ->> 'role'`) and by application code. That is the known security hole being fixed on
the `fix/rls-role-app-metadata` branch: roles move to `app_metadata`. Known roles:

- `admin`, `board`, `reviewer`: Ops Hub staff
- `applicant`: Portal self-service accounts

## Edge Function secrets

Every Edge Function in `supabase/functions/` gets `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` injected automatically by the Supabase platform — these are never set manually and never committed to this repo.

Each `sync-*` function additionally checks its own distinct `*_SYNC_SECRET` value (e.g. `SYNC_SECRET`, `BUDGET_TRACKING_SYNC_SECRET`, `FUNDRAISING_SYNC_SECRET`, `PROGRAM_PLAN_SYNC_SECRET`, ...) against an `x-sync-secret` request header, since those endpoints are called server-to-server with no user session to carry a JWT. These secrets are set with `supabase secrets set <NAME>=<value>` and live only in the Supabase project's own secrets store — never in this repo, never in a `.env` file.

## Code comments

Every function, and every non-obvious or RLS-dependent block, should have a short comment above it — see `CLAUDE.md`.
