<script setup>
// AWARDEE WORKFLOW -- FRONT-END-ONLY PREVIEW.
//
// Everything rendered on this page comes from local, hand-authored sample
// data (see src/lib/awardeeWorkflowSampleData.js) -- there is no applicant,
// committee-review, or decision table backing any of it yet, and this
// component makes ZERO Supabase calls (authStore.isAdmin/isBoard/isReviewer
// below reads the session the router's global guard already loaded, it
// doesn't fetch anything itself). The vote buttons only mutate a local,
// per-cycle copy of the sample data held in this component -- see
// castYourVote() below for the "simulated, nothing is saved" boundary.
import { computed, onMounted, reactive, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import {
  YOU_INITIALS,
  CYCLE_YEARS,
  DEFAULT_CYCLE_YEAR,
  FUNNEL_BY_CYCLE,
  COMMITTEE_REVIEW_BY_CYCLE,
  RECENT_DECISIONS_BY_CYCLE,
} from '@/lib/awardeeWorkflowSampleData'

const authStore = useAuthStore()
// Same admin/board/reviewer gate every other Program/Finance/Scholarship
// page uses -- display-only, RLS (once real tables exist) is the actual
// enforcement.
const canView = computed(() => authStore.isAdmin || authStore.isBoard || authStore.isReviewer)

onMounted(() => {
  authStore.init()
})

const selectedCycleYear = ref(DEFAULT_CYCLE_YEAR)

const funnelSteps = computed(() => FUNNEL_BY_CYCLE[selectedCycleYear.value])

// Deep-cloned once per cycle year up front, so a vote-button click mutates
// a LOCAL copy only -- the imported sample data module itself is never
// touched. Switching cycles and back keeps whatever this session already
// clicked, same as any other in-memory UI state would.
const committeeReviewByCycle = reactive(
  Object.fromEntries(CYCLE_YEARS.map((year) => [year, structuredClone(COMMITTEE_REVIEW_BY_CYCLE[year])])),
)
const committeeReviewRows = computed(() => committeeReviewByCycle[selectedCycleYear.value])

const recentDecisions = computed(() => RECENT_DECISIONS_BY_CYCLE[selectedCycleYear.value])

// Which committee-review rows have their decision panel open; multiple can
// be open at once, same convention as every other expandable-card list in
// this app (ProgramPlanning.vue's expandedMilestoneIds, Home.vue's
// expandedSectionIds).
const expandedRowIds = reactive(new Set())
function toggleRow(id) {
  if (expandedRowIds.has(id)) expandedRowIds.delete(id)
  else expandedRowIds.add(id)
}

function agreedCount(row) {
  return row.votes.filter((v) => v.decision === 'agreed').length
}

// SIMULATED vote buttons -- updates ONLY this row's local `votes` array,
// specifically the entry flagged isYou (YOU_INITIALS). Nothing is saved
// anywhere and no Supabase call is ever made from this page; a real build
// needs this wired to an actual committee_votes-style write, gated by the
// real signed-in board member's identity (see YOU_INITIALS' own comment).
function castYourVote(row, decision) {
  const yourVote = row.votes.find((v) => v.isYou)
  if (yourVote) yourVote.decision = decision
}

function formatScore(score) {
  return score.toFixed(1)
}

// Renders a missing amount as an em dash -- never "$0" (a real number
// with real meaning) and never a blank cell (which would look broken).
function formatAmount(amount) {
  return amount ?? '—'
}
</script>

<template>
  <p v-if="!authStore.session">Sign in</p>
  <p v-else-if="!canView" class="access-denied">Access Denied</p>

  <section v-else class="awardee-workflow">
    <p class="page-crumb">Scholarship</p>
    <h1 class="page-title" data-page-heading>Awardee Workflow</h1>
    <p class="subline">Every current applicant, from submission through committee decision.</p>

    <!-- STEP 3: preview banner -- built before anything else on the page,
         and deliberately not just a code comment: this page is going into
         the real Ops Hub, so "not connected to real applicants" has to be
         impossible to miss at any width, in either theme. -->
    <div class="preview-banner">
      <span class="preview-banner-dot" aria-hidden="true"></span>
      Preview — sample data only, not connected to real applicants
    </div>

    <!-- Cycle selector: same hidden-scrollbar / right-edge-fade swipeable
         strip as ProgramPlanning.vue's own plan-year strip. -->
    <div class="cycle-strip">
      <button
        v-for="year in CYCLE_YEARS"
        :key="year"
        type="button"
        class="cycle-card"
        :class="{ 'cycle-card--selected': year === selectedCycleYear }"
        :aria-pressed="year === selectedCycleYear"
        @click="selectedCycleYear = year"
      >
        {{ year }}
      </button>
    </div>

    <h2 class="section-heading heading-funnel">Pipeline this cycle</h2>
    <div class="funnel-scroll">
      <div class="funnel-row">
        <template v-for="(step, i) in funnelSteps" :key="step.key">
          <div class="funnel-step" :class="`funnel-step--${step.status}`">
            <p class="funnel-count">{{ step.count }}</p>
            <p class="funnel-label">{{ step.label }}</p>
          </div>
          <span v-if="i < funnelSteps.length - 1" class="funnel-arrow" aria-hidden="true">›</span>
        </template>
      </div>
    </div>
    <p class="funnel-note">
      Applicants must complete their application to be interview-eligible. Both assigned
      interviewers must publish a score before an applicant enters committee review.
    </p>

    <div class="section-heading-row">
      <h2 class="section-heading">In committee review · {{ committeeReviewRows.length }}</h2>
      <RouterLink :to="{ name: 'tasks' }" class="section-link">Tasks &amp; Approvals →</RouterLink>
    </div>

    <p v-if="committeeReviewRows.length === 0" class="empty">
      No applicants currently in committee review for this cycle.
    </p>

    <ul v-else class="review-list">
      <li v-for="row in committeeReviewRows" :key="row.id" class="review-card">
        <button type="button" class="review-card-header" @click="toggleRow(row.id)">
          <span class="avatar" aria-hidden="true">{{ row.avatar }}</span>
          <span class="review-card-main">
            <span class="review-card-top">
              <span class="app-id">{{ row.id }}</span>
              <span class="pill pill--amber">In Review</span>
            </span>
            <span class="final-score"><strong>{{ formatScore(row.finalScore) }}</strong>/5.0</span>
            <span class="stage-text">{{ row.stageText }}</span>
          </span>
          <svg
            class="expand-chevron"
            :class="{ 'expand-chevron--expanded': expandedRowIds.has(row.id) }"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        <div v-if="expandedRowIds.has(row.id)" class="decision-panel">
          <div class="field-row">
            <div class="field">
              <p class="field-label">Scholarship type</p>
              <p class="field-value" :class="{ 'field-value--unset': !row.scholarshipType }">
                {{ row.scholarshipType ?? 'Not yet set' }}
              </p>
            </div>
            <div class="field">
              <p class="field-label">Award amount</p>
              <p class="field-value" :class="{ 'field-value--unset': !row.amount }">
                {{ row.amount ?? 'Not yet set' }}
              </p>
            </div>
          </div>

          <p class="field-label vote-track-label">Board vote</p>
          <div class="vote-track">
            <span
              v-for="vote in row.votes"
              :key="vote.initials"
              class="vote-chip"
              :class="[
                vote.decision === 'agreed' && 'vote-chip--agreed',
                vote.decision === 'waitlisted' && 'vote-chip--waitlisted',
                vote.decision === 'declined' && 'vote-chip--declined',
                vote.isYou && 'vote-chip--you',
              ]"
              :title="vote.isYou ? `${vote.initials} (you)` : vote.initials"
            >
              {{ vote.initials }}
            </span>
          </div>
          <p class="vote-count">{{ agreedCount(row) }} of {{ row.votes.length }} board members agreed</p>

          <div class="decision-actions">
            <button type="button" class="decision-btn decision-btn--agree" @click="castYourVote(row, 'agreed')">
              Agree to Award
            </button>
            <button type="button" class="decision-btn decision-btn--waitlist" @click="castYourVote(row, 'waitlisted')">
              Waitlist
            </button>
            <button type="button" class="decision-btn decision-btn--decline" @click="castYourVote(row, 'declined')">
              Decline
            </button>
          </div>
        </div>
      </li>
    </ul>

    <div class="section-heading-row section-heading-row--spaced">
      <h2 class="section-heading">Recent decisions</h2>
      <RouterLink :to="{ name: 'tasks' }" class="section-link">Tasks &amp; Approvals →</RouterLink>
    </div>

    <ul class="decision-list">
      <li v-for="decision in recentDecisions" :key="decision.id" class="decision-card">
        <span class="avatar" aria-hidden="true">{{ decision.avatar }}</span>
        <div class="decision-card-main">
          <div class="decision-card-top">
            <span class="app-id">{{ decision.id }}</span>
            <span
              class="pill"
              :class="{
                'pill--success': decision.pill === 'Awarded',
                'pill--amber': decision.pill === 'Waitlisted',
                'pill--rust': decision.pill === 'Declined',
              }"
            >
              {{ decision.pill }}
            </span>
          </div>
          <p class="decision-meta">{{ decision.decidedLabel }} · {{ formatScore(decision.finalScore) }}/5.0</p>
          <p class="decision-type">{{ decision.scholarshipType }} · {{ decision.awardKind }}</p>
          <p class="decision-amount" :class="{ 'decision-amount--unset': !decision.amount }">
            {{ formatAmount(decision.amount) }}
          </p>
          <p class="decision-agreed">✓ {{ decision.agreedCount }} of 5 board members agreed</p>
        </div>
      </li>
    </ul>

    <p class="footer">BTX Ops Hub · Awardee Workflow</p>
  </section>
