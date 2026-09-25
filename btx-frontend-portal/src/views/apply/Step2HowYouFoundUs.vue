<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useApplicationStore } from '../../stores/application'
import OptionRow from '../../components/OptionRow.vue'

const router = useRouter()
const store = useApplicationStore()

const HOW_HEARD_OPTIONS = [
  'I was nominated!',
  'A friend or mentor shared it with me!',
  'Instagram or LinkedIn',
  'Other',
]

const isValid = computed(() => store.howHeard.length > 0)

// Advances to Step 3. currentStep is set here (in addition to
// ApplyStepView's route watcher) so the draft reflects "completed step 2"
// the instant Continue is clicked, not only once navigation resolves.
function onContinue() {
  if (!isValid.value) return
  store.currentStep = 3
  router.push('/apply/3')
}
</script>

<template>
  <div>
    <h1 class="step-heading">How you found us</h1>
    <p class="step-subline">Nomination isn't required to apply.</p>

    <div class="field question">
      <span class="field-label">How did you hear about this scholarship? <span class="field-required">*</span></span>
      <div class="option-list">
        <OptionRow
          v-for="option in HOW_HEARD_OPTIONS"
          :key="option"
          variant="pill"
          type="radio"
          :label="option"
          :selected="store.howHeard === option"
          @select="store.howHeard = option"
        />
      </div>
    </div>

    <button type="button" class="continue-btn" :disabled="!isValid" @click="onContinue">Continue</button>
  </div>
</template>

<style scoped>
.step-heading {
  margin-top: 20px;
  font-family: var(--font-serif);
  font-weight: 800;
  font-size: 32px;
  color: var(--color-header-strong);
}

.step-subline {
  margin-top: 8px;
  font-size: 15px;
  color: var(--color-text-secondary);
}

.question {
  margin-top: 24px;
}

.option-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.continue-btn {
  margin-top: 28px;
  width: 100%;
  padding: 16px;
  border: none;
  border-radius: 10px;
  background: var(--color-header-strong);
  color: #fff;
  font-weight: 700;
  font-size: 15px;
  cursor: pointer;
}

.continue-btn:hover:not(:disabled) {
  opacity: 0.92;
}

.continue-btn:disabled {
  background: var(--color-border-strong);
  color: var(--color-text-secondary);
  cursor: not-allowed;
}
</style>
