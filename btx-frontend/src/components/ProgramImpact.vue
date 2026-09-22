<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { DONOR_IMPACT_METRICS, cycleHasAnyData, metricHasRealValue, useDonorImpactStore } from '@/stores/donorImpact'

const authStore = useAuthStore()
const donorImpactStore = useDonorImpactStore()

// Every donor_impact category is backed by real columns (see donorImpact.js's
// own "every category is now backed by real columns" note), so all six get a
// working tab here -- none are the disabled/no-data placeholder this row
// would otherwise need.
const CATEGORY_TABS = ['Reach', 'Investment', 'Engagement', 'Outcomes', 'Equity', 'Stewardship']
const activeCategory = ref('Reach')

// Same page-access gate as every other Program page: admin, board, and
// reviewer can view; matches donor_impact's RLS SELECT policy exactly.
const canView = computed(() => authStore.isAdmin || authStore.isBoard || authStore.isReviewer)

onMounted(() => {
  authStore.init()
})

// Refetch whenever the signed-in user changes (sign in, sign out, switch
// accounts). Skipped entirely while signed out or for a role RLS wouldn't
// return rows to anyway.
watch(
  () => authStore.session?.user?.id ?? null,
  (userId) => {
    if (userId && canView.value) {
      donorImpactStore.fetchCycles()
    }
  },
  { immediate: true },
)

const selectedMetricId = ref(null)

const selectedCycle = computed(() =>
  donorImpactStore.cycles.find((cycle) => cycle.metric_id === selectedMetricId.value),
)

// The most recent published year -- that card gets the "Live" badge, every
// other published card gets "Archived". Unpublished (draft) cycles get no
// badge at all, matching donorImpactStore's own draft/published distinction.
const liveYear = computed(() => {
  const publishedYears = donorImpactStore.cycles.filter((c) => c.published).map((c) => c.cycle_year)
  return publishedYears.length > 0 ? Math.max(...publishedYears) : null
})

function badgeFor(cycle) {
  if (!cycle.published) return null
  return cycle.cycle_year === liveYear.value ? { text: 'Live', variant: 'live' } : { text: 'Archived', variant: 'default' }
}

// Auto-select the most recent cycle (cycles are fetched newest-year-first)
// once they load, if nothing is selected yet. Also (re)validates the chart's
// selected series against whatever this cycle set actually supports -- see
// chartMetricsForCategory below.
watch(
  () => donorImpactStore.cycles,
  (cycles) => {
    if (!selectedMetricId.value && cycles.length > 0) {
      selectedMetricId.value = cycles[0].metric_id
    }
    if (!chartMetricsForCategory.value.some((m) => m.key === chartMetricKey.value)) {
      chartMetricKey.value = chartMetricsForCategory.value[0]?.key ?? null
    }
  },
)

// -- Category metric tiles (single selected cycle) --
// Every metric in the active category -- all six categories are real, so
// nothing is filtered out here the way the old page's chart tabs were.
const activeCategoryMetrics = computed(() => DONOR_IMPACT_METRICS.filter((m) => m.category === activeCategory.value))

// Reads a metric's value off a cycle for tile display -- computed metrics
// derive their value from other columns instead of reading a column
// directly. Falls back to 0 so a null legacy column (see
// metricHasRealValue's own comment) never throws in toLocaleString below.
function metricValue(cycle, metric) {
  return metric.computed ? metric.computed(cycle) : (cycle[metric.key] ?? 0)
}

function formatMetricValue(cycle, metric) {
  const value = metricValue(cycle, metric)
  if (metric.format === 'currency') return `$${value.toLocaleString()}`
  if (metric.format === 'percent') return `${value.toLocaleString()}%`
  return value.toLocaleString()
}

function formatCurrency(value) {
  return `$${value.toLocaleString()}`
}

// Percentage of `whole`, zero-guarded for a draft cycle whose funding
// columns both start at 0 (see donorImpactStore.createCycle).
function pct(part, whole) {
  return whole > 0 ? ((part / whole) * 100).toFixed(1) : '0.0'
}

