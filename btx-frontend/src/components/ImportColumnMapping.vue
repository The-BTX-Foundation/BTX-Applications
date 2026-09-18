<script setup>
// Purely presentational -- the detected header list and the initial
// auto-matched guesses are computed by the parent (ImportPreviewStep.vue),
// since both depend on rawRows/the field spec, which this component has no
// reason to know about directly. columnMapping is a plain object
// { [fieldColumn]: matchedHeader | null } mutated in place via v-model on
// each <select>; because parent and child share the same reactive object
// (objects passed as props aren't cloned), mutating one of its properties
// here is visible to the parent immediately, without needing defineModel's
// whole-value reassignment path.
defineProps({
  fields: { type: Array, required: true }, // selected table's field spec .fields array
  detectedHeaders: { type: Array, required: true }, // union of header keys found across rawRows
})

const columnMapping = defineModel({ required: true })
</script>

<template>
  <div class="column-mapping">
    <div
      v-for="field in fields"
      :key="field.column"
      class="mapping-row"
      :class="{ 'mapping-row--unmapped': !columnMapping[field.column] }"
    >
      <span class="field-name">{{ field.label }}</span>
      <select v-model="columnMapping[field.column]" class="mapping-select">
        <option :value="null">— Not mapped —</option>
        <option v-for="header in detectedHeaders" :key="header" :value="header">{{ header }}</option>
      </select>
    </div>
  </div>
</template>

<style scoped>
.column-mapping {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mapping-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 0;
}

.mapping-row--unmapped .field-name {
  color: var(--color-text-secondary);
}

.field-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-primary);
}

.mapping-select {
  border: 1px solid var(--color-border-strong);
  border-radius: 8px;
  padding: 6px 8px;
  font-size: 13px;
  font-family: inherit;
  color: var(--color-text-primary);
  min-width: 200px;
}
</style>
