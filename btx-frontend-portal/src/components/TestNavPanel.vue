<script setup>
// Dev-only "click through every page without entering real data" panel.
// Mounted once in App.vue, gated (both at render time here and at the
// import site in App.vue) so it never appears -- and in a production build
// without VITE_ENABLE_TEST_NAV, never even ships -- outside local dev.
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useApplicationStore } from '../stores/application'
import { INTERVIEW_SLOTS } from '../lib/interviewSlots'

const route = useRoute()
const router = useRouter()
const store = useApplicationStore()

const expanded = ref(false)

// One array of jump links so a later round can add "Confirmation" with a
// single entry, e.g. { label: 'Confirmation', path: '/apply/confirmation' }.
const NAV_LINKS = [
  { label: 'Landing', path: '/' },
  { label: 'Step 1', path: '/apply/1' },
  { label: 'Step 2', path: '/apply/2' },
  { label: 'Step 3', path: '/apply/3' },
  { label: 'Step 4', path: '/apply/4' },
  { label: 'Step 5', path: '/apply/5' },
  { label: 'Step 6', path: '/apply/6' },
  { label: 'Step 7', path: '/apply/7' },
]

// PLACEHOLDER option lists mirrored from each step's own component, since
// those arrays are local to their <script setup> blocks (not exported) and
// this addition is instructed not to modify any step component. Keep these
// in sync with Step1BasicInfo.vue / Step2HowYouFoundUs.vue by hand if those
// lists ever change.
const GENDER_OPTIONS = ['Female', 'Male', 'Prefer not to say']
const RACE_OPTIONS = ['Prefer not to say'] // any entry from Step1's real list works; this one always exists
const ATTENDS_UMD_OPTIONS = ['Yes', 'No']
const EDUCATION_STATUS_OPTIONS = ['Freshman', 'Sophomore', 'Junior', 'Senior']
const MAJOR_OPTIONS = ['Computer Engineering'] // any entry from Step1's real list works
const HOW_HEARD_OPTIONS = ['Other'] // any entry from Step2's real list works

// Fills the store with obviously-fake but fully valid data -- passes every
// step's own validation as-is, so Steps 1-6's real Continue buttons all
// enable without the panel touching any step's validation logic itself.
function fillSampleData() {
  store.fullName = 'Test Applicant'
  store.email = 'test.applicant@terpmail.umd.edu'
  store.phone = '(301) 555-0100'
  store.gender = GENDER_OPTIONS[2]
  store.race = RACE_OPTIONS[0]
  store.attendsUMD = ATTENDS_UMD_OPTIONS[0]
  store.educationStatus = EDUCATION_STATUS_OPTIONS[2]
  store.creditsLeft = '30'
  store.major = MAJOR_OPTIONS[0]

  store.howHeard = HOW_HEARD_OPTIONS[0]
  // Step 3's award opt-outs and certification interest are optional --
  // left at their defaults (nothing opted out, not interested).

  // Step 5 requires 4+ selected interview slots -- taken from the real
  // INTERVIEW_SLOTS list so the ids actually exist.
  store.selectedSlots = INTERVIEW_SLOTS.slice(0, 4).map((slot) => slot.id)

  // Step 6 requires an actual File in memory for both documents (a saved
  // filename alone isn't enough) -- routed through the same setDocument
  // action the real upload cards use, so Step 6's gating behaves exactly
  // as it does with a real pick.
  const tinyPdfBytes = ['%PDF-1.4 sample test document']
  store.setDocument('resume', new File(tinyPdfBytes, 'Test_Resume.pdf', { type: 'application/pdf' }))
  store.setDocument(
    'transcript',
    new File(tinyPdfBytes, 'Test_Unofficial_Transcript.pdf', { type: 'application/pdf' }),
  )

  // Step 7's three agreement checkboxes are deliberately left unchecked so
  // that step can still be tested by hand.
}

// Clears the persisted draft and in-memory files, then returns to Step 1.
function resetDraft() {
  store.resetDraft()
  router.push('/apply/1')
}
</script>

<template>
  <div class="test-nav" :class="{ 'test-nav--expanded': expanded }">
    <!-- Panel is placed BEFORE the tab button in a column-reverse layout so
         the tab always stays pinned to its corner and the panel grows
         upward, above it, rather than pushing the tab up when expanded. -->
    <div v-if="expanded" class="test-nav-panel">
      <p class="test-nav-label">TEST MODE — not shown to applicants</p>

      <div class="test-nav-links">
        <RouterLink
          v-for="link in NAV_LINKS"
          :key="link.path"
          :to="link.path"
          class="test-nav-link"
          :class="{ 'test-nav-link--current': route.path === link.path }"
        >
          {{ link.label }}
        </RouterLink>
      </div>

      <div class="test-nav-actions">
        <button type="button" class="test-nav-action" @click="fillSampleData">Fill sample data</button>
        <button type="button" class="test-nav-action test-nav-action--danger" @click="resetDraft">
          Reset draft
        </button>
      </div>
    </div>

    <button type="button" class="test-nav-tab" @click="expanded = !expanded">
      {{ expanded ? 'Close' : 'Test' }}
    </button>
  </div>
</template>

<style scoped>
.test-nav {
  position: fixed;
  left: 16px;
  /* Anchored well above 16px -- every step's Continue button is followed by
     WizardShell's own footer, so this clears both the footer and the
     button even when the page is scrolled all the way to the bottom
     (footer is ~59px tall: 20px+20px padding around one 12px/1.6 line). */
  bottom: 72px;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  font-family:
    Inter,
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    Roboto,
    sans-serif;
}

.test-nav-tab {
  padding: 8px 14px;
  border: none;
  border-radius: 8px;
  background: #1c1a17;
  color: #fff;
  font-weight: 700;
  font-size: 12px;
  letter-spacing: 0.02em;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
}

.test-nav-tab:hover {
  opacity: 0.92;
}

.test-nav-panel {
  /* Gap sits below the panel (not above) since the panel now renders
     before the tab button in DOM order -- see the template comment. */
  margin-bottom: 8px;
  width: 220px;
  max-height: 70vh;
  overflow-y: auto;
  padding: 14px;
  border-radius: 10px;
  background: #1c1a17;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
}

.test-nav-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #e0762c;
  margin-bottom: 10px;
}

.test-nav-links {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.test-nav-link {
  padding: 6px 8px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  color: #d8d6cf;
  text-decoration: none;
}

.test-nav-link:hover {
  background: rgba(255, 255, 255, 0.08);
}

.test-nav-link--current {
  background: rgba(201, 147, 42, 0.25);
  color: #fff;
}

.test-nav-actions {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.15);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.test-nav-action {
  padding: 8px 10px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  background: transparent;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
}

.test-nav-action:hover {
  background: rgba(255, 255, 255, 0.08);
}

.test-nav-action--danger {
  border-color: rgba(211, 79, 63, 0.5);
  color: #ff9d90;
}
</style>
