<script setup>
import { computed, onMounted, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useFundraisingHealthStore } from '@/stores/fundraisingHealth'
import HistoryBrowser from '@/components/HistoryBrowser.vue'

const authStore = useAuthStore()
const fundraisingHealthStore = useFundraisingHealthStore()

// Same page-access gate as BudgetTracking.vue -- no write-gating beyond
// this exists, since nothing on this page persists.
const canView = computed(() => authStore.isAdmin || authStore.isBoard || authStore.isReviewer)

onMounted(() => {
  authStore.init()
  fundraisingHealthStore.fetchAll()
})

// Field definitions for direct rendering -- no tab bar on this page, so
// this is a flat list rather than grouped-by-category like BudgetTracking.
const FIELDS = [
  { key: 'individual_donors', label: 'Individual Donors', format: 'currency' },
  { key: 'corporate_partnerships', label: 'Corporate/Partnerships', format: 'currency' },
  { key: 'grants_revenue', label: 'Grants', format: 'currency' },
  { key: 'events_revenue', label: 'Events', format: 'currency' },
  { key: 'annual_goal', label: 'Annual Goal', format: 'currency' },
  { key: 'donor_retention_rate', label: 'Donor Retention Rate', format: 'percent' },
  { key: 'average_gift_size', label: 'Average Gift Size', format: 'currency' },
  { key: 'median_gift_size', label: 'Median Gift Size', format: 'currency' },
  { key: 'new_donors', label: 'New Donors', format: 'number' },
  { key: 'recurring_donors', label: 'Recurring Donors', format: 'number' },
]

// Reads a field off a fundraising_health row, defaulting a still-null
// column to 0 for display -- a column can be null before every field has
// been filled in on the source spreadsheet, and showing the literal word
// "null" would be worse than showing 0.
function fieldValue(row, key) {
  return row?.[key] ?? 0
}

// Formats a 1-based month number as its full month name (e.g. 9 ->
// "September"). Used by both the left panel's month cards and the detail
// heading.
function monthName(month) {
  return new Date(2000, month - 1, 1).toLocaleDateString(undefined, { month: 'long' })
}

// Selection state for the flat month-card left panel. Both start on the
// real current year/month so the page opens on "today" exactly like the
// pre-history-button flat page did -- no fetch needs to complete first
// since "today" is known client-side immediately, unlike Program
// Impact/Program Planning's auto-select-most-recent (which has to wait on
// fetched data to know what "most recent" even is).
const selectedYear = ref(fundraisingHealthStore.currentYear)
const selectedMonth = ref(fundraisingHealthStore.currentMonth)

// Selects a given year/month as the detail panel's current subject.
function selectMonth(year, month) {
  selectedYear.value = year
  selectedMonth.value = month
}

const selectedRow = computed(() => fundraisingHealthStore.rowFor(selectedYear.value, selectedMonth.value))

// True only when the selection is the real current calendar month, not just
// any month a user clicked to -- gates the Fundraising Goal Progress card
// below, since that stat is deliberately "today's" progress only and isn't
// recomputed for arbitrary past months.
const isCurrentMonthSelected = computed(
  () =>
    selectedYear.value === fundraisingHealthStore.currentYear &&
    selectedMonth.value === fundraisingHealthStore.currentMonth,
)

// Builds a month card's badge text/variant -- a plain calendar check
// against the store's real "today", not ProgramImpact's inferred
// most-recent-published-year logic, since every month here (including one
// that hasn't synced yet) has an unambiguous real/not-real "current month"
// answer.
function badgeFor(entry) {
  return entry.year === fundraisingHealthStore.currentYear && entry.month === fundraisingHealthStore.currentMonth
    ? { text: 'Live', variant: 'live' }
    : { text: 'Archived', variant: 'default' }
}

// Goal progress for the CURRENT month specifically -- reads
// currentMonthTotalRevenue/currentMonthRow, not the selected row (that
// distinction belongs to Budget Tracking's Cost to Raise a Dollar instead,
// which deliberately reads mostRecentTotalRevenue). Both sides are 0 when
// there's no row for the current month yet, so this renders 0% rather than
// throwing on a null/missing annual_goal.
const fundraisingGoalProgress = computed(() => {
  const goal = fundraisingHealthStore.currentMonthRow?.annual_goal
  return goal > 0 ? (fundraisingHealthStore.currentMonthTotalRevenue / goal) * 100 : 0
})

