<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useFundraisingHealthStore } from '@/stores/fundraisingHealth'

const authStore = useAuthStore()
const fundraisingHealthStore = useFundraisingHealthStore()

// Same page-access gate as every other Finance/Program page: admin, board,
// and reviewer can view; matches fundraising_health's RLS SELECT policy
// exactly. This page has no write actions of its own.
const canView = computed(() => authStore.isAdmin || authStore.isBoard || authStore.isReviewer)

onMounted(() => {
  authStore.init()
  fundraisingHealthStore.fetchAll()
})

// Reads a field off a fundraising_health row, defaulting a still-null
// column to 0 for display.
function fieldValue(row, key) {
  return row?.[key] ?? 0
}

function monthName(month) {
  return new Date(2000, month - 1, 1).toLocaleDateString(undefined, { month: 'long' })
}

function formatCurrency(value) {
  return `$${value.toLocaleString()}`
}

// -- Reporting-months strip --
// Starts on the real current year/month immediately -- known client-side
// without waiting on a fetch, unlike Program Impact/Program Planning's
// auto-select-most-recent (which has to wait for data to know what "most
// recent" even is).
const selectedYear = ref(fundraisingHealthStore.currentYear)
const selectedMonth = ref(fundraisingHealthStore.currentMonth)

function selectMonth(year, month) {
  selectedYear.value = year
  selectedMonth.value = month
}

const selectedRow = computed(() => fundraisingHealthStore.rowFor(selectedYear.value, selectedMonth.value))

// A plain calendar check against the store's real "today", not an
// inferred most-recent-published year like Program Impact's Live badge --
// every month here (including one that hasn't synced yet) has an
// unambiguous real/not-real "current month" answer.
function badgeFor(entry) {
  return entry.year === fundraisingHealthStore.currentYear && entry.month === fundraisingHealthStore.currentMonth
    ? { text: 'Live', variant: 'live' }
    : { text: 'Archived', variant: 'default' }
}

// -- Month strip "swipe for earlier months" hint --
// Program Planning's plan-strip pattern specifically (hidden scrollbar +
// edge-fade mask + text hint), NOT Program Impact's newer visible-
// scrollbar version -- both patterns are intentionally still in use
// app-wide, this page just keeps the older one.
const monthStripEl = ref(null)
const monthStripOverflows = ref(false)

function checkMonthStripOverflow() {
  const el = monthStripEl.value
  monthStripOverflows.value = !!el && el.scrollWidth > el.clientWidth + 1
}

onMounted(() => {
  window.addEventListener('resize', checkMonthStripOverflow)
})

onUnmounted(() => {
  window.removeEventListener('resize', checkMonthStripOverflow)
})

watch(
  () => fundraisingHealthStore.monthEntries,
  () => nextTick(checkMonthStripOverflow),
)

// -- Fundraising Goal Progress hero --
// Deliberately reads the CURRENT month's row, not the selected one -- this
// is "today's" progress, not recomputed for arbitrary past months, same
// distinction the pre-redesign page drew (isCurrentMonthSelected).
// Formula unchanged from the pre-redesign page: selected/current month's
// revenue over the annual goal, not a true year-to-date sum -- a known
// simplification, left as-is per this task's own instruction.
const fundraisingGoalProgress = computed(() => {
  const goal = fundraisingHealthStore.currentMonthRow?.annual_goal
  return goal > 0 ? (fundraisingHealthStore.currentMonthTotalRevenue / goal) * 100 : 0
})
// Capped at 100% width so an over-goal month never visually overflows the
// track, same convention as Budget Tracking's variance bars.
const fundraisingGoalProgressBarPct = computed(() => Math.min(100, fundraisingGoalProgress.value))
const currentMonthGoal = computed(() => fieldValue(fundraisingHealthStore.currentMonthRow, 'annual_goal'))

