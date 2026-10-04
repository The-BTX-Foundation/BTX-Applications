# btx-frontend-portal — BTX Scholarship Portal

Public-facing scholarship application wizard for BTX Foundation applicants, plus a staff preview of the applicant-facing flow.

## Setup

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in the Supabase URL and publishable key (Supabase dashboard → Settings → API).
3. `npm run dev`

## Environment variables

See `.env.example` for the full list with descriptions. In short:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_ENABLE_TEST_NAV` (optional, dev-only nav shortcut — see `src/components/TestNavPanel.vue`)

## Scripts

- `npm run dev` — local dev server
- `npm run build` — production build
- `npm run preview` — preview the production build locally

## Deploy

Deployed to Vercel as its own project, using this folder's own `vercel.json` (Vercel "Root Directory" set to `btx-frontend-portal`).

## Roles

Applicants sign in with a one-time email code and default to the `applicant` role, enforced server-side by a role-safety trigger (see `supabase/migrations/`). Staff can sign in with a password via the same screen's "Admin Login" entry point; access beyond `/staff-preview` requires an `admin`, `board`, or `reviewer` role read from `user_metadata.role` — see `src/views/SignInView.vue`.

## Code comments

Every function, and every non-obvious or RLS-dependent block, should have a short comment above it — see the repo root `CLAUDE.md`.
