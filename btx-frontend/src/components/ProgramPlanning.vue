<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useProgramPlanProgressStore } from '@/stores/programPlanProgress'
import { useProgramPlanMilestonesStore } from '@/stores/programPlanMilestones'

const authStore = useAuthStore()
const programPlanProgressStore = useProgramPlanProgressStore()
const programPlanMilestonesStore = useProgramPlanMilestonesStore()

// Same page-access gate as ProgramImpact.vue/FundraisingHealth.vue: admin,
// board, and reviewer can view; applicant is blocked. Matches
// program_plan_progress's own RLS SELECT policy exactly.
const canView = computed(() => authStore.isAdmin || authStore.isBoard || authStore.isReviewer)

onMounted(() => {
  authStore.init()
})

// Refetch whenever the signed-in user changes (sign in, sign out, switch
// accounts). Skips the fetch entirely while signed out or for a role that
// can't view this page, since RLS would just reject it with a
// permission-denied error before the user ever gets a chance to act. Fetches
// both stores -- the plan cards/stats/chart need programPlanProgressStore,
// the new milestone list needs programPlanMilestonesStore -- since both are
// gated by the exact same canView check and RLS policy.
watch(
  () => authStore.session?.user?.id ?? null,
  (userId) => {
    if (userId && canView.value) {
      programPlanProgressStore.fetchPlans()
      programPlanMilestonesStore.fetchMilestones()
    }
  },
  { immediate: true },
)

const selectedPlanYear = ref(null)

// Auto-select the most recent plan year (plans are fetched newest-year-
// first) once they load, if nothing is selected yet.
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
// year gets "Archived".
const liveYear = computed(() => {
  const years = programPlanProgressStore.plans.map((plan) => plan.plan_year)
  return years.length > 0 ? Math.max(...years) : null
})

// Builds a plan card's badge text/variant from the inferred liveYear above.
function badgeFor(plan) {
  return plan.plan_year === liveYear.value
    ? { text: 'Live', variant: 'live' }
    : { text: 'Archived', variant: 'default' }
}

// Chart tabs, each keyed to one of program_plan_progress's own count
// columns directly -- unlike ProgramImpact.vue's DONOR_IMPACT_METRICS (which
// needs a `computed` fn per metric for things like Average Scholarship
// Size), every value plotted here is already a raw stored count, so a
// plain label map is enough.
const CHART_TABS = [
  { key: 'milestones_complete', label: 'Milestones Complete' },
  { key: 'tasks_complete', label: 'Tasks Complete' },
  { key: 'tasks_in_progress', label: 'In Progress' },
  { key: 'tasks_not_started', label: 'Not Yet Started' },
]
const chartMetricKey = ref('milestones_complete')

// Every fetched plan year, oldest first, for the chart's left-to-right
// timeline -- same ascending-by-year ordering as ProgramImpact.vue's
// publishedCycles, but over every plan year rather than a "published"
// subset: program_plan_progress has no draft/live flag (see liveYear's own
// comment above), so there's no equivalent filter to apply here.
const chartPlans = computed(() =>
  [...programPlanProgressStore.plans].sort((a, b) => a.plan_year - b.plan_year),
)

const maxChartValue = computed(() =>
  Math.max(...chartPlans.value.map((plan) => plan[chartMetricKey.value]), 1),
)

// Bar height as a percentage of the highest value for the selected tab
// across every plotted plan year.
function barHeight(plan) {
  return `${(plan[chartMetricKey.value] / maxChartValue.value) * 100}%`
}

// Every milestone for the currently selected plan year, alphabetical --
// programPlanMilestonesStore.milestones already comes back
// alphabetically ordered (see its own fetchMilestones), so this only needs
// to filter by year, not re-sort.
const selectedPlanMilestones = computed(() =>
  programPlanMilestonesStore.milestones.filter((milestone) => milestone.plan_year === selectedPlanYear.value),
)
</script>

