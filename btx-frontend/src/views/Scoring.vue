<script setup>
// SCORING -- wired to real data.
//
// "Your scoring queue" and "All applicants this cycle" both derive from
// useScholarshipScoringStore's single fetch (scholarship_applicant_directory
// joined, client-side, to every scholarship_scores row for the current
// cycle) -- see that store's own comment. "Who am I": the self-typed
// reviewer label lives in the shared useReviewerIdentityStore, extracted
// from Interviews.vue's own flow (see ReviewerLabelPrompt.vue) rather than
// built fresh here.
import { computed, onMounted, ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useReviewerIdentityStore } from '@/stores/reviewerIdentity'
import { useScholarshipScoringStore, EXPECTED_INTERVIEWERS } from '@/stores/scholarshipScoring'
import ReviewerLabelPrompt from '@/components/ReviewerLabelPrompt.vue'

const authStore = useAuthStore()
const reviewerIdentity = useReviewerIdentityStore()
const scoringStore = useScholarshipScoringStore()

// Same admin/board/reviewer gate every other Program/Finance/Scholarship
// page uses -- display-only, RLS on the underlying tables is the actual
// enforcement.
const canView = computed(() => authStore.isAdmin || authStore.isBoard || authStore.isReviewer)

onMounted(() => {
  authStore.init()
})

// Re-fetch whenever the signed-in user changes AND a label has already
// been entered this session -- same watch-on-session-id pattern as
// Interviews.vue's own store. Entering the label for the first time is
// handled separately by ReviewerLabelPrompt's own @confirmed below.
watch(
  () => authStore.session?.user?.id ?? null,
  (userId) => {
    if (userId && canView.value && reviewerIdentity.label) {
      scoringStore.fetchCycle()
    }
  },
  { immediate: true },
)

// "Your scoring queue" -- every applicant this cycle without a PUBLISHED
// score from this session's own label (see the store's own comment on
// why a draft still leaves an applicant in the queue).
const queue = computed(() => scoringStore.queueForLabel(reviewerIdentity.label))

// Redefinition of the old sample data's "done/total" queue-header badge:
// "done" now means "applicants this cycle you've already published a
// score for" (i.e. everyone NOT in the queue below), since nothing
// inside the queue itself can ever be "done" by construction.
const doneCount = computed(() => scoringStore.tiles.total - queue.value.length)

// Describes every OTHER interviewer's status for one queue row -- "other"
// meaning any score row not from this session's own label. Normally at
// most one row (every applicant is paired with exactly
// EXPECTED_INTERVIEWERS interviewers), but this doesn't assume that.
function otherInterviewerMeta(applicant) {
  const others = applicant.scores.filter((s) => s.interviewer_label !== reviewerIdentity.label)
  if (others.length === 0) return 'No other interviewer has started yet'
  return others.map((s) => `${s.interviewer_label}: ${s.status}`).join(', ')
}

// Whether THIS session's own label has a draft (not yet published) score
// row for this applicant -- same "Draft saved" indicator the old sample
// data showed, now derived from a real row instead of a mutated sample.
function hasOwnDraft(applicant) {
  return applicant.scores.some((s) => s.interviewer_label === reviewerIdentity.label && s.status === 'draft')
}

// STEP 4's badge color rule, unchanged from the sample-data version --
// >= 4.5 green, 3.5-4.4 gold, < 3.5 rust; null (no published score yet)
// returns 'none'.
function scoreTone(score) {
  if (score === null || score === undefined) return 'none'
  if (score >= 4.5) return 'green'
  if (score >= 3.5) return 'gold'
  return 'rust'
}

const TILE_VALUE_CLASS = { gold: 'tile-value--gold', dark: 'tile-value--dark', rust: 'tile-value--rust' }

const summaryTiles = computed(() => [
  {
    key: 'scored',
    label: 'Applicants scored',
    value: `${scoringStore.tiles.scored}/${scoringStore.tiles.total}`,
    tone: 'gold',
  },
  {
    key: 'average',
    label: 'Average weighted score',
    value: scoringStore.tiles.average !== null ? `${scoringStore.tiles.average.toFixed(1)}/5` : '—',
    tone: 'dark',
  },
  { key: 'pending', label: 'Pending score', value: String(scoringStore.tiles.pending), tone: 'rust' },
])

