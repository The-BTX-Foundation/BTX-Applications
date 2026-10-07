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

// Falls back to the most recently reported month when the real current
// month hasn't synced yet -- see budgetTracking.js's own displayRow
// comment. Every computed below that used to read currentMonthRow reads
// this instead, so the whole "This month" section (hero, tiles,
// efficiency, variance) substitutes together rather than mixing a
// fallback month's expenses against the real current month's budget.
const displayRow = computed(() => budgetTrackingStore.displayRow)

// "September 2026" -- full month name, for the fallback banner's own
// copy ("Showing September 2026 — the most recently reported month").
// Distinct from latestQuarterMonthLabel below (abbreviated "Sep 2026",
// used by the past-quarter snapshot card) since the fallback banner reads
// as a sentence rather than a compact "as of" label.
const displayRowMonthLabel = computed(() => {
  const row = displayRow.value
  if (!row) return ''
  return new Date(row.reporting_year, row.reporting_month - 1, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  })
})

// -- Hero: burn rate / runway --
// Identical formula (same two columns, same >0 guard) to Home's own
// useHomeSummary.js burnRateMonths -- reused here rather than
// independently re-derived, so the two pages can never silently disagree
// about runway.
const burnRateMonths = computed(() => {
  const funds = fieldValue(displayRow.value, 'current_funds_on_hand')
  const monthly = fieldValue(displayRow.value, 'monthly_operating_expense')
  return monthly > 0 ? funds / monthly : 0
})
// Same source column as the "Current Funds on Hand" tile below -- not a
// separate cash figure, see the Step 1 report.
const cashOnHand = computed(() => fieldValue(displayRow.value, 'current_funds_on_hand'))
const avgMonthlySpend = computed(() => fieldValue(displayRow.value, 'monthly_operating_expense'))

// Formats a plain number as a "$"-prefixed, comma-grouped currency string.
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
  const programs = fieldValue(displayRow.value, 'program_expenses')
  const overhead = fieldValue(displayRow.value, 'overhead_expenses')
  const total = programs + overhead
  return total > 0 ? (programs / total) * 100 : 0
})

// program_expense_ratio is the one tile with no real column to read --
// every other tile is a direct field lookup.
function tileValue(tile) {
  if (tile.key === 'program_expense_ratio') return programExpenseRatio.value
  return fieldValue(displayRow.value, tile.key)
}

// Formats a tile's value according to its declared format (currency/percent/plain).
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
  const expenses = fieldValue(displayRow.value, 'fundraising_expenses')
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

