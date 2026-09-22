<script setup>
import { computed, onMounted, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useBudgetTrackingStore } from '@/stores/budgetTracking'
import { useFundraisingHealthStore } from '@/stores/fundraisingHealth'
import { useGrantPipelineStore } from '@/stores/grantPipeline'

const authStore = useAuthStore()
const budgetTrackingStore = useBudgetTrackingStore()
// Cost to Raise a Dollar reads this page's own fundraising_expenses
// against Fundraising Health's most-recently-synced revenue total (not
// necessarily the current calendar month) -- a live cross-store read, not
// a copy, so it updates the instant a new fundraising_health row syncs.
// Both tables share the same admin/board/reviewer SELECT policy (see each
// store's own file comment), so this metric can't work for one role and
// silently fail for another.
const fundraisingHealthStore = useFundraisingHealthStore()
const grantPipelineStore = useGrantPipelineStore()

// Same page-access gate as every other Program/Finance page: admin, board,
// and reviewer can view; matches budget_tracking's RLS SELECT policy
// exactly. This page has no write actions of its own -- everything here,
// including Grant Pipeline, is read-only display.
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

// Both tabs are real, RLS-backed data (grant_pipeline is a genuine synced
// table, not a placeholder) -- unlike a category with no backing source,
// neither needs a disabled treatment.
const TABS = ['Budget & Spend', 'Grant Pipeline']
const activeTab = ref(TABS[0])

// Reads a field off the current month's budget_tracking row, defaulting a
// still-null column to 0 for display -- same convention as every other
// store-backed page in this app.
function fieldValue(row, key) {
  return row?.[key] ?? 0
}

const currentMonthRow = computed(() => budgetTrackingStore.currentMonthRow)

// -- Hero: burn rate / runway --
// Identical formula (same two columns, same >0 guard) to Home's own
// useHomeSummary.js burnRateMonths -- reused here rather than
// independently re-derived, so the two pages can never silently disagree
// about runway.
const burnRateMonths = computed(() => {
  const funds = fieldValue(currentMonthRow.value, 'current_funds_on_hand')
  const monthly = fieldValue(currentMonthRow.value, 'monthly_operating_expense')
  return monthly > 0 ? funds / monthly : 0
})
// Same source column as the "Current Funds on Hand" tile below -- not a
// separate cash figure, see the Step 1 report.
const cashOnHand = computed(() => fieldValue(currentMonthRow.value, 'current_funds_on_hand'))
const avgMonthlySpend = computed(() => fieldValue(currentMonthRow.value, 'monthly_operating_expense'))

function formatCurrency(value) {
  return `$${value.toLocaleString()}`
}

// -- "This month" tiles --
// The four raw expense fields (plain dark values) plus the two highlighted
// figures (gold serif) -- program_expense_ratio has no column of its own,
// see programExpenseRatio below.
const TILES = [
  { key: 'program_expenses', label: 'Program Expenses', format: 'currency', gold: false },
  { key: 'overhead_expenses', label: 'Overhead Expenses', format: 'currency', gold: false },
  { key: 'fundraising_expenses', label: 'Fundraising Expenses', format: 'currency', gold: false },
  { key: 'monthly_operating_expense', label: 'Monthly Operating Expense', format: 'currency', gold: false },
  { key: 'current_funds_on_hand', label: 'Current Funds on Hand', format: 'currency', gold: true },
  { key: 'program_expense_ratio', label: 'Program Expense Ratio', format: 'percent', gold: true },
]

// program_expenses / (program_expenses + overhead_expenses) -- the same
// formula the pre-redesign BudgetTracking.vue already used, reused
// verbatim rather than re-derived, since it isn't its own stored column.
const programExpenseRatio = computed(() => {
  const programs = fieldValue(currentMonthRow.value, 'program_expenses')
  const overhead = fieldValue(currentMonthRow.value, 'overhead_expenses')
  const total = programs + overhead
  return total > 0 ? (programs / total) * 100 : 0
})

// program_expense_ratio is the one tile with no real column to read --
// every other tile is a direct field lookup.
function tileValue(tile) {
  if (tile.key === 'program_expense_ratio') return programExpenseRatio.value
  return fieldValue(currentMonthRow.value, tile.key)
}

