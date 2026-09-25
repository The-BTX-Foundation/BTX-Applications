<script setup>
// Labeled single-select button row, reused for every either/or or
// short-multiple-choice field (Gender, UMD attendance, Education status,
// and future steps' similar fields). Options can be plain strings or
// {label, value} objects, same convention as SelectField.
defineProps({
  label: { type: String, required: true },
  modelValue: { type: String, default: '' },
  required: { type: Boolean, default: false },
  options: { type: Array, required: true },
})

defineEmits(['update:modelValue'])

function optionValue(opt) {
  return typeof opt === 'string' ? opt : opt.value
}

function optionLabel(opt) {
  return typeof opt === 'string' ? opt : opt.label
}
</script>

<template>
  <div class="field">
    <span class="field-label">{{ label }} <span v-if="required" class="field-required">*</span></span>
    <div class="segmented" role="radiogroup" :aria-label="label">
      <button
        v-for="opt in options"
        :key="optionValue(opt)"
        type="button"
        class="segmented-btn"
        :class="{ 'segmented-btn--selected': modelValue === optionValue(opt) }"
        :aria-pressed="modelValue === optionValue(opt)"
        @click="$emit('update:modelValue', optionValue(opt))"
      >
        {{ optionLabel(opt) }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.field {
  display: block;
}

.segmented {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.segmented-btn {
  /* flex-basis 0 + equal grow, deliberately WITHOUT a min-width override:
     the default min-width:auto means a long label (e.g. "Prefer not to
     say") still claims its own min-content width instead of being
     compressed, while shorter labels grow to fill the rest of the row --
     matching the mockup's uneven-but-no-wrap button widths at mobile
     widths. */
  flex: 1 1 0;
  padding: 12px 10px;
  border: 1px solid var(--color-border-strong);
  border-radius: 10px;
  background: var(--color-surface);
  color: var(--color-text-primary);
  font-weight: 700;
  font-size: 14px;
  font-family: inherit;
  text-align: center;
  white-space: nowrap;
  cursor: pointer;
}

.segmented-btn:hover:not(.segmented-btn--selected) {
  border-color: var(--color-text-secondary);
}

.segmented-btn--selected {
  background: var(--color-header-strong);
  border-color: var(--color-header-strong);
  color: #fff;
}
</style>