// -- "This month" tiles --
// donor_retention_rate is the one gold-highlighted tile; the rest are
// plain dark bold values. Recurring donors is deliberately excluded from
// this grid -- it gets its own full-width tile below, per the mockup.
const TILES = [
  { key: 'donor_retention_rate', label: 'Donor Retention Rate', format: 'percent', gold: true },
  { key: 'average_gift_size', label: 'Average Gift Size', format: 'currency', gold: false },
  { key: 'median_gift_size', label: 'Median Gift Size', format: 'currency', gold: false },
  { key: 'new_donors', label: 'New Donors', format: 'number', gold: false },
]

function formatTileValue(tile) {
  const value = fieldValue(selectedRow.value, tile.key)
  if (tile.format === 'currency') return formatCurrency(value)
  if (tile.format === 'percent') return `${value.toLocaleString()}%`
  return value.toLocaleString()
}

const recurringDonors = computed(() => fieldValue(selectedRow.value, 'recurring_donors'))

// -- Revenue sources portfolio --
const REVENUE_SOURCES = [
  { key: 'individual_donors', label: 'Individual Donors' },
  { key: 'corporate_partnerships', label: 'Corporate Partnerships' },
  { key: 'grants_revenue', label: 'Grants' },
  { key: 'events_revenue', label: 'Events' },
]

// A source's % share of the selected row's total revenue -- 0% (not NaN/
// Infinity) when the row has no revenue at all yet. sumRevenue is the same
// store function the hero's "raised" figure reads for the current month,
// so the four source rows always sum to that same total by construction.
function revenueShare(key) {
  const total = fundraisingHealthStore.sumRevenue(selectedRow.value)
  return total > 0 ? (fieldValue(selectedRow.value, key) / total) * 100 : 0
}

// -- By-month chart --
// Every revenue source plus every "this month" metric is chart-eligible --
// annual_goal is deliberately excluded (it's a target the hero card shows,
// not a performance metric alongside these). recurring_donors IS included
// here even though it isn't part of the 2-column tile grid above.
const CHART_METRICS = [
  ...REVENUE_SOURCES.map((s) => ({ ...s, format: 'currency' })),
  { key: 'donor_retention_rate', label: 'Donor Retention Rate', format: 'percent' },
  { key: 'average_gift_size', label: 'Average Gift Size', format: 'currency' },
  { key: 'median_gift_size', label: 'Median Gift Size', format: 'currency' },
  { key: 'new_donors', label: 'New Donors', format: 'number' },
  { key: 'recurring_donors', label: 'Recurring Donors', format: 'number' },
]

// True when `row` carries a genuine (non-null) value for the given metric
// key -- distinguishes a real recorded value from a column that predates
// being filled in, same purpose as Program Impact's metricHasRealValue.
function metricHasRealValue(row, key) {
  return row[key] !== null && row[key] !== undefined
}

// Only metrics with a real value across 2+ synced months earn a series
// pill -- same rule Program Impact already uses, so switching to a metric
// with just one month of history (or none) is never offered.
const chartMetricsAvailable = computed(() =>
  CHART_METRICS.filter((metric) => {
    const realCount = fundraisingHealthStore.chartRows.filter((row) => metricHasRealValue(row, metric.key)).length
    return realCount >= 2
  }),
)

const chartMetricKey = ref('individual_donors')

watch(
  () => fundraisingHealthStore.chartRows,
  () => {
    if (!chartMetricsAvailable.value.some((m) => m.key === chartMetricKey.value)) {
      chartMetricKey.value = chartMetricsAvailable.value[0]?.key ?? null
    }
  },
)

const chartMetric = computed(() => CHART_METRICS.find((m) => m.key === chartMetricKey.value))

const chartHeading = computed(() => (chartMetric.value ? `${chartMetric.value.label} by Month` : 'By Month'))

// null (rendered as a 0-height "no data" stub) when this row predates the
// metric's column, as opposed to a genuine recorded 0 -- same convention
// as Program Impact's own chartValue.
function chartValue(row, metric) {
  if (!metric || !metricHasRealValue(row, metric.key)) return null
  return row[metric.key]
}