function formatTileValue(tile) {
  const value = tileValue(tile)
  if (tile.format === 'currency') return formatCurrency(value)
  if (tile.format === 'percent') return `${value.toFixed(1)}%`
  return value.toLocaleString()
}

// -- Efficiency: cost to raise a dollar --
// Uses the most-recently-synced fundraising_health row rather than
// requiring an exact current-month match: this is a supporting ratio, not
// the main Fundraising Health view, so it should read the best real data
// available instead of showing 0 just because the current month hasn't
// synced yet.
const costToRaiseADollar = computed(() => {
  const revenue = fundraisingHealthStore.mostRecentTotalRevenue
  const expenses = fieldValue(currentMonthRow.value, 'fundraising_expenses')
  return revenue > 0 ? expenses / revenue : 0
})
// Derived from the same computed above, not re-divided independently, so
// the dollar figure and its cents subtext can never drift apart.
const costToRaiseADollarCents = computed(() => Math.round(costToRaiseADollar.value * 100))

// -- Budget variance --
// overhead_admin (not admin_overhead) -- the pre-redesign page used the
// wrong prefix here, silently reading undefined admin_overhead_budgeted/
// _actual columns (falling back to 0 via fieldValue) instead of the real
// overhead_admin_budgeted/_actual columns confirmed in
// sync-budget-tracking/index.ts. Fixed here -- see the Step 1 report.
const VARIANCE_ROWS = [
  { key: 'programs', label: 'Programs' },
  { key: 'overhead_admin', label: 'Administration & Overhead' },
  { key: 'fundraising', label: 'Fundraising' },
  { key: 'marketing', label: 'Marketing' },
]

function budgetedFor(row) {
  return fieldValue(currentMonthRow.value, `${row.key}_budgeted`)
}
function actualFor(row) {
  return fieldValue(currentMonthRow.value, `${row.key}_actual`)
}

// $ variance for a row -- positive means over budget, same sign
// convention as useHomeSummary.js's own financeVariance/financeOverBudget.
function varianceDollar(row) {
  return actualFor(row) - budgetedFor(row)
}

// % variance, or null when budgeted is 0 -- avoids an Infinity/NaN result
// for a category that hasn't been budgeted yet.
function variancePercent(row) {
  const budgeted = budgetedFor(row)
  return budgeted !== 0 ? (varianceDollar(row) / budgeted) * 100 : null
}

// Sign-before-"$" formatting -- Number.toLocaleString() puts the minus
// sign before the digits, so naively writing `$${value.toLocaleString()}`
// would render a negative value as "$-1,000" instead of "-$1,000". Exactly
// 0 gets no sign at all rather than a misleading "+$0" implying a
// (non-existent) overage.
function formatVarianceDollar(value) {
  if (value > 0) return `+$${value.toLocaleString()}`
  if (value < 0) return `-$${Math.abs(value).toLocaleString()}`
  return '$0'
}

function formatVariancePercent(value) {
  if (value > 0) return `+${value.toFixed(1)}%`
  return `${value.toFixed(1)}%`
}

// Pill tone for a variance row -- neutral "On budget" (no dollar/percent
// breakdown) when budgeted is exactly 0, since a real vs. $0 budget isn't
// a meaningful over/under signal. Otherwise danger when over budget,
// success when at or under.
function varianceTone(row) {
  if (budgetedFor(row) === 0) return 'neutral'
  return varianceDollar(row) > 0 ? 'danger' : 'success'
}

function variancePillText(row) {
  if (budgetedFor(row) === 0) return 'On budget'
  return `${formatVarianceDollar(varianceDollar(row))} · ${formatVariancePercent(variancePercent(row))}`
}

// Actual bar's width as a % of the budgeted bar's full width -- capped at
// 100 so an over-budget category never visually overflows the card. A $0
// budget can't be divided into, so a real actual spend against it reads as
// fully "over" (100%); no spend against a $0 budget reads as empty.
function actualBarPct(row) {
  const budgeted = budgetedFor(row)
  if (budgeted > 0) return Math.min(100, (actualFor(row) / budgeted) * 100)
  return actualFor(row) > 0 ? 100 : 0
}