const STATUS_FILTERS = ['All', 'Scored', 'Pending']
const selectedStatus = ref('All')
const filteredApplicants = computed(() => {
  if (selectedStatus.value === 'All') return scoringStore.allApplicants
  const wantScored = selectedStatus.value === 'Scored'
  return scoringStore.allApplicants.filter((a) => (a.publishedScores.length > 0) === wantScored)
})

const emptyAllApplicantsMessage = computed(() => {
  if (selectedStatus.value === 'Scored') return 'No applicants have a published score yet.'
  if (selectedStatus.value === 'Pending') return 'No applicants are pending a score.'
  return 'No applicants yet this cycle.'
})
</script>

<template>
  <p v-if="!authStore.session">Sign in</p>
  <p v-else-if="!canView" class="access-denied">Access Denied</p>

  <section v-else-if="!reviewerIdentity.label" class="scoring label-prompt">
    <p class="page-crumb">Scholarship</p>
    <h1 class="page-title" data-page-heading>Scoring</h1>
    <ReviewerLabelPrompt
      help-text="Enter your name or initials to see your scoring queue."
      @confirmed="scoringStore.fetchCycle()"
    />
  </section>

  <section v-else class="scoring">
    <p class="page-crumb">Scholarship</p>
    <h1 class="page-title" data-page-heading>Scoring</h1>
    <p class="subline">
      Ranked 1-5 across six weighted criteria. Two independent interviewers score every applicant.
    </p>

    <div v-if="scoringStore.loading" class="skeleton skeleton--list"></div>
    <p v-else-if="scoringStore.error" class="page-error">Couldn't load scoring data.</p>

    <template v-else>
      <section class="queue-card">
        <div class="queue-header">
          <span class="avatar" aria-hidden="true">{{ reviewerIdentity.label.slice(0, 2).toUpperCase() }}</span>
          <div class="queue-header-text">
            <p class="queue-title">Your scoring queue</p>
            <p class="queue-subline">
              {{ queue.length }} applicant{{ queue.length === 1 ? '' : 's' }} without your score yet
            </p>
          </div>
          <span class="queue-count">{{ doneCount }}/{{ scoringStore.tiles.total }}</span>
        </div>

        <p v-if="queue.length === 0" class="empty">No applicants waiting on your score this cycle.</p>
        <ul v-else class="queue-list">
          <li
            v-for="applicant in queue"
            :key="applicant.applicant_id"
            class="queue-row"
            :class="{ 'queue-row--gold': hasOwnDraft(applicant) }"
          >
            <div class="queue-row-main">
              <span class="app-id">{{ applicant.applicant_code }}</span>
              <p class="queue-meta">{{ otherInterviewerMeta(applicant) }}</p>
              <p v-if="hasOwnDraft(applicant)" class="draft-indicator">Draft saved</p>
            </div>

            <RouterLink
              :to="{ name: 'scholarship-score-applicant', params: { appId: applicant.applicant_id } }"
              class="score-btn"
            >
              Score →
            </RouterLink>
          </li>
        </ul>
      </section>

      <h2 class="section-heading heading-progress">Cycle-wide progress</h2>
      <div class="tiles">
        <div v-for="tile in summaryTiles" :key="tile.key" class="tile">
          <p class="tile-value" :class="TILE_VALUE_CLASS[tile.tone]">{{ tile.value }}</p>
          <p class="tile-label">{{ tile.label }}</p>
        </div>
      </div>

      <h2 class="section-heading heading-rubric">Average by rubric criterion</h2>
      <div class="rubric-card">
        <div v-for="criterion in scoringStore.rubricAverages" :key="criterion.key" class="rubric-row">
          <div class="row-top">
            <span class="row-label">{{ criterion.label }} <span class="row-weight">{{ criterion.weight }}%</span></span>
            <span class="row-value-serif">{{ criterion.average !== null ? criterion.average.toFixed(1) : '—' }}/5</span>
          </div>
          <div class="bar-track">
            <div class="bar-fill bar-fill--gold" :style="{ width: `${((criterion.average ?? 0) / 5) * 100}%` }"></div>
          </div>
        </div>
      </div>

      <h2 class="section-heading heading-all">All applicants this cycle</h2>
      <div class="status-filter-row">
        <button
          v-for="status in STATUS_FILTERS"
          :key="status"
          type="button"
          class="status-filter-pill"
          :class="{ 'status-filter-pill--active': selectedStatus === status }"
          :aria-pressed="selectedStatus === status"
          @click="selectedStatus = status"
        >
          {{ status }}
        </button>
      </div>

      <p v-if="filteredApplicants.length === 0" class="empty">{{ emptyAllApplicantsMessage }}</p>
      <ul v-else class="applicant-list">
        <li v-for="applicant in filteredApplicants" :key="applicant.applicant_id" class="applicant-row">
          <span class="score-badge" :class="`score-badge--${scoreTone(applicant.combinedScore)}`">
            {{ applicant.combinedScore !== null ? applicant.combinedScore.toFixed(1) : '–' }}
          </span>
          <div class="applicant-main">
            <div class="applicant-top">
              <span class="app-id">{{ applicant.applicant_code }}</span>
              <span v-if="applicant.scores.some((s) => s.interviewer_label === reviewerIdentity.label)" class="you-tag">
                you
              </span>
            </div>
            <p class="applicant-meta">
              {{ applicant.publishedScores.length }} of {{ EXPECTED_INTERVIEWERS }} interviewers published
            </p>
          </div>
          <span class="pill" :class="applicant.publishedScores.length > 0 ? 'pill--success' : 'pill--rust'">
            {{ applicant.publishedScores.length > 0 ? 'Scored' : 'Pending' }}
          </span>
        </li>
      </ul>
    </template>

    <p class="footer">BTX Ops Hub · Scoring</p>
  </section>
