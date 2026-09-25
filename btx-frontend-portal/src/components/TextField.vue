<script setup>
// Labeled single-line input, reused across every text/email/tel/number
// field in the wizard. inheritAttrs is off so extra attributes passed by
// the parent (inputmode, maxlength, autocomplete, ...) land on the actual
// <input>, not the outer <label>.
defineOptions({ inheritAttrs: false })

defineProps({
  label: { type: String, required: true },
  modelValue: { type: [String, Number], default: '' },
  placeholder: { type: String, default: '' },
  type: { type: String, default: 'text' },
  required: { type: Boolean, default: false },
  error: { type: String, default: '' },
})

defineEmits(['update:modelValue', 'blur'])
</script>

<template>
  <label class="field">
    <span class="field-label">{{ label }} <span v-if="required" class="field-required">*</span></span>
    <input
      class="text-input"
      :class="{ 'text-input--error': error }"
      :type="type"
      :value="modelValue"
      :placeholder="placeholder"
      v-bind="$attrs"
      @input="$emit('update:modelValue', $event.target.value)"
      @blur="$emit('blur')"
    />
    <span v-if="error" class="field-error">{{ error }}</span>
  </label>
</template>

<style scoped>
.field {
  display: block;
}

.text-input {
  width: 100%;
  padding: 14px 16px;
  border: 1px solid var(--color-border-strong);
  border-radius: 10px;
  background: var(--color-surface);
  color: var(--color-text-primary);
  font-size: 15px;
  font-family: inherit;
}

.text-input::placeholder {
  color: var(--color-text-secondary);
}

.text-input--error {
  border-color: var(--color-danger-text);
}

.field-error {
  display: block;
  margin-top: 6px;
  font-size: 12px;
  color: var(--color-danger-text);
}
</style>
