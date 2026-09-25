<script setup>
// Full-width selectable row, reused for every single-select and
// multi-select list in the wizard (Step 2's "how did you hear" list, Step
// 3's award opt-outs and certification checkbox, and future steps' similar
// lists). The parent owns selection state -- this component only renders
// one row and emits 'select' on click, so it works the same whether the
// parent treats its options as single-select (radio) or independent
// toggles (checkbox).
defineProps({
  variant: { type: String, default: 'card' }, // 'card' (squarer, bordered) | 'pill' (taller, fully rounded)
  type: { type: String, default: 'radio' }, // 'radio' | 'checkbox'
  label: { type: String, required: true },
  subtext: { type: String, default: '' },
  selected: { type: Boolean, default: false },
})

defineEmits(['select'])
</script>

<template>
  <button
    type="button"
    class="option-row"
    :class="[`option-row--${variant}`, { 'option-row--selected': selected }]"
    :role="type === 'radio' ? 'radio' : 'checkbox'"
    :aria-checked="selected"
    @click="$emit('select')"
  >
    <span class="option-indicator" :class="[`option-indicator--${type}`, { 'option-indicator--selected': selected }]">
      <span v-if="selected && type === 'radio'" class="option-dot" aria-hidden="true"></span>
      <span v-else-if="selected && type === 'checkbox'" class="option-check" aria-hidden="true">✓</span>
    </span>
    <span class="option-text">
      <span class="option-label">{{ label }}</span>
      <span v-if="subtext" class="option-subtext">{{ subtext }}</span>
    </span>
  </button>
</template>

<style scoped>
.option-row {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  width: 100%;
  text-align: left;
  background: var(--color-surface);
  border: 1px solid var(--color-border-strong);
  cursor: pointer;
  font-family: inherit;
}

.option-row--card {
  padding: 16px 18px;
  border-radius: 12px;
}

.option-row--pill {
  padding: 22px 20px;
  border-radius: 20px;
  align-items: center;
}

.option-row--selected {
  border-color: var(--color-header-strong);
}

.option-indicator {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--color-border-strong);
  background: var(--color-surface);
}

.option-indicator--radio {
  width: 24px;
  height: 24px;
  border-radius: 50%;
}

.option-indicator--checkbox {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  margin-top: 1px;
}

.option-indicator--selected {
  border-color: var(--color-header-strong);
}

.option-indicator--checkbox.option-indicator--selected {
  background: var(--color-header-strong);
}

.option-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--color-header-strong);
}

.option-check {
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  line-height: 1;
}

.option-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.option-label {
  font-weight: 700;
  font-size: 15px;
  color: var(--color-text-primary);
}

.option-subtext {
  font-size: 13px;
  color: var(--color-text-secondary);
}
</style>
