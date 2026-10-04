# btx-frontend — BTX Ops Hub

Staff-facing dashboard for the BTX Foundation: budgeting, fundraising, marketing, event tracking, program planning, and scholarship review.

## Setup

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in the Supabase URL and publishable key (Supabase dashboard → Settings → API).
3. `npm run dev`

## Environment variables

See `.env.example` for the full list with descriptions. In short:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

## Scripts

- `npm run dev` — local dev server
- `npm run build` — production build
- `npm run preview` — preview the production build locally
- `npm run lint` — oxlint + eslint, auto-fix
- `npm run format` — prettier, write

## Deploy

Deployed to Vercel from the repo root's `vercel.json`, which runs `cd btx-frontend && npm install --legacy-peer-deps && npm run build` and serves `btx-frontend/dist`.

## Roles

Access to most views is gated to the `admin`, `board`, and `reviewer` roles. A user's role is read from their Supabase Auth `user_metadata.role` (set server-side, never client-writable) — see `src/stores/auth.js` and the RLS policies in `supabase/migrations/`.

## Code comments

Every function, and every non-obvious or RLS-dependent block, should have a short comment above it — see the repo root `CLAUDE.md`.

## Recommended IDE Setup

[VS Code](https://code.visualstudio.com/) + [Vue (Official)](https://marketplace.visualstudio.com/items?itemName=Vue.volar) (and disable Vetur).
