<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useApplicationStore } from '../../stores/application'
import { getIncompleteSteps } from '../../lib/stepValidation'
import { AWARDS } from '../../lib/awards'
import AgreementRow from '../../components/AgreementRow.vue'

const router = useRouter()
const store = useApplicationStore()

// "Considered for" -- every award NOT opted out of, in AWARDS' fixed
// order, joined by its short label. "None" only when all three are opted
// out (opting out of all of them is allowed, just unusual).
const consideredFor = computed(() => {
  const remaining = AWARDS.filter((award) => !store.awardOptOuts.includes(award.id))
  return remaining.length > 0 ? remaining.map((award) => award.shortLabel).join(', ') : 'None'
})

const essayWordCount = computed(() => store.essayText.trim().split(/\s+/).filter(Boolean).length)

const incompleteSteps = computed(() => getIncompleteSteps(store))

const allAgreed = computed(() => store.agreedAccurate && store.agreedTerms && store.agreedPrivacy)
// Also disabled while a submission is in flight -- submitApplication() now
// makes a real network call (no longer simulated), so a double-click could
// otherwise fire a second overlapping request.
const isDisabled = computed(() => incompleteSteps.value.length > 0 || !allAgreed.value || store.submitting)

// Submits the application and, on success, replaces the route with the
// confirmation screen.
async function onSubmit() {
  if (isDisabled.value) return
  const ok = await store.submitApplication()
  // router.replace (not push) so the browser Back button from the
  // confirmation screen can't land the applicant back on a Step 7 that no
  // longer has any data to show (submitApplication just cleared it).
  if (ok) router.replace('/apply/confirmation')
}
</script>

<template>
  <div>
    <h1 class="step-heading">Review &amp; submit</h1>
    <p class="step-subline">Please review your application thoroughly before submitting.</p>

    <section class="summary-card">
      <p class="summary-label">Application summary</p>

      <div class="summary-row">
        <span class="summary-key">Considered for</span>
        <span class="summary-value">{{ consideredFor }}</span>
      </div>

      <div class="summary-row">
        <span class="summary-key">Essay</span>
        <span class="summary-value">
          {{ store.essayText.trim() ? `Provided (${essayWordCount} words)` : 'Skipped' }}
        </span>
      </div>

      <div class="summary-row">
        <span class="summary-key">Documents</span>
        <span class="summary-value">
          <template v-if="store.hasResumeFile && store.hasTranscriptFile">Resume, Transcript</template>
          <template v-else-if="!store.hasResumeFile && !store.hasTranscriptFile">
            Resume, Transcript: <span class="danger-text">Missing</span><br />
            <RouterLink to="/apply/6" class="summary-fix-link">Add documents</RouterLink>
          </template>
          <template v-else-if="store.hasResumeFile">
            Resume attached, Transcript <span class="danger-text">missing</span><br />
            <RouterLink to="/apply/6" class="summary-fix-link">Add documents</RouterLink>
          </template>
          <template v-else>
            Resume <span class="danger-text">missing</span>, Transcript attached<br />
            <RouterLink to="/apply/6" class="summary-fix-link">Add documents</RouterLink>
          </template>
        </span>
      </div>

      <div class="summary-row">
        <span class="summary-key">Availability</span>
        <span class="summary-value">{{ store.selectedSlots.length }} slots selected</span>
      </div>
    </section>

    <div v-if="incompleteSteps.length > 0" class="incomplete-notice">
      <p class="incomplete-notice-title">Before you can submit, finish:</p>
      <ul class="incomplete-list">
        <li v-for="item in incompleteSteps" :key="item.step">
          <RouterLink :to="`/apply/${item.step}`" class="incomplete-link"
            >{{ item.title }}</RouterLink
          >
        </li>
      </ul>
    </div>

    <!-- Shown on a 409/403/other failure from submit-application -- the
         draft is deliberately left intact in all three cases (see
         submitApplication's own comment), so this banner is the only
         feedback the applicant gets; it must never appear alongside a
         navigation to the confirmation screen. -->
    <div v-if="store.submitError" class="incomplete-notice">
      <p class="incomplete-notice-title">{{ store.submitError.message }}</p>
    </div>

    <div class="agreements">
      <AgreementRow
        label="I certify that the information in this application is true and accurate."
        :selected="store.agreedAccurate"
        @select="store.agreedAccurate = !store.agreedAccurate"
      />
      <!-- No real terms-and-conditions document exists yet to link to --
           this is plain text until BTX provides one. -->
      <AgreementRow
        label="I have read and understand the terms and conditions of this scholarship."
        :selected="store.agreedTerms"
        @select="store.agreedTerms = !store.agreedTerms"
      />
      <!-- Same as above: no real privacy policy document exists yet. -->
      <AgreementRow
        label="I have read the privacy policy of this scholarship."
        :selected="store.agreedPrivacy"
        @select="store.agreedPrivacy = !store.agreedPrivacy"
      />
    </div>

    <button type="button" class="continue-btn" :disabled="isDisabled" @click="onSubmit">
      {{ store.submitting ? 'Submitting…' : 'Submit Application' }}
    </button>
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

.summary-card {
  margin-top: 24px;
  background: var(--color-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: 12px;
  padding: 20px;
}

.summary-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--color-text-secondary);
}

.summary-row {
  margin-top: 16px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.summary-key {
  font-size: 15px;
  color: var(--color-text-primary);
  flex-shrink: 0;
}

.summary-value {
  font-weight: 700;
  font-size: 15px;
  color: var(--color-text-primary);
  text-align: right;
}

.danger-text {
  color: var(--color-danger-text);
}

.summary-fix-link {
  display: inline-block;
  margin-top: 4px;
  font-weight: 700;
  font-size: 13px;
  color: var(--color-accent);
  text-decoration: none;
}

.incomplete-notice {
  margin-top: 20px;
  background: var(--color-surface);
  border: 1px solid var(--color-danger-text);
  border-radius: 12px;
  padding: 16px 18px;
}

.incomplete-notice-title {
  font-weight: 700;
  font-size: 13px;
  color: var(--color-danger-text);
}

.incomplete-list {
  margin-top: 10px;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.incomplete-link {
  font-weight: 700;
  font-size: 14px;
  color: var(--color-danger-text);
  text-decoration: underline;
}

.agreements {
  margin-top: 24px;
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
