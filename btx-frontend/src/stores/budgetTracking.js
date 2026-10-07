import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabaseClient'

// Pinia store for Budget Tracking. Reads go through Supabase's RLS SELECT
// policy on `budget_tracking` (admin, board, and reviewer), matching
// BudgetTracking.vue's own canView gate. Read-only: the only writer is
// the sync-budget-tracking edge function (an external Apps Script sync),
// not this app.
export const useBudgetTrackingStore = defineStore('budgetTracking', () => {
  // Same fetch-everything-once-and-derive design as fundraisingHealth.js
  // -- see that store's comment for the full reasoning.
  const rows = ref([])
  const loading = ref(false)
  const error = ref(null)

  // Fetches every budget_tracking row (newest month first) visible under RLS.
  async function fetchAll() {
    loading.value = true
    error.value = null

    const { data, error: fetchError } = await supabase
      .from('budget_tracking')
      .select('*')
      .order('reporting_year', { ascending: false })
      .order('reporting_month', { ascending: false })

    if (fetchError) {
      error.value = fetchError.message
    } else {
      rows.value = data
    }
    loading.value = false
  }

  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1

  // The row for THIS calendar month specifically -- see
  // fundraisingHealth.js's identical currentMonthRow for the full
  // reasoning (no silent fallback to an older month). Left unchanged by
  // the displayRow/isFallback pair below -- other code (e.g. the quarter
  // selector's isCurrentQuarterSelected gate) still depends on this
  // meaning exactly "the real current month, or null."
  const currentMonthRow = computed(
    () =>
      rows.value.find((row) => row.reporting_year === currentYear && row.reporting_month === currentMonth) ?? null,
  )

  // The single most recently synced row regardless of whether it matches
  // the current calendar month -- same derivation as
  // fundraisingHealth.js's own mostRecentRow (rows is already sorted desc
  // by (reporting_year, reporting_month), so this is simply the first
  // element).
  const mostRecentRow = computed(() => rows.value[0] ?? null)

  // The best row to actually display: currentMonthRow if it's real,
  // otherwise mostRecentRow, or null if the table has never synced a
  // single row. This deliberately reverses currentMonthRow's own
  // no-fallback rule above -- a real, clearly labeled older month reads
  // better to a viewer than every figure on the page reading 0 just
  // because this month's sync hasn't landed yet.
  const displayRow = computed(() => currentMonthRow.value ?? mostRecentRow.value)

  // True when displayRow is substituting an older month for the real
  // current month -- lets callers show a "this isn't the current month"
  // label only when that substitution is actually happening.
  const isFallback = computed(() => !currentMonthRow.value && !!mostRecentRow.value)

  // Looks up the row for an arbitrary (year, 1-based month) pair -- used
  // by the History browser's per-month detail view. Takes a 1-based month
  // (matching reporting_month's own convention) -- callers translating
  // from HistoryBrowser's 0-based selectedMonth must add 1 before calling.
  function rowFor(year, month) {
    return rows.value.find((row) => row.reporting_year === year && row.reporting_month === month) ?? null
  }

  // Quarter (1-4) a given 1-based reporting_month falls into -- Q1 =
  // Jan-Mar, Q2 = Apr-Jun, Q3 = Jul-Sep, Q4 = Oct-Dec.
  function quarterOfMonth(month) {
    return Math.ceil(month / 3)
  }

  const currentQuarter = quarterOfMonth(currentMonth)

  // Every (year, quarter) pair with at least one real row, plus the
  // current quarter even if it has none yet -- same "always show today's
  // pill even with no data" convention as every other cycle/plan strip in
  // this app (e.g. ProgramPlanning.vue's own plan-strip). Newest first.
  const quarterOptions = computed(() => {
    const seen = new Map()
    for (const row of rows.value) {
      const quarter = quarterOfMonth(row.reporting_month)
      const key = `${row.reporting_year}-${quarter}`
      if (!seen.has(key)) seen.set(key, { year: row.reporting_year, quarter })
    }
    const currentKey = `${currentYear}-${currentQuarter}`
    if (!seen.has(currentKey)) seen.set(currentKey, { year: currentYear, quarter: currentQuarter })
    return [...seen.values()].sort((a, b) => b.year - a.year || b.quarter - a.quarter)
  })

  // Every real row belonging to one (year, quarter) pair, sorted oldest ->
  // newest month within the quarter -- so "the latest reported month in
  // this quarter" is simply the last element, with no row invented for a
  // month that was never synced.
  function rowsForQuarter(year, quarter) {
    return rows.value
      .filter((row) => row.reporting_year === year && quarterOfMonth(row.reporting_month) === quarter)
      .sort((a, b) => a.reporting_month - b.reporting_month)
  }

  return {
    rows,
    loading,
    error,
    fetchAll,
    currentYear,
    currentMonth,
    currentQuarter,
    currentMonthRow,
    mostRecentRow,
    displayRow,
    isFallback,
    rowFor,
    quarterOptions,
    rowsForQuarter,
  }
})
