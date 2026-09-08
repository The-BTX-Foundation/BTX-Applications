<script setup>
import { computed, onMounted, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useFundraisingHealthStore } from '@/stores/fundraisingHealth'

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
// "September"). Used by both the left panel's month chips and the detail
// heading.
function monthName(month) {
  return new Date(2000, month - 1, 1).toLocaleDateString(undefined, { month: 'long' })
}

// Selection state for the Year -> Month left panel. Both start on the real
// current year/month so the page opens on "today" exactly like the old
// flat page did -- no fetch needs to complete first since "today" is known
// client-side immediately, unlike Donor Impact/Progress-to-Goal's
// auto-select-most-recent (which has to wait on fetched data to know what
// "most recent" even is).
const selectedYear = ref(fundraisingHealthStore.currentYear)
const selectedMonth = ref(fundraisingHealthStore.currentMonth)

// Which year's month chips are expanded in the accordion -- only one year
// open at a time keeps the panel compact given the larger row count months
// bring vs. Donor Impact/Progress-to-Goal's one-card-per-year lists. Starts
// on the current year to match the default selection above.
const expandedYear = ref(fundraisingHealthStore.currentYear)

// Toggles a year's month chips open/closed; clicking the already-expanded
// year collapses it instead of doing nothing.
function toggleYear(year) {
  expandedYear.value = expandedYear.value === year ? null : year
}

// Selects a given year/month as the detail panel's current subject.
function selectMonth(year, month) {
  selectedYear.value = year
  selectedMonth.value = month
}

const selectedRow = computed(() => fundraisingHealthStore.rowFor(selectedYear.value, selectedMonth.value))

// True only when the selection is the real current calendar month, not just
// any month a user clicked to -- gates the Fundraising Goal Progress card
// below, since that stat is deliberately "today's" progress only and isn't
// recomputed for arbitrary past months (matching what the old
// HistoryBrowser-based detail view already did by omitting it entirely
// outside the main view).
const isCurrentMonthSelected = computed(
  () =>
    selectedYear.value === fundraisingHealthStore.currentYear &&
    selectedMonth.value === fundraisingHealthStore.currentMonth,
)

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
// year -- unlike Donor Impact/Progress-to-Goal's one-bar-per-year charts,
// this one can realistically grow to dozens of monthly bars, so labels need
// to stay narrow as the dataset grows.
function barLabel(row) {
  return new Date(row.period_year, row.period_month - 1, 1).toLocaleDateString(undefined, {
    month: 'short',
    year: '2-digit',
  })
}
</script>

<template>
  <h2 v-if="!authStore.session">Sign in</h2>
  <p v-else-if="!canView" class="access-denied">Access Denied</p>

  <template v-else>
    <p v-if="fundraisingHealthStore.loading">Loading…</p>
    <p v-else-if="fundraisingHealthStore.error" class="error">{{ fundraisingHealthStore.error }}</p>

    <div v-else class="fundraising-health">
      <div class="year-column">
        <div class="year-column-header">
          <h2>Fundraising Health</h2>
        </div>

        <ul class="year-list">
          <li v-for="entry in fundraisingHealthStore.yearMonthTree" :key="entry.year">
            <button
              type="button"
              class="year-card"
              :class="{ 'year-card--active': entry.year === selectedYear }"
              @click="toggleYear(entry.year)"
            >
              <span class="year-label">{{ entry.year }}</span>
              <span class="year-toggle">{{ expandedYear === entry.year ? '−' : '+' }}</span>
            </button>

            <ul v-if="expandedYear === entry.year" class="month-list">
              <li v-for="month in entry.months" :key="month">
                <button
                  type="button"
                  class="month-chip"
                  :class="{ 'month-chip--active': entry.year === selectedYear && month === selectedMonth }"
                  @click="selectMonth(entry.year, month)"
                >
                  {{ monthName(month) }}
                </button>
              </li>
            </ul>
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
  </template>
</template>

<style scoped>
.fundraising-health {
  display: flex;
  gap: 24px;
  align-items: flex-start;
}

.year-column {
  flex-shrink: 0;
  width: 220px;
}

.year-column-header {
  margin-bottom: 12px;
}

.year-column-header h2 {
  margin: 0;
  font-size: 18px;
}

.year-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.year-card {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  background: #fff;
  border: 0.5px solid #e5e3dd;
  border-radius: 10px;
  padding: 10px 12px;
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.year-card--active {
  border: 1px solid #c9932a;
}

.year-label {
  font-size: 14px;
  font-weight: 500;
  color: #2d3142;
}

.year-toggle {
  font-size: 14px;
  color: #8a8a85;
}

.month-list {
  list-style: none;
  padding: 6px 0 2px 8px;
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.month-chip {
  font-size: 12px;
  font-weight: 500;
  padding: 5px 10px;
  border-radius: 999px;
  border: 0.5px solid #e5e3dd;
  background: #faf9f6;
  color: #5f5e5a;
  cursor: pointer;
}

.month-chip--active {
  background: #faeeda;
  color: #854f0b;
  border-color: #c9932a;
  font-weight: 600;
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
  align-items: flex-end;
  gap: 16px;
  margin-bottom: 20px;
}

.metric-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.metric-label {
  font-size: 13px;
  color: #8a8a85;
}

.metric-value {
  font-size: 14px;
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
  gap: 4px;
}

.computed-label {
  font-size: 13px;
  color: #8a8a85;
}

.computed-value {
  font-size: 20px;
  font-weight: 600;
  color: #c9932a;
}

/* Card wrapper reusing the year-card/month-chip border treatment, so the
   chart reads as a grouped panel consistent with Donor Impact/Progress-to-
   Goal's own .chart cards. */
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
   fixed-width chart (5 years = 60 bars) in a way Donor Impact/Progress-to-
   Goal's yearly charts never do, so bars overflow into a scrollbar instead
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

.error {
  color: #b3261e;
}

.access-denied {
  margin: 0;
  color: #b3261e;
  font-weight: 600;
}
</style>