// Revenue Sources table rows -- the four raw revenue columns that make up
// a row's total, in the same order as FIELDS above.
const REVENUE_SOURCES = [
  { key: 'individual_donors', label: 'Individual Donors' },
  { key: 'corporate_partnerships', label: 'Corporate Partnerships' },
  { key: 'grants_revenue', label: 'Grants' },
  { key: 'events_revenue', label: 'Events' },
]

// A source's % share of a row's total revenue -- takes row explicitly
// (like fieldValue, and like BudgetTracking's varianceDollar/
// variancePercent) rather than closing over selectedRow, so both the main
// detail column and the HistoryBrowser slot below can reuse it for
// whichever row they're each showing. 0% (not NaN/Infinity) when the row
// has no revenue at all yet.
function revenueShare(row, key) {
  const total = fundraisingHealthStore.sumRevenue(row)
  return total > 0 ? (fieldValue(row, key) / total) * 100 : 0
}

// Chart tab definitions, each keyed to a real fundraising_health column.
const CHART_TABS = [
  { key: 'individual_donors', label: 'Individual Donors', format: 'currency' },
  { key: 'donor_retention_rate', label: 'Donor Retention Rate', format: 'percent' },
  { key: 'new_donors', label: 'New Donors', format: 'number' },
  { key: 'recurring_donors', label: 'Recurring Donors', format: 'number' },
  { key: 'average_gift_size', label: 'Average Gift Size', format: 'currency' },
  { key: 'annual_goal', label: 'Annual Goal', format: 'currency' },
]
const chartMetricKey = ref('individual_donors')
const chartMetric = computed(() => CHART_TABS.find((tab) => tab.key === chartMetricKey.value))

const maxChartValue = computed(() =>
  Math.max(...fundraisingHealthStore.chartRows.map((row) => fieldValue(row, chartMetricKey.value)), 1),
)

// Bar height as a percentage of the highest value for the selected metric
// across every synced month (uncapped -- the dataset is still small enough
// that a recent-window cutoff would just hide real data).
function barHeight(row) {
  return `${(fieldValue(row, chartMetricKey.value) / maxChartValue.value) * 100}%`
}

// Formats a bar-top label for the selected metric -- currency gets a
// leading "$", percent gets a trailing "%", everything else is a plain
// thousands-separated number.
function formatBarValue(row) {
  const value = fieldValue(row, chartMetricKey.value)
  if (chartMetric.value.format === 'currency') return `$${value.toLocaleString()}`
  if (chartMetric.value.format === 'percent') return `${value.toLocaleString()}%`
  return value.toLocaleString()
}

// Compact "Mon 'YY" bar-bottom label (e.g. "Sep '26") rather than a bare
// year -- unlike Program Impact/Program Planning's one-bar-per-year charts,
// this one can realistically grow to dozens of monthly bars, so labels need
// to stay narrow as the dataset grows.
function barLabel(row) {
  return new Date(row.period_year, row.period_month - 1, 1).toLocaleDateString(undefined, {
    month: 'short',
    year: '2-digit',
  })
}

// Toggles the shared HistoryBrowser (see components/HistoryBrowser.vue).
// Its drill-down state lives inside that component and resets for free on
// every toggle, since v-if/v-else below unmounts/remounts it each time.
// Matches BudgetTracking.vue's own showHistory toggle exactly.
const showHistory = ref(false)
</script>

