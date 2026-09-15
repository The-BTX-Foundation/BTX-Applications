<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { DONOR_IMPACT_METRICS, useDonorImpactStore } from '@/stores/donorImpact'

const authStore = useAuthStore()
const donorImpactStore = useDonorImpactStore()

// The subset of metrics that are real, selected/inserted-by-the-store
// columns, as opposed to client-derived computed ones.
const editableMetrics = DONOR_IMPACT_METRICS.filter((m) => m.editable)

// Category tabs shown across the top of the detail panel, in display
// order. All six are real, DONOR_IMPACT_METRICS-backed categories.
const CATEGORY_TABS = ['Reach', 'Investment', 'Engagement', 'Outcomes', 'Equity', 'Stewardship']
const activeCategory = ref('Reach')

// The active category's editable metrics -- covers all six tabs, not just
// Reach/Investment, since every category is now backed by real columns.
const activeCategoryMetrics = computed(() =>
  editableMetrics.filter((m) => m.category === activeCategory.value),
)

// Chart-tab metrics for the active category -- the full DONOR_IMPACT_METRICS
// list (not just editable ones), so computed metrics like Average
// Scholarship Size still get their own tab within Investment.
const chartMetricsForCategory = computed(() =>
  DONOR_IMPACT_METRICS.filter((m) => m.category === activeCategory.value),
)

// Reads a metric's value off a cycle row — computed metrics derive their
// value from other columns instead of reading a column directly. Falls
// back to 0 for editable metrics: cycles created before a column existed
// hold real `null` there (never backfilled), and null.toLocaleString()
// throws in formatBarValue — coalescing here is the one place that needs
// to know about that, instead of every caller guarding separately.
function metricValue(cycle, metric) {
  return metric.computed ? metric.computed(cycle) : (cycle[metric.key] ?? 0)
}

// Includes reviewer alongside admin/board so viewing matches the donor_impact
// RLS SELECT policy (admin, board, and reviewer can all view). This page has
// no write actions of its own anymore -- all data here is read-only display.
const canView = computed(() => authStore.isAdmin || authStore.isBoard || authStore.isReviewer)

const selectedMetricId = ref(null)
// Matches activeCategory's default ('Reach') so the chart and the visible
// category agree on first load.
const chartMetricKey = ref('students_reached')

// Chart tabs are scoped to the active category. When switching categories,
// reset the chart selection to that category's first metric if the
// current one doesn't belong there anymore -- otherwise you could land on
// a category whose chart-tab row doesn't even include the previously
// selected metric.
watch(activeCategory, (category) => {
  const categoryMetrics = DONOR_IMPACT_METRICS.filter((m) => m.category === category)
  if (!categoryMetrics.some((m) => m.key === chartMetricKey.value)) {
    chartMetricKey.value = categoryMetrics[0]?.key ?? null
  }
})

onMounted(() => {
  authStore.init()
})

// Refetch whenever the signed-in user changes (sign in, sign out, switch
// accounts). Skips the fetch entirely while signed out or for a role that
// can't view this page, since RLS would just reject it with a
// permission-denied error before the user ever gets a chance to act.
watch(
  () => authStore.session?.user?.id ?? null,
  (userId) => {
    if (userId && canView.value) {
      donorImpactStore.fetchCycles()
    }
  },
  { immediate: true },
)

// Auto-select the most recent cycle (cycles are fetched newest-year-first)
// once they load, if nothing is selected yet.
watch(
  () => donorImpactStore.cycles,
  (cycles) => {
    if (!selectedMetricId.value && cycles.length > 0) {
      selectedMetricId.value = cycles[0].metric_id
    }
  },
)

const selectedCycle = computed(() =>
  donorImpactStore.cycles.find((cycle) => cycle.metric_id === selectedMetricId.value),
)

// The most recent published year — that card gets the "Live" badge, every
// other published card gets "Archived".
const liveYear = computed(() => {
  const publishedYears = donorImpactStore.cycles.filter((c) => c.published).map((c) => c.cycle_year)
  return publishedYears.length > 0 ? Math.max(...publishedYears) : null
})

// Builds a cycle card's badge text/variant. Unpublished (draft) cycles get
// no badge at all.
function badgeFor(cycle) {
  if (!cycle.published) return null
  return cycle.cycle_year === liveYear.value
    ? { text: 'Live', variant: 'live' }
    : { text: 'Archived', variant: 'default' }
}

// Published cycles, oldest first, for the bar chart's left-to-right timeline.
const publishedCycles = computed(() =>
  donorImpactStore.cycles.filter((c) => c.published).sort((a, b) => a.cycle_year - b.cycle_year),
)

// The metric definition backing the chart's currently selected tab.
const chartMetric = computed(() => DONOR_IMPACT_METRICS.find((m) => m.key === chartMetricKey.value))

const maxChartValue = computed(() =>
  Math.max(...publishedCycles.value.map((c) => metricValue(c, chartMetric.value)), 1),
)

// Bar height as a percentage of the highest published value for the
// selected metric.
function barHeight(cycle) {
  return `${(metricValue(cycle, chartMetric.value) / maxChartValue.value) * 100}%`
}

