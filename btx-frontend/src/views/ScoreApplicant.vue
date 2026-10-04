<script setup>
// SCORE APPLICANT -- FRONT-END-ONLY PREVIEW.
//
// Reached from a "Score ->" row in Scoring.vue's "Your scoring queue".
// Everything here comes from local, hand-authored sample data (see
// src/lib/scoreApplicantSampleData.js for the per-applicant content, and
// src/lib/scoringSampleData.js for the shared queue/all-applicants rows
// this page reads and writes) -- there is no rubric/score/transcript table
// backing any of it, and this component makes ZERO Supabase calls. Save
// draft and Publish score are both SIMULATED: they only mutate the shared
// reactive sample data held in this browser tab's memory -- see
// onSaveDraft()/onPublish() below for exactly what each one touches.
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { RUBRIC_CRITERIA, YOUR_QUEUE, ALL_APPLICANTS } from '@/lib/scoringSampleData'
import { APPLICANT_DETAIL, RANK_DESCRIPTIONS } from '@/lib/scoreApplicantSampleData'

const route = useRoute()
const router = useRouter()

const authStore = useAuthStore()
// Same admin/board/reviewer gate every other Program/Finance/Scholarship
// page uses -- display-only, RLS (once real tables exist) is the actual
// enforcement.
const canView = computed(() => authStore.isAdmin || authStore.isBoard || authStore.isReviewer)

onMounted(() => {
  authStore.init()
})

const appId = computed(() => route.params.appId)
const detail = computed(() => APPLICANT_DETAIL[appId.value] ?? null)
const queueRow = computed(() => YOUR_QUEUE.find((row) => row.id === appId.value) ?? null)

// scores[key] is 1-5 once picked, null until then. Initialized fresh per
// mount from RUBRIC_CRITERIA's own keys, rather than hardcoding the six
// names here, so this stays in sync if the rubric ever changes.
const scores = reactive(Object.fromEntries(RUBRIC_CRITERIA.map((c) => [c.key, null])))

const allScored = computed(() => RUBRIC_CRITERIA.every((c) => scores[c.key] !== null))

// Sum of (score * weight) / 100 -- an unscored criterion contributes 0,
// not a partial/average value, so the total only reaches its true value
// once every criterion has a pick.
const weightedTotal = computed(() => {
  let sum = 0
  for (const criterion of RUBRIC_CRITERIA) {
    const score = scores[criterion.key]
    if (score !== null) sum += score * criterion.weight
  }
  return sum / 100
})

// Looks up the rank description text for a 1-based rubric score.
function rankDescription(score) {
  return RANK_DESCRIPTIONS[score - 1]
}

// Per-criterion "+ Add note" -- local-only, nothing persisted, same as
// every other note/draft field on this page.
const noteVisible = reactive(Object.fromEntries(RUBRIC_CRITERIA.map((c) => [c.key, false])))
const noteText = reactive(Object.fromEntries(RUBRIC_CRITERIA.map((c) => [c.key, ''])))

// Shows/hides the "+ Add note" field for a single rubric criterion.
function toggleNote(key) {
  noteVisible[key] = !noteVisible[key]
}

const generalNotes = ref('')

// SIMULATED save -- shows a brief, non-persistent confirmation (same
// show-then-auto-clear shape as Interviews.vue's own "Saved locally"
// note), and marks this applicant's queue row with a "Draft saved"
// indicator so Scoring.vue's queue reflects it. Nothing is written
// anywhere outside this tab's own memory.
const draftSavedMessageVisible = ref(false)
let draftSavedTimer = null

// Marks this applicant's queue row as draft-saved and shows a brief
// non-persistent confirmation.
function onSaveDraft() {
  if (queueRow.value) queueRow.value.draftSaved = true
  draftSavedMessageVisible.value = true
  if (draftSavedTimer) clearTimeout(draftSavedTimer)
  draftSavedTimer = setTimeout(() => {
    draftSavedMessageVisible.value = false
    draftSavedTimer = null
  }, 3500)
}