</template>

<style scoped>
.scoring {
  max-width: 640px;
  margin: 0 auto;
}

/* Reused verbatim from AwardeeWorkflow.vue/Interviews.vue/
   ApplicantRecords.vue -- same crumb markup/approach, not a second
   implementation. */
.page-crumb {
  margin: 0 0 4px;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-accent);
}

.page-title {
  margin: 0;
  font-family: var(--font-serif);
  font-size: 28px;
  font-weight: 700;
  line-height: 1.15;
  color: var(--color-header-strong);
}

.subline {
  margin: 8px 0 0;
  max-width: 440px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--color-header-muted);
}

.queue-card {
  margin-top: 20px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 16px;
}

.queue-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.avatar {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--color-gold-soft);
  color: var(--color-gold-deep);
  font-size: 12px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}

.queue-header-text {
  flex: 1;
  min-width: 0;
}

.queue-title {
  margin: 0;
  font-weight: 700;
  font-size: 14px;
  color: var(--color-header-strong);
}

.queue-subline {
  margin: 2px 0 0;
  font-size: 11.5px;
  color: var(--color-text-secondary);
}

.queue-count {
  flex-shrink: 0;
  font-family: var(--font-serif);
  font-size: 16px;
  font-weight: 700;
  color: var(--color-gold-deep);
  font-variant-numeric: lining-nums;
  font-feature-settings: 'lnum' 1;
}

.queue-list {
  margin-top: 14px;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* Left accent bar: gold while a draft exists, transparent otherwise --
   nothing in this list is ever "done" (a published score removes the row
   from the queue entirely), so the old green accent state is gone. */
.queue-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  border-left: 3px solid transparent;
  background: var(--color-surface);
}

.queue-row--gold {
  border-left-color: var(--color-gold-strong);
}

.queue-row-main {
  flex: 1;
  min-width: 0;
}

.app-id {
  font-weight: 700;
  font-size: 13px;
  color: var(--color-header-strong);
}

.queue-meta {
  margin: 2px 0 0;
  font-size: 11.5px;
  color: var(--color-text-secondary);
}

.draft-indicator {
  margin: 2px 0 0;
  font-size: 10.5px;
  font-weight: 700;
  color: var(--color-gold-deep);
}

