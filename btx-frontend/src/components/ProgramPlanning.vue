<script setup>
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useProgramPlanProgressStore } from '@/stores/programPlanProgress'
import { useProgramPlanMilestonesStore } from '@/stores/programPlanMilestones'
import {
  formatFullDate,
  groupMilestonesByQuarter,
  milestoneStatus,
  monthAbbreviation,
  splitMilestoneCode,
} from '@/lib/programRoadmap'

const authStore = useAuthStore()
const programPlanProgressStore = useProgramPlanProgressStore()
const programPlanMilestonesStore = useProgramPlanMilestonesStore()

// Same page-access gate as ProgramImpact.vue/FundraisingHealth.vue: admin,
// board, and reviewer can view; applicant is blocked. Matches
// program_plan_progress's/program_plan_milestones' own RLS SELECT policy
// exactly.
const canView = computed(() => authStore.isAdmin || authStore.isBoard || authStore.isReviewer)

// Loads the session and subscribes to future auth changes -- nothing else
// in this app calls this globally (App.vue only inits the theme store), so
// each gated page is responsible for its own call. Idempotent (see
// auth.js's own `initialized` guard), so this is safe even though several
// other pages make the same call.
onMounted(() => {
  authStore.init()
})

// Refetch whenever the signed-in user changes (sign in, sign out, switch
// accounts). Skips the fetch entirely while signed out or for a role that
// can't view this page, since RLS would just reject it before the user
// ever gets a chance to act. Both stores load together in one Promise.all
// -- the plan strip/tiles need programPlanProgressStore, the roadmap needs
// programPlanMilestonesStore, and both are gated by the same canView check
// and RLS policy, so there's no reason to sequence them.
watch(
  () => authStore.session?.user?.id ?? null,
  (userId) => {
    if (userId && canView.value) {
      Promise.all([programPlanProgressStore.fetchPlans(), programPlanMilestonesStore.fetchMilestones()])
    }
  },
  { immediate: true },
)

const selectedPlanYear = ref(null)

// Auto-select the Live plan once plans load, if nothing is selected yet.
// plans[0] already IS the Live plan -- fetchPlans orders plan_year
// descending, the same ordering liveYear below computes Math.max from.
watch(
  () => programPlanProgressStore.plans,
  (plans) => {
    if (selectedPlanYear.value === null && plans.length > 0) {
      selectedPlanYear.value = plans[0].plan_year
    }
  },
)

const selectedPlan = computed(() =>
  programPlanProgressStore.plans.find((plan) => plan.plan_year === selectedPlanYear.value),
)

// program_plan_progress has no published/live-vs-archived column -- every
// row here is a real synced progress snapshot, not a draft/live state like
// donor_impact's `published` flag. Live is inferred the same way
// ProgramImpact.vue infers its own Live badge for a column that doesn't
// exist: the single most recent plan year gets "Live", every other plan
// year gets "Archived". Unlike Home's own useHomeSummary.js (which picks
// the plan matching the real calendar year, falling back to the most
// recent), this is a plain max -- the two happen to agree today (both
// resolve to 2026), but they're independent computations, not shared
// logic, and Home is intentionally not touched here.
const liveYear = computed(() => {
  const years = programPlanProgressStore.plans.map((plan) => plan.plan_year)
  return years.length > 0 ? Math.max(...years) : null
})

function planIsLive(plan) {
  return plan.plan_year === liveYear.value
}

// Every milestone row for the selected plan year.
const selectedPlanMilestones = computed(() =>
  programPlanMilestonesStore.milestones.filter((milestone) => milestone.plan_year === selectedPlanYear.value),
)

// -- Status tiles --
// Milestones complete/total come from the milestone ROWS for this plan
// year (not program_plan_progress's own milestones_complete/
// milestones_total columns) per the spec's own tie-break rule -- in the
// live data these already agree (1/9 both ways for 2026), so this is
// belt-and-suspenders rather than a fix for an observed mismatch.
const milestonesCompleteCount = computed(
  () => selectedPlanMilestones.value.filter((milestone) => milestone.is_complete).length,
)
const milestonesTotalCount = computed(() => selectedPlanMilestones.value.length)

// Always null -- program_plan_milestones has no per-deliverable/progress
// column of any kind (see programRoadmap.js's milestoneStatus comment),
// so there's no real data source for a milestone-level "in progress"
// count. Rendered as an em-dash, never a fake 0.
const milestonesInProgressCount = null

const deliverablesComplete = computed(() => selectedPlan.value?.tasks_complete ?? null)
const deliverablesTotal = computed(() => selectedPlan.value?.tasks_total ?? null)
const deliverablesRemaining = computed(() => selectedPlan.value?.tasks_not_started ?? null)

