<script setup>
import { computed, onMounted, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useFundraisingHealthStore } from '@/stores/fundraisingHealth'
import { useBudgetTrackingStore } from '@/stores/budgetTracking'
import { useGrantPipelineStore } from '@/stores/grantPipeline'
import HistoryBrowser from '@/components/HistoryBrowser.vue'

const authStore = useAuthStore()
const budgetTrackingStore = useBudgetTrackingStore()
const grantPipelineStore = useGrantPipelineStore()
// Cost to Raise a Dollar reads this page's own fundraising_expenses
// against Fundraising Health's most-recently-synced revenue total (not
// necessarily the current calendar month) -- a live cross-store read, not
// a copy, so it updates the instant a new fundraising_health row syncs.
const fundraisingHealthStore = useFundraisingHealthStore()

// Matches Donor Impact/Marketing's view convention. This page has no write
// actions of its own -- everything on it, including Grant Pipeline, is
// read-only display, so there's nothing a stricter role split would
// actually be protecting, matching EventCalendar.vue's precedent of only
// gating page access, not individual actions.
const canView = computed(() => authStore.isAdmin || authStore.isBoard || authStore.isReviewer)

onMounted(() => {
  authStore.init()
  budgetTrackingStore.fetchAll()
  // Fetched here too, independently of whether Fundraising Health's own
  // page has ever been visited this session -- Pinia state only populates
  // once its fetch actually runs, so Cost to Raise a Dollar can't assume
  // the other page loaded it first.
  fundraisingHealthStore.fetchAll()
  grantPipelineStore.fetchAll()
})

// -- Field definitions for the Budget & Spend tab --
const BUDGET_FIELDS = [
  { key: 'program_expenses', label: 'Program Expenses', format: 'currency' },
  { key: 'overhead_expenses', label: 'Overhead Expenses', format: 'currency' },
  { key: 'current_funds_on_hand', label: 'Current Funds on Hand', format: 'currency' },
  { key: 'monthly_operating_expense', label: 'Monthly Operating Expense', format: 'currency' },
  { key: 'fundraising_expenses', label: 'Fundraising Expenses', format: 'currency' },
]

// Tab bar: Budget & Spend's editable fields, then Grant Pipeline (moved
// here from its old standalone section below the tabs).
const CATEGORY_TABS = ['Budget & Spend', 'Grant Pipeline']
const activeCategory = ref(CATEGORY_TABS[0])

// Budget Variance table rows.
const VARIANCE_ROWS = [
  { key: 'programs', label: 'Programs' },
  { key: 'admin_overhead', label: 'Administration & Overhead' },
  { key: 'fundraising', label: 'Fundraising' },
  { key: 'marketing', label: 'Marketing' },
]

// Reads a field off a budget_tracking row, defaulting a still-null column
// to 0 for display -- same reasoning as Fundraising Health's fieldValue.
function fieldValue(row, key) {
  return row?.[key] ?? 0
}

// Today's month label, used only for the main view's empty state when no
// row has synced for the current month yet.
const today = new Date()
const todayLabel = today.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

const programExpenseRatio = computed(() => {
  const row = budgetTrackingStore.currentMonthRow
  const programs = fieldValue(row, 'program_expenses')
  const overhead = fieldValue(row, 'overhead_expenses')
  const total = programs + overhead
  return total > 0 ? (programs / total) * 100 : 0
})

// Reads mostRecentTotalRevenue from the separate Fundraising Health store
// (a Pinia singleton), not local state -- this is what makes it update
// live when a new fundraising_health row syncs, without a reload. Uses
// the most-recently-synced row rather than requiring an exact
// current-month match: this is a supporting ratio, not the main
// Fundraising Health view, so it should read the best real data available
// instead of showing 0 just because the current month hasn't synced yet.
const costToRaiseADollar = computed(() => {
  const revenue = fundraisingHealthStore.mostRecentTotalRevenue
  const expenses = fieldValue(budgetTrackingStore.currentMonthRow, 'fundraising_expenses')
  return revenue > 0 ? expenses / revenue : 0
})

// The one thing that gets its own top-of-page callout instead of living
// inside a tab. Its two inputs (current_funds_on_hand,
// monthly_operating_expense) are still just normal Budget & Spend fields --
// this is a read-only computed display over the same row, not a separate
// data source.
const burnRateMonths = computed(() => {
  const row = budgetTrackingStore.currentMonthRow
  const funds = fieldValue(row, 'current_funds_on_hand')
  const monthly = fieldValue(row, 'monthly_operating_expense')
  return monthly > 0 ? funds / monthly : 0
})

// $ variance for a row. Positive means over budget.
function varianceDollar(row, variance) {
  return fieldValue(row, `${variance.key}_actual`) - fieldValue(row, `${variance.key}_budgeted`)
}

// % variance for a row, or null when budgeted is 0 -- avoids displaying an
// Infinity/NaN result for a row that hasn't been budgeted yet.
function variancePercent(row, variance) {
  const budgeted = fieldValue(row, `${variance.key}_budgeted`)
  return budgeted !== 0 ? (varianceDollar(row, variance) / budgeted) * 100 : null
}

