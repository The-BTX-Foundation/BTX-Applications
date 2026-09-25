<script setup>
// Small standalone toggle chip for compact multi-select grids -- used by
// Step 5's interview time slots, where OptionRow's full-width row (with
// its own radio/checkbox indicator) doesn't fit the mockup's plain,
// text-only pill grid. Reusable for any future many-small-pills layout.
defineProps({
  label: { type: String, required: true },
  selected: { type: Boolean, default: false },
})

defineEmits(['select'])
</script>

<template>
  <button
    type="button"
    class="pill-toggle"
    :class="{ 'pill-toggle--selected': selected }"
    :aria-pressed="selected"
    @click="$emit('select')"
  >
    {{ label }}
  </button>
</template>

<style scoped>
.pill-toggle {
  /* Sized by the parent's CSS grid column (see Step5's .slot-row), not by
     its own content -- a flex/flex-grow row was tried first, but when a
     4th item wrapped to its own line at narrow widths it stretched to
     fill the whole row alone (an ugly "3 + 1 giant pill" layout). A grid
     column keeps every pill the same width and, if a row ever needs to
     wrap, wraps as a clean sub-grid instead of one oversized orphan. */
  width: 100%;
  padding: 12px 6px;
  border: 1px solid var(--color-border-strong);
  border-radius: 999px;
  background: var(--color-surface);
  color: var(--color-text-primary);
  font-weight: 700;
  font-size: 13px;
  font-family: inherit;
  text-align: center;
  white-space: nowrap;
  cursor: pointer;
}

.pill-toggle:hover:not(.pill-toggle--selected) {
  border-color: var(--color-text-secondary);
}

.pill-toggle--selected {
  background: var(--color-header-strong);
  border-color: var(--color-header-strong);
  color: #fff;
}
</style>