// -- Roadmap --
const quarterGroups = computed(() => groupMilestonesByQuarter(selectedPlanMilestones.value))

// Tracks which milestone cards are expanded in place; multiple can be
// open at once, same convention as Home's own section cards.
const expandedMilestoneIds = reactive(new Set())

function toggleMilestone(id) {
  if (expandedMilestoneIds.has(id)) {
    expandedMilestoneIds.delete(id)
  } else {
    expandedMilestoneIds.add(id)
  }
}

// -- Plan strip "swipe for more" hint --
// Only shown once the strip has actually overflowed its own width -- a
// scroll hint for a row that already shows every card in full would just
// be noise. Rechecked on window resize and whenever the plan list itself
// changes (a plan year is added/removed), not just once on mount.
const planStripEl = ref(null)
const planStripOverflows = ref(false)

function checkPlanStripOverflow() {
  const el = planStripEl.value
  planStripOverflows.value = !!el && el.scrollWidth > el.clientWidth + 1
}

onMounted(() => {
  window.addEventListener('resize', checkPlanStripOverflow)
})

onUnmounted(() => {
  window.removeEventListener('resize', checkPlanStripOverflow)
})

watch(
  () => programPlanProgressStore.plans,
  () => nextTick(checkPlanStripOverflow),
)

// -- Per-milestone display helpers --
// Thin wrappers around programRoadmap.js's pure functions, kept here
// rather than calling the imports directly in the template so the
// template reads as "what" not "how" (milestoneCode(m), not
// splitMilestoneCode(m.milestone_name).code).
function milestoneCode(milestone) {
  return splitMilestoneCode(milestone.milestone_name).code
}

function milestoneTitle(milestone) {
  return splitMilestoneCode(milestone.milestone_name).title
}

function milestoneMonth(milestone) {
  return monthAbbreviation(milestone.due_date)
}

// 'complete' | 'in-progress' | 'not-started' -> the pill/accent-bar
// modifier class suffix used by both .milestone-card and .status-pill.
function statusModifier(milestone) {
  return milestoneStatus(milestone)
}

function statusLabel(milestone) {
  const status = milestoneStatus(milestone)
  if (status === 'complete') return 'Complete'
  if (status === 'in-progress') return 'In progress'
  return 'Not started'
}
</script>

