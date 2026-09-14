# Known Issues / Cleanup Backlog

- `saveAndPublish` and `createCycle` in `src/stores/donorImpact.js` are now
  dead code — DonorImpact.vue was converted to read-only display (Reach/
  Investment editing, Save & Publish, and + Add Cycle were removed) and no
  longer calls either. Left in place intentionally pending a future decision
  on whether editing donor_impact data comes back in some form; delete both
  (and their RLS-dependent comments) if that never happens.

- The Headline Metric Summary page (`src/components/HeadlineMetricSummary.vue`,
  moved off Home.vue) still shows 100% hardcoded PLACEHOLDER figures for the
  4 metric cards and the Program Allocation table — see the PLACEHOLDER
  comments in that file. No Scholarship backing tables exist yet, so these
  are hand-entered values pending a real query.

## Tooling / Environment Notes

- **Supabase CLI: use `--use-api` for Edge Function deploys on Windows, not
  local bundling.** The default Windows binary (`supabase.exe`, currently
  2.113.0 — the newer TypeScript/Bun-based rewrite) fails local Edge
  Function bundling with an unhelpful `Effect.tryPromise` / `UnknownError`
  error and no useful detail at any verbosity level. Confirmed this is not
  a Docker problem (Docker Desktop was installed and running throughout)
  and not a shell/path-mangling problem (reproduced identically from both
  Git Bash and PowerShell). The same npm install also ships a legacy Go
  binary (`node_modules/supabase/node_modules/@supabase/cli-windows-x64/bin/supabase-go.exe`)
  which bundles and deploys the same function successfully — via an
  embedded Deno process, no Docker involved at all — confirming the bug is
  specific to the new binary's bundling code path, not the environment.
  Standard deploy command for this project until this is confirmed fixed
  upstream:
  ```
  supabase functions deploy <name> --no-verify-jwt --use-api
  ```
  If server-side bundling (`--use-api`) is ever unavailable, invoking
  `supabase-go.exe` directly (same flags, same working directory) is a
  known-working fallback — but `--use-api` should stay the default, not
  the fallback. Re-check whether local bundling works again next CLI
  upgrade (installed 2.113.0; 2.116.0 was available as of 2026-09-02).