// Reads this variance row's budgeted amount for the currently selected month.
function budgetedFor(row) {
  return fieldValue(displayRow.value, `${row.key}_budgeted`)
}
// Reads this variance row's actual spend for the currently selected month.
function actualFor(row) {
  return fieldValue(displayRow.value, `${row.key}_actual`)
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

// Formats a variance percentage with an explicit "+" sign for overages.
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

// Builds the variance pill's display text: "On budget" when nothing was
// budgeted, otherwise the formatted dollar and percent variance combined.
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

// -- Quarter selector --
// Defaults to the real current quarter -- computed synchronously from
// budgetTrackingStore.currentYear/currentQuarter rather than waiting on
// fetchAll() to resolve, so "the current quarter is selected by default"
// holds even before the first row arrives.
const selectedQuarter = ref({ year: budgetTrackingStore.currentYear, quarter: budgetTrackingStore.currentQuarter })

function isSelectedQuarter(q) {
  return q.year === selectedQuarter.value.year && q.quarter === selectedQuarter.value.quarter
}

// Whether the quarter selector is currently on the real current quarter --
// the ONLY thing every pre-existing computed/template block below this
// point still gates on is this flag, so the current-quarter view (including
// its "no data yet" empty state) renders exactly as it did before this
// selector existed.
const isCurrentQuarterSelected = computed(
  () =>
    selectedQuarter.value.year === budgetTrackingStore.currentYear &&
    selectedQuarter.value.quarter === budgetTrackingStore.currentQuarter,
)

// -- Past-quarter view --
// Real rows for whichever quarter is selected, oldest month first --
// empty when nothing has synced for that quarter at all.
const selectedQuarterRows = computed(() =>
  budgetTrackingStore.rowsForQuarter(selectedQuarter.value.year, selectedQuarter.value.quarter),
)
const quarterRowCount = computed(() => selectedQuarterRows.value.length)

// Every flow-type column -- a per-month expense/budget/actual figure, not
// a running balance -- confirmed against sync-budget-tracking/index.ts's
// own row shape. current_funds_on_hand is deliberately excluded: it's the
// one point-in-time snapshot column (a balance, not a flow), handled
// separately below via the quarter's latest reported month instead of a
// sum.
const QUARTER_SUM_KEYS = [
  'program_expenses',
  'overhead_expenses',
  'fundraising_expenses',
  'monthly_operating_expense',
  'programs_budgeted',
  'programs_actual',
  'overhead_admin_budgeted',
  'overhead_admin_actual',
  'fundraising_budgeted',
  'fundraising_actual',
  'marketing_budgeted',
  'marketing_actual',
]

// Sums every flow-type column across however many of the selected
// quarter's months actually have a row -- 0, 1, 2, or 3, never assumed to
// be 3.
const quarterSummedRow = computed(() => {
  const sums = {}
  for (const key of QUARTER_SUM_KEYS) sums[key] = 0
  for (const row of selectedQuarterRows.value) {
    for (const key of QUARTER_SUM_KEYS) sums[key] += fieldValue(row, key)
  }
  return sums
})

// Reads this variance row's quarter-summed budgeted/actual amount -- same
// column-name convention as budgetedFor/actualFor above, just sourced from
// quarterSummedRow instead of currentMonthRow. Kept as separate functions
// (not a shared helper with a source-row parameter) so the current-quarter
// code path above is never touched by this feature.
function quarterBudgetedFor(row) {
  return fieldValue(quarterSummedRow.value, `${row.key}_budgeted`)
}
function quarterActualFor(row) {
  return fieldValue(quarterSummedRow.value, `${row.key}_actual`)
}
function quarterVarianceDollar(row) {
  return quarterActualFor(row) - quarterBudgetedFor(row)
}
function quarterVariancePercent(row) {
  const budgeted = quarterBudgetedFor(row)
  return budgeted !== 0 ? (quarterVarianceDollar(row) / budgeted) * 100 : null
}
function quarterVarianceTone(row) {
  if (quarterBudgetedFor(row) === 0) return 'neutral'
  return quarterVarianceDollar(row) > 0 ? 'danger' : 'success'
}
function quarterVariancePillText(row) {
  if (quarterBudgetedFor(row) === 0) return 'On budget'
  return `${formatVarianceDollar(quarterVarianceDollar(row))} · ${formatVariancePercent(quarterVariancePercent(row))}`
}
function quarterActualBarPct(row) {
  const budgeted = quarterBudgetedFor(row)
  if (budgeted > 0) return Math.min(100, (quarterActualFor(row) / budgeted) * 100)
  return quarterActualFor(row) > 0 ? 100 : 0
}

// Quarter-wide budgeted/actual totals across all four variance categories
// -- what the past-quarter hero replaces burn-rate/runway with, since
// runway doesn't make sense for a historical period.
const quarterTotalBudgeted = computed(() => VARIANCE_ROWS.reduce((sum, row) => sum + quarterBudgetedFor(row), 0))
const quarterTotalActual = computed(() => VARIANCE_ROWS.reduce((sum, row) => sum + quarterActualFor(row), 0))

// The latest-reported month's row within the selected quarter (rows are
// sorted oldest-first by rowsForQuarter) -- null when the quarter has no
// rows at all.
const latestQuarterRow = computed(() => selectedQuarterRows.value[selectedQuarterRows.value.length - 1] ?? null)

// current_funds_on_hand as of the quarter's latest reported month -- a
// running balance, so it's read from one real row, never summed across
// the quarter's months.
const quarterSnapshotFunds = computed(() => fieldValue(latestQuarterRow.value, 'current_funds_on_hand'))

const MONTH_ABBREVIATIONS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
// "as of {month} {year}" label for the snapshot card -- blank when the
// quarter has no rows (the template's own empty state covers that case).
const latestQuarterMonthLabel = computed(() => {
  const row = latestQuarterRow.value
  return row ? `${MONTH_ABBREVIATIONS[row.reporting_month - 1]} ${row.reporting_year}` : ''
})
</script>

<template>
  <h2 v-if="!authStore.session">Sign in</h2>
  <p v-else-if="!canView" class="access-denied">Access Denied</p>

  <section v-else class="budget-tracking">
    <h1 class="page-title" data-page-heading>Budget Tracking</h1>
    <p class="subline">Spend against budget, runway, and grant pipeline for the current fiscal year.</p>

    <p v-if="budgetTrackingStore.error" class="page-error">Couldn't load budget tracking data.</p>
    <div v-else-if="budgetTrackingStore.loading" class="skeleton skeleton--hero"></div>

    <template v-else>
      <!-- Quarter selector: reuses ProgramPlanning.vue's own plan-strip
           pattern exactly (hidden-scrollbar strip, mask-image edge fade,
           1.5px accent border on the selected card) -- card sizing itself
           is adapted to a short "Q3 2026" label (AwardeeWorkflow.vue's
           own cycle-card min-width/centered-text treatment) rather than
           plan-card's wider title+pill layout, which a two-word label
           doesn't need. Always visible once loading/error have resolved,
           independent of whether the current quarter has any data --
           this is the only way to reach a past quarter from today's own
           "no data yet" state below. -->
      <div class="quarter-strip">
        <button
          v-for="q in budgetTrackingStore.quarterOptions"
          :key="`${q.year}-${q.quarter}`"
          type="button"
          class="quarter-card"
          :class="{ 'quarter-card--selected': isSelectedQuarter(q) }"
          :aria-pressed="isSelectedQuarter(q)"
          @click="selectedQuarter = q"
        >
          Q{{ q.quarter }} {{ q.year }}
        </button>
      </div>

      <template v-if="isCurrentQuarterSelected">
        <!-- Unchanged from before this quarter selector existed: same
             v-if/v-else pair, same empty-state copy, now gated on
             displayRow (null only when the table has truly never synced a
             row) instead of currentMonthRow (null whenever this month
             specifically hasn't synced). -->
        <template v-if="!displayRow">
          <p class="empty">No budget tracking data recorded for the current month yet.</p>
        </template>

        <template v-else>
          <!-- Reuses .quarter-note (the same amber informational banner
               used below for "N of 3 months reported") rather than a new
               style -- same purpose, flagging that what's on screen isn't
               the full/current picture. -->
          <p v-if="budgetTrackingStore.isFallback" class="quarter-note">
            Showing {{ displayRowMonthLabel }} — the most recently reported month
          </p>

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
      </template>

      <template v-else>
        <!-- Past-quarter view. -->
        <p v-if="quarterRowCount === 0" class="empty">
          No budget data recorded for Q{{ selectedQuarter.quarter }} {{ selectedQuarter.year }}.
        </p>

        <template v-else>
          <p v-if="quarterRowCount < 3" class="quarter-note">
            {{ quarterRowCount }} of 3 months reported for Q{{ selectedQuarter.quarter }} {{ selectedQuarter.year }}
          </p>

          <div class="card card--full">
            <p class="label">Quarter summary</p>
            <p class="value value--28">{{ formatCurrency(quarterTotalActual) }} actual</p>
            <p class="sub">
              {{ formatCurrency(quarterTotalBudgeted) }} budgeted ·
              {{ formatVarianceDollar(quarterTotalActual - quarterTotalBudgeted) }} variance
            </p>
          </div>

          <div class="card card--full">
            <p class="label">Funds on hand (as of {{ latestQuarterMonthLabel }})</p>
            <p class="value value--28">{{ formatCurrency(quarterSnapshotFunds) }}</p>
          </div>

          <h2 class="section-heading heading-variance">Budget variance</h2>
          <div class="variance-list">
            <div v-for="row in VARIANCE_ROWS" :key="row.key" class="card variance-card">
              <div class="variance-header">
                <span class="variance-title">{{ row.label }}</span>
                <span class="pill" :class="`pill--${quarterVarianceTone(row)}`">{{ quarterVariancePillText(row) }}</span>
              </div>

              <div class="variance-bars">
                <div class="variance-bar variance-bar--budgeted"></div>
                <div class="variance-bar variance-bar--actual" :style="{ width: `${quarterActualBarPct(row)}%` }"></div>
              </div>

              <div class="variance-footer">
                <span>Budgeted <strong>{{ formatCurrency(quarterBudgetedFor(row)) }}</strong></span>
                <span>Actual <strong>{{ formatCurrency(quarterActualFor(row)) }}</strong></span>
              </div>
            </div>
          </div>
        </template>
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

/* Hidden-scrollbar horizontal scroller with a right-edge fade -- same
   mechanism as ProgramPlanning.vue's own .plan-strip. Card sizing is
   AwardeeWorkflow.vue's .cycle-card treatment instead of .plan-card's
   wider title+pill layout -- a short "Q3 2026" label doesn't need that
   much width. */
.quarter-strip {
  margin-top: 16px;
  display: flex;
  gap: 10px;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  scrollbar-width: none;
  -ms-overflow-style: none;
  mask-image: linear-gradient(to right, black 92%, transparent 100%);
}

.quarter-strip::-webkit-scrollbar {
  display: none;
}

.quarter-card {
  flex: 0 0 auto;
  min-width: 84px;
  scroll-snap-align: start;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 10px 16px;
  font-family: var(--font-serif);
  font-size: 14px;
  font-weight: 700;
  color: var(--color-header-strong);
  font-variant-numeric: lining-nums;
  font-feature-settings: 'lnum' 1;
  cursor: pointer;
  text-align: center;
}

.quarter-card--selected {
  border: 1.5px solid var(--color-accent);
}

/* Missing-month note for a past quarter with < 3 real rows -- amber
   tokens, same as this page's own pill--amber, so it reads as an
   informational flag rather than an error. */
.quarter-note {
  margin: 16px 0 0;
  padding: 8px 12px;
  border-radius: 8px;
  background: var(--color-amber-badge-bg);
  color: var(--color-amber-badge-text);
  font-size: 12px;
  font-weight: 600;
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
