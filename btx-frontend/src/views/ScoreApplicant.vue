<script setup>
// SCORE APPLICANT -- wired to real data.
//
// Reached from a "Score ->" row in Scoring.vue's "Your scoring queue" (now
// linking by real applicant_id, not a sample code). Header comes from
// scholarship_applicant_directory via useScholarshipScoreApplicantStore;
// Save draft/Publish both call the real save-score Edge Function. The
// interview transcript/quotes section below is still FABRICATED PREVIEW
// CONTENT (src/lib/scoreApplicantSampleData.js) -- see the prominent
// on-screen banner above that section, not just this comment, for why
// that matters now that real scores get published alongside it.
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useReviewerIdentityStore } from '@/stores/reviewerIdentity'
import { useScholarshipScoreApplicantStore } from '@/stores/scholarshipScoreApplicant'
import { RUBRIC_CRITERIA, RANK_DESCRIPTIONS } from '@/lib/scoringRubric'
import { FABRICATED_TRANSCRIPT } from '@/lib/scoreApplicantSampleData'
import ReviewerLabelPrompt from '@/components/ReviewerLabelPrompt.vue'

const route = useRoute()
const router = useRouter()

const authStore = useAuthStore()
const reviewerIdentity = useReviewerIdentityStore()
const detailStore = useScholarshipScoreApplicantStore()

// Same admin/board/reviewer gate every other Program/Finance/Scholarship
// page uses -- display-only, RLS on the underlying tables is the actual
// enforcement.
const canView = computed(() => authStore.isAdmin || authStore.isBoard || authStore.isReviewer)

onMounted(() => {
  authStore.init()
})

const applicantId = computed(() => route.params.appId)

// Re-fetch whenever the signed-in user OR the self-typed label changes --
// a reviewer can land here directly via URL without ever visiting
// Scoring.vue first, so this page has to be able to prompt for and react
// to the label on its own, not assume it's already set.
watch(
  () => [authStore.session?.user?.id ?? null, reviewerIdentity.label],
  ([userId, label]) => {
    if (userId && canView.value && label) {
      detailStore.fetchApplicant(applicantId.value, label)
    }
  },
  { immediate: true },
)

// scores[key] is 1-5 once picked, null until then. Seeded below from this
// session's label's own existing score row once it loads (resuming a
// draft), falling back to all-null for a brand-new scorecard.
const scores = reactive(Object.fromEntries(RUBRIC_CRITERIA.map((c) => [c.key, null])))
const noteText = reactive(Object.fromEntries(RUBRIC_CRITERIA.map((c) => [c.key, ''])))
const noteVisible = reactive(Object.fromEntries(RUBRIC_CRITERIA.map((c) => [c.key, false])))
const generalNotes = ref('')

watch(
  () => detailStore.existingScore,
  (existing) => {
    for (const criterion of RUBRIC_CRITERIA) {
      scores[criterion.key] = existing?.criterion_scores?.[criterion.key] ?? null
      noteText[criterion.key] = existing?.notes?.[criterion.key] ?? ''
    }
    generalNotes.value = existing?.general_notes ?? ''
  },
  { immediate: true },
)

const allScored = computed(() => RUBRIC_CRITERIA.every((c) => scores[c.key] !== null))

// Mirrors save-score's own formula exactly (sum of score*weight / 100, an
// unscored criterion contributing 0) -- this is a live PREVIEW total
// only; the real, authoritative weighted_total is always computed
// server-side by save-score, never trusted from here.
const weightedTotal = computed(() => {
  let sum = 0
  for (const criterion of RUBRIC_CRITERIA) {
    const score = scores[criterion.key]
    if (score !== null) sum += score * criterion.weight
  }
  return sum / 100
})

function rankDescription(score) {
  return RANK_DESCRIPTIONS[score - 1]
}

function toggleNote(key) {
  noteVisible[key] = !noteVisible[key]
}

// Describes every OTHER interviewer's status for this applicant -- "other"
// meaning any score row not from this session's own label.
const interviewerNote = computed(() => {
  if (detailStore.otherScores.length === 0) return 'No other interviewer has started scoring this applicant yet.'
  return detailStore.otherScores
    .map((s) => `${s.interviewer_label} has ${s.status === 'published' ? 'published' : 'a draft, not yet published'}.`)
    .join(' ')
})

// Already published -- blocks BOTH buttons client-side the moment the
// existing row loads, mirroring the server-side rule save-score itself
// enforces (status === 'published' => 409 already_published on any
// further write, draft or publish). A disabled button is a UX nicety,
// not a security boundary -- save-score re-checks this independently.
const alreadyPublished = computed(() => detailStore.existingScore?.status === 'published')

const statusLabel = computed(() => {
  if (alreadyPublished.value) return 'Published'
  if (detailStore.existingScore) return 'Draft saved'
  return 'Not started'
})

