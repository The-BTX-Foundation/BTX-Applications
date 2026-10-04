# btx-frontend — BTX Ops Hub

Staff-facing dashboard for the BTX Foundation: budgeting, fundraising, marketing, event tracking, program planning, and scholarship review.

See the repo root [README.md](../README.md) for prerequisites, local setup, deploys, the role model, the database-change workflow, and where Edge Function secrets live — this file only covers what's specific to this app.

## This app specifically

- **Scripts**: `npm run dev`, `npm run build`, `npm run preview`, `npm run lint` (oxlint + eslint, auto-fix), `npm run format` (prettier)
- **Env vars** (see `.env.example` for the full descriptions): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`
- **Deploy**: the root `vercel.json` builds this app (`cd btx-frontend && npm install --legacy-peer-deps && npm run build`, serving `btx-frontend/dist`)
- **Access gate**: most views are gated to the `admin`, `board`, and `reviewer` roles — see `src/stores/auth.js`

## Recommended IDE Setup

[VS Code](https://code.visualstudio.com/) + [Vue (Official)](https://marketplace.visualstudio.com/items?itemName=Vue.volar) (and disable Vetur).