// -- Funding portfolio ("Program allocation, {year}") --
// Bound to the same two real columns as before -- scholarship_funds_awarded
// and other_program_funds_awarded -- only the display labels below changed,
// to match Impact to Date's "Direct academic aid" / "Conference travel"
// wording. See the row-label comments in the template for why
// "Conference travel" is NOT a confirmed description of
// other_program_funds_awarded. There's no per-cycle "Student reach
// portfolio" equivalent -- campus outreach has no column at all, so a
// 2-of-3 segment breakdown would misrepresent that cycle's reach
// composition (see the Step 1/2 report) and is intentionally omitted.
const scholarshipFunds = computed(() => selectedCycle.value?.scholarship_funds_awarded ?? 0)
const otherProgramFunds = computed(() => selectedCycle.value?.other_program_funds_awarded ?? 0)
const totalPortfolioFunds = computed(() => scholarshipFunds.value + otherProgramFunds.value)
const scholarshipFundsPct = computed(() => pct(scholarshipFunds.value, totalPortfolioFunds.value))
const otherProgramFundsPct = computed(() => pct(otherProgramFunds.value, totalPortfolioFunds.value))

// -- By-year chart --
const chartMetricKey = ref('students_reached')

// Every cycle that has a genuine value for at least one metric, oldest
// first -- keeps a cycle whose columns are all still unset off the x-axis
// entirely rather than drawing a phantom column of nothing-but-stubs.
// Matches Impact to Date's own yearly-reach chart in including drafts, not
// just published cycles -- a user selecting a draft cycle above should see
// it reflected in the chart too.
const chartCycles = computed(() =>
  [...donorImpactStore.cycles].filter(cycleHasAnyData).sort((a, b) => a.cycle_year - b.cycle_year),
)

// This category's metrics that actually have a real value across 2+
// chart-eligible cycles -- only these earn a series pill, so switching to a
// metric with just one year of history (or none) is never offered.
const chartMetricsForCategory = computed(() =>
  DONOR_IMPACT_METRICS.filter((metric) => {
    if (metric.category !== activeCategory.value) return false
    const realCount = chartCycles.value.filter((cycle) => metricHasRealValue(cycle, metric)).length
    return realCount >= 2
  }),
)

// Switching categories resets the chart to that category's first eligible
// series if the current selection doesn't belong there -- otherwise you
// could land on a category whose own series-picker row doesn't even
// include the previously selected metric.
watch(activeCategory, () => {
  if (!chartMetricsForCategory.value.some((m) => m.key === chartMetricKey.value)) {
    chartMetricKey.value = chartMetricsForCategory.value[0]?.key ?? null
  }
})

const chartMetric = computed(() => DONOR_IMPACT_METRICS.find((m) => m.key === chartMetricKey.value))

const chartHeading = computed(() => (chartMetric.value ? `${chartMetric.value.label} by Year` : 'By Year'))

// A cycle's value for the chart's selected metric -- null (rendered as a
// 0-height "no data" stub, same convention as Impact to Date's own
// yearly-reach chart) when this cycle predates the metric's column, as
// opposed to a genuine recorded 0.
function chartValue(cycle, metric) {
  if (!metric || !metricHasRealValue(cycle, metric)) return null
  return metric.computed ? metric.computed(cycle) : cycle[metric.key]
}

const maxChartValue = computed(() => {
  const values = chartCycles.value.map((c) => chartValue(c, chartMetric.value)).filter((v) => v !== null)
  return Math.max(1, ...values)
})

// Bar height in px, capped at ~100px per the Impact to Date reference. A
// genuine 0 gets a small visible stub (2px, dimmed via .bar--zero); a
// missing value gets nothing (0px) -- same two-case split as Impact to
// Date's own barHeightPx/template.
function barHeightPx(cycle) {
  const value = chartValue(cycle, chartMetric.value)
  if (value === null) return 0
  if (value === 0) return 2
  return Math.round((value / maxChartValue.value) * 100)
}

function barIsZero(cycle) {
  return chartValue(cycle, chartMetric.value) === 0
}

// Highlights the bar for whichever cycle is selected in the reporting-cycle
// strip above, so the single-year focus of this page is visible in the
// by-year chart too.
function barIsCurrent(cycle) {
  return !!selectedCycle.value && cycle.cycle_year === selectedCycle.value.cycle_year
}

function formatBarValue(cycle) {
  const value = chartValue(cycle, chartMetric.value)
  if (value === null) return '—'
  if (chartMetric.value.format === 'currency') return `$${value.toLocaleString()}`
  if (chartMetric.value.format === 'percent') return `${value.toLocaleString()}%`
  return value.toLocaleString()
}