<template>
  <h2 v-if="!authStore.session">Sign in</h2>
  <p v-else-if="!canView" class="access-denied">Access Denied</p>

  <section v-else class="program-planning">
    <h1 class="page-title" data-page-heading>Program Planning</h1>
    <p class="subline">Milestones and deliverables for the active program plan, laid out by quarter.</p>

    <p v-if="programPlanProgressStore.error || programPlanMilestonesStore.error" class="page-error">
      Couldn't load program plans.
    </p>

    <template v-else>
      <h2 class="section-heading heading-plans">Program plans - drives the homepage widget</h2>

      <div v-if="programPlanProgressStore.loading" class="skeleton skeleton--strip"></div>
      <p v-else-if="programPlanProgressStore.plans.length === 0" class="empty">No program plans yet.</p>
      <template v-else>
        <div ref="planStripEl" class="plan-strip">
          <button
            v-for="plan in programPlanProgressStore.plans"
            :key="plan.plan_year"
            type="button"
            class="plan-card"
            :class="{ 'plan-card--selected': plan.plan_year === selectedPlanYear }"
            :aria-pressed="plan.plan_year === selectedPlanYear"
            @click="selectedPlanYear = plan.plan_year"
          >
            <span class="plan-card-title">{{ plan.plan_year }} Plan</span>
            <span class="pill" :class="planIsLive(plan) ? 'pill--success' : 'pill--neutral'">
              <span class="pill-dot"></span>{{ planIsLive(plan) ? 'Live' : 'Archived' }}
            </span>
          </button>
        </div>
        <p v-if="planStripOverflows" class="swipe-hint">Swipe for more plans →</p>
      </template>

      <template v-if="selectedPlan">
        <h2 class="section-heading heading-status">{{ selectedPlan.plan_year }} plan status</h2>

        <div class="tiles">
          <div class="tile">
            <p class="tile-value tile-value--green">{{ milestonesCompleteCount }}/{{ milestonesTotalCount }}</p>
            <p class="tile-label">Milestones complete</p>
          </div>
          <div class="tile">
            <p class="tile-value tile-value--strong">{{ deliverablesComplete ?? '—' }}/{{ deliverablesTotal ?? '—' }}</p>
            <p class="tile-label">Deliverables complete</p>
          </div>
          <div class="tile">
            <p class="tile-value tile-value--gold">{{ milestonesInProgressCount ?? '—' }}</p>
            <p class="tile-label">Milestones in progress</p>
          </div>
          <div class="tile">
            <p class="tile-value tile-value--muted">{{ deliverablesRemaining ?? '—' }}</p>
            <p class="tile-label">Deliverables remaining</p>
          </div>
        </div>

        <h2 class="section-heading heading-roadmap">Roadmap by quarter</h2>

        <div v-if="programPlanMilestonesStore.loading" class="skeleton skeleton--roadmap"></div>
        <p v-else-if="selectedPlanMilestones.length === 0" class="empty">No milestones for this plan yet.</p>
        <div v-else class="roadmap">
          <div v-for="(group, i) in quarterGroups" :key="group.key" class="quarter-block">
            <div v-if="i !== quarterGroups.length - 1" class="quarter-rail" aria-hidden="true"></div>

            <div class="quarter-header">
              <span class="quarter-node" :class="{ 'quarter-node--filled': group.nodeFilled }" aria-hidden="true"></span>
              <span class="quarter-title">{{ group.label }}</span>
              <span class="quarter-summary">
                {{ group.inProgressCount > 0 ? `${group.inProgressCount} in progress` : `${group.completeCount} of ${group.totalCount} complete` }}
              </span>
            </div>

            <div class="milestone-list">
              <div
                v-for="milestone in group.milestones"
                :key="milestone.id"
                class="milestone-card"
                :class="`milestone-card--${statusModifier(milestone)}`"
              >
                <button
                  type="button"
                  class="milestone-header"
                  :aria-expanded="expandedMilestoneIds.has(milestone.id)"
                  @click="toggleMilestone(milestone.id)"
                >
                  <span class="milestone-left">
                    <span class="milestone-meta">
                      <span v-if="milestoneCode(milestone)" class="milestone-code">{{ milestoneCode(milestone) }}</span>
                      <span v-if="milestoneMonth(milestone)" class="month-chip">{{ milestoneMonth(milestone) }}</span>
                    </span>
                    <span class="milestone-title">{{ milestoneTitle(milestone) }}</span>
                  </span>

                  <span class="milestone-right">
                    <span class="pill" :class="`pill--${statusModifier(milestone) === 'complete' ? 'success' : statusModifier(milestone) === 'in-progress' ? 'amber' : 'neutral'}`">
                      <span class="pill-dot"></span>{{ statusLabel(milestone) }}
                    </span>
                    <svg
                      class="chevron"
                      :class="{ 'chevron--open': expandedMilestoneIds.has(milestone.id) }"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </span>
                </button>

                <div v-if="expandedMilestoneIds.has(milestone.id)" class="milestone-body">
                  <p>{{ milestone.due_date ? `Due ${formatFullDate(milestone.due_date)}` : 'No due date set' }}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </template>

    <!-- No admin/refresh/sync action existed on the old page to carry
         forward -- program_plan_progress/program_plan_milestones are both
         read-only from this app (the only writer is the external Apps
         Script sync, via its own Edge Functions), and the old page had no
         button of its own beyond the milestone timeline/list this
         redesign replaces. -->
    <p class="footer">BTX Ops Hub · Program Planning</p>
  </section>
</template>

<style scoped>
.program-planning {
  max-width: 640px;
  margin: 0 auto;
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
  max-width: 300px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--color-header-muted);
}

.section-heading {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  color: var(--color-header-strong);
}

.heading-plans {
  margin-top: 24px;
}

.heading-status {
  margin-top: 20px;
}

.heading-roadmap {
  margin-top: 20px;
}

.empty {
  margin: 10px 0 0;
  font-size: 13px;
  color: var(--color-header-muted);
}

.page-error {
  margin: 16px 0 0;
  font-size: 13px;
  color: var(--color-danger-text);
}

/* Hidden-scrollbar horizontal scroller with scroll-snap, plus a right-edge
   fade (mask-image) hinting there's more to scroll to -- the "Swipe for
   more plans" text below is the accessible version of that same hint for
   anyone who can't see the fade (or isn't on a touch device to begin
   with). Cards sized to ~48% of the strip's own width so the 2nd card is
   always fully visible and a 3rd peeks at the edge, regardless of how
   many plan years exist. */
.plan-strip {
  margin-top: 10px;
  display: flex;
  gap: 10px;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  scrollbar-width: none;
  -ms-overflow-style: none;
  mask-image: linear-gradient(to right, black 92%, transparent 100%);
}

.plan-strip::-webkit-scrollbar {
  display: none;
}