// Builds the notes payload from only the criteria that actually have
// text -- an empty string note is the same as no note at all, not worth
// sending/storing.
function buildNotesPayload() {
  const notes = {}
  for (const criterion of RUBRIC_CRITERIA) {
    if (noteText[criterion.key].trim() !== '') notes[criterion.key] = noteText[criterion.key]
  }
  return notes
}

// Only the criteria that actually have a pick -- save-score accepts a
// partial object for a draft (an unscored criterion simply isn't in it
// yet), and requires every key only when publish is true.
function buildScoresPayload() {
  return Object.fromEntries(Object.entries(scores).filter(([, value]) => value !== null))
}

const draftSavedMessageVisible = ref(false)
let draftSavedTimer = null

async function onSaveDraft() {
  if (alreadyPublished.value) return
  const accessToken = authStore.session?.access_token
  if (!accessToken) return

  const result = await detailStore.saveScore({
    applicantId: applicantId.value,
    label: reviewerIdentity.label,
    accessToken,
    criterionScores: buildScoresPayload(),
    notes: buildNotesPayload(),
    generalNotes: generalNotes.value,
    publish: false,
  })

  if (result) {
    draftSavedMessageVisible.value = true
    if (draftSavedTimer) clearTimeout(draftSavedTimer)
    draftSavedTimer = setTimeout(() => {
      draftSavedMessageVisible.value = false
      draftSavedTimer = null
    }, 3500)
  }
}

async function onPublish() {
  if (!allScored.value || alreadyPublished.value) return
  const accessToken = authStore.session?.access_token
  if (!accessToken) return

  const result = await detailStore.saveScore({
    applicantId: applicantId.value,
    label: reviewerIdentity.label,
    accessToken,
    criterionScores: buildScoresPayload(),
    notes: buildNotesPayload(),
    generalNotes: generalNotes.value,
    publish: true,
  })

  if (result) {
    router.push({ name: 'scholarship-scoring' })
  }
}