.score-badge {
  flex-shrink: 0;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-serif);
  font-size: 13px;
  font-weight: 700;
  font-variant-numeric: lining-nums;
  font-feature-settings: 'lnum' 1;
}

.score-badge--green {
  background: var(--color-success-badge-bg);
  color: var(--color-success-badge-text);
}

.score-badge--gold {
  background: var(--color-amber-badge-bg);
  color: var(--color-amber-badge-text);
}

.score-badge--rust {
  background: var(--color-rust-badge-bg);
  color: var(--color-rust-badge-text);
}

.score-badge--none {
  background: var(--color-neutral-badge-bg);
  color: var(--color-neutral-badge-text);
}

.score-btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  padding: 7px 12px;
  border-radius: 999px;
  border: none;
  background: var(--color-header-strong);
  color: var(--color-surface);
  font-size: 12px;
  font-weight: 700;
  font-family: inherit;
  text-decoration: none;
  cursor: pointer;
  white-space: nowrap;
}

.score-btn:hover {
  opacity: 0.9;
}

.section-heading {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  color: var(--color-header-strong);
}

.heading-progress {
  margin-top: 26px;
}

.heading-rubric {
  margin-top: 26px;
}

.heading-all {
  margin-top: 26px;
}

.tiles {
  margin-top: 12px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.tile {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 12px 6px;
  text-align: center;
}

.tile-value {
  margin: 0;
  font-family: var(--font-serif);
  font-size: 22px;
  font-weight: 700;
  font-variant-numeric: lining-nums;
  font-feature-settings: 'lnum' 1;
}

.tile-value--gold {
  color: var(--color-gold-deep);
}

.tile-value--dark {
  color: var(--color-header-strong);
}

.tile-value--rust {
  color: var(--color-rust-badge-text);
}

.tile-label {
  margin: 4px 0 0;
  font-size: 10.5px;
  line-height: 1.3;
  color: var(--color-header-muted);
}

.rubric-card {
  margin-top: 12px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.row-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.row-label {
  font-size: 12.5px;
  color: var(--color-header-strong);
}

.row-weight {
  font-size: 11px;
  color: var(--color-text-secondary);
}

.row-value-serif {
  flex-shrink: 0;
  font-family: var(--font-serif);
  font-size: 13px;
  font-weight: 700;
  color: var(--color-header-strong);
  font-variant-numeric: lining-nums;
  font-feature-settings: 'lnum' 1;
}

.bar-track {
  margin-top: 6px;
  height: 4px;
  border-radius: 999px;
  background: var(--color-track);
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  min-width: 3px;
  border-radius: 999px;
}

.bar-fill--gold {
  background: var(--color-gold-strong);
}

.status-filter-row {
  margin-top: 12px;
  display: flex;
  gap: 8px;
}

.status-filter-pill {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 600;
  padding: 6px 14px;
  border-radius: 999px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-header-muted);
  cursor: pointer;
  white-space: nowrap;
  font-family: inherit;
}

.status-filter-pill--active {
  border-color: var(--color-header-strong);
  background: var(--color-header-strong);
  color: var(--color-surface);
}

.applicant-list {
  margin-top: 12px;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.applicant-row {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 14px;
}

.applicant-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.applicant-top {
  display: flex;
  align-items: center;
  gap: 8px;
}

.you-tag {
  flex-shrink: 0;
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  padding: 2px 7px;
  border-radius: 999px;
  background: var(--color-gold-soft);
  color: var(--color-gold-deep);
}

.applicant-meta {
  margin: 0;
  font-size: 12px;
  color: var(--color-text-secondary);
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

.pill--success {
  background: var(--color-success-badge-bg);
  color: var(--color-success-badge-text);
}

.pill--rust {
  background: var(--color-rust-badge-bg);
  color: var(--color-rust-badge-text);
}

.empty {
  margin: 12px 0 0;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.page-error {
  margin: 12px 0 0;
  font-size: 13px;
  color: var(--color-danger-text);
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

.access-denied {
  margin: 0;
  color: var(--color-danger-text);
  font-weight: 600;
}

.footer {
  margin: 28px 0 0;
  text-align: center;
  font-size: 12px;
  color: var(--color-text-secondary);
}
</style>