const maxChartValue = computed(() => {
  const values = fundraisingHealthStore.chartRows.map((row) => chartValue(row, chartMetric.value)).filter((v) => v !== null)
  return Math.max(1, ...values)
})

function barHeightPx(row) {
  const value = chartValue(row, chartMetric.value)
  if (value === null) return 0
  if (value === 0) return 2
  return Math.round((value / maxChartValue.value) * 100)
}

function barIsZero(row) {
  return chartValue(row, chartMetric.value) === 0
}

// The most recent SYNCED month (fundraisingHealthStore.mostRecentRow), not
// whichever month is selected in the strip above -- unlike Program
// Impact's selectable current-cycle highlight, this page's highlighted bar
// is a fixed "latest data point" marker per the mockup's own explicit
// current-month treatment.
function barIsMostRecent(row) {
  const mostRecent = fundraisingHealthStore.mostRecentRow
  return !!mostRecent && row.period_year === mostRecent.period_year && row.period_month === mostRecent.period_month
}

function formatBarValue(row) {
  const value = chartValue(row, chartMetric.value)
  if (value === null) return '—'
  if (chartMetric.value.format === 'currency') return `$${value.toLocaleString()}`
  if (chartMetric.value.format === 'percent') return `${value.toLocaleString()}%`
  return value.toLocaleString()
}

// Compact "Mon 'YY" bar-bottom label -- this chart can realistically grow
// to dozens of monthly bars, unlike Program Impact/Program Planning's
// one-bar-per-year charts, so labels stay narrow as the dataset grows.
function barLabel(row) {
  return new Date(row.period_year, row.period_month - 1, 1).toLocaleDateString(undefined, {
    month: 'short',
    year: '2-digit',
  })
}

const chartAriaLabel = computed(() => {
  const parts = fundraisingHealthStore.chartRows.map((row) => {
    const value = chartValue(row, chartMetric.value)
    return `${barLabel(row)}: ${value === null ? 'no data' : value}`
  })
  return `${chartMetric.value?.label ?? 'Metric'} by month: ${parts.join(', ')}`
})
</script>

