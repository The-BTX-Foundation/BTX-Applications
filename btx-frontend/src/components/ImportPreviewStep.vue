<script setup>
import { computed, ref, watch } from 'vue'
import { supabase } from '@/lib/supabaseClient'
import { buildAssigneeLookup } from '@/lib/importAssigneeLookup'
import ImportColumnMapping from './ImportColumnMapping.vue'
import ImportValidationGrid from './ImportValidationGrid.vue'

const props = defineProps({
  selectedTable: { type: Object, required: true }, // the chosen IMPORT_TABLES entry -- read-only here, Preview never changes it
  rawRows: { type: Array, required: true }, // read-only PapaParse output from Provide Data
})

// All five written back to ImportWizard.vue's shared state -- Confirm and
// Execution (later sub-phases) read these, not just this step. isValidating
// specifically has to be visible to ImportWizard's Next button: on a
// program_plan_milestones import, validatedRows updates synchronously but
// milestoneGroups' real deletion counts resolve afterward via the Supabase
// query below -- clicking Next in that window would carry a stale deletion
// count/name list onto Confirm, the one screen specifically designed to
// require accurate information before an irreversible delete. That's worth
// blocking on, not just a cosmetic loading flag.
const validatedRows = defineModel('validatedRows', { default: () => [] })
const validationContext = defineModel('validationContext', { default: () => ({}) })
const excludedFields = defineModel('excludedFields', { default: () => [] })
const milestoneGroups = defineModel('milestoneGroups', { default: null })
const isValidating = defineModel('isValidating', { default: false })

const fieldSpecModule = ref(null) // the loaded field spec's default export (not the module namespace)
const columnMapping = ref({}) // { [fieldColumn]: matchedHeader | null }, mutated by ImportColumnMapping.vue

// Built as the union of keys across every parsed row, not just the first --
// a ragged first row (fewer fields than the rest, see the FieldMismatch
// case Provide Data deliberately doesn't handle) would otherwise make the
// header list look incomplete even though later rows have the missing
// column. __parsed_extra is PapaParse's own synthetic key for a row with
// too many fields, not a real header, so it's excluded.
const detectedHeaders = computed(() => {
  const headers = new Set()
  for (const row of props.rawRows) {
    for (const key of Object.keys(row)) {
      if (key !== '__parsed_extra') headers.add(key)
    }
  }
  return Array.from(headers)
})

// Loosely normalizes text for fuzzy header matching: lowercase, strip
// everything but letters/digits, so "Grant Name", "grant_name", and
// "Grant-Name " all collapse to the same comparable key.
function normalizeForMatch(text) {
  return text.toLowerCase().replace(/[^a-z0-9]/g, '')
}

// Checks a field spec entry's column AND label against every detected
// header, since a real file might use either form ("grant_name" or
// "Grant Name") as its header text.
function autoMatchColumn(field, headers) {
  const candidates = [field.column, field.label].map(normalizeForMatch)
  return headers.find((header) => candidates.includes(normalizeForMatch(header))) ?? null
}

// Reloads the field spec, re-seeds the column mapping, and (re)builds the
// assignee lookup whenever the selected table changes. Deliberately
// separate from runValidation (triggered below by columnMapping itself)
// since none of this needs to repeat just because the admin nudged one
// dropdown -- especially the assignee lookup, which would otherwise
// re-query profiles on every mapping tweak for no reason.
watch(
  () => props.selectedTable,
  async (table) => {
    fieldSpecModule.value = null
    columnMapping.value = {}
    validationContext.value = {}
    if (!table) return

    const module = await table.fieldSpec()
    const spec = module.default
    fieldSpecModule.value = spec

    // Must resolve BEFORE columnMapping is assigned below -- that
    // assignment is what triggers the columnMapping watcher into
    // runValidation, and buildAssigneeLookup is a real network round-trip
    // far slower than the microtask that watcher fires on. Building it
    // first, in this same async function, guarantees validationContext is
    // fully ready by the time anything reads it -- ordering, not a
    // defensive null-check in resolveAssignee, is the actual fix here.
    if (spec.fields.some((field) => field.needsContext === 'assigneeLookup')) {
      validationContext.value = { assigneeLookup: await buildAssigneeLookup(supabase) }
    }

    const mapping = {}
    for (const field of spec.fields) {
      mapping[field.column] = autoMatchColumn(field, detectedHeaders.value)
    }
    columnMapping.value = mapping
  },
  { immediate: true },
)

// Re-validates whenever the mapping changes -- including the very first
// assignment above, which is exactly when the initial auto-matched mapping
// needs its first validation pass.
watch(columnMapping, runValidation, { deep: true })

