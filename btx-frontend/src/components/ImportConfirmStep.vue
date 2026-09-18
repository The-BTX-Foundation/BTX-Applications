<script setup>
import { computed, ref, watch } from 'vue'
import { supabase } from '@/lib/supabaseClient'
import { executeImport } from '@/lib/importExecutor.js'

const props = defineProps({
  selectedTable: { type: Object, required: true }, // the chosen IMPORT_TABLES entry -- read-only here, Confirm never changes it
  validatedRows: { type: Array, required: true }, // read-only { raw, values, errors, rowErrors, valid }[] from Preview
  milestoneGroups: { type: Array, default: null }, // program_plan_milestones-only, read-only from Preview
})

const importResults = defineModel('importResults', { default: () => [] })
const isExecuting = defineModel('isExecuting', { default: false })

const emit = defineEmits(['done'])

// True while the insert-vs-update existence check (upsert/upsert-partial
// tables only) is in flight -- blocks the Confirm & Import button the same
// way Preview's isValidating blocks its own Next, so the admin never commits
// against a summary that hasn't finished loading.
const isLoadingSummary = ref(true)

// Set of already-existing natural-key strings for the current table, built
// by fetchExistingKeys below. Stays null for 'insert' and 'replace-set'
// tables, which don't need this check -- insert has no natural key at all,
// and replace-set's equivalent work already happened in Preview's
// buildGroupResult and is sitting in props.milestoneGroups.
const existingKeys = ref(null)

// The destructive-write acknowledgment checkbox, replace-set only. Gates the
// Confirm & Import button below whenever this table's valid groups would
// delete at least one existing milestone.
const acknowledgeDelete = ref(false)

const validRows = computed(() => props.validatedRows.filter((row) => row.valid))

// Only the groups Execution will actually attempt -- an invalid group is
// excluded entirely (never written), same rule Preview already applied when
// deciding canAdvance out of that step.
const validGroups = computed(() => (props.milestoneGroups ?? []).filter((group) => group.groupValid))

const totalStaleCount = computed(() => validGroups.value.reduce((sum, group) => sum + group.staleCount, 0))
const staleGroupCount = computed(() => validGroups.value.filter((group) => group.staleCount > 0).length)

// Rows that never reached Execution at all: failed field/row validation
// individually, or -- for replace-set -- belonged to a group whose
// validateGroup check failed, which excludes the whole group, not just the
// offending row.
const skippedCount = computed(() => {
  const fieldFailures = props.validatedRows.filter((row) => !row.valid).length
  if (!props.milestoneGroups) return fieldFailures
  const invalidGroupRows = props.milestoneGroups
    .filter((group) => !group.groupValid)
    .reduce((sum, group) => sum + group.milestones.length, 0)
  return fieldFailures + invalidGroupRows
})

// How many valid rows will land as a fresh INSERT vs. an UPDATE on an
// existing row, for upsert/upsert-partial tables' summary line. Both counts
// are 0 until existingKeys finishes loading.
const insertCount = computed(() => {
  if (!existingKeys.value) return 0
  return validRows.value.filter((row) => !existingKeys.value.has(keyOf(props.selectedTable.naturalKey, row.values))).length
})
const updateCount = computed(() => (existingKeys.value ? validRows.value.length - insertCount.value : 0))

// Joins a row's natural-key column values into one comparable string. U+0000
// (never typable in a pasted CSV/TSV cell) is used as the separator rather
// than a printable character like "|", so a real text value containing that
// character (e.g. a grant_name) can never collide with the join itself.
function keyOf(naturalKey, values) {
  return naturalKey.map((column) => values[column]).join('\u0000')
}

// Narrows by the natural key's first column (the one cheap, directly
// supported .in() filter PostgREST offers), then diffs the full composite
// key client-side. Deliberately not a .or()-with-and()-groups filter string
// -- this project has no existing usage of that pattern, and building one
// here would mean hand-escaping arbitrary text values (grant_name, funder,
// ...) into a filter string, which this sidesteps entirely.
async function fetchExistingKeys(table, naturalKey, rows) {
  const leadColumn = naturalKey[0]
  const incomingLeadValues = [...new Set(rows.map((row) => row.values[leadColumn]))]
  const { data, error } = await supabase.from(table).select(naturalKey.join(', ')).in(leadColumn, incomingLeadValues)
  if (error) throw error
  return new Set(data.map((row) => keyOf(naturalKey, row)))
}

