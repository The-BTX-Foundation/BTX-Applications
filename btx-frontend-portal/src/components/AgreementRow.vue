<script setup>
// Plain checkbox row used by Step 7's three agreement checkboxes. Unlike
// OptionRow (always a bordered card or pill), the mockup here has no
// border around the row itself -- just a checkbox + label, separated from
// its neighbors by a hairline divider -- so it's its own small component
// rather than a forced OptionRow variant.
defineProps({
  label: { type: String, required: true },
  selected: { type: Boolean, default: false },
})

defineEmits(['select'])
</script>

<template>
  <button
    type="button"
    class="agreement-row"
    role="checkbox"
    :aria-checked="selected"
    @click="$emit('select')"
  >
    <span class="agreement-checkbox" :class="{ 'agreement-checkbox--selected': selected }">
      <span v-if="selected" class="agreement-check" aria-hidden="true">✓</span>
    </span>
    <span class="agreement-label">{{ label }}</span>
  </button>
</template>

<style scoped>
.agreement-row {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  width: 100%;
  padding: 20px 0;
  border: none;
  border-bottom: 1px solid var(--color-border);
  background: none;
  text-align: left;
  cursor: pointer;
  font-family: inherit;
}

.agreement-checkbox {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  margin-top: 1px;
  border-radius: 6px;
  border: 2px solid var(--color-border-strong);
  background: var(--color-surface);
  display: flex;
  align-items: center;
  justify-content: center;
}

.agreement-checkbox--selected {
  border-color: var(--color-header-strong);
  background: var(--color-header-strong);
}

.agreement-check {
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  line-height: 1;
}

.agreement-label {
  font-size: 15px;
  color: var(--color-text-primary);
  line-height: 1.5;
}
</style>