</template>

<style scoped>
.awardee-workflow {
  max-width: 640px;
  margin: 0 auto;
}

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
  max-width: 420px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--color-header-muted);
}

/* Preview banner -- amber/warning badge tokens, same pair used everywhere
   else in the app for a warning-toned pill/callout (already measured
   4.5:1+ in both themes, see base.css). Border is a tint of the same
   badge-text color, same technique HomeOverdueBanner.vue uses for its own
   danger-toned banner border. */
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

/* Hidden-scrollbar horizontal scroller with a right-edge fade -- same
   pattern as ProgramPlanning.vue's .plan-strip. */
.cycle-strip {
  margin-top: 20px;
  display: flex;
  gap: 10px;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  scrollbar-width: none;
  -ms-overflow-style: none;
  mask-image: linear-gradient(to right, black 92%, transparent 100%);
}

.cycle-strip::-webkit-scrollbar {
  display: none;
}

.cycle-card {
  flex: 0 0 auto;
  min-width: 84px;
  scroll-snap-align: start;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 12px 20px;
  font-family: var(--font-serif);
  font-size: 16px;
  font-weight: 700;
  color: var(--color-header-strong);
  font-variant-numeric: lining-nums;
  font-feature-settings: 'lnum' 1;
  cursor: pointer;
  text-align: center;
}