// Formats a cycle's bar-top label for the selected metric — currency gets
// a leading "$", percent gets a trailing "%", everything else is a plain
// thousands-separated number.
function formatBarValue(cycle) {
  const value = metricValue(cycle, chartMetric.value)
  if (chartMetric.value.format === 'currency') return `$${value.toLocaleString()}`
  if (chartMetric.value.format === 'percent') return `${value.toLocaleString()}%`
  return value.toLocaleString()
}

</script>

<template>
  <h2 v-if="!authStore.session">Sign in</h2>
  <p v-else-if="!canView" class="access-denied">Access Denied</p>

  <template v-else>
    <p v-if="donorImpactStore.loading">Loading cycles…</p>
    <p v-else-if="donorImpactStore.error" class="error">{{ donorImpactStore.error }}</p>

    <div v-else class="program-impact">
      <div class="cycle-column">
        <div class="cycle-column-header">
          <h2>Reporting Cycles</h2>
        </div>

        <ul class="cycle-list">
          <li v-for="cycle in donorImpactStore.cycles" :key="cycle.metric_id">
            <button
              type="button"
              class="cycle-card"
              :class="{ 'cycle-card--active': cycle.metric_id === selectedMetricId }"
              @click="selectedMetricId = cycle.metric_id"
            >
              <span class="cycle-year">{{ cycle.cycle_year }}</span>
              <span
                v-if="badgeFor(cycle)"
                class="badge"
                :class="`badge--${badgeFor(cycle).variant}`"
              >
                {{ badgeFor(cycle).text }}
              </span>
            </button>
          </li>
        </ul>
      </div>

      <div v-if="selectedCycle" class="detail-column">
        <h2 data-page-heading>{{ selectedCycle.cycle_year }} Metrics</h2>

        <div class="metrics-form">
          <div class="tabs">
            <button
              v-for="category in CATEGORY_TABS"
              :key="category"
              type="button"
              class="tab"
              :class="{ 'tab--active': activeCategory === category }"
              @click="activeCategory = category"
            >
              {{ category }}
            </button>
          </div>

          <div class="category-panel">
            <div class="metrics-group-fields">
              <div v-for="metric in activeCategoryMetrics" :key="metric.key" class="metric-field">
                <span class="metric-label">{{ metric.label }}</span>
                <span class="value-with-suffix">
                  <span class="metric-value">{{ metricValue(selectedCycle, metric) }}</span>
                  <span v-if="metric.format === 'percent'" class="value-suffix">%</span>
                </span>
              </div>
            </div>

            <!-- Applicant Pool Comparison is inherently a comparison, not a
                 single metric -- reuses the 2 Equity fields above in a
                 side-by-side layout rather than adding a fake 3rd field. -->
            <div v-if="activeCategory === 'Equity'" class="applicant-pool-comparison">
              <h4 class="metrics-group-header">Applicant Pool Comparison</h4>
              <div class="comparison-row">
                <div class="comparison-item">
                  <span class="comparison-label">% First-Generation Students</span>
                  <span class="comparison-value">{{ selectedCycle.pct_first_generation ?? 0 }}%</span>
                </div>
                <div class="comparison-item">
                  <span class="comparison-label">% Underrepresented/Low-Income</span>
                  <span class="comparison-value">{{ selectedCycle.pct_underrepresented_low_income ?? 0 }}%</span>
                </div>
              </div>
            </div>

            <div class="chart">
              <h3>{{ chartMetric?.label }} by Year</h3>

              <div class="chart-tabs">
                <button
                  v-for="metric in chartMetricsForCategory"
                  :key="metric.key"
                  type="button"
                  class="chart-tab"
                  :class="{ 'chart-tab--active': metric.key === chartMetricKey }"
                  @click="chartMetricKey = metric.key"
                >
                  {{ metric.label }}
                </button>
              </div>

              <p v-if="publishedCycles.length === 0" class="chart-empty">
                No published cycles yet.
              </p>
              <div v-else class="bars">
                <div v-for="cycle in publishedCycles" :key="cycle.metric_id" class="bar-col">
                  <span class="bar-value">{{ formatBarValue(cycle) }}</span>
                  <div class="bar" :style="{ height: barHeight(cycle) }"></div>
                  <span class="bar-label">{{ cycle.cycle_year }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </template>
</template>

<style scoped>
.program-impact {
  display: flex;
  gap: 24px;
  align-items: flex-start;
}

.cycle-column {
  flex-shrink: 0;
  width: 220px;
}

.cycle-column-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;
}

.cycle-column-header h2 {
  margin: 0;
  font-size: 18px;
}

.cycle-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cycle-card {
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

.cycle-card--active {
  border: 1px solid #c9932a;
}

.cycle-year {
  font-size: 15px;
  font-weight: 500;
  color: #2d3142;
}

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

.metrics-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* Category tab bar — same underline pattern as TasksAlertsList.vue's
   Active/Pending/Completed tabs, reused here rather than inventing a new
   tab style. */
.tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  border-bottom: 1px solid #e5e3dd;
}

