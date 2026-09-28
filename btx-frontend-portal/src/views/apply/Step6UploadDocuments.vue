<script setup>
import { computed, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { useApplicationStore } from '../../stores/application'
import FileUploadCard from '../../components/FileUploadCard.vue'
import { isStepValid } from '../../lib/stepValidation'

const router = useRouter()
const store = useApplicationStore()

// PLACEHOLDER: 10 MB, pending confirmation against the real storage limit
// once uploads are actually wired to Supabase Storage.
const MAX_FILE_BYTES = 10 * 1024 * 1024

// Per-card validation error, keyed the same way as store.setDocument's
// `kind` argument ('resume' | 'transcript').
const errors = reactive({ resume: '', transcript: '' })

// The `accept` attribute on the file input is only a hint browsers may
// ignore (or a user can bypass via drag-and-drop), so the actual type is
// always re-checked here after a file is picked.
function isPdf(file) {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
}

// Returns an error message for an invalid file, or '' if it passes.
function validate(file) {
  if (!isPdf(file)) return 'Only PDF files are accepted.'
  if (file.size === 0) return 'This file is empty. Choose a different file.'
  if (file.size > MAX_FILE_BYTES) return 'This file is larger than 10 MB. Choose a smaller file.'
  return ''
}

// Shared @select handler for both cards. A rejected file is never stored --
// it leaves any existing valid selection in place -- while a successful
// pick clears whatever error was previously showing for that slot.
function onSelect(kind, file) {
  const message = validate(file)
  errors[kind] = message
  if (!message) store.setDocument(kind, file)
}

const isValid = computed(() => isStepValid(6, store))

// Advances to Step 7. currentStep is set here (in addition to
// ApplyStepView's route watcher) so the draft reflects "completed step 6"
// the instant Continue is clicked, not only once navigation resolves.
function onContinue() {
  if (!isValid.value) return
  store.currentStep = 7
  router.push('/apply/7')
}
</script>

<template>
  <div>
    <h1 class="step-heading">Upload documents</h1>
    <p class="step-subline">
      Both files are required. Missing documents disqualify an application for the current cycle.
    </p>

    <div class="upload-list">
      <FileUploadCard
        title="Resume"
        hint="Name the file YourName_Resume.pdf"
        accept=".pdf,application/pdf"
        :file="store.files.resume"
        :saved-name="store.resumeFileName"
        :error="errors.resume"
        @select="(file) => onSelect('resume', file)"
      />
      <FileUploadCard
        title="Unofficial transcript"
        hint="Name the file YourName_Unofficial_Transcript.pdf"
        accept=".pdf,application/pdf"
        :file="store.files.transcript"
        :saved-name="store.transcriptFileName"
        :error="errors.transcript"
        @select="(file) => onSelect('transcript', file)"
      />
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

.upload-list {
  margin-top: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
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