// "Oct 2, 2026" -- same shape as ApplicantRecords.vue's own
// formatSubmittedDate.
function formatSubmittedDate(submittedAt) {
  return new Date(submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
</script>

<template>
  <p v-if="!authStore.session">Sign in</p>
  <p v-else-if="!canView" class="access-denied">Access Denied</p>

  <section v-else-if="!reviewerIdentity.label" class="score-applicant label-prompt">
    <p class="page-crumb">Scholarship</p>
    <h1 class="page-title" data-page-heading>Score applicant</h1>
    <ReviewerLabelPrompt help-text="Enter your name or initials to score this applicant." />
  </section>

  <section v-else-if="detailStore.loading" class="score-applicant">
    <div class="skeleton skeleton--list"></div>
  </section>

  <p v-else-if="detailStore.error" class="page-error">Couldn't load this applicant.</p>
  <p v-else-if="!detailStore.applicant" class="empty">No applicant found for this link.</p>

  <section v-else class="score-applicant">
    <p class="page-crumb">Scholarship</p>

    <RouterLink :to="{ name: 'scholarship-scoring' }" class="back-link">← Back to your queue</RouterLink>

    <div class="detail-header-row">
      <h1 class="app-id-large" data-page-heading>{{ detailStore.applicant.applicant_code }}</h1>
      <span class="pill" :class="alreadyPublished ? 'pill--success' : 'pill--amber'">{{ statusLabel }}</span>
    </div>
    <p class="scholarship-line">
      {{ detailStore.applicant.cycle_year }} cycle · submitted {{ formatSubmittedDate(detailStore.applicant.submitted_at) }}
    </p>

    <div class="info-card">
      <p>{{ interviewerNote }}</p>
    </div>

    <div class="info-items">
      <!-- Inert -- file uploads are still deferred end-to-end (resume/
           transcript filenames are stored on scholarship_applicants, but
           no file bytes are ever uploaded anywhere yet), so this stays a
           visual placeholder only (href="#" + a no-op click handler), not
           a working download/view action. -->
      <a href="#" class="info-item info-item--action" @click.prevent>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
        View resume
      </a>
      <!-- Passive label, not clickable -- there's no real recording/
           player pipeline behind this yet. -->
      <span class="info-item">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <polygon points="10 8 16 12 10 16 10 8" />
        </svg>
        Interview was recorded
      </span>
    </div>

    <!-- Prominent, on-screen fabrication notice -- covers BOTH the
         transcript summary below AND the quoted "Student's response"
         text under each rubric criterion further down. Deliberately more
         visible than a code comment: real scores and notes now get
         published alongside this fabricated content, so a reviewer
         scrolling past needs to see this, not just a developer reading
         the source. -->
    <div class="fabricated-banner">
      <span class="fabricated-banner-dot" aria-hidden="true"></span>
      Fabricated preview content below (transcript summary and quoted responses) — not real interview
      data. The scores and notes you save or publish on this page ARE real.
    </div>

    <h2 class="section-heading heading-transcript">Interview transcript summary</h2>
    <div class="transcript-card">
      <p class="transcript-summary">{{ FABRICATED_TRANSCRIPT.summary }}</p>
      <p class="transcript-footer">{{ FABRICATED_TRANSCRIPT.footer }}</p>
    </div>

    <h2 class="section-heading heading-rubric">Rank against the rubric - 1 (needs improvement) to 5 (excellent)</h2>

    <div v-for="criterion in RUBRIC_CRITERIA" :key="criterion.key" class="criterion-card">
      <div class="criterion-top">
        <span class="criterion-label">{{ criterion.label }}</span>
        <span class="pill pill--neutral">{{ criterion.weight }}%</span>
      </div>

      <template v-if="FABRICATED_TRANSCRIPT.criteria[criterion.key].type === 'quote'">
        <p class="response-heading">
          Student's response
          <span class="response-timestamp">{{ FABRICATED_TRANSCRIPT.criteria[criterion.key].timestamp }}</span>
        </p>
        <p class="response-quote">"{{ FABRICATED_TRANSCRIPT.criteria[criterion.key].text }}"</p>
      </template>
      <p v-else class="response-note">{{ FABRICATED_TRANSCRIPT.criteria[criterion.key].text }}</p>

      <div class="score-picks">
        <button
          v-for="n in 5"
          :key="n"
          type="button"
          class="score-pick"
          :disabled="alreadyPublished"
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
        :disabled="alreadyPublished"
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
      :disabled="alreadyPublished"
      class="general-notes-textarea"
      rows="3"
      placeholder="Anything else the committee should know that isn't tied to one criterion above."
    ></textarea>

    <div class="action-row">
      <!-- Save draft is also disabled once published -- save-score itself
           rejects ANY further write (draft or publish) once status is
           'published', so there's nothing a draft save could do here but
           hit that same 409. -->
      <button type="button" class="save-draft-btn" :disabled="alreadyPublished" @click="onSaveDraft">Save draft</button>
      <!-- Publish is disabled until all six criteria have a score, AND
           once the server would reject it as already-published --
           checked client-side from the existing score row fetched on
           load, re-checked server-side by save-score regardless. -->
      <button
        type="button"
        class="publish-btn"
        :disabled="!allScored || alreadyPublished"
        @click="onPublish"
      >
        Publish score
      </button>
    </div>
    <p v-if="draftSavedMessageVisible" class="draft-saved-message">Draft saved.</p>
    <p v-if="detailStore.saveError" class="save-error">{{ detailStore.saveError }}</p>

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

/* Scoped specifically to the fabricated transcript/quotes content below
   -- not a whole-page preview banner. Same amber/warning badge tokens as
   every other banner in this app, just narrower in scope and wording. */
.fabricated-banner {
  margin-top: 16px;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px 14px;
  border-radius: 10px;
  background: var(--color-amber-badge-bg);
  color: var(--color-amber-badge-text);
  border: 1px solid color-mix(in srgb, var(--color-amber-badge-text) 30%, transparent);
  font-size: 12.5px;
  font-weight: 700;
  line-height: 1.5;
}

.fabricated-banner-dot {
  margin-top: 4px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
  flex-shrink: 0;
}

.section-heading {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  color: var(--color-header-strong);
}

.heading-transcript {
  margin-top: 20px;
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

.score-pick:disabled {
  opacity: 0.6;
  cursor: not-allowed;
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

.criterion-note-textarea:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

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

.general-notes-textarea:disabled {
  opacity: 0.6;
  cursor: not-allowed;
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

.save-draft-btn:hover:not(:disabled) {
  opacity: 0.85;
}

.save-draft-btn:disabled {
  background: var(--color-border-strong);
  color: var(--color-text-secondary);
  cursor: not-allowed;
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

.save-error {
  margin: 10px 0 0;
  padding: 8px 12px;
  border-radius: 8px;
  background: var(--color-rust-badge-bg);
  color: var(--color-rust-badge-text);
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

.pill--success {
  background: var(--color-success-badge-bg);
  color: var(--color-success-badge-text);
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

.page-error {
  margin: 0;
  color: var(--color-danger-text);
  font-weight: 600;
}

.skeleton {
  margin-top: 12px;
  border-radius: 12px;
  background: var(--color-track);
  animation: skeleton-pulse 1.4s ease-in-out infinite;
}

.skeleton--list {
  height: 220px;
}

@keyframes skeleton-pulse {
  0%,
  100% {
    opacity: 0.5;
  }
  50% {
    opacity: 0.9;
  }
}

.footer {
  margin: 28px 0 0;
  text-align: center;
  font-size: 12px;
  color: var(--color-text-secondary);
}
</style>