// Screen-reader summary for the whole chart, read once via role="img"
// rather than requiring per-bar navigation.
const chartAriaLabel = computed(() => {
  const parts = chartCycles.value.map((c) => {
    const value = chartValue(c, chartMetric.value)
    return `${c.cycle_year}: ${value === null ? 'no data' : value}`
  })
  return `${chartMetric.value?.label ?? 'Metric'} by year: ${parts.join(', ')}`
})
</script>

<template>
  <h2 v-if="!authStore.session">Sign in</h2>
  <p v-else-if="!canView" class="access-denied">Access Denied</p>

  <section v-else class="program-impact">
    <h1 class="page-title" data-page-heading>Program Impact</h1>
    <p class="subline">
      Reach and outcomes for a single reporting year — pick a cycle below to see how that year performed on its own.
    </p>

    <p v-if="donorImpactStore.error" class="page-error">Couldn't load reporting cycles.</p>

    <template v-else>
      <h2 class="section-heading heading-cycles">Reporting cycles</h2>

      <div v-if="donorImpactStore.loading" class="skeleton skeleton--strip"></div>
      <p v-else-if="donorImpactStore.cycles.length === 0" class="empty">No reporting cycles yet.</p>
      <template v-else>
        <div class="cycle-strip">
          <button
            v-for="cycle in donorImpactStore.cycles"
            :key="cycle.metric_id"
            type="button"
            class="cycle-card"
            :class="{ 'cycle-card--selected': cycle.metric_id === selectedMetricId }"
            :aria-pressed="cycle.metric_id === selectedMetricId"
            @click="selectedMetricId = cycle.metric_id"
          >
            <span class="cycle-card-title">{{ cycle.cycle_year }}</span>
            <span
              v-if="badgeFor(cycle)"
              class="pill"
              :class="badgeFor(cycle).variant === 'live' ? 'pill--success' : 'pill--neutral'"
            >
              <span class="pill-dot"></span>{{ badgeFor(cycle).text }}
            </span>
          </button>
        </div>
      </template>

      <template v-if="selectedCycle">
        <h2 class="section-heading heading-allocation">Program allocation, {{ selectedCycle.cycle_year }}</h2>

        <p class="portfolio-label">FUNDING PORTFOLIO</p>
        <div class="card allocation-card">
          <!-- "Direct academic aid" is scholarship_funds_awarded -- this
               mapping is CONFIRMED by the column's own name/label
               (donorImpact.js: "Scholarship Funds Awarded"), so renaming it
               to match Impact to Date's wording is a safe display-only
               change. -->
          <div class="allocation-row">
            <div class="row-top">
              <span class="row-label">Direct academic aid</span>
              <span class="row-value"
                ><span class="row-value-serif">{{ formatCurrency(scholarshipFunds) }}</span
                ><span class="row-value-pct"> · {{ scholarshipFundsPct }}%</span></span
              >
            </div>
            <div class="bar-track"><div class="bar-fill bar-fill--gold" :style="{ width: `${scholarshipFundsPct}%` }"></div></div>
          </div>
          <!-- "Conference travel" is other_program_funds_awarded -- this
               mapping is UNCONFIRMED. Neither the migration that added this
               column, sync-donor-impact's source, nor donorImpact.js's own
               "Other Program Funds Awarded" label describes it as
               travel-specific; the only "travel" column in the whole schema
               is the unrelated students_sponsored_travel headcount. Its real
               values ($20,000 in both 2025 and 2026, ~33% of that cycle's
               funding portfolio and half the size of scholarship funds) look
               nothing like Impact to Date's own ~$1,886 cumulative
               Conference Travel total -- that's consistent with a broad
               "other programs" bucket, not a small travel-expense line item.
               Renamed here per explicit request; the underlying column
               remains generically named and its travel-specific meaning is
               NOT verified. -->
          <div class="allocation-row allocation-row--last">
            <div class="row-top">
              <span class="row-label">Conference travel</span>
              <span class="row-value"
                ><span class="row-value-serif">{{ formatCurrency(otherProgramFunds) }}</span
                ><span class="row-value-pct"> · {{ otherProgramFundsPct }}%</span></span
              >
            </div>
            <div class="bar-track"><div class="bar-fill bar-fill--gold" :style="{ width: `${otherProgramFundsPct}%` }"></div></div>
          </div>
        </div>

        <h2 class="section-heading heading-metrics">{{ selectedCycle.cycle_year }} metrics</h2>

        <div class="category-tabs">
          <button
            v-for="category in CATEGORY_TABS"
            :key="category"
            type="button"
            class="category-tab"
            :class="{ 'category-tab--active': activeCategory === category }"
            @click="activeCategory = category"
          >
            {{ category }}
          </button>
        </div>

        <div class="tiles">
          <div v-for="metric in activeCategoryMetrics" :key="metric.key" class="tile">
            <p class="tile-value">{{ formatMetricValue(selectedCycle, metric) }}</p>
            <p class="tile-label">{{ metric.label }}</p>
          </div>
        </div>

        <h2 class="section-heading heading-chart">{{ chartHeading }}</h2>
        <div class="card chart-card">
          <div v-if="chartMetricsForCategory.length > 0" class="series-picker">
            <button
              v-for="metric in chartMetricsForCategory"
              :key="metric.key"
              type="button"
              class="series-pill"
              :class="{ 'series-pill--active': metric.key === chartMetricKey }"
              @click="chartMetricKey = metric.key"
            >
              {{ metric.label }}
            </button>
          </div>

          <p v-if="!chartMetric" class="chart-empty">Not enough year-over-year data yet for this category.</p>
          <div v-else class="chart" role="img" :aria-label="chartAriaLabel">
            <div v-for="cycle in chartCycles" :key="cycle.metric_id" class="bar-col">
              <span class="bar-value-label">{{ formatBarValue(cycle) }}</span>
              <div
                class="bar"
                :class="{ 'bar--zero': barIsZero(cycle), 'bar--current': barIsCurrent(cycle) }"
                :style="{ height: `${barHeightPx(cycle)}px` }"
              ></div>
              <span class="bar-year-label">{{ cycle.cycle_year }}</span>
            </div>
          </div>
        </div>
      </template>
    </template>

    <p class="footer">BTX Ops Hub · Program Impact</p>
  </section>