// Validates one raw row against the current mapping. errors (per-column)
// and rowErrors (from the spec's optional validateRow hook) are kept as
// separate arrays/objects on purpose -- a validateRow failure (e.g.
// program_plan_progress's milestones_complete > milestones_total) isn't
// about any single column, so it must never be attached to one cell the
// way a per-field error is; the grid renders the two in different places
// for exactly this reason.
function validateOneRow(raw, spec) {
  const values = {}
  const errors = {}
  for (const field of spec.fields) {
    const header = columnMapping.value[field.column]
    // partialUpdate's excluded columns are skipped entirely, not validated
    // against a blank cell -- that's what makes them "left unchanged"
    // rather than "cleared to null" on the eventual upsert.
    if (spec.partialUpdate && header == null) continue
    const result = field.validate(header != null ? raw[header] : '', validationContext.value)
    if (result.ok) values[field.column] = result.value
    else errors[field.column] = result.error
  }
  if (spec.fixedFields) Object.assign(values, spec.fixedFields)

  const rowErrors = []
  if (spec.validateRow && Object.keys(errors).length === 0) {
    const check = spec.validateRow(values)
    if (!check.ok) rowErrors.push(check.error)
  }
  return { raw, values, errors, rowErrors, valid: Object.keys(errors).length === 0 && rowErrors.length === 0 }
}

// Queries the real existing milestone_names for one plan_year and diffs
// them against this import's incoming set, so Preview can show an actual
// count/list of what would be deleted rather than a generic warning.
// Skipped for a group that already failed validateGroup, since an invalid
// group won't be executed regardless -- no reason to spend the query.
async function buildGroupResult(group, spec) {
  const check = spec.validateGroup(group.milestones)
  if (!check.ok) {
    return { planYear: group.plan_year, milestones: group.milestones, groupValid: false, groupError: check.error, staleCount: 0, staleNames: [] }
  }

  const { data, error } = await supabase
    .from('program_plan_milestones')
    .select('milestone_name')
    .eq('plan_year', group.plan_year)
  if (error) throw error

  const incomingNames = new Set(group.milestones.map((m) => m.milestone_name))
  const staleNames = data.map((row) => row.milestone_name).filter((name) => !incomingNames.has(name))
  return { planYear: group.plan_year, milestones: group.milestones, groupValid: true, groupError: null, staleCount: staleNames.length, staleNames }
}

let __debugCallCounter = 0
async function runValidation() {
  const callId = ++__debugCallCounter
  const spec = fieldSpecModule.value
  console.log(`[DEBUG#${callId} ENTRY]`, JSON.stringify({ hasSpec: !!spec, rawRowsLength: props.rawRows.length, columnMapping: columnMapping.value }))
  if (!spec) { console.log(`[DEBUG#${callId} EARLY RETURN no spec]`); return }

  isValidating.value = true
  try {
    excludedFields.value = spec.partialUpdate
      ? spec.fields.filter((field) => columnMapping.value[field.column] == null).map((field) => field.label)
      : []

    const rows = props.rawRows.map((raw) => validateOneRow(raw, spec))
    validatedRows.value = rows

    if (spec.toPayloadGroups) {
      const validValues = rows.filter((row) => row.valid).map((row) => row.values)
      const groups = spec.toPayloadGroups(validValues)
      console.log(`[DEBUG#${callId} DONE]`, JSON.stringify({ rowsLength: rows.length, validCount: rows.filter((r) => r.valid).length, validValuesLength: validValues.length, groupsLength: groups.length }))
      milestoneGroups.value = await Promise.all(groups.map((group) => buildGroupResult(group, spec)))
      console.log(`[DEBUG#${callId} milestoneGroups SET]`, JSON.stringify(milestoneGroups.value))
    } else {
      milestoneGroups.value = null
    }
  } finally {
    isValidating.value = false
    console.log(`[DEBUG#${callId} FINALLY]`, JSON.stringify({ finalValidatedRowsValidCount: validatedRows.value.filter((r) => r.valid).length, finalMilestoneGroups: milestoneGroups.value }))
  }
}
</script>

<template>
  <div class="preview-step">
    <p v-if="!fieldSpecModule">Loading…</p>
    <template v-else>
      <h2 class="section-title">Match Columns</h2>
      <ImportColumnMapping v-model="columnMapping" :fields="fieldSpecModule.fields" :detected-headers="detectedHeaders" />

      <p v-if="isValidating" class="validating">Validating…</p>
      <template v-else>
        <h2 class="section-title">Preview</h2>
        <ImportValidationGrid
          :fields="fieldSpecModule.fields"
          :validated-rows="validatedRows"
          :excluded-fields="excludedFields"
          :milestone-groups="milestoneGroups"
          :column-mapping="columnMapping"
          :partial-update="!!fieldSpecModule.partialUpdate"
        />
      </template>
    </template>
  </div>
</template>

<style scoped>
.preview-step {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-title {
  margin: 12px 0 0;
  font-size: 16px;
  font-weight: 600;
  color: #2d3142;
}

.validating {
  margin: 0;
  color: #8a8a85;
  font-size: 13px;
}
</style>