<template>
  <h2 v-if="!authStore.session">Sign in</h2>
  <p v-else-if="!canView" class="access-denied">Access Denied</p>

  <template v-else>
    <p v-if="programPlanProgressStore.loading">Loading plans…</p>
    <p v-else-if="programPlanProgressStore.error" class="error">{{ programPlanProgressStore.error }}</p>

    <div v-else class="program-planning">
      <div class="plan-column">
        <div class="plan-column-header">
          <h2>Program Plans</h2>
          <p class="column-subtitle">Drives the homepage widget</p>
        </div>

        <p v-if="programPlanProgressStore.plans.length === 0" class="empty">No program plans yet.</p>

        <ul v-else class="plan-list">
          <li v-for="plan in programPlanProgressStore.plans" :key="plan.plan_year">
            <button
              type="button"
              class="plan-card"
              :class="{ 'plan-card--active': plan.plan_year === selectedPlanYear }"
              @click="selectedPlanYear = plan.plan_year"
            >
              <span class="plan-name">{{ plan.plan_year }} Program Plan</span>
              <span class="badge" :class="`badge--${badgeFor(plan).variant}`">
                {{ badgeFor(plan).text }}
              </span>
            </button>
          </li>
        </ul>
      </div>

      <div v-if="selectedPlan" class="detail-column">
        <h2>{{ selectedPlan.plan_year }} Program Plan</h2>

        <div class="stats-grid">
          <div class="stat">
            <span class="stat-label">Milestones Complete</span>
            <span class="stat-value">{{ selectedPlan.milestones_complete }} / {{ selectedPlan.milestones_total }}</span>
          </div>

          <div class="stat">
            <span class="stat-label">Tasks Complete</span>
            <span class="stat-value">{{ selectedPlan.tasks_complete }} / {{ selectedPlan.tasks_total }}</span>
          </div>

          <div class="stat">
            <span class="stat-label">In Progress</span>
            <span class="stat-value">{{ selectedPlan.tasks_in_progress }}</span>
          </div>

          <div class="stat">
            <span class="stat-label">Not Yet Started</span>
            <span class="stat-value">{{ selectedPlan.tasks_not_started }}</span>
          </div>
        </div>

        <!-- Same chart shape as ProgramImpact.vue's .chart card: title, tab
             row, then bar columns -- reuses those class names verbatim
             (see the shared style comment below) so the two pages read as
             one visual system. Plots raw counts across every fetched plan
             year, not just the one currently selected above. -->
        <div class="chart">
          <h3>{{ CHART_TABS.find((tab) => tab.key === chartMetricKey)?.label }} by Year</h3>

          <div class="chart-tabs">
            <button
              v-for="tab in CHART_TABS"
              :key="tab.key"
              type="button"
              class="chart-tab"
              :class="{ 'chart-tab--active': tab.key === chartMetricKey }"
              @click="chartMetricKey = tab.key"
            >
              {{ tab.label }}
            </button>
          </div>

          <p v-if="chartPlans.length === 0" class="chart-empty">No program plans yet.</p>
          <div v-else class="bars">
            <div v-for="plan in chartPlans" :key="plan.plan_year" class="bar-col">
              <span class="bar-value">{{ plan[chartMetricKey].toLocaleString() }}</span>
              <div class="bar" :style="{ height: barHeight(plan) }"></div>
              <span class="bar-label">{{ plan.plan_year }}</span>
            </div>
          </div>
        </div>

        <!-- Milestone list: every program_plan_milestones row for the
             selected plan year, name + complete/incomplete status. Reuses
             the plan cards' own Live/Archived badge classes (badge--live
             reads as a natural "done" green here too) instead of inventing
             a third badge color for this one section. -->
        <div class="milestone-list-section">
          <h3>Milestones</h3>

          <p v-if="selectedPlanMilestones.length === 0" class="chart-empty">
            No milestones synced for this plan year yet.
          </p>
          <ul v-else class="milestone-list">
            <li v-for="milestone in selectedPlanMilestones" :key="milestone.id" class="milestone-row">
              <span class="milestone-name">{{ milestone.milestone_name }}</span>
              <span class="badge" :class="milestone.is_complete ? 'badge--live' : 'badge--default'">
                {{ milestone.is_complete ? 'Complete' : 'Incomplete' }}
              </span>
            </li>
          </ul>
        </div>

        <!-- PLACEHOLDER — static Program Allocation rollup, not wired to any
             store or table. No Scholarship backing tables exist yet, so
             these are hand-entered values kept only until a real query can
             replace them -- identical to Home.vue's own Program Allocation
             table (same figures, same markup, same styling). Split into
             two portfolios -- Funding and Student Reach -- each summing
             independently to ~100%, with a sub-header row above each group
             so "% of Portfolio" is never ambiguous about which total it's
             measured against. -->
        <div class="allocation-panel">
          <h3>Program Allocation</h3>
          <!-- Horizontal-scroll wrapper at narrow widths -- same overflow-x
               pattern as .bars-scroll elsewhere in the app -- since the
               4-column table (especially Key Milestone Highlights) doesn't
               fit a mobile viewport without it. -->
          <div class="allocation-table-scroll">
            <table class="allocation-table">
              <thead>
                <tr>
                  <th>Metric Category</th>
                  <th>Disbursed/Tracked</th>
                  <th>% of Portfolio</th>
                  <th>Key Milestone Highlights</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colspan="4" class="allocation-group-label">Funding</td>
                </tr>
                <tr>
                  <td class="allocation-category">Direct Academic Aid</td>
                  <td>$52,020.48</td>
                  <td>96.5%</td>
                  <td>13 Scholars funded across 7 active scholarship cycles ($4,000 average disbursement)</td>
                </tr>
                <tr>
                  <td class="allocation-category">Conference Travel</td>
                  <td>$1,886.75</td>
                  <td>3.5%</td>
                  <td>3 Travel Awardees supported for academic conference attendance</td>
                </tr>
                <tr>
                  <td colspan="4" class="allocation-group-label">Student Reach</td>
                </tr>
                <tr>
                  <td class="allocation-category">Scholars Awarded</td>
                  <td>13 Scholars</td>
                  <td>4.5%</td>
                  <td>Core award cohort within the 288 Total Tracked Student Reach</td>
                </tr>
                <tr>
                  <td class="allocation-category">Travel Awardees</td>
                  <td>3 Students</td>
                  <td>1.0%</td>
                  <td>Conference travel recipients within the 288 Total Tracked Student Reach</td>
                </tr>
                <tr>
                  <td class="allocation-category">Campus Outreach</td>
                  <td>272 Students</td>
                  <td>94.4%</td>
                  <td>Largest share of the 288 Total Tracked Student Reach, via on-campus engagement events</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </template>
