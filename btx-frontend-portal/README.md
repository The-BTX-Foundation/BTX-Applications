# btx-frontend-portal — BTX Scholarship Portal

Public-facing scholarship application wizard for BTX Foundation applicants, plus a staff preview of the applicant-facing flow.

See the repo root [README.md](../README.md) for prerequisites, local setup, deploys, the role model, the database-change workflow, and where Edge Function secrets live — this file only covers what's specific to this app.

## This app specifically

- **Scripts**: `npm run dev`, `npm run build`, `npm run preview`
- **Env vars** (see `.env.example` for the full descriptions): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and `VITE_ENABLE_TEST_NAV` (dev-only nav shortcut — must be unset/`false` in production, it has no auth gate of its own)
- **Deploy**: its own Vercel project, using this folder's own `vercel.json` (Vercel "Root Directory" set to `btx-frontend-portal`)
- **Staff preview gate**: applicants sign in with a one-time email code and default to the `applicant` role; staff reach `/staff-preview` via the same screen's "Admin Login" entry point, which requires an `admin`, `board`, or `reviewer` role — see `src/views/SignInView.vue`