<template>
  <h2 v-if="!authStore.session">Sign in</h2>
  <p v-else-if="!canView" class="access-denied">Access Denied</p>

  <section v-else class="fundraising-health">
    <h1 class="page-title" data-page-heading>Fundraising Health</h1>
    <p class="subline">Revenue by source, donor trends, and progress toward the annual goal.</p>

    <p v-if="fundraisingHealthStore.error" class="page-error">Couldn't load fundraising health data.</p>

    <template v-else>
      <h2 class="section-heading heading-months">Reporting months</h2>

      <div v-if="fundraisingHealthStore.loading" class="skeleton skeleton--strip"></div>
      <p v-else-if="fundraisingHealthStore.monthEntries.length === 0" class="empty">No reporting months yet.</p>
      <template v-else>
        <div ref="monthStripEl" class="month-strip">
          <button
            v-for="entry in fundraisingHealthStore.monthEntries"
            :key="`${entry.year}-${entry.month}`"
            type="button"
            class="month-card"
            :class="{ 'month-card--selected': entry.year === selectedYear && entry.month === selectedMonth }"
            :aria-pressed="entry.year === selectedYear && entry.month === selectedMonth"
            @click="selectMonth(entry.year, entry.month)"
          >
            <span class="month-card-title">{{ monthName(entry.month) }} {{ entry.year }}</span>
            <span class="pill" :class="badgeFor(entry).variant === 'live' ? 'pill--success' : 'pill--neutral'">
              <span class="pill-dot"></span>{{ badgeFor(entry).text }}
            </span>
          </button>
        </div>
        <p v-if="monthStripOverflows" class="swipe-hint">Swipe for earlier months →</p>
      </template>

      <!-- Fixed-dark brand surface, same treatment as Home's mission hero
           (HomeMissionHero.vue) -- hardcoded dark/gold/white regardless of
           the light/dark toggle, matching base.css's own documented list
           of intentional exceptions to the themed color system. -->
      <div class="goal-hero">
        <p class="goal-label">Fundraising Goal Progress</p>
        <p class="goal-percent">{{ fundraisingGoalProgress.toFixed(1) }}%</p>
        <div class="goal-track">
          <div class="goal-fill" :style="{ width: `${fundraisingGoalProgressBarPct}%` }"></div>
        </div>
        <p class="goal-sub">
          <strong>{{ formatCurrency(fundraisingHealthStore.currentMonthTotalRevenue) }}</strong> raised toward a
          <strong>{{ formatCurrency(currentMonthGoal) }}</strong> annual goal
        </p>
      </div>

      <template v-if="selectedRow">
        <h2 class="section-heading heading-tiles">{{ monthName(selectedMonth) }} {{ selectedYear }}</h2>

        <div class="tiles">
          <div v-for="tile in TILES" :key="tile.key" class="tile">
            <p class="tile-value" :class="{ 'tile-value--gold': tile.gold }">{{ formatTileValue(tile) }}</p>
            <p class="tile-label">{{ tile.label }}</p>
          </div>
        </div>

        <div class="tile tile--full">
          <p class="tile-value">{{ recurringDonors.toLocaleString() }}</p>
          <p class="tile-label">Recurring Donors</p>
        </div>

        <h2 class="section-heading heading-revenue">Revenue sources</h2>
        <div class="card allocation-card">
          <div
            v-for="(source, i) in REVENUE_SOURCES"
            :key="source.key"
            class="allocation-row"
            :class="{ 'allocation-row--last': i === REVENUE_SOURCES.length - 1 }"
          >
            <div class="row-top">
              <span class="row-label">{{ source.label }}</span>
              <span class="row-value"
                ><span class="row-value-serif">{{ formatCurrency(fieldValue(selectedRow, source.key)) }}</span
                ><span class="row-value-pct"> · {{ revenueShare(source.key).toFixed(1) }}%</span></span
              >
            </div>
            <div class="bar-track"><div class="bar-fill bar-fill--gold" :style="{ width: `${revenueShare(source.key)}%` }"></div></div>
          </div>
        </div>
      </template>
      <p v-else class="empty">No fundraising health data recorded for {{ monthName(selectedMonth) }} {{ selectedYear }} yet.</p>

      <h2 class="section-heading heading-chart">{{ chartHeading }}</h2>
      <div class="card chart-card">
        <div v-if="chartMetricsAvailable.length > 0" class="series-picker">
          <button
            v-for="metric in chartMetricsAvailable"
            :key="metric.key"
            type="button"
            class="series-pill"
            :class="{ 'series-pill--active': metric.key === chartMetricKey }"
            @click="chartMetricKey = metric.key"
          >
            {{ metric.label }}
          </button>
        </div>

        <p v-if="!chartMetric" class="chart-empty">Not enough month-over-month data yet.</p>
        <div v-else class="chart" role="img" :aria-label="chartAriaLabel">
          <div v-for="row in fundraisingHealthStore.chartRows" :key="`${row.period_year}-${row.period_month}`" class="bar-col">
            <span class="bar-value-label">{{ formatBarValue(row) }}</span>
            <div
              class="bar"
              :class="{ 'bar--zero': barIsZero(row), 'bar--current': barIsMostRecent(row) }"
              :style="{ height: `${barHeightPx(row)}px` }"
            ></div>
            <span class="bar-year-label">{{ barLabel(row) }}</span>
          </div>
        </div>
      </div>
    </template>

    <p class="footer">BTX Ops Hub · Fundraising Health</p>
  </section>
</template>

