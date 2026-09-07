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

// Today's month label (e.g. "September 2026"), used only for the main
// view's empty state when no row has been synced for the current month
// yet.
const today = new Date()
const todayLabel = today.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

// Goal progress for the CURRENT month specifically -- reads
// currentMonthTotalRevenue/currentMonthRow, not the most-recently-synced
// row (that distinction belongs to Budget Tracking's Cost to Raise a
// Dollar instead, which deliberately reads mostRecentTotalRevenue). Both
// sides are 0 when there's no row for the current month yet, so this
// renders 0% rather than throwing on a null/missing annual_goal.
const fundraisingGoalProgress = computed(() => {
  const goal = fundraisingHealthStore.currentMonthRow?.annual_goal
  return goal > 0 ? (fundraisingHealthStore.currentMonthTotalRevenue / goal) * 100 : 0
})

const showHistory = ref(false)
</script>

<template>
  <h2 v-if="!authStore.session">Sign in</h2>
  <p v-else-if="!canView" class="access-denied">Access Denied</p>

  <template v-else>
    <div class="page-header">
      <h2>Fundraising Health</h2>
      <button type="button" class="btn btn--outline" @click="showHistory = !showHistory">
        {{ showHistory ? '← Back to Today' : 'View Fundraising History' }}
      </button>
    </div>

    <p v-if="fundraisingHealthStore.loading">Loading…</p>
    <p v-else-if="fundraisingHealthStore.error" class="error">{{ fundraisingHealthStore.error }}</p>

    <template v-else>
      <template v-if="!showHistory">
        <p v-if="!fundraisingHealthStore.currentMonthRow" class="not-connected-note">
          No fundraising health data recorded for {{ todayLabel }} yet.
        </p>

        <div class="metrics-group-fields">
          <div v-for="field in FIELDS" :key="field.key" class="metric-field">
            <span class="metric-label">{{ field.label }}</span>
            <span class="value-with-suffix">
              <span class="metric-value">{{ fieldValue(fundraisingHealthStore.currentMonthRow, field.key) }}</span>
              <span v-if="field.format === 'percent'" class="value-suffix">%</span>
            </span>
          </div>
        </div>

        <div class="computed-row">
          <div class="computed-display">
            <span class="computed-label">Fundraising Goal Progress</span>
            <span class="computed-value">{{ fundraisingGoalProgress.toFixed(1) }}%</span>
          </div>
        </div>
      </template>

      <!-- month is 0-based (see HistoryBrowser.vue's slot contract) -- +1
           to match period_month's 1-based value before looking up a row.
           Program Expense Ratio/Goal Progress aren't reproduced here --
           this view shows the stored historical fields only, not
           recomputed "today" ratios for an arbitrary past month. -->
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