// Formats a variance $ amount with the sign before the "$", not after --
// Number.toLocaleString() puts a minus sign before the digits, so naively
// writing `$${value.toLocaleString()}` would render a negative value as
// "$-1,000" instead of "-$1,000". Exactly 0 gets no sign at all rather
// than a misleading "+$0" implying an (non-existent) overage.
function formatVarianceDollar(value) {
  if (value > 0) return `+$${value.toLocaleString()}`
  if (value < 0) return `-$${Math.abs(value).toLocaleString()}`
  return '$0'
}

// Formats a variance % — null (unbudgeted row) as an em dash, otherwise
// signed to one decimal place, with no "+" on an exact 0% match.
function formatVariancePercent(value) {
  if (value === null) return '—'
  if (value > 0) return `+${value.toFixed(1)}%`
  if (value < 0) return `${value.toFixed(1)}%`
  return '0.0%'
}

// Toggles the shared HistoryBrowser (see components/HistoryBrowser.vue).
// Its drill-down state lives inside that component and resets for free on
// every toggle, since v-if/v-else below unmounts/remounts it each time.
const showHistory = ref(false)
</script>

<template>
  <h2 v-if="!authStore.session">Sign in</h2>
  <p v-else-if="!canView" class="access-denied">Access Denied</p>

  <template v-else>
    <div class="page-header">
      <h2>Budget Tracking</h2>
      <button type="button" class="btn btn--outline" @click="showHistory = !showHistory">
        {{ showHistory ? '← Back to Today' : 'View Budget History' }}
      </button>
    </div>

    <p v-if="budgetTrackingStore.loading">Loading…</p>
    <p v-else-if="budgetTrackingStore.error" class="error">{{ budgetTrackingStore.error }}</p>

    <template v-else>
      <template v-if="!showHistory">
        <p v-if="!budgetTrackingStore.currentMonthRow" class="not-connected-note">
          No budget tracking data recorded for {{ todayLabel }} yet.
        </p>

        <div class="burn-rate-callout">
          <span class="burn-rate-label">Burn Rate / Runway</span>
          <span class="burn-rate-value">{{ burnRateMonths.toFixed(1) }} months of runway</span>
        </div>

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
          <template v-if="activeCategory === 'Budget & Spend'">
            <div class="metrics-group-fields">
              <div v-for="field in BUDGET_FIELDS" :key="field.key" class="metric-field">
                <span class="metric-label">{{ field.label }}</span>
                <span class="metric-value">{{ fieldValue(budgetTrackingStore.currentMonthRow, field.key) }}</span>
              </div>
            </div>

            <div class="computed-row">
              <div class="computed-display">
                <span class="computed-label">Program Expense Ratio</span>
                <span class="computed-value">{{ programExpenseRatio.toFixed(1) }}%</span>
              </div>
              <div class="computed-display">
                <span class="computed-label">Cost to Raise a Dollar</span>
                <span class="computed-value">${{ costToRaiseADollar.toFixed(2) }}</span>
              </div>
            </div>

            <div class="variance-panel">
              <h4 class="metrics-group-header">Budget Variance</h4>
              <table class="variance-table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Budgeted</th>
                    <th>Actual</th>
                    <th>Variance $</th>
                    <th>Variance %</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in VARIANCE_ROWS" :key="row.key">
                    <td class="variance-label">{{ row.label }}</td>
                    <td>{{ fieldValue(budgetTrackingStore.currentMonthRow, `${row.key}_budgeted`) }}</td>
                    <td>{{ fieldValue(budgetTrackingStore.currentMonthRow, `${row.key}_actual`) }}</td>
                    <td
                      :class="
                        varianceDollar(budgetTrackingStore.currentMonthRow, row) > 0 ? 'variance--over' : 'variance--under'
                      "
                    >
                      {{ formatVarianceDollar(varianceDollar(budgetTrackingStore.currentMonthRow, row)) }}
                    </td>
                    <td
                      :class="
                        variancePercent(budgetTrackingStore.currentMonthRow, row) === null
                          ? ''
                          : variancePercent(budgetTrackingStore.currentMonthRow, row) > 0
                            ? 'variance--over'
                            : 'variance--under'
                      "
                    >
                      {{ formatVariancePercent(variancePercent(budgetTrackingStore.currentMonthRow, row)) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </template>

          <div v-else class="grant-pipeline">
            <h3 class="grant-pipeline-title">Grant Pipeline</h3>

            <p v-if="grantPipelineStore.loading">Loading…</p>
            <p v-else-if="grantPipelineStore.error" class="error">{{ grantPipelineStore.error }}</p>
            <template v-else>
              <p v-if="grantPipelineStore.grants.length === 0" class="chart-empty">No grants added yet.</p>
              <table v-else class="grant-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Funder</th>
                    <th>Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="grant in grantPipelineStore.grants" :key="grant.id">
                    <td>{{ grant.grant_name }}</td>
                    <td>{{ grant.funder }}</td>
                    <td>{{ grant.amount != null ? `$${grant.amount.toLocaleString()}` : '—' }}</td>
                    <td><span class="badge badge--default">{{ grant.status ?? '—' }}</span></td>
                  </tr>
                </tbody>
              </table>
            </template>
          </div>
        </div>
      </template>

      <!-- month is 0-based (see HistoryBrowser.vue's slot contract) -- +1
           to match reporting_month's 1-based value before looking up a
           row. Program Expense Ratio/Cost to Raise a Dollar aren't
           reproduced here -- the latter also cross-references Fundraising
           Health's most-recent row, not this specific historical month --
           so this view shows the stored historical fields only. -->
      <HistoryBrowser v-else>
        <template #detail="{ year, month }">
          <template v-if="budgetTrackingStore.rowFor(year, month + 1)">
            <div class="metrics-group-fields">
              <div v-for="field in BUDGET_FIELDS" :key="field.key" class="metric-field">
                <span class="metric-label">{{ field.label }}</span>
                <span class="metric-value">{{
                  fieldValue(budgetTrackingStore.rowFor(year, month + 1), field.key)
                }}</span>
              </div>
            </div>

            <div class="variance-panel">
              <h4 class="metrics-group-header">Budget Variance</h4>
              <table class="variance-table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Budgeted</th>
                    <th>Actual</th>
                    <th>Variance $</th>
                    <th>Variance %</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in VARIANCE_ROWS" :key="row.key">
                    <td class="variance-label">{{ row.label }}</td>
                    <td>{{ fieldValue(budgetTrackingStore.rowFor(year, month + 1), `${row.key}_budgeted`) }}</td>
                    <td>{{ fieldValue(budgetTrackingStore.rowFor(year, month + 1), `${row.key}_actual`) }}</td>
                    <td
                      :class="
                        varianceDollar(budgetTrackingStore.rowFor(year, month + 1), row) > 0
                          ? 'variance--over'
                          : 'variance--under'
                      "
                    >
                      {{ formatVarianceDollar(varianceDollar(budgetTrackingStore.rowFor(year, month + 1), row)) }}
                    </td>
                    <td
                      :class="
                        variancePercent(budgetTrackingStore.rowFor(year, month + 1), row) === null
                          ? ''
                          : variancePercent(budgetTrackingStore.rowFor(year, month + 1), row) > 0
                            ? 'variance--over'
                            : 'variance--under'
                      "
                    >
                      {{ formatVariancePercent(variancePercent(budgetTrackingStore.rowFor(year, month + 1), row)) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </template>
          <p v-else class="not-connected-note">No budget tracking data recorded for this month.</p>
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

.not-connected-note {
  margin: 0 0 20px;
  font-size: 12px;
  font-style: italic;
  color: #8a8a85;
}

.burn-rate-callout {
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: #fff;
  border: 0.5px solid #e5e3dd;
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 24px;
}

.burn-rate-label {
  font-size: 13px;
  color: #8a8a85;
}

.burn-rate-value {
  font-size: 32px;
  font-weight: 700;
  color: #c9932a;
}

/* Category tab bar — same underline pattern used on Donor Impact
   (itself reused from TasksAlertsList.vue's Active/Pending/Completed
   tabs), no new visual language introduced. */
.tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  border-bottom: 1px solid #e5e3dd;
  margin-bottom: 20px;
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
  margin-bottom: 32px;
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
  align-items: flex-end;
  gap: 16px;
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

.computed-row {
  display: flex;
  gap: 24px;
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

.variance-panel {
  border: 0.5px solid #e5e3dd;
  border-radius: 12px;
  padding: 20px;
  background: #fff;
}

.variance-table {
  width: 100%;
  border-collapse: collapse;
}

.variance-table th {
  text-align: left;
  font-size: 12px;
  font-weight: 600;
  color: #8a8a85;
  padding: 0 8px 8px 0;
}

.variance-table td {
  padding: 6px 8px 6px 0;
  font-size: 14px;
  color: #2d3142;
}

.variance-label {
  font-weight: 500;
}

.variance--over {
  color: #b3261e;
  font-weight: 600;
}

.variance--under {
  color: #2e7d32;
  font-weight: 600;
}

.grant-pipeline-title {
  margin: 0 0 12px;
  font-size: 16px;
}

.chart-empty {
  margin: 0;
  color: #8a8a85;
}

.grant-table {
  width: 100%;
  border-collapse: collapse;
}

.grant-table th {
  text-align: left;
  font-size: 12px;
  font-weight: 600;
  color: #8a8a85;
  padding: 0 8px 8px 0;
}

.grant-table td {
  padding: 8px 8px 8px 0;
  font-size: 14px;
  color: #2d3142;
  border-top: 1px solid #f1efe8;
}

.badge {
  flex-shrink: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 999px;
  white-space: nowrap;
}

.badge--default {
  background: #f1efe8;
  color: #5f5e5a;
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
</style>
