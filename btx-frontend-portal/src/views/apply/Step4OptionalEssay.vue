<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useApplicationStore } from '../../stores/application'

const router = useRouter()
const store = useApplicationStore()

const MAX_CHARACTERS = 3000

// PLACEHOLDER essay prompt -- swap for the real Legacy Award essay prompt
// when provided. Shown as the textarea's placeholder text, not typed-in
// content, so it disappears the moment the applicant starts writing.
const ESSAY_PROMPT =
  'Describe a moment when engineering felt personal to you — a challenge, a community need, or an experience that shaped why you want to become an engineer. (500 words max)'

const charCount = computed(() => store.essayText.length)

// Hard-caps the stored value at MAX_CHARACTERS -- typing or pasting past
// the limit has no further effect, rather than letting the count run past
// 3000 and clamping only the display.
function onInput(event) {
  store.essayText = event.target.value.slice(0, MAX_CHARACTERS)
}

// Skip and Continue both just move on -- the essay is optional for every
// applicant, so neither button validates or clears essayText.
function goToStep5() {
  store.currentStep = 5
  router.push('/apply/5')
}
</script>

<template>
  <div>
    <h1 class="step-heading">Optional essay</h1>
    <p class="step-subline">
      The BTX Legacy Award has historically included an essay. Answering is optional for every
      applicant, but it strengthens your consideration for the Legacy Award specifically.
    </p>

    <div class="section-header">
      <h2 class="section-heading">Placeholder prompt</h2>
      <span class="optional-pill">Optional</span>
    </div>

    <textarea
      class="essay-textarea"
      :value="store.essayText"
      :placeholder="ESSAY_PROMPT"
      :maxlength="MAX_CHARACTERS"
      rows="6"
      @input="onInput"
    ></textarea>
    <p class="char-count">{{ charCount }} / {{ MAX_CHARACTERS }} characters</p>

    <div class="button-row">
      <button type="button" class="skip-btn" @click="goToStep5">Skip for now</button>
      <button type="button" class="continue-btn" @click="goToStep5">Continue</button>
    </div>
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

.section-header {
  margin-top: 24px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.section-heading {
  font-weight: 700;
  font-size: 16px;
  color: var(--color-text-primary);
}

.optional-pill {
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--color-border);
  color: var(--color-text-secondary);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.essay-textarea {
  margin-top: 12px;
  width: 100%;
  min-height: 160px;
  padding: 16px;
  border: 1px solid var(--color-border-strong);
  border-radius: 12px;
  background: var(--color-surface);
  color: var(--color-text-primary);
  font-size: 15px;
  font-family: inherit;
  line-height: 1.6;
  resize: vertical;
}

.essay-textarea::placeholder {
  color: var(--color-text-secondary);
}

.char-count {
  margin-top: 8px;
  text-align: right;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.button-row {
  margin-top: 24px;
  display: flex;
  gap: 12px;
}

.skip-btn,
.continue-btn {
  flex: 1;
  padding: 16px;
  border-radius: 10px;
  font-weight: 700;
  font-size: 15px;
  font-family: inherit;
  cursor: pointer;
}

.skip-btn {
  border: 1px solid var(--color-border-strong);
  background: var(--color-surface);
  color: var(--color-text-primary);
}

.continue-btn {
  border: none;
  background: var(--color-header-strong);
  color: #fff;
}

.skip-btn:hover,
.continue-btn:hover {
  opacity: 0.92;
}
</style>