<style scoped>
.fundraising-health {
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

.heading-months {
  margin-top: 24px;
}

.heading-tiles,
.heading-revenue,
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

/* Program Planning's plan-strip pattern verbatim (hidden-scrollbar +
   scroll-snap + right-edge fade), reused here for reporting months
   instead of plan years -- deliberately NOT Program Impact's newer
   visible-scrollbar treatment; both patterns stay in use app-wide. */
.month-strip {
  margin-top: 10px;
  display: flex;
  gap: 10px;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  scrollbar-width: none;
  -ms-overflow-style: none;
  mask-image: linear-gradient(to right, black 92%, transparent 100%);
}

.month-strip::-webkit-scrollbar {
  display: none;
}

.month-card {
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

.month-card--selected {
  border: 1.5px solid var(--color-accent);
}

.month-card-title {
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

.pill--neutral {
  background: var(--color-neutral-badge-bg);
  color: var(--color-neutral-badge-text);
}

/* Fixed-dark brand surface -- a flat #1c1a17 (not HomeMissionHero.vue's
   gradient), paler gold #e9c78a for the percentage/bar fill, and muted
   rgba(255,255,255,0.5) text -- matching the reference mockup's own
   distinct (darker, less saturated) palette, not the themed
   --color-surface/--color-gold-strong tokens, per base.css's own
   documented exception list. */
.goal-hero {
  margin-top: 20px;
  border-radius: 20px;
  padding: 22px;
  background: #1c1a17;
}

.goal-label {
  margin: 0;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.5);
}

.goal-percent {
  margin: 10px 0 0;
  font-family: var(--font-serif);
  font-size: 48px;
  font-weight: 700;
  line-height: 1;
  color: #e9c78a;
  font-variant-numeric: lining-nums;
  font-feature-settings: 'lnum' 1;
}

.goal-track {
  margin-top: 14px;
  height: 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.15);
  overflow: hidden;
}

.goal-fill {
  height: 100%;
  min-width: 3px;
  border-radius: 999px;
  background: #e9c78a;
}

.goal-sub {
  margin: 14px 0 0;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
}

.goal-sub strong {
  color: rgba(255, 255, 255, 0.62);
  font-weight: 700;
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

.tile--full {
  margin-top: 8px;
}

.tile-value {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  color: var(--color-header-strong);
  font-variant-numeric: lining-nums;
  font-feature-settings: 'lnum' 1;
  overflow-wrap: anywhere;
}

.tile-value--gold {
  font-family: var(--font-serif);
  font-size: 20px;
  color: var(--color-gold-strong);
}

.tile-label {
  margin: 4px 0 0;
  font-size: 11px;
  line-height: 1.3;
  color: var(--color-header-muted);
}

.card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 14px;
  padding: 14px 16px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}

.allocation-card {
  margin-top: 10px;
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

.chart-card {
  margin-top: 8px;
}

/* Horizontal-scroll series picker -- same hidden-scrollbar pattern as
   Program Impact's, since a metric list this size can outgrow a narrow
   viewport. */
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

/* This chart can realistically grow to dozens of monthly bars (unlike
   Program Impact/Program Planning's one-bar-per-year charts), so its own
   horizontal scroll (same hidden-scrollbar convention as above) is the
   permanent behavior here, not just a many-cycle fallback. */
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

.bar-col {
  flex: 0 0 32px;
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

.bar {
  width: 32px;
  background: var(--color-gold-strong);
  border-radius: 4px 4px 0 0;
}

.bar--zero {
  opacity: 0.4;
}

/* The most recent synced month's bar -- opposite of Program Impact's
   current-cycle highlight (which is now all-gold per that page's own
   explicit single-color change): this page's mockup keeps its dedicated
   current-month color deliberately, per this task's own instruction not
   to "fix" it to match. */
.bar--current {
  background: var(--color-header-strong);
}

.bar-year-label {
  margin-top: 6px;
  font-size: 10.5px;
  color: var(--color-header-muted);
}

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
