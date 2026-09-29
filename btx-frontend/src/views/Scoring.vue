<script setup>
// SCORING -- FRONT-END-ONLY PREVIEW.
//
// Everything rendered on this page comes from local, hand-authored sample
// data (see src/lib/scoringSampleData.js) -- there is no rubric/score
// table backing any of it yet, and this component makes ZERO Supabase
// calls (authStore.isAdmin/isBoard/isReviewer below reads the session the
// router's global guard already loaded, it doesn't fetch anything
// itself). The All/Scored/Pending tab below is a real local filter; the
// "Score" button is NOT -- see onScoreClick() below for why it only shows
// an inline note instead of opening a fabricated scoring form.
import { computed, onMounted, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { VIEWER_INITIALS, YOUR_QUEUE, CYCLE_PROGRESS_TILES, RUBRIC_CRITERIA, ALL_APPLICANTS } from '@/lib/scoringSampleData'

const authStore = useAuthStore()
// Same admin/board/reviewer gate every other Program/Finance/Scholarship
// page uses -- display-only, RLS (once real tables exist) is the actual
// enforcement.
const canView = computed(() => authStore.isAdmin || authStore.isBoard || authStore.isReviewer)

onMounted(() => {
  authStore.init()
})

const queueDoneCount = computed(() => YOUR_QUEUE.filter((row) => row.yourScore !== null).length)

// STEP 4's badge color rule -- a single reusable function, called
// identically from both "Your scoring queue" and "All applicants this
// cycle" below, rather than two copies of the same banding logic.
// >= 4.5 green, 3.5-4.4 gold, < 3.5 rust; null/undefined (no score yet)
// returns 'none', which renders a neutral gray dash instead of a colored
// number.
function scoreTone(score) {
  if (score === null || score === undefined) return 'none'
  if (score >= 4.5) return 'green'
  if (score >= 3.5) return 'gold'
  return 'rust'
}

const TILE_VALUE_CLASS = { gold: 'tile-value--gold', dark: 'tile-value--dark', rust: 'tile-value--rust' }

const STATUS_PILL_CLASS = { Scored: 'pill--success', Pending: 'pill--rust' }

// STEP 6's All/Scored/Pending tab, reusing ApplicantRecords.vue's own
// cycle-filter-pill pattern (same active/inactive treatment, renamed here
// since it filters by status rather than cycle year). Filters by each
// row's own literal `pill` field -- see scoringSampleData.js's comment on
// why that's stored rather than derived.
const STATUS_FILTERS = ['All', 'Scored', 'Pending']
const selectedStatus = ref('All')
const filteredApplicants = computed(() => {
  if (selectedStatus.value === 'All') return ALL_APPLICANTS
  return ALL_APPLICANTS.filter((applicant) => applicant.pill === selectedStatus.value)
})

// STEP 5 -- there is no scoring-input mockup, so "Score ->" must not open
// a fabricated multi-criterion form. Clicking it just shows a small,
// clearly non-blocking inline note near that row's button, which clears
// on the next click (either the same button again, a different row's
// button, or automatically after a few seconds) -- same
// show-then-auto-clear shape as Interviews.vue's own "Saved locally" note
// for an action that isn't really wired up yet.
const scoreNoteRowId = ref(null)
let scoreNoteTimer = null

function onScoreClick(rowId) {
  scoreNoteRowId.value = rowId
  if (scoreNoteTimer) clearTimeout(scoreNoteTimer)
  scoreNoteTimer = setTimeout(() => {
    scoreNoteRowId.value = null
    scoreNoteTimer = null
  }, 3500)
}
</script>

<template>
  <p v-if="!authStore.session">Sign in</p>
  <p v-else-if="!canView" class="access-denied">Access Denied</p>

  <section v-else class="scoring">
    <p class="page-crumb">Scholarship</p>
    <h1 class="page-title" data-page-heading>Scoring</h1>
    <p class="subline">
      Ranked 1-5 across six weighted criteria. Two independent interviewers score every applicant.
    </p>

    <!-- Same preview banner as the other three Scholarship pages -- same
         tokens, same prominence, wording adjusted for this page. -->
    <div class="preview-banner">
      <span class="preview-banner-dot" aria-hidden="true"></span>
      Preview — sample data only, not connected to real scoring
    </div>

    <section class="queue-card">
      <div class="queue-header">
        <span class="avatar" aria-hidden="true">{{ VIEWER_INITIALS }}</span>
        <div class="queue-header-text">
          <p class="queue-title">Your scoring queue</p>
          <p class="queue-subline">{{ YOUR_QUEUE.length }} applicants assigned to you</p>
        </div>
        <span class="queue-count">{{ queueDoneCount }}/{{ YOUR_QUEUE.length }}</span>
      </div>

      <ul class="queue-list">
        <li v-for="row in YOUR_QUEUE" :key="row.id" class="queue-row" :class="`queue-row--${row.accent}`">
          <div class="queue-row-main">
            <span class="app-id">{{ row.id }}</span>
            <p class="queue-meta">{{ row.meta }}</p>
          </div>

          <span
            v-if="row.yourScore !== null"
            class="score-badge"
            :class="`score-badge--${scoreTone(row.yourScore)}`"
          >
            {{ row.yourScore.toFixed(1) }}
          </span>
          <div v-else class="score-action">
            <button type="button" class="score-btn" @click="onScoreClick(row.id)">Score →</button>
            <p v-if="scoreNoteRowId === row.id" class="score-note">Scoring form not built yet</p>
          </div>
        </li>
      </ul>
    </section>

    <h2 class="section-heading heading-progress">Cycle-wide progress</h2>
    <div class="tiles">
      <div v-for="tile in CYCLE_PROGRESS_TILES" :key="tile.key" class="tile">
        <p class="tile-value" :class="TILE_VALUE_CLASS[tile.tone]">{{ tile.value }}</p>
        <p class="tile-label">{{ tile.label }}</p>
      </div>
    </div>

    <h2 class="section-heading heading-rubric">Average by rubric criterion</h2>
    <div class="rubric-card">
      <div v-for="criterion in RUBRIC_CRITERIA" :key="criterion.key" class="rubric-row">
        <div class="row-top">
          <span class="row-label">{{ criterion.label }} <span class="row-weight">{{ criterion.weight }}%</span></span>
          <span class="row-value-serif">{{ criterion.average.toFixed(1) }}/5</span>
        </div>
        <!-- Same bar-track/bar-fill shape as ProgramImpact.vue/
             BudgetTracking.vue's own allocation bars -- reused verbatim,
             not a new bar style. -->
        <div class="bar-track">
          <div class="bar-fill bar-fill--gold" :style="{ width: `${(criterion.average / 5) * 100}%` }"></div>
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

    <ul class="applicant-list">
      <li v-for="applicant in filteredApplicants" :key="applicant.id" class="applicant-row">
        <span class="score-badge" :class="`score-badge--${scoreTone(applicant.combinedScore)}`">
          {{ applicant.combinedScore !== null ? applicant.combinedScore.toFixed(1) : '–' }}
        </span>
        <div class="applicant-main">
          <div class="applicant-top">
            <span class="app-id">{{ applicant.id }}</span>
            <span v-if="applicant.isYou" class="you-tag">you</span>
          </div>
          <p class="applicant-meta">{{ applicant.interviewerText }}</p>
        </div>
        <span class="pill" :class="STATUS_PILL_CLASS[applicant.pill]">{{ applicant.pill }}</span>
      </li>
    </ul>

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

/* Same amber/warning badge tokens and layout as the other three
   Scholarship pages' own .preview-banner -- only the copy differs. */
.preview-banner {
  margin-top: 18px;
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
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* Left accent bar: green once scored, gold while still needing your
   score -- a colored border-left rather than a separate token, same
   "borrow the badge/status color for a hairline accent" technique
   Home/AlertCenter already use elsewhere in this app. */
.queue-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  border-left: 3px solid transparent;
  background: var(--color-page-bg);
}

.queue-row--green {
  border-left-color: var(--color-green-strong);
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

/* Score badge -- reuses the exact same success/amber/rust/neutral badge
   token pairs the pills elsewhere on this app already use, just rendered
   as a circle instead of a pill. Used identically by both "Your scoring
   queue" (a scored row) and "All applicants this cycle" (every row) --
   see scoreTone() in <script>. */
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

.score-action {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}

.score-btn {
  padding: 7px 12px;
  border-radius: 999px;
  border: none;
  background: var(--color-header-strong);
  color: var(--color-surface);
  font-size: 12px;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
  white-space: nowrap;
}

.score-btn:hover {
  opacity: 0.9;
}

.score-note {
  margin: 0;
  font-size: 10.5px;
  font-weight: 600;
  color: var(--color-text-secondary);
  white-space: nowrap;
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

/* Same tile styling as the other three Scholarship pages' own .tiles --
   .tile-value--dark is new to this page since none of the others needed a
   third, non-gold/green/rust tile tone. */
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

/* Same bar-track/bar-fill shape as ProgramImpact.vue's own allocation
   bars, reused verbatim. */
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

/* Copied from ApplicantRecords.vue's .cycle-filter-row/.cycle-filter-pill
   (same active/inactive treatment) -- renamed here since it filters by
   status rather than cycle year, but it's the same reused pattern, not a
   new one. */
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

/* Reused verbatim from AwardeeWorkflow.vue/Interviews.vue/
   ApplicantRecords.vue -- same pill base + success/rust modifier classes
   for Scored/Pending, not a second set of pill styles. */
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
