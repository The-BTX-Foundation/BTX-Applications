<script setup>
import { computed } from 'vue'
import Papa from 'papaparse'

const props = defineProps({
  selectedTable: { type: Object, required: true }, // the chosen IMPORT_TABLES entry -- read-only here, Results never changes it
  importResults: { type: Object, required: true }, // { outcomes, rawByKey } -- exactly as executeImport() returned it
  validatedRows: { type: Array, required: true }, // read-only, same array Confirm used -- needed to recompute skippedCount identically
  milestoneGroups: { type: Array, default: null }, // program_plan_milestones-only, read-only -- needed to recompute skippedCount identically
})

const emit = defineEmits(['start-new-import'])

const outcomes = computed(() => props.importResults.outcomes ?? [])

// Joins a row's natural-key column values into one comparable string.
// Deliberately identical to ImportConfirmStep.vue's and importExecutor.js's
// own keyOf (same U+0000 separator, same argument order) -- this is now a
// third copy of the same three-line function, previously flagged as a
// candidate for consolidation into one shared module when Chunk 2 first
// duplicated it. Still not done here: this chunk is scoped to Results only,
// and unifying all three would mean reopening two already-reviewed,
// already-shipped files without being asked to. Worth doing as its own
// small follow-up.
function keyOf(naturalKey, values) {
  return naturalKey.map((column) => values[column]).join('\u0000')
}

// A single display value identifying one outcome's row/group -- its
// natural-key column values for upsert/upsert-partial tables, its title for
// insert-mode tables (which have no natural key at all), or the plan year
// plus milestone count for replace-set, whose outcomes are per-group, not
// per-row.
function describeOutcome(outcome) {
  if (props.selectedTable.writeMode === 'replace-set') {
    const count = outcome.group.milestones.length
    return `Plan Year ${outcome.group.planYear} (${count} milestone${count === 1 ? '' : 's'})`
  }
  const naturalKey = props.selectedTable.naturalKey
  if (naturalKey) {
    return naturalKey.map((column) => outcome.row.values[column]).join(' / ')
  }
  return outcome.row.values.title
}

// The error/detail text for a non-success outcome. Replace-set outcomes
// additionally carry which phase failed (upsert or delete) -- prefixed here
// when present; every other writeMode's outcomes have no phase field at
// all, so the prefix is simply omitted for them.
function describeError(outcome) {
  const phasePrefix = outcome.phase ? `${outcome.phase} failed: ` : ''
  return `${phasePrefix}${outcome.message}`
}

// How many rows one outcome represents for the summary counts below --
// always 1 for insert/upsert/upsert-partial (one outcome per row), but the
// full milestone count for replace-set, whose outcomes are per plan-year
// group -- "N milestones succeeded" should count actual milestones, not
// plan years, even though the table below still groups by plan year.
function unitCount(outcome) {
  return props.selectedTable.writeMode === 'replace-set' ? outcome.group.milestones.length : 1
}

// Totals unitCount across every outcome matching the given status.
function sumUnits(status) {
  return outcomes.value.filter((outcome) => outcome.status === status).reduce((sum, outcome) => sum + unitCount(outcome), 0)
}

const succeededCount = computed(() => sumUnits('success'))
const failedCount = computed(() => sumUnits('failed'))
// replace-set only -- every other writeMode's executor never produces this
// status, since a plain insert/upsert is a single all-or-nothing call with
// no second phase that could succeed independently of the first.
const partialCount = computed(() => sumUnits('partial'))

// Rows that never reached Execution at all -- recomputed identically to
// ImportConfirmStep.vue's own skippedCount (same two-part rule: failed
// field/row validation individually, or -- for replace-set -- belonged to a
// group whose validateGroup check failed, excluding the whole group).
const skippedCount = computed(() => {
  const fieldFailures = props.validatedRows.filter((row) => !row.valid).length
  if (!props.milestoneGroups) return fieldFailures
  const invalidGroupRows = props.milestoneGroups
    .filter((group) => !group.groupValid)
    .reduce((sum, group) => sum + group.milestones.length, 0)
  return fieldFailures + invalidGroupRows
})

// Failed outcomes always belong in the recovery export; partial ones do
// too, for replace-set specifically -- the upsert half succeeded, but the
// stale milestones that should have been deleted are still sitting there,
// which is exactly the kind of thing the admin needs to notice and retry.
const exportableOutcomes = computed(() =>
  outcomes.value.filter((outcome) => outcome.status === 'failed' || outcome.status === 'partial'),
)

