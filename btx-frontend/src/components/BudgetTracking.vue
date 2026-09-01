<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useFundraisingTotalsDraft } from '@/stores/fundraisingTotalsDraft'
import HistoryBrowser from '@/components/HistoryBrowser.vue'

const authStore = useAuthStore()
// Cost to Raise a Dollar reads this page's own fundraising_expenses against
// the OTHER page's revenue total -- a live cross-store read, not a copy, so
// it updates the instant Fundraising Totals' fields change.
const fundraisingStore = useFundraisingTotalsDraft()

// Matches Donor Impact/Marketing's view convention. No write-gating beyond
// this exists anywhere on this page (see the field/grant inputs below) --
// nothing here persists, so there's nothing a stricter role split would
// actually be protecting, matching EventCalendar.vue's precedent of only
// gating page access, not individual actions.
const canView = computed(() => authStore.isAdmin || authStore.isBoard || authStore.isReviewer)

onMounted(() => {
  authStore.init()
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

// Flat draft holding Budget & Spend's fields plus the variance rows.
// Revenue & Fundraising Health's fields now live in the separate
// fundraisingStore (see costToRaiseADollar below for the one place that
// still reads across into it).
const draft = reactive({
  ...Object.fromEntries(BUDGET_FIELDS.map((f) => [f.key, 0])),
  ...Object.fromEntries(
    VARIANCE_ROWS.flatMap((r) => [
      [`${r.key}_budgeted`, 0],
      [`${r.key}_actual`, 0],
    ]),
  ),
})

const programExpenseRatio = computed(() => {
  const total = draft.program_expenses + draft.overhead_expenses
  return total > 0 ? (draft.program_expenses / total) * 100 : 0
})

// Reads totalRevenue from the separate Fundraising Totals store (a Pinia
// singleton), not local state -- this is what makes it update live when
// revenue fields change on the other page, without a reload.
const costToRaiseADollar = computed(() =>
  fundraisingStore.totalRevenue > 0 ? draft.fundraising_expenses / fundraisingStore.totalRevenue : 0,
)

// The one thing that gets its own top-of-page callout instead of living
// inside a tab. Its two inputs (current_funds_on_hand,
// monthly_operating_expense) are still just normal Budget & Spend fields --
// this is a read-only computed display over the same draft, not a
// separate data source.
const burnRateMonths = computed(() =>
  draft.monthly_operating_expense > 0 ? draft.current_funds_on_hand / draft.monthly_operating_expense : 0,
)

// $ variance for a row. Positive means over budget.
function varianceDollar(row) {
  return draft[`${row.key}_actual`] - draft[`${row.key}_budgeted`]
}

// % variance for a row, or null when budgeted is 0 -- avoids displaying an
// Infinity/NaN result for a row that hasn't been budgeted yet.
function variancePercent(row) {
  const budgeted = draft[`${row.key}_budgeted`]
  return budgeted !== 0 ? (varianceDollar(row) / budgeted) * 100 : null
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

// -- Grant Pipeline: client-side only, same non-persisting pattern as the
// rest of this page's placeholder fields -- no store, no Supabase call.
const GRANT_STATUSES = ['Submitted', 'Pending', 'Awarded', 'Declined']
const grants = ref([])
const showAddGrant = ref(false)
const newGrant = reactive({ name: '', funder: '', amount: 0, status: GRANT_STATUSES[0] })

function handleAddGrant() {
  if (!newGrant.name || !newGrant.funder) return
  grants.value.push({ id: crypto.randomUUID(), ...newGrant })
  newGrant.name = ''
  newGrant.funder = ''
  newGrant.amount = 0
  newGrant.status = GRANT_STATUSES[0]
  showAddGrant.value = false
}

function removeGrant(id) {
  grants.value = grants.value.filter((grant) => grant.id !== id)
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

    <template v-if="!showHistory">
      <!-- Page-level instance: governs the whole editable "Today" view
           below, shown once here rather than repeated per field. -->
      <p class="not-connected-note">Not yet connected to saved data — this won't persist.</p>

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
            <label v-for="field in BUDGET_FIELDS" :key="field.key">
              {{ field.label }}
              <span class="input-with-suffix">
                <input v-model.number="draft[field.key]" type="number" min="0" />
                <span v-if="field.format === 'percent'" class="input-suffix">%</span>
              </span>
            </label>
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
                  <td><input v-model.number="draft[`${row.key}_budgeted`]" type="number" min="0" /></td>
                  <td><input v-model.number="draft[`${row.key}_actual`]" type="number" min="0" /></td>
                  <td :class="varianceDollar(row) > 0 ? 'variance--over' : 'variance--under'">
                    {{ formatVarianceDollar(varianceDollar(row)) }}
                  </td>
                  <td
                    :class="
                      variancePercent(row) === null ? '' : variancePercent(row) > 0 ? 'variance--over' : 'variance--under'
                    "
                  >
                    {{ formatVariancePercent(variancePercent(row)) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>

        <div v-else class="grant-pipeline">
          <div class="grant-pipeline-header">
            <h3>Grant Pipeline</h3>
            <button type="button" class="btn btn--outline" @click="showAddGrant = !showAddGrant">+ Add Grant</button>
          </div>

          <form v-if="showAddGrant" class="add-grant-form" @submit.prevent="handleAddGrant">
            <input v-model="newGrant.name" type="text" placeholder="Name" required />
            <input v-model="newGrant.funder" type="text" placeholder="Funder" required />
            <input v-model.number="newGrant.amount" type="number" min="0" placeholder="Amount" />
            <select v-model="newGrant.status">
              <option v-for="status in GRANT_STATUSES" :key="status" :value="status">{{ status }}</option>
            </select>
            <button type="submit" class="btn btn--gold">Add</button>
          </form>

          <p v-if="grants.length === 0" class="chart-empty">No grants added yet.</p>
          <table v-else class="grant-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Funder</th>
                <th>Amount</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="grant in grants" :key="grant.id">
                <td>{{ grant.name }}</td>
                <td>{{ grant.funder }}</td>
                <td>${{ grant.amount.toLocaleString() }}</td>
                <td><span class="badge badge--default">{{ grant.status }}</span></td>
                <td>
                  <button type="button" class="remove-btn" @click="removeGrant(grant.id)" aria-label="Remove grant">
                    ×
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <HistoryBrowser v-else />
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

.metrics-group-fields label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  color: #8a8a85;
}

.metrics-group-fields input {
  padding: 6px 10px;
  border: 1px solid #d8d6cf;
  border-radius: 8px;
  font-size: 14px;
  color: #2d3142;
  width: 160px;
}

.input-with-suffix {
  display: flex;
  align-items: center;
  gap: 6px;
}

.input-suffix {
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

.variance-table input {
  width: 110px;
  padding: 6px 10px;
  border: 1px solid #d8d6cf;
  border-radius: 8px;
  font-size: 13px;
  color: #2d3142;
}

.variance--over {
  color: #b3261e;
  font-weight: 600;
}

.variance--under {
  color: #2e7d32;
  font-weight: 600;
}

.grant-pipeline-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;
}

.grant-pipeline-header h3 {
  margin: 0;
  font-size: 16px;
}

.add-grant-form {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}

.add-grant-form input,
.add-grant-form select {
  padding: 6px 10px;
  border: 1px solid #d8d6cf;
  border-radius: 8px;
  font-size: 13px;
  color: #2d3142;
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

.remove-btn {
  background: none;
  border: none;
  color: #8a8a85;
  font-size: 16px;
  cursor: pointer;
  line-height: 1;
  padding: 4px;
}

.remove-btn:hover {
  color: #b3261e;
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

.btn--gold {
  background: #c9932a;
  color: #fff;
  border: 1px solid #c9932a;
}

.access-denied {
  margin: 0;
  color: #b3261e;
  font-weight: 600;
}
</style>
