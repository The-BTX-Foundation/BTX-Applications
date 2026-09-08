import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabaseClient'

// Pinia store for Fundraising Health. Reads go through Supabase's RLS
// SELECT policy on `fundraising_health` (admin, board, and reviewer),
// matching FundraisingHealth.vue's own canView gate. Read-only: the only
// writer is the sync-fundraising-health edge function (an external Apps
// Script sync), not this app.
export const useFundraisingHealthStore = defineStore('fundraisingHealth', () => {
  // Every synced row, ordered most-recent-first by (period_year,
  // period_month). currentMonthRow/mostRecentRow below are both derived
  // from this single array rather than fetched separately -- the table is
  // small enough (one row per month) that fetching everything once and
  // deriving in memory is simpler and cheaper than three separate
  // queries, and .find() naturally returns undefined instead of
  // .single() throwing when a month has no row yet.
  const rows = ref([])
  const loading = ref(false)
  const error = ref(null)

  async function fetchAll() {
    loading.value = true
    error.value = null

    const { data, error: fetchError } = await supabase
      .from('fundraising_health')
      .select('*')
      .order('period_year', { ascending: false })
      .order('period_month', { ascending: false })

    if (fetchError) {
      error.value = fetchError.message
    } else {
      rows.value = data
    }
    loading.value = false
  }

  // Real calendar year/month, captured once when the store is created --
  // this is "today" for as long as the page stays open, matching every
  // other page's own `today = new Date()` convention (e.g.
  // EventCalendar.vue).
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1

  // The row for THIS calendar month specifically -- not "latest
  // available". If no row has been synced yet for the current month, this
  // is null and the main page shows an explicit empty state rather than
  // silently substituting an older month's numbers.
  const currentMonthRow = computed(
    () => rows.value.find((row) => row.period_year === currentYear && row.period_month === currentMonth) ?? null,
  )

  // The single most recently synced row regardless of whether it matches
  // the current calendar month -- used only by Budget Tracking's Cost to
  // Raise a Dollar, which wants the best real data available rather than
  // potentially reading 0 just because this month hasn't synced yet. rows
  // is already ordered desc by (period_year, period_month), so this is
  // simply the first element.
  const mostRecentRow = computed(() => rows.value[0] ?? null)

  // Looks up the row for an arbitrary (year, 1-based month) pair. Takes a
  // 1-based month, matching period_month's own convention. Two calling
  // conventions meet here, and FundraisingHealth.vue now uses both: its
  // own flat month-card list owns 1-based selectedYear/selectedMonth
  // state directly, so calls from there need no translation, while its
  // "View Fundraising History" button switches in HistoryBrowser's shared
  // 0-based selectedMonth slot (0 = January), whose calls must add 1
  // first. BudgetTracking.vue only ever goes through that same
  // HistoryBrowser slot, so it always adds 1 too. Forgetting that add-1 on
  // either HistoryBrowser call site would silently look up the wrong
  // month's row instead of erroring.
  function rowFor(year, month) {
    return rows.value.find((row) => row.period_year === year && row.period_month === month) ?? null
  }

  // Sums a row's four revenue fields. Nullable columns are safe to add
  // directly -- `null + number` evaluates as `0 + number` in JS -- so no
  // extra guarding is needed even before every field has been synced for
  // a given month. Exported (not just used internally below) because
  // FundraisingHealth.vue's Revenue Sources table also needs this same
  // total as the denominator for each source's % share, for whichever
  // month is currently selected -- not just the current or most-recent one.
  function sumRevenue(row) {
    if (!row) return 0
    return row.individual_donors + row.corporate_partnerships + row.grants_revenue + row.events_revenue
  }

  const currentMonthTotalRevenue = computed(() => sumRevenue(currentMonthRow.value))
  const mostRecentTotalRevenue = computed(() => sumRevenue(mostRecentRow.value))

  // Builds the left panel's flat, most-recent-first month card list from
  // whatever rows actually exist, instead of a hardcoded range like the old
  // HistoryBrowser's fixed 5-year/12-month arrays -- a (year, month) pair
  // only appears here if a row was really synced for it. The real current
  // year/month is always injected even if nothing has synced for it yet:
  // FundraisingHealth.vue's default view is always "today", so the list's
  // entry point must exist on first load exactly like currentMonthRow
  // already tolerates being null instead of the page having nothing to
  // select. Sorted newest-first by (year, month), matching fetchAll's own
  // ORDER BY direction.
  const monthEntries = computed(() => {
    const seen = new Set(rows.value.map((row) => `${row.period_year}-${row.period_month}`))
    seen.add(`${currentYear}-${currentMonth}`)

    return Array.from(seen)
      .map((key) => {
        const [year, month] = key.split('-').map(Number)
        return { year, month }
      })
      .sort((a, b) => b.year - a.year || b.month - a.month)
  })

  // Every synced row, oldest first -- feeds the chart's left-to-right
  // timeline. rows is fetched newest-first for the list/lookups above, so
  // this is a separate reversed-sort copy rather than reusing rows.value
  // directly.
  const chartRows = computed(() =>
    [...rows.value].sort((a, b) => a.period_year - b.period_year || a.period_month - b.period_month),
  )

  return {
    rows,
    loading,
    error,
    fetchAll,
    currentYear,
    currentMonth,
    currentMonthRow,
    mostRecentRow,
    rowFor,
    currentMonthTotalRevenue,
    mostRecentTotalRevenue,
    monthEntries,
    chartRows,
    sumRevenue,
  }
})