.tab {
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  padding: 8px 4px;
  margin-right: 20px;
  font-size: 14px;
  font-weight: 500;
  color: #8a8a85;
  cursor: pointer;
}

.tab--active {
  color: #2d3142;
  border-bottom-color: #c9932a;
}

.category-panel {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.metrics-group-header {
  margin: 0 0 12px;
  font-size: 13px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #8a8a85;
}

.metrics-group-fields {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 10px;
}

/* Shared dense boxed-widget spec (matching ProgramPlanning.vue's .stat,
   FundraisingHealth.vue's .metric-field, and BudgetTracking.vue's
   .metric-field/.computed-display) -- same border/background/radius/
   padding/gap/font-size standard app-wide. */
.metric-field {
  display: flex;
  flex-direction: column;
  gap: 3px;
  background: #fff;
  border: 0.5px solid #e5e3dd;
  border-radius: 8px;
  padding: 8px 10px;
}

.metric-label {
  font-size: 12px;
  font-weight: 600;
  color: #4a4a4a;
}

.metric-value {
  font-size: 15px;
  font-weight: 600;
  color: #2d3142;
}

.value-with-suffix {
  display: flex;
  align-items: center;
  gap: 6px;
}

.value-suffix {
  font-size: 13px;
  color: #8a8a85;
}

.applicant-pool-comparison {
  padding-top: 4px;
}

.comparison-row {
  display: flex;
  gap: 10px;
}

/* Same boxed treatment as .metric-field above, but keeping its existing
   gold/larger value styling as a deliberate highlight tier -- not shrunk
   to the plain metric-field's 15px/navy. */
.comparison-item {
  display: flex;
  flex-direction: column;
  gap: 3px;
  background: #fff;
  border: 0.5px solid #e5e3dd;
  border-radius: 8px;
  padding: 8px 10px;
}

.comparison-label {
  font-size: 12px;
  font-weight: 600;
  color: #4a4a4a;
}

.comparison-value {
  font-size: 20px;
  font-weight: 600;
  color: #c9932a;
}

/* Card wrapper reusing .cycle-card's existing border treatment, so the
   chart reads as a grouped panel consistent with the cycle-list cards
   already on this page. */
.chart {
  border: 0.5px solid #e5e3dd;
  border-radius: 12px;
  padding: 20px;
  background: #fff;
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
   cycle list stacks above the detail column instead of beside it. The list
   itself becomes a horizontal scroll row rather than a taller vertical
   stack -- same overflow-x pattern this file's own .chart bars already use
   for a growing set of items -- so a long cycle history doesn't push the
   selected cycle's actual detail content further down the page. Nothing
   above this query is touched, so desktop layout is unaffected.

   scrollbar-width/-ms-overflow-style/::-webkit-scrollbar below hide the
   native horizontal scrollbar this row's overflow-x: auto produces --
   with 5+ cards at min-width: 200px it always overflows a phone-width
   screen, so the unstyled browser scrollbar painted as a persistent gray
   bar under the cards. The row is still scrollable by touch/trackpad;
   only the visible scrollbar affordance is removed. */
@media (max-width: 850px) {
  .program-impact {
    flex-direction: column;
  }

  .cycle-column {
    width: 100%;
  }

  .cycle-list {
    flex-direction: row;
    overflow-x: auto;
    padding-bottom: 4px;
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  .cycle-list::-webkit-scrollbar {
    display: none;
  }

  .cycle-card {
    width: auto;
    min-width: 200px;
    flex-shrink: 0;
  }
}

/* Below 850px, .bars/.bar-col shrink to fit -- sized against the real
   measured container width, not the naive "viewport minus a bit of
   padding" estimate that would wrongly suggest plenty of room. At an
   actual 375px phone width, .program-impact's own box is only ~228px wide
   (the page's 32px padding plus the panel's 32px padding already eat
   128px off both sides, before .chart's own 20px padding is even
   counted), leaving just ~188px for .bars itself. At the original 48px
   bar-col width and 20px gap, 5 published cycles need 320px -- overflowing
   that real 188px budget by well over 100px, which is what the screenshot
   showed. 28px columns with a 6px gap total 164px for 5 bars, comfortably
   inside the measured 188px with slack to spare (and more slack still at
   390px, where the same container measures ~243px). Font sizes drop to
   10px/11px to stay legible at the narrower column -- both already within
   the app's existing minimum text sizes elsewhere (.source-label uses
   11px). Currency-formatted bar values (e.g. "$200,000" on the Investment
   tab) need overflow-wrap: anywhere, not just a smaller font -- a string
   like "$200,000" has no space or hyphen for the browser to wrap at, so
   without it the text doesn't drop to a second line at all, it overflows
   straight into the neighboring column (verified: adjacent values
   overlapping by several px). overflow-wrap: anywhere forces a break
   mid-string once it no longer fits, which only ever triggers when
   content is actually too wide for 28px -- the plain short numbers used
   elsewhere in both charts are unaffected. */
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