// SIMULATED publish -- only reachable once all six criteria have a score
// (see the button's :disabled below). Flips this applicant's row in BOTH
// shared arrays to Scored with the computed weighted total as its score,
// then returns to the queue. Still entirely in-memory: no Supabase call,
// nothing saved outside this browser tab.
function onPublish() {
  if (!allScored.value) return
  const total = Math.round(weightedTotal.value * 10) / 10

  if (queueRow.value) {
    queueRow.value.yourScore = total
    queueRow.value.accent = 'green'
    queueRow.value.draftSaved = false
  }

  const applicantRow = ALL_APPLICANTS.find((a) => a.id === appId.value)
  if (applicantRow) {
    applicantRow.combinedScore = total
    applicantRow.pill = 'Scored'
  }

  router.push({ name: 'scholarship-scoring' })
}
</script>

<template>
  <p v-if="!authStore.session">Sign in</p>
  <p v-else-if="!canView" class="access-denied">Access Denied</p>
  <p v-else-if="!detail" class="empty">No preview content for {{ appId }}.</p>

  <section v-else class="score-applicant">
    <p class="page-crumb">Scholarship</p>

    <!-- Same amber/warning preview banner as the other four Scholarship
         pages -- same tokens, same prominence, wording adjusted here. -->
    <div class="preview-banner">
      <span class="preview-banner-dot" aria-hidden="true"></span>
      Preview — sample data only, not connected to real scoring
    </div>

    <RouterLink :to="{ name: 'scholarship-scoring' }" class="back-link">← Back to your queue</RouterLink>

    <div class="detail-header-row">
      <h1 class="app-id-large" data-page-heading>{{ appId }}</h1>
      <span class="pill pill--amber">{{ detail.statusPill }}</span>
    </div>
    <p class="scholarship-line">{{ detail.scholarshipLine }}</p>

    <div class="info-card">
      <p>{{ detail.interviewerNote }}</p>
    </div>

    <div class="info-items">
      <!-- Inert -- no real applicant file exists in this preview, so this
           is a visual placeholder only (href="#" + a no-op click
           handler), not a working download/view action. -->
      <a href="#" class="info-item info-item--action" @click.prevent>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
        View resume
      </a>
      <!-- Passive label, not clickable -- there's no player/recording to
           open in this preview. -->
      <span class="info-item">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <polygon points="10 8 16 12 10 16 10 8" />
        </svg>
        Interview was recorded
      </span>
    </div>

    <h2 class="section-heading heading-transcript">Interview transcript summary</h2>
    <div v-if="detail.transcript" class="transcript-card">
      <p class="transcript-summary">{{ detail.transcript.summary }}</p>
      <p class="transcript-footer">{{ detail.transcript.footer }}</p>
    </div>
    <!-- APP-062/APP-066 have no matching mockup transcript -- honest
         fallback rather than fabricating one for them specifically. -->
    <p v-else class="transcript-card transcript-card--empty">
      No transcript is available for this applicant in this preview.
    </p>

    <h2 class="section-heading heading-rubric">Rank against the rubric - 1 (needs improvement) to 5 (excellent)</h2>

    <div v-for="criterion in RUBRIC_CRITERIA" :key="criterion.key" class="criterion-card">
      <div class="criterion-top">
        <span class="criterion-label">{{ criterion.label }}</span>
        <span class="pill pill--neutral">{{ criterion.weight }}%</span>
      </div>

      <template v-if="detail.criteria[criterion.key].type === 'quote'">
        <p class="response-heading">
          Student's response <span class="response-timestamp">{{ detail.criteria[criterion.key].timestamp }}</span>
        </p>
        <p class="response-quote">"{{ detail.criteria[criterion.key].text }}"</p>
      </template>
      <p v-else class="response-note">{{ detail.criteria[criterion.key].text }}</p>

      <div class="score-picks">
        <button
          v-for="n in 5"
          :key="n"
          type="button"
          class="score-pick"
          :class="{ 'score-pick--selected': scores[criterion.key] === n }"
          :aria-pressed="scores[criterion.key] === n"
          @click="scores[criterion.key] = n"
        >
          {{ n }}
        </button>
      </div>

      <p class="rank-description">
        <template v-if="scores[criterion.key]">
          <strong>{{ rankDescription(scores[criterion.key]).label }}</strong> — {{ rankDescription(scores[criterion.key]).detail }}
        </template>
        <template v-else>Select a score to see what that rank means for this criterion.</template>
      </p>

      <button type="button" class="add-note-btn" @click="toggleNote(criterion.key)">
        {{ noteVisible[criterion.key] ? '- Hide note' : '+ Add note' }}
      </button>
      <textarea
        v-if="noteVisible[criterion.key]"
        v-model="noteText[criterion.key]"
        class="criterion-note-textarea"
        rows="2"
        placeholder="Add a private note for this criterion..."
      ></textarea>
    </div>

    <!-- Fixed-dark/gold treatment -- same non-themed brand-chrome pair as
         Interviews.vue's own +Schedule button, reused here since this is
         a prominent stat callout, not a themed page surface. -->
    <div class="weighted-total-box">
      <p class="weighted-total-label">Your weighted total</p>
      <p class="weighted-total-value">{{ weightedTotal.toFixed(1) }}/5.0</p>
    </div>

    <h2 class="section-heading heading-general-notes">General notes for the committee (optional)</h2>
    <textarea
      v-model="generalNotes"
      class="general-notes-textarea"
      rows="3"
      placeholder="Anything else the committee should know that isn't tied to one criterion above."
    ></textarea>

    <div class="action-row">
      <button type="button" class="save-draft-btn" @click="onSaveDraft">Save draft</button>
      <!-- Publish is disabled until all six criteria have a score -- this
           is an INFERRED rule (the mockup doesn't show a disabled state),
           reasonable since Save draft already covers "save a partial
           scorecard", so a real publish should mean the scorecard is
           actually complete. -->
      <button type="button" class="publish-btn" :disabled="!allScored" @click="onPublish">Publish score</button>
    </div>
    <p v-if="draftSavedMessageVisible" class="draft-saved-message">
      Saved locally — not yet connected to real scoring.
    </p>

    <p class="footer">BTX Ops Hub - Scoring</p>
  </section>
</template>

<style scoped>
.score-applicant {
  max-width: 640px;
  margin: 0 auto;
}

/* Reused verbatim from AwardeeWorkflow.vue/Interviews.vue/
   ApplicantRecords.vue/Scoring.vue -- same crumb markup/approach, not a
   second implementation. */
.page-crumb {
  margin: 0 0 4px;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-accent);
}