// Loads the insert-vs-update summary whenever this step is (re)entered --
// this component fully remounts every time the wizard re-enters 'confirm'
// (see ImportWizard.vue's v-else-if chain), so an immediate watch on mount
// is enough; no need to watch for prop changes mid-step. Re-runs fresh on
// every visit rather than caching, since DB state may have changed since
// Preview last computed anything.
watch(
  () => props.selectedTable,
  async (table) => {
    isLoadingSummary.value = true
    existingKeys.value = null
    acknowledgeDelete.value = false

    if (table.writeMode === 'upsert' || table.writeMode === 'upsert-partial') {
      existingKeys.value = await fetchExistingKeys(table.table, table.naturalKey, validRows.value)
    }

    isLoadingSummary.value = false
  },
  { immediate: true },
)

// Runs the import and advances to Results once it settles. isExecuting also
// blocks ImportWizard.vue's Back button (see its own template), so the
// admin can't navigate away mid-write. importResults ends up shaped exactly
// as executeImport returns it: { outcomes, rawByKey }. outcomes is the
// per-row (or, for replace-set, per-plan-year-group) array every writeMode
// produces -- Results reads this for its summary counts and results table.
// rawByKey is the plan_year+milestone_name -> raw-row lookup replace-set
// needs for its failed/partial-row CSV export; null for every other
// writeMode, where each outcome's own .row.raw already covers that need
// directly.
async function runExecution() {
  isExecuting.value = true
  importResults.value = await executeImport({
    selectedTable: props.selectedTable,
    validatedRows: props.validatedRows,
    milestoneGroups: props.milestoneGroups,
  })
  isExecuting.value = false
  emit('done')
}
</script>

<template>
  <div class="confirm-step">
    <h2 class="section-title">Confirm Import</h2>

    <p v-if="isLoadingSummary" class="validating">Loading summary…</p>

    <template v-else>
      <p v-if="selectedTable.writeMode === 'insert'" class="summary-line">
        {{ validRows.length }} row{{ validRows.length === 1 ? '' : 's' }} will be created.
      </p>

      <p v-else-if="selectedTable.writeMode === 'upsert' || selectedTable.writeMode === 'upsert-partial'" class="summary-line">
        {{ insertCount }} row{{ insertCount === 1 ? '' : 's' }} will be inserted,
        {{ updateCount }} row{{ updateCount === 1 ? '' : 's' }} will be updated.
      </p>

      <div v-else-if="selectedTable.writeMode === 'replace-set'" class="milestone-groups">
        <div v-for="group in validGroups" :key="group.planYear" class="milestone-group">
          <p class="group-title">
            Plan Year {{ group.planYear }} — {{ group.milestones.length }} milestone{{ group.milestones.length === 1 ? '' : 's' }}
          </p>
          <p v-if="group.staleCount > 0" class="group-warning">
            This will delete {{ group.staleCount }} existing milestone{{ group.staleCount === 1 ? '' : 's' }}:
            {{ group.staleNames.join(', ') }}
          </p>
        </div>
      </div>

      <p v-if="skippedCount > 0" class="skipped-line">
        {{ skippedCount }} row{{ skippedCount === 1 ? '' : 's' }} skipped due to validation errors.
      </p>

      <label v-if="selectedTable.writeMode === 'replace-set' && totalStaleCount > 0" class="acknowledge-delete">
        <input type="checkbox" v-model="acknowledgeDelete" />
        I understand this will permanently delete {{ totalStaleCount }} milestone{{ totalStaleCount === 1 ? '' : 's' }}
        across {{ staleGroupCount }} plan year{{ staleGroupCount === 1 ? '' : 's' }}, as listed above.
      </label>

      <button
        type="button"
        class="btn btn--gold"
        :disabled="isExecuting || (selectedTable.writeMode === 'replace-set' && totalStaleCount > 0 && !acknowledgeDelete)"
        @click="runExecution"
      >
        {{ isExecuting ? 'Importing…' : 'Confirm & Import' }}
      </button>
    </template>
  </div>
</template>

<style scoped>
.confirm-step {
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

.validating {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: 13px;
}

.summary-line {
  margin: 0;
  font-size: 14px;
  color: var(--color-text-primary);
}

.skipped-line {
  margin: 0;
  color: var(--color-amber-text);
  font-size: 13px;
}

.milestone-groups {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.milestone-group {
  border: 0.5px solid var(--color-border);
  border-radius: 12px;
  padding: 12px 14px;
}

.group-title {
  margin: 0 0 4px;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-primary);
}

.group-warning {
  margin: 0;
  color: var(--color-amber-text);
  font-size: 13px;
}

.acknowledge-delete {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 13px;
  color: var(--color-text-primary);
  cursor: pointer;
}

.acknowledge-delete input {
  margin-top: 2px;
}

.btn {
  align-self: flex-start;
  font-size: 13px;
  font-weight: 500;
  padding: 6px 14px;
  border-radius: 8px;
  cursor: pointer;
}

.btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.btn--gold {
  background: var(--color-accent);
  color: var(--color-surface);
  border: 1px solid var(--color-accent);
}
</style>
