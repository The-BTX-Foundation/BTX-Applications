<script setup>
import { computed, ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import ImportChooseTableStep from './ImportChooseTableStep.vue'
import ImportProvideDataStep from './ImportProvideDataStep.vue'
import ImportPreviewStep from './ImportPreviewStep.vue'
import ImportConfirmStep from './ImportConfirmStep.vue'

const authStore = useAuthStore()

// Deliberately isAdmin alone, not the canView (admin/board/reviewer)
// convention used everywhere else in the app -- Import writes directly to
// tables board/reviewer have no INSERT/UPDATE access to at all (Phase 1 RLS
// audit). This is a second, independent gate alongside HomeView.vue's own
// sidebar-hiding, matching how every other admin-adjacent page in the app
// double-gates: hidden from nav, and still blocked if the route is hit
// directly.
const isAdmin = computed(() => authStore.isAdmin)

const STEPS = ['choose-table', 'provide-data', 'preview', 'confirm', 'results']

const currentStep = ref(STEPS[0])

// Populated once a table is chosen in step 1 -- the full entry object from
// importTables.js's IMPORT_TABLES (table name, naturalKey, writeMode, etc.),
// not just its id, so every later step can read what it needs directly.
const selectedTable = ref(null)

// PapaParse's own `header: true` output shape: one plain object per row,
// keyed by the file's original header text -> raw string cell value.
// Populated by the Provide Data step.
const rawRows = ref([])

// Switching tables after already having parsed rows for a different one
// would otherwise carry stale rows into Preview, where they'd be validated
// against the wrong table's field spec. Resetting on every change (not just
// a "real" change from one table to another) is simplest and harmless --
// the very first assignment goes from null to a table, so this also runs
// once on initial selection, which is a no-op since rawRows is already [].
watch(selectedTable, () => {
  rawRows.value = []
})

// Extra data a field's validate() needs beyond its own raw cell -- e.g.
// { assigneeLookup: Map } for the four task tables' assigned_to lookup.
// Built once per import run before Preview validates anything.
const validationContext = ref({})

// One entry per rawRows row, built by the Preview step:
//   raw:       the original PapaParse row (kept so a failed row can be
//              re-exported in its original form later, per Phase 2c)
//   values:    successfully parsed/coerced values, keyed by DB column name
//   errors:    per-column error messages, keyed by DB column name
//   rowErrors: messages from the field spec's optional validateRow(row)
//              hook (program_plan_progress only) -- kept separate from
//              errors since a row-level problem (e.g. milestones_complete
//              exceeding milestones_total) isn't about any single column,
//              so it's never attached to one cell the way a per-field
//              error is
//   valid:     true iff errors is empty AND rowErrors is empty
const validatedRows = ref([])

// Populated only for donor_impact (partialUpdate: true) -- the field-spec
// entries whose column wasn't matched to any header in this import. []
// for every other table.
const excludedFields = ref([])

// Populated only for program_plan_milestones (writeMode: 'replace-set') --
// one entry per distinct plan_year in the file. null for every other table.
const milestoneGroups = ref(null)

// True while Preview is (re)computing validatedRows/milestoneGroups,
// including the milestone deletion-count queries, which resolve after
// validatedRows itself has already updated. canAdvance blocks on this
// below specifically so Confirm can never be reached showing a stale
// deletion count for a replace-set import.
const isValidating = ref(false)

// Populated once Confirm's "Confirm & Import" runs the executor. Shaped
// exactly as executeImport() returns it: { outcomes, rawByKey }. outcomes
// is one entry per attempted row (or per plan-year group, for
// program_plan_milestones), read by Results to build its summary/table.
// rawByKey is the plan_year+milestone_name -> raw-row lookup replace-set
// needs for its failed-rows CSV export; null for every other writeMode,
// where each outcome's own .row.raw already covers that need directly.
const importResults = ref([])

// True for the whole span of the executor's sequential writes, from click
// to settle. Gates ImportWizard's own Back button below so the admin can't
// navigate away mid-write, the same way isValidating already gates Preview's
// Next.
const isExecuting = ref(false)

const currentStepIndex = computed(() => STEPS.indexOf(currentStep.value))

// Per-step precondition for the shared Next button. confirm never reaches
// this -- its own "Confirm & Import" button replaces Next entirely (see the
// template below) -- and results is still a placeholder, so both default to
// true rather than blocking on state that doesn't exist yet.
const canAdvance = computed(() => {
  if (currentStep.value === 'choose-table') return selectedTable.value !== null
  if (currentStep.value === 'provide-data') return rawRows.value.length > 0
  if (currentStep.value === 'preview') {
    if (isValidating.value) return false
    // program_plan_milestones executes per-group, not per-row -- a row can
    // be individually valid while every group it ends up in still fails
    // validateGroup (e.g. a duplicate milestone_name), so that table's gate
    // has to check group validity specifically, not row validity.
    if (milestoneGroups.value) return milestoneGroups.value.some((group) => group.groupValid)
    return validatedRows.value.some((row) => row.valid)
  }
  return true
})

// Advances to the next step in STEPS, if one exists.
function goToNextStep() {
  const next = STEPS[currentStepIndex.value + 1]
  if (next) currentStep.value = next
}

// Returns to the previous step in STEPS, if one exists.
function goToPreviousStep() {
  const prev = STEPS[currentStepIndex.value - 1]
  if (prev) currentStep.value = prev
}
</script>

<template>
  <section v-if="isAdmin" class="import-wizard">
    <h1 class="heading">Import</h1>

    <ImportChooseTableStep v-if="currentStep === 'choose-table'" v-model="selectedTable" />
    <ImportProvideDataStep v-else-if="currentStep === 'provide-data'" v-model="rawRows" />
    <ImportPreviewStep
      v-else-if="currentStep === 'preview'"
      :selected-table="selectedTable"
      :raw-rows="rawRows"
      v-model:validated-rows="validatedRows"
      v-model:validation-context="validationContext"
      v-model:excluded-fields="excludedFields"
      v-model:milestone-groups="milestoneGroups"
      v-model:is-validating="isValidating"
    />
    <ImportConfirmStep
      v-else-if="currentStep === 'confirm'"
      :selected-table="selectedTable"
      :validated-rows="validatedRows"
      :milestone-groups="milestoneGroups"
      v-model:import-results="importResults"
      v-model:is-executing="isExecuting"
      @done="goToNextStep"
    />
    <div v-else-if="currentStep === 'results'">Results step goes here</div>

    <div class="step-nav">
      <button
        v-if="currentStepIndex > 0 && currentStep !== 'results' && !isExecuting"
        type="button"
        class="btn btn--outline"
        @click="goToPreviousStep"
      >
        Back
      </button>
      <button
        v-if="currentStepIndex < STEPS.length - 1 && currentStep !== 'confirm'"
        type="button"
        class="btn btn--gold"
        :disabled="!canAdvance"
        @click="goToNextStep"
      >
        Next
      </button>
    </div>
  </section>

  <p v-else class="access-denied">Access Denied</p>
</template>

<style scoped>
.heading {
  margin: 0 0 20px;
  font-size: 22px;
  font-weight: 700;
}

.step-nav {
  display: flex;
  gap: 8px;
  margin-top: 20px;
}

.btn {
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

.btn--outline {
  background: #fff;
  color: #2d3142;
  border: 1px solid #d8d6cf;
}

.btn--gold {
  background: #c9932a;
  color: #fff;
  border: 1px solid #c9932a;
}

.access-denied {
  margin: 0;
  color: #b3261e;
  font-weight: 600;
}
</style>