.cycle-card--selected {
  border: 1.5px solid var(--color-gold-strong);
}

.section-heading {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  color: var(--color-header-strong);
}

.heading-funnel {
  margin-top: 26px;
}

/* Funnel: a hidden-scrollbar horizontal scroller (same mechanism as
   .cycle-strip above), not a chart library -- guarantees no page-level
   horizontal overflow at any width, since the funnel itself absorbs any
   overflow internally instead. At >= 600px six boxes comfortably fit this
   page's own 640px max-width with no scrolling needed at all. */
.funnel-scroll {
  margin-top: 10px;
  overflow-x: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
  mask-image: linear-gradient(to right, black 94%, transparent 100%);
}

.funnel-scroll::-webkit-scrollbar {
  display: none;
}

.funnel-row {
  display: flex;
  align-items: center;
  gap: 2px;
  width: max-content;
}

.funnel-step {
  flex: 0 0 auto;
  width: 92px;
  padding: 10px 6px;
  border-radius: 10px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  text-align: center;
}

.funnel-step--active {
  border: 1.5px solid var(--color-gold-strong);
  background: var(--color-gold-soft);
}

.funnel-count {
  margin: 0;
  font-family: var(--font-serif);
  font-size: 20px;
  font-weight: 700;
  font-variant-numeric: lining-nums;
  font-feature-settings: 'lnum' 1;
  color: var(--color-text-secondary);
}

.funnel-step--done .funnel-count {
  color: var(--color-green-strong);
}

.funnel-step--active .funnel-count {
  color: var(--color-gold-deep);
}

.funnel-label {
  margin: 2px 0 0;
  font-size: 10.5px;
  line-height: 1.3;
  color: var(--color-header-muted);
}

.funnel-arrow {
  flex: 0 0 auto;
  font-size: 18px;
  font-weight: 700;
  color: var(--color-border-strong);
  padding: 0 2px;
}

.funnel-note {
  margin: 10px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-text-secondary);
}

