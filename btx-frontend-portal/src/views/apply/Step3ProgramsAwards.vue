<script setup>
import { useRouter } from 'vue-router'
import { useApplicationStore } from '../../stores/application'
import OptionRow from '../../components/OptionRow.vue'
import { AWARDS, formatAwardAmount } from '../../lib/awards'

const router = useRouter()
const store = useApplicationStore()

// The mockup's opt-out row wording doesn't follow one template per award --
// "Think Big Scholarship" and "BTX Legacy Award" both add a word the other
// doesn't, and "Empowerment Award" keeps "Award" rather than switching to
// "Scholarship" -- so each row's exact text is keyed by award id instead of
// derived from a single format string.
const OPT_OUT_LABELS = {
  'think-big': (award) => `Don't consider me for the ${award.shortLabel} Scholarship`,
  legacy: (award) => `Don't consider me for the BTX ${award.shortLabel} Award`,
  empowerment: (award) => `Don't consider me for the ${award.shortLabel} Award`,
}

// Toggles an award id in/out of the opt-out list -- awardOptOuts is an
// array (not one boolean per award) since a later round's Step 7 summary
// needs to list which specific awards were opted out of.
function toggleOptOut(awardId) {
  const index = store.awardOptOuts.indexOf(awardId)
  if (index === -1) {
    store.awardOptOuts.push(awardId)
  } else {
    store.awardOptOuts.splice(index, 1)
  }
}

// Everything on this step is optional, so Continue is never disabled.
function onContinue() {
  store.currentStep = 4
  router.push('/apply/4')
}
</script>

<template>
  <div>
    <h1 class="step-heading">Programs &amp; awards</h1>
    <p class="step-subline">
      One interview, all three awards. Opt out below only if you'd prefer not to be considered for
      it.
    </p>

    <section class="highlight-card">
      <p class="highlight-label">You're in consideration for</p>
      <p class="highlight-text">
        The committee reviews every interviewed applicant for all three scholarships and selects
        based on final scores — you don't apply to each one separately.
      </p>
      <div class="award-list">
        <div v-for="award in AWARDS" :key="award.id" class="award-row">
          <span>{{ award.label }}</span>
          <span>{{ formatAwardAmount(award.amount) }}</span>
        </div>
      </div>
    </section>

    <div class="section-header">
      <h2 class="section-heading">Opt out of a specific award</h2>
      <span class="optional-pill">Optional</span>
    </div>
    <div class="option-list">
      <OptionRow
        v-for="award in AWARDS"
        :key="award.id"
        variant="card"
        type="checkbox"
        :label="OPT_OUT_LABELS[award.id](award)"
        :selected="store.awardOptOuts.includes(award.id)"
        @select="toggleOptOut(award.id)"
      />
    </div>

    <div class="section-header">
      <h2 class="section-heading">Other BTX programs</h2>
      <span class="optional-pill">Optional</span>
    </div>
    <div class="option-list">
      <OptionRow
        variant="card"
        type="checkbox"
        label="Also consider me for the BTX/AWS Certification Program"
        subtext="A separate, non-scholarship certification track"
        :selected="store.certificationInterest"
        @select="store.certificationInterest = !store.certificationInterest"
      />
    </div>

    <button type="button" class="continue-btn" @click="onContinue">Continue</button>
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

.highlight-card {
  margin-top: 24px;
  background: var(--color-highlight-bg);
  border: 1px solid var(--color-gold-strong);
  border-radius: 12px;
  padding: 20px;
}

.highlight-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--color-accent);
}

.highlight-text {
  margin-top: 10px;
  font-size: 14px;
  color: var(--color-text-primary);
}

.award-list {
  margin-top: 16px;
}

.award-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 0;
  /* A tinted version of --color-gold-strong (#b6832e) rather than the
     solid border color -- a full-strength border reads too heavy as an
     internal row divider against the highlight card's own background. */
  border-top: 1px solid rgba(182, 131, 46, 0.3);
  font-weight: 700;
  font-size: 14px;
  color: var(--color-text-primary);
}

.award-row:first-child {
  border-top: none;
}

.section-header {
  margin-top: 32px;
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

.option-list {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
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

.continue-btn:hover {
  opacity: 0.92;
}
</style>