</template>

<style scoped>
.program-planning {
  display: flex;
  gap: 24px;
  align-items: flex-start;
}

.plan-column {
  flex-shrink: 0;
  width: 240px;
}

.plan-column-header {
  margin-bottom: 12px;
}

.plan-column-header h2 {
  margin: 0;
  font-size: 18px;
}

.column-subtitle {
  margin: 4px 0 0;
  font-size: 12px;
  color: #8a8a85;
}

.empty {
  color: #8a8a85;
  font-size: 13px;
}

.plan-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.plan-card {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  background: #fff;
  border: 0.5px solid #e5e3dd;
  border-radius: 12px;
  padding: 12px 14px;
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.plan-card--active {
  border: 1px solid #c9932a;
}

.plan-name {
  font-size: 15px;
  font-weight: 500;
  color: #2d3142;
}

/* Same badge styling as ProgramImpact.vue's Live/Archived cycle badges. */
.badge {
  flex-shrink: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 999px;
  white-space: nowrap;
}

.badge--live {
  background: #e3f1e1;
  color: #2e7d32;
}

.badge--default {
  background: #f1efe8;
  color: #5f5e5a;
}

.detail-column {
  flex: 1;
  min-width: 0;
}

.detail-column h2 {
  margin: 0 0 16px;
  font-size: 18px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20px;
  margin-bottom: 20px;
}

.stat {
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: #fff;
  border: 0.5px solid #e5e3dd;
  border-radius: 12px;
  padding: 16px 18px;
}

.stat-label {
  font-size: 12px;
  font-weight: 600;
  color: #4a4a4a;
}

.stat-value {
  font-size: 22px;
  font-weight: 600;
  color: #2d3142;
}

/* Chart card: same shape/class names as ProgramImpact.vue's own .chart --
   card wrapper reusing .plan-card's border treatment so it reads as a
   grouped panel consistent with the plan-list cards already on this page. */
.chart {
  border: 0.5px solid #e5e3dd;
  border-radius: 12px;
  padding: 20px;
  background: #fff;
  margin-bottom: 20px;
}

.chart h3 {
  margin: 0 0 16px;
  font-size: 14px;
  font-weight: 500;
  color: #2d3142;
}

.chart-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}

.chart-tab {
  font-size: 13px;
  font-weight: 500;
  padding: 6px 14px;
  border-radius: 999px;
  border: none;
  background: transparent;
  color: #8a8a85;
  cursor: pointer;
}

.chart-tab--active {
  background: #faeeda;
  color: #854f0b;
  font-weight: 600;
}

.chart-empty {
  margin: 0;
  color: #8a8a85;
}

.bars {
  display: flex;
  align-items: flex-end;
  gap: 20px;
  height: 180px;
}

.bar-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  height: 100%;
  width: 48px;
}

.bar-value {
  font-size: 12px;
  color: #8a8a85;
  margin-bottom: 4px;
}

.bar {
  width: 100%;
  background: #c9932a;
  border-radius: 4px 4px 0 0;
}

.bar-label {
  margin-top: 8px;
  font-size: 13px;
  color: #2d3142;
}

/* Milestone list card: same card treatment as .chart above, its own
   section since it's a list rather than a bar chart. */
.milestone-list-section {
  border: 0.5px solid #e5e3dd;
  border-radius: 12px;
  padding: 20px;
  background: #fff;
}

.milestone-list-section h3 {
  margin: 0 0 16px;
  font-size: 14px;
  font-weight: 500;
  color: #2d3142;
}

.milestone-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.milestone-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border: 0.5px solid #e5e3dd;
  border-radius: 12px;
  padding: 10px 14px;
}

.milestone-name {
  font-size: 14px;
  color: #2d3142;
}

