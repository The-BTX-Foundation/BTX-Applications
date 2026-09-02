# Known Issues / Cleanup Backlog

- `saveAndPublish` and `createCycle` in `src/stores/donorImpact.js` are now
  dead code — DonorImpact.vue was converted to read-only display (Reach/
  Investment editing, Save & Publish, and + Add Cycle were removed) and no
  longer calls either. Left in place intentionally pending a future decision
  on whether editing donor_impact data comes back in some form; delete both
  (and their RLS-dependent comments) if that never happens.
