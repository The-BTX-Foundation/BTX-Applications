<script setup>
import { IMPORT_TABLES } from '@/lib/importTables.js'

const selectedTable = defineModel({ default: null })

// One-line "how this gets matched" hint per table, derived entirely from
// fields already on the registry entry (naturalKey/writeMode/createOnly/
// groupBy) -- no per-table hint text needs to be hand-written or kept in
// sync separately.
function describeMatch(entry) {
  if (entry.createOnly) return 'Creates new rows only'
  if (entry.writeMode === 'replace-set') {
    return `Grouped by ${titleCase(entry.groupBy)} — replaces each group's full set`
  }
  return `Matched by ${entry.naturalKey.map(titleCase).join(' + ')}`
}

// Converts a snake_case column name to display form, e.g. "grant_name" -> "Grant Name".
function titleCase(column) {
  return column
    .split('_')
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ')
}
</script>

<template>
  <div class="choose-table">
    <button
      v-for="entry in IMPORT_TABLES"
      :key="entry.id"
      type="button"
      class="table-card"
      :class="{ 'table-card--active': selectedTable?.id === entry.id }"
      @click="selectedTable = entry"
    >
      <span class="table-label">{{ entry.label }}</span>
      <span class="table-hint">{{ describeMatch(entry) }}</span>
    </button>
  </div>
</template>

<style scoped>
.choose-table {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.table-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  width: 100%;
  background: #fff;
  border: 0.5px solid #e5e3dd;
  border-radius: 12px;
  padding: 12px 14px;
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.table-card--active {
  border: 1px solid #c9932a;
}

.table-label {
  font-size: 15px;
  font-weight: 500;
  color: #2d3142;
}

.table-hint {
  font-size: 13px;
  color: #8a8a85;
}
</style>