/* Program Allocation card+table: identical to Home.vue's own version
   (same class names, same property values) rather than inventing separate
   CSS -- both reuse the app's established card/table convention verbatim
   (same shape as FundraisingHealth.vue's .revenue-panel/.revenue-table). */
.allocation-panel {
  border: 0.5px solid #e5e3dd;
  border-radius: 12px;
  padding: 20px;
  background: #fff;
  margin-bottom: 20px;
}

.allocation-panel h3 {
  margin: 0 0 16px;
  font-size: 14px;
  font-weight: 500;
  color: #2d3142;
}

/* Matches .bars-scroll's convention (FundraisingHealth.vue) -- harmless at
   desktop widths since overflow-x: auto only activates once .allocation-table's
   own min-width genuinely exceeds the panel. */
.allocation-table-scroll {
  overflow-x: auto;
}

.allocation-table {
  width: 100%;
  min-width: 640px;
  border-collapse: collapse;
}

.allocation-table th {
  text-align: left;
  font-size: 12px;
  font-weight: 600;
  color: #8a8a85;
  padding: 0 8px 8px 0;
}

.allocation-table td {
  padding: 6px 8px 6px 0;
  font-size: 14px;
  color: #2d3142;
}

.allocation-category {
  font-weight: 500;
}

/* Sub-header row separating the two portfolios (Funding vs. Student Reach)
   so "% of Portfolio" is never ambiguous about which total it's measured
   against -- matches .metrics-group-header's uppercase small-caps
   convention (FundraisingHealth.vue's "REVENUE SOURCES" label). */
.allocation-group-label {
  padding: 12px 8px 6px 0;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #8a8a85;
}

.error {
  color: #b3261e;
}

.access-denied {
  margin: 0;
  color: #b3261e;
  font-weight: 600;
}

/* Below 850px (matching HomeView.vue's sidebar-drawer breakpoint, so the
   whole app switches to its mobile layout at one consistent width), the
   plan list stacks above the detail column instead of beside it. The list
   itself becomes a horizontal scroll row rather than a taller vertical
   stack -- same overflow-x pattern Program Impact/Fundraising Health's own
   charts already use for a growing set of items -- so more plan years
   accumulating over time doesn't push the selected plan's actual detail
   content further down the page. Nothing above this query is touched, so
   desktop layout is unaffected. */
@media (max-width: 850px) {
  .program-planning {
    flex-direction: column;
    /* .program-planning's own align-items: flex-start (above) is meant for
       the desktop row layout, sizing plan-column/detail-column to their
       content along the (vertical) cross axis -- harmless there since
       neither child is ever wider than the other. Flipping to a column
       direction here swaps the cross axis to horizontal, so without this
       override the same flex-start would shrink-to-fit each child's width
       to its own content instead of the container's -- invisible until
       .allocation-panel's table (min-width: 640px, below) became the first
       child wide enough to expose it, overflowing the whole page instead
       of being contained by .allocation-table-scroll's own overflow-x. */
    align-items: stretch;
  }

  .plan-column {
    width: 100%;
  }

  .plan-list {
    flex-direction: row;
    overflow-x: auto;
    padding-bottom: 4px;
  }

  .plan-card {
    width: auto;
    min-width: 200px;
    flex-shrink: 0;
  }
}

/* Below 850px, .bars/.bar-col shrink to fit -- sized against the real
   measured container width, not the naive "viewport minus a bit of
   padding" estimate that would wrongly suggest plenty of room. At an
   actual 375px phone width, .program-planning's own box is only ~228px
   wide (the page's 32px padding plus the panel's 32px padding already eat
   128px off both sides, before .chart's own 20px padding is even
   counted), leaving just ~188px for .bars itself. At the original 48px
   bar-col width and 20px gap, 5 bars (matching Program Impact's own real
   published-cycle count, since both charts share this exact component
   shape) would need 320px -- overflowing that real 188px budget by well
   over 100px. 28px columns with a 6px gap total 164px for 5 bars,
   comfortably inside the measured 188px with slack to spare (and more
   slack still at 390px, where the same container measures ~243px). Font
   sizes drop to 10px/11px to stay legible at the narrower column -- both
   already within the app's existing minimum text sizes elsewhere
   (.source-label uses 11px). overflow-wrap: anywhere on .bar-value is
   needed on Program Impact's currency-formatted values (e.g. "$200,000" has
   no space or hyphen to wrap at, so without it the text overflows into
   the neighboring column instead of dropping to a second line -- verified
   there). Values here are plain counts, always short enough to never
   trigger it, but the identical rule is applied regardless since both
   files share this component shape exactly. */
@media (max-width: 850px) {
  .bars {
    gap: 6px;
  }

  .bar-col {
    width: 28px;
  }

  .bar-value {
    font-size: 10px;
    overflow-wrap: anywhere;
  }

  .bar-label {
    font-size: 11px;
  }
}
</style>
