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
  // reasoning (no silent fallback to an older month).
  const currentMonthRow = computed(
    () =>
      rows.value.find((row) => row.reporting_year === currentYear && row.reporting_month === currentMonth) ?? null,
  )

  // Looks up the row for an arbitrary (year, 1-based month) pair -- used
  // by the History browser's per-month detail view. Takes a 1-based month
  // (matching reporting_month's own convention) -- callers translating
  // from HistoryBrowser's 0-based selectedMonth must add 1 before calling.
  function rowFor(year, month) {
    return rows.value.find((row) => row.reporting_year === year && row.reporting_month === month) ?? null
  }

  return {
    rows,
    loading,
    error,
    fetchAll,
    currentMonthRow,
    rowFor,
  }
})
