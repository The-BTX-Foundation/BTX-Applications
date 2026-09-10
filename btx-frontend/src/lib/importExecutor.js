// Executes the actual writes for the Import feature -- one row (or one
// plan-year group, for program_plan_milestones) per await, inside a
// for...of loop. Never a single batched multi-row .insert()/.upsert() call:
// Postgres fails an entire batched statement the moment any one row in it
// is bad, which would make the per-row/per-group outcome tracking below
// impossible -- there'd be no way to tell which of N rows in a failed batch
// were actually the problem.
import { supabase } from './supabaseClient'

// Joins a row's natural-key column values into one comparable string.
// Deliberately identical to ImportConfirmStep.vue's own keyOf (same U+0000
// separator, same argument order) -- duplicated rather than imported
// because Confirm's version is a local function inside a Vue SFC's
// <script setup> with no export path, and wiring this module into Confirm
// is explicitly out of scope for this chunk. Consolidating both into one
// shared module is a reasonable follow-up, not done here.
function keyOf(naturalKey, values) {
  return naturalKey.map((column) => values[column]).join('\u0000')
}

// Plain insert -- tasks_alerts and the three task tables. Mirrors
// tasksAlerts.js's own createTask(): aliased error destructuring, the raw
// message surfaced as-is, no .select() since nothing here patches a live
// list the way that store does.
async function executeInsertRow(table, row) {
  const { error: insertError } = await supabase.from(table).insert(row.values)
  return { row, status: insertError ? 'failed' : 'success', message: insertError?.message ?? null }
}

// Upsert -- covers both 'upsert' and 'upsert-partial' tables with one code
// path. The partial-ness was already resolved upstream: Preview's
// validateOneRow skips unmapped columns entirely for partialUpdate specs,
// so row.values already contains exactly the columns this write should
// send, whichever mode the table is in.
async function executeUpsertRow(table, naturalKey, row) {
  const { error: upsertError } = await supabase.from(table).upsert(row.values, { onConflict: naturalKey.join(',') })
  return { row, status: upsertError ? 'failed' : 'success', message: upsertError?.message ?? null }
}

// Replace-set, program_plan_milestones only -- two phases per group: upsert
// the group's milestones, then delete the ones Preview already identified
// as stale (group.staleNames, computed once in buildGroupResult and reused
// here as-is, never recomputed). If the upsert itself fails, the delete is
// skipped entirely -- staleNames was computed against DB state that's still
// accurate, so deleting now would leave the plan_year worse off than either
// a full success or a clean no-op failure. If there's nothing to delete,
// the delete call itself is skipped (not just its result ignored) rather
// than sending a wasteful empty .in() list.
async function executeMilestoneGroup(group) {
  const { error: upsertError } = await supabase
    .from('program_plan_milestones')
    .upsert(
      group.milestones.map((milestone) => ({ plan_year: group.planYear, ...milestone })),
      { onConflict: 'plan_year,milestone_name' },
    )

  if (upsertError) {
    return { group, status: 'failed', phase: 'upsert', message: upsertError.message }
  }

  if (group.staleNames.length === 0) {
    return { group, status: 'success', phase: null, message: null }
  }

  const { error: deleteError } = await supabase
    .from('program_plan_milestones')
    .delete()
    .eq('plan_year', group.planYear)
    .in('milestone_name', group.staleNames)

  return deleteError
    ? { group, status: 'partial', phase: 'delete', message: deleteError.message }
    : { group, status: 'success', phase: null, message: null }
}

// Builds the plan_year+milestone_name -> raw lookup Results will need for
// replace-set's failed/partial-row CSV export -- toPayloadGroups' output
// (group.milestones) only carries validated values, not the original raw
// row, so this is built separately here from the full validatedRows, which
// still has both. Only valid rows are included -- an invalid row never
// reached a group in the first place.
//
// Known limitation: if two valid rows in the same plan_year share a
// milestone_name (the exact case validateGroup rejects the whole group
// for), this Map can only keep one of their raw rows -- the later one wins.
// That only affects CSV-export fidelity for that specific duplicate-name
// failure case, not any write behavior above; left as-is for now rather
// than adding index-based tracking for a case Results doesn't exist yet to
// exercise.
function buildRawLookup(validatedRows) {
  const rawByKey = new Map()
  for (const row of validatedRows) {
    if (!row.valid) continue
    rawByKey.set(keyOf(['plan_year', 'milestone_name'], row.values), row.raw)
  }
  return rawByKey
}

// Single entry point: runs every write for the current import, sequentially,
// and returns the per-row/per-group outcomes (plus, for replace-set, the
// raw-row lookup Results will use for its failed-rows export). Only
// rows/groups that already passed Preview's validation are ever attempted --
// filtered once, before either loop below, never inside it.
export async function executeImport({ selectedTable, validatedRows, milestoneGroups }) {
  if (selectedTable.writeMode === 'replace-set') {
    const validGroups = (milestoneGroups ?? []).filter((group) => group.groupValid)
    const outcomes = []
    for (const group of validGroups) {
      outcomes.push(await executeMilestoneGroup(group))
    }
    return { outcomes, rawByKey: buildRawLookup(validatedRows) }
  }

  const validRows = validatedRows.filter((row) => row.valid)
  const outcomes = []
  for (const row of validRows) {
    outcomes.push(
      selectedTable.writeMode === 'insert'
        ? await executeInsertRow(selectedTable.table, row)
        : await executeUpsertRow(selectedTable.table, selectedTable.naturalKey, row),
    )
  }
  return { outcomes, rawByKey: null }
}