/* Same amber/warning badge tokens and layout as the other four
   Scholarship pages' own .preview-banner -- only the copy differs. */
.preview-banner {
  margin-top: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 10px;
  background: var(--color-amber-badge-bg);
  color: var(--color-amber-badge-text);
  border: 1px solid color-mix(in srgb, var(--color-amber-badge-text) 30%, transparent);
  font-size: 12.5px;
  font-weight: 700;
}

.preview-banner-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
  flex-shrink: 0;
}

.back-link {
  display: inline-block;
  margin-top: 18px;
  font-weight: 700;
  font-size: 13px;
  color: var(--color-header-strong);
  text-decoration: none;
}

.back-link:hover {
  text-decoration: underline;
}

.detail-header-row {
  margin-top: 14px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.app-id-large {
  margin: 0;
  font-family: var(--font-serif);
  font-size: 26px;
  font-weight: 700;
  color: var(--color-header-strong);
}

.scholarship-line {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--color-header-muted);
}

.info-card {
  margin-top: 16px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 14px 16px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--color-text-primary);
}

.info-items {
  margin-top: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
}

.info-item {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.info-item--action {
  color: var(--color-accent);
  text-decoration: underline;
  cursor: pointer;
}

.section-heading {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  color: var(--color-header-strong);
}

.heading-transcript {
  margin-top: 24px;
}

.heading-rubric {
  margin-top: 26px;
}

.heading-general-notes {
  margin-top: 24px;
}

.transcript-card {
  margin-top: 10px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 14px 16px;
}

.transcript-summary {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--color-text-primary);
}

.transcript-footer {
  margin: 10px 0 0;
  font-size: 11px;
  color: var(--color-text-secondary);
}

.transcript-card--empty {
  font-size: 13px;
  color: var(--color-text-secondary);
}

.criterion-card {
  margin-top: 12px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 14px 16px;
}

.criterion-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.criterion-label {
  font-weight: 700;
  font-size: 13.5px;
  color: var(--color-header-strong);
}

.response-heading {
  margin: 10px 0 0;
  font-size: 10.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--color-text-secondary);
}

.response-timestamp {
  font-weight: 600;
  text-transform: none;
  letter-spacing: 0;
  color: var(--color-gold-deep);
}

.response-quote {
  margin: 4px 0 0;
  font-size: 13px;
  line-height: 1.55;
  font-style: italic;
  color: var(--color-text-primary);
}