// Resolves one outcome back to the original raw row(s) it came from -- for
// insert/upsert/upsert-partial, that's just outcome.row.raw directly, kept
// on the validated row since Preview first built it. For replace-set,
// outcome.group.milestones only carries validated values, not raw rows, so
// each milestone is looked up individually in rawByKey, the lookup the
// executor built from the same full validatedRows Preview produced.
function resolveRawRows(outcome) {
  if (props.selectedTable.writeMode !== 'replace-set') {
    return [outcome.row.raw]
  }
  const rawByKey = props.importResults.rawByKey
  return outcome.group.milestones
    .map((milestone) =>
      rawByKey?.get(keyOf(['plan_year', 'milestone_name'], { plan_year: outcome.group.planYear, milestone_name: milestone.milestone_name })),
    )
    .filter((raw) => raw != null)
}

// Reconstructs every failed/partial outcome's original raw rows into a
// downloadable CSV via Papa.unparse() -- parse's exact inverse -- so the
// admin gets back the same headers/values they originally pasted or
// uploaded, ready to fix and re-import just the problem subset.
function downloadFailedRows() {
  const failedRawRows = exportableOutcomes.value.flatMap((outcome) => resolveRawRows(outcome))
  const csv = Papa.unparse(failedRawRows)
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${props.selectedTable.table}-failed-rows.csv`
  link.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div class="results-step">
    <h2 class="section-title">Import Results</h2>

    <p class="summary-line">
      {{ succeededCount }} row{{ succeededCount === 1 ? '' : 's' }} succeeded,
      {{ failedCount }} row{{ failedCount === 1 ? '' : 's' }} failed,
      {{ skippedCount }} row{{ skippedCount === 1 ? '' : 's' }} skipped.
    </p>
    <p v-if="partialCount > 0" class="partial-line">
      {{ partialCount }} row{{ partialCount === 1 ? '' : 's' }} partially applied -- see below.
    </p>

    <button v-if="exportableOutcomes.length > 0" type="button" class="btn btn--outline" @click="downloadFailedRows">
      Download Failed Rows
    </button>

    <table v-if="outcomes.length > 0" class="results-table">
      <thead>
        <tr>
          <th class="status-col"></th>
          <th>{{ selectedTable.writeMode === 'replace-set' ? 'Plan Year' : 'Row' }}</th>
          <th>Details</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(outcome, index) in outcomes" :key="index">
          <td class="status-col">
            <span v-if="outcome.status === 'success'">✓</span>
            <span v-else-if="outcome.status === 'partial'" class="status-partial">⚠</span>
            <span v-else class="status-error">✗</span>
          </td>
          <td>{{ describeOutcome(outcome) }}</td>
          <td>
            <span v-if="outcome.status === 'failed'" class="cell-error">{{ describeError(outcome) }}</span>
            <span v-else-if="outcome.status === 'partial'" class="cell-warning">{{ describeError(outcome) }}</span>
          </td>
        </tr>
      </tbody>
    </table>
    <p v-else class="summary-line">No rows were attempted.</p>

    <button type="button" class="btn btn--gold" @click="emit('start-new-import')">Start New Import</button>
  </div>
</template>

<style scoped>
.results-step {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.summary-line {
  margin: 0;
  font-size: 14px;
  color: var(--color-text-primary);
}

.partial-line {
  margin: 0;
  color: var(--color-amber-text);
  font-size: 13px;
}

.results-table {
  width: 100%;
  border-collapse: collapse;
}

.results-table th {
  text-align: left;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
  padding: 0 8px 8px 0;
}

.results-table td {
  padding: 6px 8px 6px 0;
  font-size: 13px;
  color: var(--color-text-primary);
  vertical-align: top;
}

.status-col {
  white-space: nowrap;
  width: 1%;
}

.status-error {
  color: var(--color-danger-text);
  font-weight: 500;
}

.status-partial {
  color: var(--color-amber-text);
  font-weight: 500;
}

.cell-error {
  color: var(--color-danger-text);
  font-size: 12px;
}

.cell-warning {
  color: var(--color-amber-text);
  font-size: 12px;
}

.btn {
  align-self: flex-start;
  font-size: 13px;
  font-weight: 500;
  padding: 6px 14px;
  border-radius: 8px;
  cursor: pointer;
}

.btn--outline {
  background: var(--color-surface);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border-strong);
}

.btn--gold {
  background: var(--color-accent);
  color: var(--color-surface);
  border: 1px solid var(--color-accent);
}
</style>