// -- Grant Pipeline --
// Badge tone per the table's own grant_pipeline_status_check values
// (Submitted, Pending, Awarded, Declined) -- reuses the same
// success/amber/danger/neutral tokens as every other badge in this app.
function grantStatusTone(status) {
  if (status === 'Awarded') return 'success'
  if (status === 'Declined') return 'danger'
  if (status === 'Pending') return 'amber'
  return 'neutral'
}
</script>

<template>
  <h2 v-if="!authStore.session">Sign in</h2>
  <p v-else-if="!canView" class="access-denied">Access Denied</p>

  <section v-else class="budget-tracking">
    <h1 class="page-title" data-page-heading>Budget Tracking</h1>
    <p class="subline">Spend against budget, runway, and grant pipeline for the current fiscal year.</p>

    <p v-if="budgetTrackingStore.error" class="page-error">Couldn't load budget tracking data.</p>
    <div v-else-if="budgetTrackingStore.loading" class="skeleton skeleton--hero"></div>

    <template v-else-if="!currentMonthRow">
      <p class="empty">No budget tracking data recorded for the current month yet.</p>
    </template>

    <template v-else>
      <div class="card card--full">
        <p class="label">Burn rate / runway</p>
        <p class="value value--28">{{ burnRateMonths.toFixed(1) }} months of runway</p>
        <p class="sub">{{ formatCurrency(cashOnHand) }} on hand · {{ formatCurrency(avgMonthlySpend) }} average monthly spend</p>
      </div>

      <div class="tab-switcher">
        <button
          v-for="tab in TABS"
          :key="tab"
          type="button"
          class="tab-switcher-btn"
          :class="{ 'tab-switcher-btn--active': activeTab === tab }"
          @click="activeTab = tab"
        >
          {{ tab }}
        </button>
      </div>

      <template v-if="activeTab === 'Budget & Spend'">
        <h2 class="section-heading heading-tiles">This month</h2>
        <div class="tiles">
          <div v-for="tile in TILES" :key="tile.key" class="tile">
            <p class="tile-value" :class="{ 'tile-value--gold': tile.gold }">{{ formatTileValue(tile) }}</p>
            <p class="tile-label">{{ tile.label }}</p>
          </div>
        </div>

        <h2 class="section-heading heading-efficiency">Efficiency</h2>
        <div class="card card--full">
          <p class="label">Cost to raise a dollar</p>
          <p class="value value--28">${{ costToRaiseADollar.toFixed(2) }}</p>
          <p class="sub">Every $1 raised costs {{ costToRaiseADollarCents }}¢ in fundraising expense</p>
        </div>

        <h2 class="section-heading heading-variance">Budget variance</h2>
        <div class="variance-list">
          <div v-for="row in VARIANCE_ROWS" :key="row.key" class="card variance-card">
            <div class="variance-header">
              <span class="variance-title">{{ row.label }}</span>
              <span class="pill" :class="`pill--${varianceTone(row)}`">{{ variancePillText(row) }}</span>
            </div>

            <div class="variance-bars">
              <div class="variance-bar variance-bar--budgeted"></div>
              <div class="variance-bar variance-bar--actual" :style="{ width: `${actualBarPct(row)}%` }"></div>
            </div>

            <div class="variance-footer">
              <span>Budgeted <strong>{{ formatCurrency(budgetedFor(row)) }}</strong></span>
              <span>Actual <strong>{{ formatCurrency(actualFor(row)) }}</strong></span>
            </div>
          </div>
        </div>
      </template>

      <template v-else>
        <h2 class="section-heading heading-tiles">Grant pipeline</h2>

        <p v-if="grantPipelineStore.loading" class="empty">Loading…</p>
        <p v-else-if="grantPipelineStore.error" class="page-error">Couldn't load grant pipeline data.</p>
        <p v-else-if="grantPipelineStore.grants.length === 0" class="empty">No grants added yet.</p>
        <div v-else class="grant-list">
          <div v-for="grant in grantPipelineStore.grants" :key="grant.id" class="card grant-card">
            <div class="grant-info">
              <p class="grant-name">{{ grant.grant_name }}</p>
              <p class="grant-funder">{{ grant.funder }}</p>
            </div>
            <div class="grant-meta">
              <p class="grant-amount">{{ grant.amount != null ? formatCurrency(grant.amount) : '—' }}</p>
              <span class="pill" :class="`pill--${grantStatusTone(grant.status)}`">{{ grant.status ?? '—' }}</span>
            </div>
          </div>
        </div>
      </template>
    </template>

    <p class="footer">BTX Ops Hub · Budget Tracking</p>
  </section>