</template>

<style scoped>
.program-impact {
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

.heading-cycles {
  margin-top: 24px;
}

.heading-allocation,
.heading-metrics,
.heading-chart {
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

/* Horizontal scroller with scroll-snap -- unlike ProgramPlanning.vue's
   identical-looking plan strip (left untouched), this one shows its own
   scrollbar instead of a hidden-scrollbar + "swipe" text hint, so the
   overflow affordance is visible without relying on a separate JS
   overflow-detection watcher. Firefox: scrollbar-width/-color below.
   WebKit/Blink: the ::-webkit-scrollbar rules that follow. Both are
   native-drawn, so they only appear at all once the strip actually
   overflows -- nothing to gate manually. */
.cycle-strip {
  margin-top: 10px;
  display: flex;
  gap: 10px;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  scrollbar-width: thin;
  scrollbar-color: var(--color-border-strong) transparent;
}

.cycle-strip::-webkit-scrollbar {
  height: 6px;
}

.cycle-strip::-webkit-scrollbar-track {
  background: transparent;
}

/* --color-border-strong, not --color-border -- the plain border tone is
   too close to --color-surface/--color-page-bg in both themes to read as a
   scrollbar thumb rather than a stray line. */
.cycle-strip::-webkit-scrollbar-thumb {
  background: var(--color-border-strong);
  border-radius: 999px;
}

.cycle-card {
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

.cycle-card--selected {
  border: 1.5px solid var(--color-accent);
}

.cycle-card-title {
  font-family: var(--font-serif);
  font-size: 14px;
  font-weight: 700;
  color: var(--color-header-strong);
  font-variant-numeric: lining-nums;
  font-feature-settings: 'lnum' 1;
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

.pill--neutral {
  background: var(--color-neutral-badge-bg);
  color: var(--color-neutral-badge-text);
}

.card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 14px;
  padding: 14px 16px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}

.portfolio-label {
  margin: 12px 0 0;
  font-size: 10.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-header-muted);
}

.allocation-card {
  margin-top: 8px;
  padding: 0 16px;
}

.allocation-row {
  padding: 12px 0;
  border-bottom: 1px solid var(--color-border);
}

.allocation-row--last {
  border-bottom: none;
}

.row-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: nowrap;
}

.row-label {
  font-size: 13px;
  font-weight: 400;
  color: var(--color-header-strong);
  white-space: nowrap;
}

.row-value {
  white-space: nowrap;
}

.row-value-serif {
  font-family: var(--font-serif);
  font-size: 13px;
  font-weight: 700;
  color: var(--color-header-strong);
  font-variant-numeric: lining-nums;
  font-feature-settings: 'lnum' 1;
}

.row-value-pct {
  font-size: 11px;
  color: var(--color-header-muted);
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

/* Category pill row -- "gold underline" per spec, matching the old page's
   .tab/.tab--active treatment rather than a filled-pill style, since every
   category is a real, equally-clickable tab here (none are disabled). */
.category-tabs {
  margin-top: 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  border-bottom: 1px solid var(--color-border);
}

.category-tab {
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  padding: 8px 2px;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-header-muted);
  cursor: pointer;
  font-family: inherit;
}

.category-tab--active {
  color: var(--color-header-strong);
  border-bottom-color: var(--color-gold-strong);
}

.tiles {
  margin-top: 10px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.tile {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 10px 12px;
}

.tile-value {
  margin: 0;
  font-family: var(--font-serif);
  font-size: 20px;
  font-weight: 700;
  color: var(--color-gold-strong);
  font-variant-numeric: lining-nums;
  font-feature-settings: 'lnum' 1;
  overflow-wrap: anywhere;
}

.tile-label {
  margin: 4px 0 0;
  font-size: 11px;
  line-height: 1.3;
  color: var(--color-header-muted);
}

.chart-card {
  margin-top: 8px;
}

/* Horizontal-scroll series picker -- same hidden-scrollbar pattern as
   .cycle-strip above, reused here since a category can offer more series
   pills than a narrow viewport can show at once. */
.series-picker {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 12px;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.series-picker::-webkit-scrollbar {
  display: none;
}

.series-pill {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 600;
  padding: 6px 14px;
  border-radius: 999px;
  border: none;
  background: var(--color-track);
  color: var(--color-header-muted);
  cursor: pointer;
  white-space: nowrap;
  font-family: inherit;
}

.series-pill--active {
  background: var(--color-amber-badge-bg);
  color: var(--color-amber-badge-text);
}

.chart-empty {
  margin: 0;
  padding: 40px 0;
  text-align: center;
  font-size: 13px;
  color: var(--color-header-muted);
}

/* Its own horizontal scroll (same hidden-scrollbar convention as above)
   rather than shrinking bar width to fit -- keeps every bar a consistent,
   legible size regardless of how many reporting cycles exist. */
.chart {
  display: flex;
  align-items: flex-end;
  gap: 14px;
  height: 150px;
  overflow-x: auto;
  padding-bottom: 2px;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.chart::-webkit-scrollbar {
  display: none;
}

/* flex: 1 1 0 -- not a fixed width -- so columns spread evenly across the
   card's full width when there are few enough cycles to fit (no dead space
   on the right). min-width is the floor: once enough cycles exist that
   even every column at min-width would overflow the card, flexbox stops
   shrinking columns further and .chart's own overflow-x: auto (below)
   takes over, same fallback as before. The 850px min-width step below
   matches the app-wide sidebar-drawer breakpoint (see HomeView.vue) --
   there's no pre-existing font-size tuning at that breakpoint in this
   chart to preserve, since this file had no @media rules for it before
   this change. */
.bar-col {
  flex: 1 1 0;
  min-width: 40px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  height: 100%;
}

.bar-value-label {
  margin: 0 0 4px;
  font-size: 10px;
  color: var(--color-header-muted);
  white-space: nowrap;
}

/* Fills its column (so bars stay evenly spread with it), capped so a
   handful of cycles spread across a wide card doesn't turn each bar into
   an oversized slab. */
.bar {
  width: 100%;
  max-width: 64px;
  background: var(--color-gold-strong);
  border-radius: 4px 4px 0 0;
}

@media (max-width: 850px) {
  .bar-col {
    min-width: 28px;
  }
}

.bar--zero {
  opacity: 0.4;
}

/* Highlights whichever cycle is selected in the reporting-cycle strip, so
   the chart visually agrees with the rest of this single-year-focused page
   -- overrides .bar-fill--gold's default color, not .bar--zero's opacity. */
.bar--current {
  background: var(--color-header-strong);
}

.bar-year-label {
  margin-top: 6px;
  font-size: 10.5px;
  color: var(--color-header-muted);
}

/* Neutral pulsing placeholder -- same footprint as the real strip so
   nothing visibly resizes once data arrives. Same animation as Impact to
   Date's/Program Planning's own skeletons. */
.skeleton {
  border-radius: 12px;
  background: var(--color-track);
  animation: skeleton-pulse 1.4s ease-in-out infinite;
}

.skeleton--strip {
  margin-top: 10px;
  height: 64px;
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