<template>
  <h2 v-if="!authStore.session">Sign in</h2>
  <p v-else-if="!canView" class="access-denied">Access Denied</p>

  <template v-else>
    <div class="page-header">
      <h2 data-page-heading>Fundraising Health</h2>
      <button type="button" class="btn btn--outline" @click="showHistory = !showHistory">
        {{ showHistory ? '← Back to Today' : 'View Fundraising History' }}
      </button>
    </div>

    <p v-if="fundraisingHealthStore.loading">Loading…</p>
    <p v-else-if="fundraisingHealthStore.error" class="error">{{ fundraisingHealthStore.error }}</p>

    <template v-else>
      <div v-if="!showHistory" class="fundraising-health">
        <div class="month-column">
          <div class="month-column-header">
            <h2>Reporting Months</h2>
          </div>

          <ul class="month-list">
            <li v-for="entry in fundraisingHealthStore.monthEntries" :key="`${entry.year}-${entry.month}`">
              <button
                type="button"
                class="month-card"
                :class="{ 'month-card--active': entry.year === selectedYear && entry.month === selectedMonth }"
                @click="selectMonth(entry.year, entry.month)"
              >
                <span class="month-label">{{ monthName(entry.month) }} {{ entry.year }}</span>
                <span class="badge" :class="`badge--${badgeFor(entry).variant}`">
                  {{ badgeFor(entry).text }}
                </span>
              </button>
            </li>
          </ul>
        </div>

        <div class="detail-column">
          <h2>{{ monthName(selectedMonth) }} {{ selectedYear }}</h2>

          <p v-if="!selectedRow" class="not-connected-note">
            No fundraising health data recorded for {{ monthName(selectedMonth) }} {{ selectedYear }} yet.
          </p>

          <div class="metrics-group-fields">
            <div v-for="field in FIELDS" :key="field.key" class="metric-field">
              <span class="metric-label">{{ field.label }}</span>
              <span class="value-with-suffix">
                <span class="metric-value">{{ fieldValue(selectedRow, field.key) }}</span>
                <span v-if="field.format === 'percent'" class="value-suffix">%</span>
              </span>
            </div>
          </div>

          <div v-if="isCurrentMonthSelected" class="computed-row">
            <div class="computed-display">
              <span class="computed-label">Fundraising Goal Progress</span>
              <span class="computed-value">{{ fundraisingGoalProgress.toFixed(1) }}%</span>
            </div>
          </div>

          <div class="revenue-panel">
            <h4 class="metrics-group-header">Revenue Sources</h4>
            <table class="revenue-table">
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Amount</th>
                  <th>% of Total Revenue</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="source in REVENUE_SOURCES" :key="source.key">
                  <td class="revenue-label">{{ source.label }}</td>
                  <td>${{ fieldValue(selectedRow, source.key).toLocaleString() }}</td>
                  <td>{{ revenueShare(selectedRow, source.key).toFixed(1) }}%</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="chart">
            <h3>{{ chartMetric?.label }} by Month</h3>

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

            <p v-if="fundraisingHealthStore.chartRows.length === 0" class="chart-empty">
              No fundraising health data synced yet.
            </p>
            <div v-else class="bars-scroll">
              <div class="bars">
                <div
                  v-for="row in fundraisingHealthStore.chartRows"
                  :key="`${row.period_year}-${row.period_month}`"
                  class="bar-col"
                >
                  <span class="bar-value">{{ formatBarValue(row) }}</span>
                  <div class="bar" :style="{ height: barHeight(row) }"></div>
                  <span class="bar-label">{{ barLabel(row) }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- month is 0-based (see HistoryBrowser.vue's slot contract) -- +1
           to match period_month's 1-based value before looking up a row.
           Fundraising Goal Progress and the by-month chart aren't
           reproduced here -- both are "today"/across-every-month features,
           not single-arbitrary-month ones, matching BudgetTracking.vue's
           own exclusion of Program Expense Ratio/Cost to Raise a Dollar
           from this same slot. Revenue Sources IS reproduced, since it's a
           pure per-row computation with no "today" dependency, matching
           BudgetTracking's Budget Variance table being reproduced here for
           the same reason. -->
      <HistoryBrowser v-else>
        <template #detail="{ year, month }">
          <template v-if="fundraisingHealthStore.rowFor(year, month + 1)">
            <div class="metrics-group-fields">
              <div v-for="field in FIELDS" :key="field.key" class="metric-field">
                <span class="metric-label">{{ field.label }}</span>
                <span class="value-with-suffix">
                  <span class="metric-value">{{
                    fieldValue(fundraisingHealthStore.rowFor(year, month + 1), field.key)
                  }}</span>
                  <span v-if="field.format === 'percent'" class="value-suffix">%</span>
                </span>
              </div>
            </div>

            <div class="revenue-panel">
              <h4 class="metrics-group-header">Revenue Sources</h4>
              <table class="revenue-table">
                <thead>
                  <tr>
                    <th>Source</th>
                    <th>Amount</th>
                    <th>% of Total Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="source in REVENUE_SOURCES" :key="source.key">
                    <td class="revenue-label">{{ source.label }}</td>
                    <td>${{ fieldValue(fundraisingHealthStore.rowFor(year, month + 1), source.key).toLocaleString() }}</td>
                    <td>{{ revenueShare(fundraisingHealthStore.rowFor(year, month + 1), source.key).toFixed(1) }}%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </template>
          <p v-else class="not-connected-note">No fundraising health data recorded for this month.</p>
        </template>
      </HistoryBrowser>
    </template>
  </template>
</template>

<style scoped>
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 16px;
}

.page-header h2 {
  margin: 0;
  font-size: 18px;
}

.fundraising-health {
  display: flex;
  gap: 24px;
  align-items: flex-start;
}

.month-column {
  flex-shrink: 0;
  width: 220px;
}

.month-column-header {
  margin-bottom: 12px;
}

.month-column-header h2 {
  margin: 0;
  font-size: 18px;
}

.month-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.month-card {
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

.month-card--active {
  border: 1px solid #c9932a;
}

.month-label {
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

.not-connected-note {
  margin: 0 0 20px;
  font-size: 12px;
  font-style: italic;
  color: #8a8a85;
}

.metrics-group-fields {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 20px;
}

/* Shared dense boxed-widget spec (matching ProgramPlanning.vue's .stat,
   BudgetTracking.vue's .metric-field/.computed-display, and
   ProgramImpact.vue's .metric-field/.comparison-item) -- same
   border/background/radius family across the app, tightened to one
   common padding/gap/font-size standard app-wide. */
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

.computed-row {
  display: flex;
  gap: 24px;
  margin-bottom: 20px;
}

.computed-display {
  display: flex;
  flex-direction: column;
  gap: 3px;
  background: #fff;
  border: 0.5px solid #e5e3dd;
  border-radius: 8px;
  padding: 8px 10px;
}

.computed-label {
  font-size: 12px;
  font-weight: 600;
  color: #4a4a4a;
}

.computed-value {
  font-size: 20px;
  font-weight: 600;
  color: #c9932a;
}

.metrics-group-header {
  margin: 0 0 12px;
  font-size: 13px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #8a8a85;
}

/* Same panel/table chrome as BudgetTracking.vue's .variance-panel/
   .variance-table -- adapted to this table's own Source/Amount/% columns
   rather than copying Budgeted/Actual/Variance verbatim. */
.revenue-panel {
  border: 0.5px solid #e5e3dd;
  border-radius: 12px;
  padding: 20px;
  background: #fff;
  margin-bottom: 20px;
}

.revenue-table {
  width: 100%;
  border-collapse: collapse;
}

.revenue-table th {
  text-align: left;
  font-size: 12px;
  font-weight: 600;
  color: #8a8a85;
  padding: 0 8px 8px 0;
}

.revenue-table td {
  padding: 6px 8px 6px 0;
  font-size: 14px;
  color: #2d3142;
}

.revenue-label {
  font-weight: 500;
}

/* Card wrapper reusing the month-card/revenue-panel border treatment, so
   the chart reads as a grouped panel consistent with Program Impact/
   Program Planning's own .chart cards. */
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

/* Horizontal scroll container -- monthly data can realistically outgrow a
   fixed-width chart (5 years = 60 bars) in a way Program Impact/Program
   Planning's yearly charts never do, so bars overflow into a scrollbar instead
   of being squeezed to fit. */
.bars-scroll {
  overflow-x: auto;
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
  flex-shrink: 0;
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

.btn {
  font-size: 13px;
  font-weight: 500;
  padding: 6px 14px;
  border-radius: 8px;
  cursor: pointer;
}

.btn--outline {
  background: #fff;
  color: #2d3142;
  border: 1px solid #d8d6cf;
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
   month list stacks above the detail column instead of beside it. The list
   itself becomes a horizontal scroll row rather than a taller vertical
   stack -- same overflow-x pattern this file's own .chart bars already use
   -- since this list is the one most likely to keep growing every month,
   a vertical stack here would only get worse over time. Nothing above this
   query is touched, so desktop layout is unaffected. Only the two-column
   .fundraising-health layout is affected -- .page-header (the title + View
   Fundraising History button) is a sibling of it, not part of this flex
   pair, so it's untouched here. */
@media (max-width: 850px) {
  .fundraising-health {
    flex-direction: column;
  }

  .month-column {
    width: 100%;
  }

  .month-list {
    flex-direction: row;
    overflow-x: auto;
    padding-bottom: 4px;
  }

  .month-card {
    width: auto;
    min-width: 200px;
    flex-shrink: 0;
  }
}
</style>