</template>

<style scoped>
.budget-tracking {
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

.heading-tiles {
  margin-top: 24px;
}

.heading-efficiency,
.heading-variance {
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

.card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 14px;
  padding: 14px 16px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}

.card--full {
  margin-top: 10px;
}

.label {
  margin: 0;
  font-size: 11.5px;
  color: var(--color-header-muted);
}

/* lining-nums -- see HomeMissionHero.vue's identical pair for why both
   properties are set (font-variant-numeric alone isn't always enough). */
.value {
  margin: 6px 0 0;
  font-family: var(--font-serif);
  font-weight: 700;
  color: var(--color-gold-strong);
  font-variant-numeric: lining-nums;
  font-feature-settings: 'lnum' 1;
}

.value--28 {
  font-size: 28px;
}

.sub {
  margin: 6px 0 0;
  font-size: 11.5px;
  color: var(--color-header-muted);
}

/* Two-tab switcher: a shared 1px track spans the full width via
   border-bottom on the wrapper; each button is exactly half the row
   (flex: 1) with its own 2px border-bottom that's transparent unless
   active. margin-bottom: -1px pulls the active button's 2px border up so
   it overlays the shared 1px track exactly, instead of stacking a second
   line beneath it. */
.tab-switcher {
  margin-top: 20px;
  display: flex;
  border-bottom: 1px solid var(--color-border);
}

.tab-switcher-btn {
  flex: 1;
  text-align: center;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  padding: 10px 4px;
  font-size: 13px;
  font-weight: 600;
  font-family: inherit;
  color: var(--color-header-muted);
  cursor: pointer;
}

.tab-switcher-btn--active {
  color: var(--color-header-strong);
  font-weight: 700;
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

.pill {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  font-size: 11px;
  font-weight: 700;
  padding: 3px 9px;
  border-radius: 999px;
  white-space: nowrap;
}

.pill--success {
  background: var(--color-success-badge-bg);
  color: var(--color-success-badge-text);
}

.pill--danger {
  background: var(--color-danger-badge-bg);
  color: var(--color-danger-badge-text);
}

.pill--amber {
  background: var(--color-amber-badge-bg);
  color: var(--color-amber-badge-text);
}

.pill--neutral {
  background: var(--color-neutral-badge-bg);
  color: var(--color-neutral-badge-text);
}

.variance-list {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.variance-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.variance-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--color-header-strong);
}

/* Two stacked bars, not a track-with-fill -- the budgeted bar is always
   full width (the reference), the actual bar (capped at 100% via
   actualBarPct) sits directly beneath it at its own proportional width,
   so the two are visually compared rather than one nested inside the
   other. */
.variance-bars {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.variance-bar {
  height: 6px;
  border-radius: 999px;
}

.variance-bar--budgeted {
  width: 100%;
  background: var(--color-header-muted);
  opacity: 0.35;
}

.variance-bar--actual {
  background: var(--color-gold-strong);
}

.variance-footer {
  margin-top: 10px;
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--color-header-muted);
}

.variance-footer strong {
  color: var(--color-header-strong);
  font-weight: 700;
}

.grant-list {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.grant-card {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.grant-info {
  min-width: 0;
}

.grant-name {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: var(--color-header-strong);
}

.grant-funder {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--color-header-muted);
}

.grant-meta {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
}

.grant-amount {
  margin: 0;
  font-family: var(--font-serif);
  font-size: 15px;
  font-weight: 700;
  color: var(--color-gold-strong);
  font-variant-numeric: lining-nums;
  font-feature-settings: 'lnum' 1;
}

/* Neutral pulsing placeholder -- same footprint as the real hero card so
   nothing visibly resizes once data arrives. Same animation as the three
   Program pages' own skeletons. */
.skeleton {
  border-radius: 12px;
  background: var(--color-track);
  animation: skeleton-pulse 1.4s ease-in-out infinite;
}

.skeleton--hero {
  margin-top: 10px;
  height: 90px;
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
