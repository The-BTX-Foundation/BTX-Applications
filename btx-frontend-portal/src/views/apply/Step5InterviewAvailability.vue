<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useApplicationStore } from '../../stores/application'
import PillToggle from '../../components/PillToggle.vue'
import { INTERVIEW_SLOTS } from '../../lib/interviewSlots'
import { isStepValid } from '../../lib/stepValidation'

const router = useRouter()
const store = useApplicationStore()

const MIN_SLOTS = 4

// Groups the flat slot list by date heading, preserving source order --
// interviewSlots.js already lists each date's slots contiguously, so this
// is simpler than a Map keyed by date.
const slotGroups = computed(() => {
  const groups = []
  for (const slot of INTERVIEW_SLOTS) {
    let group = groups.find((g) => g.date === slot.date)
    if (!group) {
      group = { date: slot.date, slots: [] }
      groups.push(group)
    }
    group.slots.push(slot)
  }
  return groups
})

function toggleSlot(slotId) {
  const index = store.selectedSlots.indexOf(slotId)
  if (index === -1) {
    store.selectedSlots.push(slotId)
  } else {
    store.selectedSlots.splice(index, 1)
  }
}

const selectedCount = computed(() => store.selectedSlots.length)
const isValid = computed(() => isStepValid(5, store))

function onContinue() {
  if (!isValid.value) return
  store.currentStep = 6
  router.push('/apply/6')
}
</script>

<template>
  <div>
    <h1 class="step-heading">Interview availability</h1>
    <p class="step-subline">
      Select at least 4 time slots you're available for a 30-minute interview. We'll match you
      with two interviewers and send a calendar invite with a video link.
    </p>

    <div v-for="group in slotGroups" :key="group.date" class="slot-group">
      <h2 class="slot-date">{{ group.date }}</h2>
      <div class="slot-row">
        <PillToggle
          v-for="slot in group.slots"
          :key="slot.id"
          :label="slot.time"
          :selected="store.selectedSlots.includes(slot.id)"
          @select="toggleSlot(slot.id)"
        />
      </div>
    </div>

    <div class="status-bar">
      <span class="status-count"><strong>{{ selectedCount }}</strong> of {{ MIN_SLOTS }} minimum slots selected</span>
      <span v-if="!isValid" class="status-need">Need {{ MIN_SLOTS }}+</span>
    </div>

    <p class="help-text">
      None of these work? Email
      <a href="mailto:info@thebtxfoundation.org" class="help-link">info@thebtxfoundation.org</a>
      and we'll find another time.
    </p>

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

.slot-group {
  margin-top: 24px;
}

.slot-date {
  font-weight: 700;
  font-size: 16px;
  color: var(--color-text-primary);
}

.slot-row {
  margin-top: 12px;
  display: grid;
  /* auto-fit + minmax rather than a fixed repeat(4, 1fr): four 70px+
     columns fit down to our narrowest supported width (360px), so this
     renders as a clean 4-across grid there and up; it only reflows to
     fewer columns if a narrower viewport or longer labels ever needed it,
     and does so as an even sub-grid rather than stretching a leftover
     item to fill the whole row (see PillToggle's own comment). */
  grid-template-columns: repeat(auto-fit, minmax(70px, 1fr));
  gap: 8px;
}

.status-bar {
  margin-top: 28px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: var(--color-track);
  border-radius: 10px;
  padding: 16px 18px;
}

.status-count {
  font-size: 14px;
  color: var(--color-header-muted);
}

.status-count strong {
  color: var(--color-header-strong);
}

.status-need {
  font-size: 14px;
  color: var(--color-header-muted);
}

.help-text {
  margin-top: 12px;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.help-link {
  font-weight: 700;
  color: inherit;
  text-decoration: none;
}

.continue-btn {
  margin-top: 24px;
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
  /* Sampled from the mockup's own disabled state -- lighter and warmer
     than --color-border-strong (used for other steps' disabled Continue),
     so it's set directly against the mockup here rather than reused. */
  background: var(--color-border);
  color: var(--color-text-secondary);
  cursor: not-allowed;
}
</style>