.response-note {
  margin: 10px 0 0;
  font-size: 12.5px;
  line-height: 1.5;
  font-style: italic;
  color: var(--color-text-secondary);
}

.score-picks {
  margin-top: 12px;
  display: flex;
  gap: 8px;
}

/* Selected state: solid gold fill with dark text -- the mockup shows no
   selected example, so this is a deliberate, consistent default across
   all six criteria (see STEP 6's own note in the task). */
.score-pick {
  flex: 1;
  padding: 9px 0;
  border-radius: 8px;
  border: 1px solid var(--color-border-strong);
  background: var(--color-surface);
  color: var(--color-header-strong);
  font-weight: 700;
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
}

.score-pick--selected {
  border-color: var(--color-gold-strong);
  background: var(--color-gold-strong);
  color: #1c1a17;
}

.rank-description {
  margin: 10px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-header-muted);
}

.add-note-btn {
  margin-top: 10px;
  padding: 0;
  border: none;
  background: none;
  color: var(--color-accent);
  font-weight: 700;
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
}

.criterion-note-textarea {
  margin-top: 8px;
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--color-border-strong);
  border-radius: 8px;
  background: var(--color-page-bg);
  color: var(--color-text-primary);
  font-size: 12.5px;
  font-family: inherit;
  resize: vertical;
}

/* Fixed-dark/gold -- same non-themed brand pair as Interviews.vue's own
   .schedule-btn (#1c1a17 + --color-accent), not a themed surface, since
   this is a prominent stat callout rather than page content. */
.weighted-total-box {
  margin-top: 22px;
  background: #1c1a17;
  border-radius: 12px;
  padding: 18px;
  text-align: center;
}

.weighted-total-label {
  margin: 0;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(255, 255, 255, 0.6);
}

.weighted-total-value {
  margin: 6px 0 0;
  font-family: var(--font-serif);
  font-size: 32px;
  font-weight: 800;
  color: var(--color-accent);
  font-variant-numeric: lining-nums;
  font-feature-settings: 'lnum' 1;
}

.general-notes-textarea {
  margin-top: 10px;
  width: 100%;
  padding: 12px 14px;
  border: 1px solid var(--color-border-strong);
  border-radius: 10px;
  background: var(--color-surface);
  color: var(--color-text-primary);
  font-size: 13px;
  font-family: inherit;
  resize: vertical;
}

.action-row {
  margin-top: 18px;
  display: flex;
  gap: 10px;
}

.save-draft-btn {
  flex: 1;
  padding: 13px;
  border: 1px solid var(--color-border-strong);
  border-radius: 10px;
  background: var(--color-surface);
  color: var(--color-header-strong);
  font-weight: 700;
  font-size: 13.5px;
  font-family: inherit;
  cursor: pointer;
}

.save-draft-btn:hover {
  opacity: 0.85;
}

.publish-btn {
  flex: 1;
  padding: 13px;
  border: none;
  border-radius: 10px;
  background: var(--color-gold-strong);
  color: #1c1a17;
  font-weight: 700;
  font-size: 13.5px;
  font-family: inherit;
  cursor: pointer;
}

.publish-btn:hover:not(:disabled) {
  opacity: 0.9;
}

.publish-btn:disabled {
  background: var(--color-border-strong);
  color: var(--color-text-secondary);
  cursor: not-allowed;
}

.draft-saved-message {
  margin: 10px 0 0;
  padding: 8px 12px;
  border-radius: 8px;
  background: var(--color-success-badge-bg);
  color: var(--color-success-badge-text);
  font-size: 12px;
  font-weight: 600;
}

.pill {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  font-size: 10px;
  font-weight: 700;
  padding: 3px 9px;
  border-radius: 999px;
  white-space: nowrap;
}

.pill--amber {
  background: var(--color-amber-badge-bg);
  color: var(--color-amber-badge-text);
}

.pill--neutral {
  background: var(--color-neutral-badge-bg);
  color: var(--color-neutral-badge-text);
}

.access-denied {
  margin: 0;
  color: var(--color-danger-text);
  font-weight: 600;
}

.empty {
  margin: 0;
  color: var(--color-text-secondary);
}

.footer {
  margin: 28px 0 0;
  text-align: center;
  font-size: 12px;
  color: var(--color-text-secondary);
}
</style>
