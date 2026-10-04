<script setup>
// Labeled dropdown, reused for every single-select-from-a-long-list field
// (Race, Major, and future steps' lists). Options can be plain strings or
// {label, value} objects -- optionValue/optionLabel below normalize either.
defineProps({
  label: { type: String, required: true },
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: 'Select one' },
  required: { type: Boolean, default: false },
  options: { type: Array, required: true },
})

defineEmits(['update:modelValue'])

// Normalizes an option to its underlying value, for plain-string or {label,value} options.
function optionValue(opt) {
  return typeof opt === 'string' ? opt : opt.value
}

// Normalizes an option to its display label, for plain-string or {label,value} options.
function optionLabel(opt) {
  return typeof opt === 'string' ? opt : opt.label
}
</script>

<template>
  <label class="field">
    <span class="field-label">{{ label }} <span v-if="required" class="field-required">*</span></span>
    <div class="select-wrap">
      <select
        class="select-input"
        :class="{ 'select-input--placeholder': !modelValue }"
        :value="modelValue"
        @change="$emit('update:modelValue', $event.target.value)"
      >
        <option value="" disabled>{{ placeholder }}</option>
        <option v-for="opt in options" :key="optionValue(opt)" :value="optionValue(opt)">
          {{ optionLabel(opt) }}
        </option>
      </select>
      <span class="select-chevron" aria-hidden="true">⌄</span>
    </div>
  </label>
</template>

<style scoped>
.field {
  display: block;
}

.select-wrap {
  position: relative;
}

.select-input {
  width: 100%;
  padding: 14px 40px 14px 16px;
  border: 1px solid var(--color-border-strong);
  border-radius: 10px;
  background: var(--color-surface);
  color: var(--color-text-primary);
  font-size: 15px;
  font-family: inherit;
  appearance: none;
}

.select-input--placeholder {
  color: var(--color-text-secondary);
}

.select-chevron {
  position: absolute;
  top: 50%;
  right: 16px;
  transform: translateY(-50%);
  color: var(--color-text-secondary);
  pointer-events: none;
  font-size: 16px;
}
</style>