.plan-card {
  flex: 0 0 48%;
  scroll-snap-align: start;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 11px 12px;
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.plan-card--selected {
  border: 1.5px solid var(--color-accent);
}

.plan-card-title {
  font-family: var(--font-serif);
  font-size: 14px;
  font-weight: 700;
  color: var(--color-header-strong);
  font-variant-numeric: lining-nums;
  font-feature-settings: 'lnum' 1;
}

.swipe-hint {
  margin: 6px 0 0;
  font-size: 10.5px;
  color: var(--color-header-muted);
}

.pill {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 10px;
  font-weight: 700;
  padding: 3px 9px;
  border-radius: 999px;
  white-space: nowrap;
}

.pill-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
  flex-shrink: 0;
}

.pill--success {
  background: var(--color-success-badge-bg);
  color: var(--color-success-badge-text);
}

.pill--amber {
  background: var(--color-amber-badge-bg);
  color: var(--color-amber-badge-text);
}

.pill--neutral {
  background: var(--color-neutral-badge-bg);
  color: var(--color-neutral-badge-text);
}

.tiles {
  margin-top: 10px;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.tile {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 10px 6px;
  text-align: center;
}

.tile-value {
  margin: 0;
  font-family: var(--font-serif);
  font-size: 20px;
  font-weight: 700;
  font-variant-numeric: lining-nums;
  font-feature-settings: 'lnum' 1;
}

.tile-value--green {
  color: var(--color-green-strong);
}

.tile-value--strong {
  color: var(--color-header-strong);
}

.tile-value--gold {
  color: var(--color-gold-strong);
}

.tile-value--muted {
  color: var(--color-header-muted);
}

.tile-label {
  margin: 4px 0 0;
  font-size: 10px;
  line-height: 1.25;
  color: var(--color-header-muted);
}

.roadmap {
  margin-top: 10px;
}

.quarter-block {
  position: relative;
}

.quarter-block + .quarter-block {
  margin-top: 22px;
}

/* Runs from just below this quarter's own node down through its
   milestone list to the next quarter's node -- the 22px inter-quarter
   margin above is exactly how far past this block's own height the rail
   needs to reach, so `bottom` is negative by that same amount. Omitted
   entirely (see the template's v-if) for the last quarter, since there's
   no next node to connect to. */
.quarter-rail {
  position: absolute;
  left: 5.25px;
  top: 14px;
  bottom: -22px;
  width: 1.5px;
  background: var(--color-border);
}

.quarter-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.quarter-node {
  position: relative;
  flex-shrink: 0;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid var(--color-header-strong);
  background: var(--color-page-bg);
}

.quarter-node--filled {
  background: var(--color-green-strong);
  border-color: var(--color-green-strong);
}

.quarter-title {
  flex: 1;
  min-width: 0;
  font-family: var(--font-serif);
  font-size: 15px;
  font-weight: 700;
  color: var(--color-header-strong);
}

.quarter-summary {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--color-header-muted);
}

.milestone-list {
  margin-top: 10px;
  margin-left: 24px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.milestone-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-left: 3px solid transparent;
  border-radius: 12px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  overflow: hidden;
}

.milestone-card--complete {
  border-left-color: var(--color-green-strong);
}

.milestone-card--in-progress {
  border-left-color: var(--color-gold-strong);
}

.milestone-header {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
  font: inherit;
  color: inherit;
}

.milestone-left {
  min-width: 0;
  flex: 1;
}

.milestone-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 2px;
}

.milestone-code {
  font-size: 9.5px;
  color: var(--color-header-muted);
  font-variant-numeric: tabular-nums;
}

.month-chip {
  font-size: 9px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--color-neutral-badge-bg);
  color: var(--color-neutral-badge-text);
}

.milestone-title {
  display: block;
  margin: 0;
  font-size: 14px;
  font-weight: 400;
  color: var(--color-header-strong);
}

.milestone-right {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.chevron {
  flex-shrink: 0;
  color: var(--color-header-muted);
  transition: transform 0.15s ease;
}

.chevron--open {
  transform: rotate(180deg);
}

.milestone-body {
  margin: 0 12px 12px;
  padding-top: 10px;
  border-top: 1px solid var(--color-border);
  font-size: 12.5px;
  color: var(--color-header-muted);
}

.milestone-body p {
  margin: 0;
}

/* Neutral pulsing placeholders -- same footprint as the real content so
   nothing visibly resizes once data arrives. Same animation as Impact to
   Date's own chart skeleton. */
.skeleton {
  border-radius: 12px;
  background: var(--color-track);
  animation: skeleton-pulse 1.4s ease-in-out infinite;
}

.skeleton--strip {
  margin-top: 10px;
  height: 64px;
}

.skeleton--roadmap {
  margin-top: 10px;
  height: 160px;
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
  font-size: 11px;
  color: var(--color-header-muted);
}

.access-denied {
  margin: 0;
  color: var(--color-danger-text);
  font-weight: 600;
}
</style>
