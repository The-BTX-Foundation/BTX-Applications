<script setup>
// Shared inline "who are you" prompt -- extracted from Interviews.vue so
// Scoring.vue and ScoreApplicant.vue reuse the same flow instead of each
// building their own copy. See useReviewerIdentityStore's own comment for
// why this is a self-typed label, not a new identity model: a simple
// inline input, not a modal, stored in-memory for this session only.
import { ref } from 'vue'
import { useReviewerIdentityStore } from '@/stores/reviewerIdentity'

defineProps({
  helpText: { type: String, required: true },
})
const emit = defineEmits(['confirmed'])

const reviewerIdentity = useReviewerIdentityStore()
const labelInput = ref('')

// Stores the self-typed label in the shared store and tells the parent
// page to run its own first fetch for it -- this component only owns the
// input/store write, not what the page does after.
function confirmLabel() {
  const trimmed = labelInput.value.trim()
  if (!trimmed) return
  reviewerIdentity.setLabel(trimmed)
  emit('confirmed', reviewerIdentity.label)
}
</script>

<template>
  <div class="reviewer-label-prompt">
    <p class="label-prompt-help">{{ helpText }}</p>
    <form class="label-prompt-form" @submit.prevent="confirmLabel">
      <input v-model="labelInput" type="text" placeholder="e.g. J. Smith" class="label-input" />
      <button type="submit" class="label-submit-btn" :disabled="!labelInput.trim()">Continue</button>
    </form>
  </div>
</template>

<style scoped>
.label-prompt-help {
  margin: 10px 0 0;
  max-width: 420px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--color-header-muted);
}

.label-prompt-form {
  margin-top: 18px;
  display: flex;
  gap: 10px;
}

.label-input {
  flex: 1;
  min-width: 0;
  padding: 11px 14px;
  border: 1px solid var(--color-border-strong);
  border-radius: 10px;
  background: var(--color-surface);
  color: var(--color-text-primary);
  font-size: 13.5px;
  font-family: inherit;
}

.label-submit-btn {
  flex-shrink: 0;
  padding: 11px 18px;
  border: none;
  border-radius: 10px;
  background: var(--color-header-strong);
  color: var(--color-surface);
  font-size: 13.5px;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
}

.label-submit-btn:hover:not(:disabled) {
  opacity: 0.92;
}

.label-submit-btn:disabled {
  background: var(--color-border-strong);
  color: var(--color-text-secondary);
  cursor: not-allowed;
}
</style>
