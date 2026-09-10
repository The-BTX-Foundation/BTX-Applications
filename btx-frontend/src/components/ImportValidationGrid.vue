<script setup>
import { computed } from 'vue'

const props = defineProps({
  fields: { type: Array, required: true }, // selected table's field spec .fields array
  validatedRows: { type: Array, required: true }, // { raw, values, errors, rowErrors, valid }[]
  excludedFields: { type: Array, default: () => [] }, // donor_impact-only: unmapped field labels
  milestoneGroups: { type: Array, default: null }, // program_plan_milestones-only: per-plan_year groups
  columnMapping: { type: Object, required: true }, // { [fieldColumn]: matchedHeader | null }
  partialUpdate: { type: Boolean, default: false }, // true only for donor_impact
})

const validCount = computed(() => props.validatedRows.filter((row) => row.valid).length)

// The milder counterpart to excludedFields, for every table EXCEPT
// donor_impact: an unmapped OPTIONAL field on a plain upsert table doesn't
// leave existing rows untouched (that's only partialUpdate's behavior) --
// it just validates to null for every row, same as if the column existed
// but every cell in it were blank. Skipped entirely for partialUpdate
// tables since excludedFields already explains those unmapped columns with
// the correct (different) behavior. required(...)'s .isRequired marker is
// what makes "optional" checkable here at all -- see importValidators.js.
const blankedFields = computed(() => {
  if (props.partialUpdate) return []
  return props.fields.filter((field) => !field.validate.isRequired && !props.columnMapping[field.column]).map((field) => field.label)
})

// Per-cell errors and the row-level validateRow error are counted together
// for the status column's "N errors" summary, even though they're rendered
// in different places below (see the rowErrors comment on validatedRows'
// definition in ImportWizard.vue) -- the admin scanning this column just
// wants a total, not which kind.
function errorCount(row) {
  return Object.keys(row.errors).length + row.rowErrors.length
}

function formatValue(value) {
  if (value === null || value === undefined) return '—'
  return String(value)
}
</script>

<template>
  <div class="validation-grid">
    <p class="summary">{{ validCount }} of {{ validatedRows.length }} row{{ validatedRows.length === 1 ? '' : 's' }} valid.</p>

    <div v-if="excludedFields.length > 0" class="info-box">
      These fields were not found in your file and will be left unchanged on existing rows:
      {{ excludedFields.join(', ') }}
    </div>

    <div v-if="blankedFields.length > 0" class="info-box">
      These optional fields weren't found and will be set to blank for every row:
      {{ blankedFields.join(', ') }}
    </div>

    <div v-if="milestoneGroups" class="milestone-groups">
      <div
        v-for="group in milestoneGroups"
        :key="group.planYear"
        class="milestone-group"
        :class="{ 'milestone-group--invalid': !group.groupValid }"
      >
        <p class="group-title">
          Plan Year {{ group.planYear }} — {{ group.milestones.length }} milestone{{ group.milestones.length === 1 ? '' : 's' }}
        </p>
        <p v-if="!group.groupValid" class="group-error">{{ group.groupError }}</p>
        <p v-else-if="group.staleCount > 0" class="group-warning">
          This will delete {{ group.staleCount }} existing milestone{{ group.staleCount === 1 ? '' : 's' }}:
          {{ group.staleNames.join(', ') }}
        </p>
      </div>
    </div>

    <table class="rows-table">
      <thead>
        <tr>
          <th class="status-col"></th>
          <th v-for="field in fields" :key="field.column">{{ field.label }}</th>
        </tr>
      </thead>
      <tbody>
        <template v-for="(row, index) in validatedRows" :key="index">
          <tr :class="{ 'row--invalid': !row.valid }">
            <td class="status-col">
              <span v-if="row.valid">✓</span>
              <span v-else class="status-error">✗ {{ errorCount(row) }} error{{ errorCount(row) === 1 ? '' : 's' }}</span>
            </td>
            <td v-for="field in fields" :key="field.column" :class="{ 'cell--error': row.errors[field.column] }">
              <span v-if="row.errors[field.column]" class="cell-error">{{ row.errors[field.column] }}</span>
              <span v-else>{{ formatValue(row.values[field.column]) }}</span>
            </td>
          </tr>
          <!-- Rendered as its own full-width row directly below the row it
               belongs to, rather than inside any single cell -- a validateRow
               failure (e.g. program_plan_progress's milestones_complete >
               milestones_total) isn't about one column, so it never gets
               attached to one. -->
          <tr v-if="row.rowErrors.length > 0" class="row-error-row">
            <td :colspan="fields.length + 1" class="row-error">{{ row.rowErrors.join(' ') }}</td>
          </tr>
        </template>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.validation-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.summary {
  margin: 0;
  font-size: 14px;
  color: #2d3142;
}

.info-box {
  background: #f7f6f3;
  border: 1px solid #e5e3dd;
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 13px;
  color: #4a4a4a;
}

.milestone-groups {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.milestone-group {
  border: 0.5px solid #e5e3dd;
  border-radius: 12px;
  padding: 12px 14px;
}

.milestone-group--invalid {
  border: 1px solid #b3261e;
}

.group-title {
  margin: 0 0 4px;
  font-size: 14px;
  font-weight: 500;
  color: #2d3142;
}

.group-error {
  margin: 0;
  color: #b3261e;
  font-size: 13px;
}

.group-warning {
  margin: 0;
  color: #854f0b;
  font-size: 13px;
}

.rows-table {
  width: 100%;
  border-collapse: collapse;
}

.rows-table th {
  text-align: left;
  font-size: 12px;
  font-weight: 600;
  color: #8a8a85;
  padding: 0 8px 8px 0;
}

.rows-table td {
  padding: 6px 8px 6px 0;
  font-size: 13px;
  color: #2d3142;
  vertical-align: top;
}

.status-col {
  white-space: nowrap;
  width: 1%;
}

.status-error {
  color: #b3261e;
  font-weight: 500;
}

.cell-error {
  color: #b3261e;
}

.row-error-row td {
  padding-top: 0;
}

.row-error {
  color: #b3261e;
  font-size: 12px;
  font-style: italic;
}
</style>
