<script setup>
import { computed, ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import ImportChooseTableStep from './ImportChooseTableStep.vue'
import ImportProvideDataStep from './ImportProvideDataStep.vue'

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

// One entry per rawRows row, built by the Preview step. Shape is provisional
// -- the first thing likely to need adjustment once Preview's actual logic
// is designed, unlike the rest of this state which is settled:
//   raw:    the original PapaParse row (kept so a failed row can be
//           re-exported in its original form later, per Phase 2c)
//   values: successfully parsed/coerced values, keyed by DB column name
//   errors: per-column error messages, keyed by DB column name
//   valid:  convenience boolean -- true iff errors is empty and any
//           row/group-level checks (validateRow/validateGroup) also passed
const validatedRows = ref([])

const currentStepIndex = computed(() => STEPS.indexOf(currentStep.value))

// Per-step precondition for the Next button. preview/confirm/results are
// still placeholders at this sub-phase, so they default to true rather than
// blocking on state that doesn't exist yet.
const canAdvance = computed(() => {
  if (currentStep.value === 'choose-table') return selectedTable.value !== null
  if (currentStep.value === 'provide-data') return rawRows.value.length > 0
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
    <div v-else-if="currentStep === 'preview'">Preview step goes here</div>
    <div v-else-if="currentStep === 'confirm'">Confirm step goes here</div>
    <div v-else-if="currentStep === 'results'">Results step goes here</div>

    <div class="step-nav">
      <button v-if="currentStepIndex > 0" type="button" class="btn btn--outline" @click="goToPreviousStep">
        Back
      </button>
      <button
        v-if="currentStepIndex < STEPS.length - 1"
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