.section-heading-row {
  margin-top: 26px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.section-heading-row--spaced {
  margin-top: 30px;
}

.section-link {
  flex-shrink: 0;
  font-size: 12.5px;
  font-weight: 700;
  color: var(--color-accent);
  text-decoration: none;
  white-space: nowrap;
}

.section-link:hover {
  text-decoration: underline;
}

.empty {
  margin: 12px 0 0;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.review-list,
.decision-list {
  margin-top: 12px;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.review-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  overflow: hidden;
}

.review-card-header {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px;
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
  font: inherit;
  color: inherit;
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

.review-card-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.review-card-top {
  display: flex;
  align-items: center;
  gap: 8px;
}

.app-id {
  font-weight: 700;
  font-size: 13.5px;
  color: var(--color-header-strong);
}

.final-score {
  font-family: var(--font-serif);
  font-size: 13px;
  font-variant-numeric: lining-nums;
  font-feature-settings: 'lnum' 1;
  color: var(--color-header-muted);
}

.final-score strong {
  font-weight: 700;
  color: var(--color-header-strong);
}

.stage-text {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.expand-chevron {
  flex-shrink: 0;
  color: var(--color-text-secondary);
  transition: transform 0.15s ease;
}

.expand-chevron--expanded {
  transform: rotate(180deg);
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

.pill--amber {
  background: var(--color-amber-badge-bg);
  color: var(--color-amber-badge-text);
}

.pill--rust {
  background: var(--color-rust-badge-bg);
  color: var(--color-rust-badge-text);
}

.decision-panel {
  padding: 0 14px 16px;
  border-top: 1px solid var(--color-border);
}

.field-row {
  margin-top: 14px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.field-label {
  margin: 0;
  font-size: 10.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--color-text-secondary);
}

.field-value {
  margin: 4px 0 0;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--color-header-strong);
}

.field-value--unset {
  font-weight: 500;
  color: var(--color-slate-badge-text);
}

.vote-track-label {
  margin-top: 16px;
}

.vote-track {
  margin-top: 8px;
  display: flex;
  gap: 8px;
}

.vote-chip {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 1.5px solid var(--color-border-strong);
  background: var(--color-surface);
  color: var(--color-slate-badge-text);
  font-size: 10.5px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}

.vote-chip--agreed {
  border-color: var(--color-green-strong);
  background: var(--color-green-strong);
  color: #fff;
}

.vote-chip--waitlisted {
  border-color: var(--color-gold-deep);
  background: var(--color-gold-soft);
  color: var(--color-gold-deep);
}

.vote-chip--declined {
  border-color: var(--color-rust-badge-text);
  background: var(--color-rust-badge-bg);
  color: var(--color-rust-badge-text);
}

/* "You" ring -- a separate outline (not the chip's own border, which
   already carries the decision color) so identity and vote state can be
   shown independently, e.g. APP-041's unfilled-but-still-you TL chip. */
.vote-chip--you {
  outline: 2px solid var(--color-gold-strong);
  outline-offset: 2px;
}

.vote-count {
  margin: 10px 0 0;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--color-header-muted);
}

.decision-actions {
  margin-top: 14px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.decision-btn {
  flex: 1 1 auto;
  min-width: 100px;
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 12.5px;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
  border: 1px solid var(--color-border-strong);
  background: var(--color-surface);
  color: var(--color-header-strong);
}

.decision-btn--agree:hover {
  border-color: var(--color-green-strong);
  color: var(--color-green-strong);
}

.decision-btn--waitlist:hover {
  border-color: var(--color-gold-deep);
  color: var(--color-gold-deep);
}

.decision-btn--decline:hover {
  border-color: var(--color-rust-badge-text);
  color: var(--color-rust-badge-text);
}

.decision-card {
  display: flex;
  gap: 12px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 14px;
}

.decision-card-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.decision-card-top {
  display: flex;
  align-items: center;
  gap: 8px;
}

.decision-meta {
  margin: 0;
  font-size: 12px;
  color: var(--color-text-secondary);
}

.decision-type {
  margin: 2px 0 0;
  font-size: 12.5px;
  color: var(--color-header-muted);
}

.decision-amount {
  margin: 4px 0 0;
  font-family: var(--font-serif);
  font-size: 18px;
  font-weight: 700;
  font-variant-numeric: lining-nums;
  font-feature-settings: 'lnum' 1;
  color: var(--color-green-strong);
}

.decision-amount--unset {
  font-family: inherit;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--color-slate-badge-text);
}

.decision-agreed {
  margin: 4px 0 0;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--color-green-strong);
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
