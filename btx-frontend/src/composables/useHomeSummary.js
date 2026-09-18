import { computed, ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useMergedTasks } from '@/composables/useMergedTasks'
import { useTasksAlertsStore } from '@/stores/tasksAlerts'
import { useBudgetTrackingStore } from '@/stores/budgetTracking'
import { useFundraisingHealthStore } from '@/stores/fundraisingHealth'
import { useProgramPlanProgressStore } from '@/stores/programPlanProgress'
import { useProgramPlanMilestonesStore } from '@/stores/programPlanMilestones'
import { useEventTrackerEventsStore } from '@/stores/eventTrackerEvents'
import { useMarketingTasksStore } from '@/stores/marketingTasks'

// Roles allowed to see Home's live summary data -- the same admin/board/
// reviewer convention every other page in this app already gates on.
// Applicant gets Access Denied with zero fetches, not an empty/zeroed-out
// dashboard.
const VIEWER_ROLES = ['admin', 'board', 'reviewer']

// Reads a field off a row, defaulting a still-null column to 0 -- same
// convention as BudgetTracking.vue/FundraisingHealth.vue's own fieldValue.
function fieldValue(row, key) {
  return row?.[key] ?? 0
}

// "N day(s)" -- the one pluralization rule every piece of hero/row copy
// below needs, so it isn't reimplemented per call site.
function dayLabel(days) {
  return `${days} day${days === 1 ? '' : 's'}`
}

// Whole days between a date-only (day-granularity) column and now. Mirrors
// AlertCenter.vue's overdueLabel exactly (same day-boundary math), but
// returns the raw number instead of a formatted "{n}d overdue" string,
// since hero/row copy here needs the number in more than one sentence
// shape.
function daysSince(date) {
  const due = new Date(date)
  due.setHours(0, 0, 0, 0)
  const elapsedHours = Math.floor((Date.now() - due.getTime()) / (60 * 60 * 1000))
  return Math.floor(elapsedHours / 24)
}

// "$37.3k" style -- deliberately not Intl's compact-notation default
// ("$37.3K"), to match the mockup's lowercase suffix exactly.
function formatCompactCurrency(value) {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}m`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}k`
  return `$${Math.round(value)}`
}

// Same sign-before-"$" formatting as BudgetTracking.vue's own
// formatVarianceDollar -- kept in sync with that copy rather than exported
// from it, since BudgetTracking.vue's version is a local (non-store)
// function with nothing to import.
function formatVarianceDollar(value) {
  if (value > 0) return `+$${value.toLocaleString()}`
  if (value < 0) return `-$${Math.abs(value).toLocaleString()}`
  return '$0'
}

// Aggregates every stat Home's redesigned page shows, across seven
// existing stores plus the four-table merged-tasks composable. Loads
// everything in one Promise.all (not sequential awaits) so one slow
// source never delays the others' tiles, and exposes per-source `error`
// pass-through so a single failed table shows an em-dash on just its own
// tile/row instead of blanking the page.
export function useHomeSummary() {
  const authStore = useAuthStore()
  const canView = computed(() => VIEWER_ROLES.includes(authStore.role))

  // Only constructed for a viewing role. useMergedTasks() fires its own
  // four-table fetch the instant it's called (via its internal
  // watch(..., { immediate: true })) -- there's no separate "fetch later"
  // entry point to gate instead -- so simply not calling it here is what
  // keeps this composable's "no fetches for applicant" promise. Snapshotting
  // canView.value once at setup time (rather than reactively) is safe
  // because a role change in this app always arrives via a fresh
  // navigation (sign-out -> /login -> sign-in -> /), which remounts Home.vue
  // and re-runs this composable from scratch.
  const merged = canView.value ? useMergedTasks() : null

  const tasksAlertsStore = useTasksAlertsStore()
  const budgetTrackingStore = useBudgetTrackingStore()
  const fundraisingHealthStore = useFundraisingHealthStore()
  const programPlanProgressStore = useProgramPlanProgressStore()
  const programPlanMilestonesStore = useProgramPlanMilestonesStore()
  const eventTrackerEventsStore = useEventTrackerEventsStore()
  const marketingTasksStore = useMarketingTasksStore()

  // True once the Promise.all below has resolved at least once. All seven
  // sources are fetched together, so they finish together -- there's no
  // meaningful per-source loading state to track separately, only
  // per-source *error* state (handled below), which is the part that
  // actually varies independently.
  const sectionsLoaded = ref(false)

  watch(
    () => authStore.session?.user?.id ?? null,
    async (userId) => {
      if (!userId || !canView.value) {
        sectionsLoaded.value = false
        return
      }
      await Promise.all([
        tasksAlertsStore.fetchGlobalOpenCount(),
        budgetTrackingStore.fetchAll(),
        fundraisingHealthStore.fetchAll(),
        programPlanProgressStore.fetchPlans(),
        programPlanMilestonesStore.fetchMilestones(),
        eventTrackerEventsStore.fetchEvents(),
        marketingTasksStore.fetchTasks(),
      ])
      sectionsLoaded.value = true
    },
    { immediate: true },
  )

  // -- Alert hero + Alert Center row --
  // allTasks is already sorted ascending by date (useMergedTasks' own
  // contract), and .filter() preserves order, so overdueTasks[0] is
  // already the earliest due date ("oldest") with no extra sort needed.
  const overdueTasks = computed(() => {
    if (!merged) return []
    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)
    return merged.allTasks.value.filter(
      (task) => new Date(task.date) < startOfToday && task.status !== 'Complete' && task.status !== 'Declined',
    )
  })
  const overdueCount = computed(() => overdueTasks.value.length)
  const oldestOverdue = computed(() => overdueTasks.value[0] ?? null)
  const oldestOverdueDays = computed(() => (oldestOverdue.value ? daysSince(oldestOverdue.value.date) : 0))

  const heroLoading = computed(() => merged?.anyLoading.value ?? false)
  const heroError = computed(() => merged?.firstError.value ?? null)

  const alertSubtitle = computed(() => {
    if (heroLoading.value || heroError.value) return '—'
    if (overdueCount.value === 0) return 'Nothing overdue'
    return `Oldest item ${dayLabel(oldestOverdueDays.value)} overdue`
  })

  // -- At a glance --
  const burnRateMonths = computed(() => {
    const row = budgetTrackingStore.currentMonthRow
    const funds = fieldValue(row, 'current_funds_on_hand')
    const monthly = fieldValue(row, 'monthly_operating_expense')
    return monthly > 0 ? funds / monthly : 0
  })
  const runwayDisplay = computed(() =>
    !sectionsLoaded.value || budgetTrackingStore.error ? '—' : `${burnRateMonths.value.toFixed(1)} mo`,
  )

  // Unchanged from FundraisingHealth.vue's own fundraisingGoalProgress:
  // current MONTH's revenue against the annual goal, not a year-to-date
  // figure -- see the "$ raised YTD" comment below for why that matters.
  const fundraisingGoalProgress = computed(() => {
    const goal = fundraisingHealthStore.currentMonthRow?.annual_goal
    return goal > 0 ? (fundraisingHealthStore.currentMonthTotalRevenue / goal) * 100 : 0
  })
  const goalPercentDisplay = computed(() =>
    !sectionsLoaded.value || fundraisingHealthStore.error ? '—' : `${fundraisingGoalProgress.value.toFixed(1)}%`,
  )

  // The plan_year matching the current calendar year, falling back to the
  // most recent plan_year available -- plans is already ordered
  // plan_year descending (the store's own fetchPlans ORDER BY), so
  // plans[0] is "most recent" with no extra sort. This same plan year also
  // anchors the Program row's milestone count below, so both stay in sync
  // about which year they're describing.
  const currentPlan = computed(() => {
    const plans = programPlanProgressStore.plans
    if (!plans.length) return null
    const currentYear = new Date().getFullYear()
    return plans.find((plan) => plan.plan_year === currentYear) ?? plans[0]
  })
  const milestonesDisplay = computed(() => {
    if (!sectionsLoaded.value || programPlanProgressStore.error) return '—'
    if (!currentPlan.value) return '—'
    return `${currentPlan.value.milestones_complete} / ${currentPlan.value.milestones_total}`
  })
  const milestonesLabel = computed(() =>
    currentPlan.value ? `${currentPlan.value.plan_year} milestones` : 'Milestones',
  )

  // -- Section row subtitles --
  const taskSubtitle = computed(() => {
    if (!sectionsLoaded.value || tasksAlertsStore.error) return '—'
    const n = tasksAlertsStore.globalOpenCount
    return `${n} pending task${n === 1 ? '' : 's'}`
  })

  const nextEvent = computed(() => {
    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)
    return eventTrackerEventsStore.events.find((event) => new Date(event.event_date) >= startOfToday) ?? null
  })
  const eventSubtitle = computed(() => {
    if (!sectionsLoaded.value || eventTrackerEventsStore.error) return '—'
    if (!nextEvent.value) return 'No upcoming events'
    const label = new Date(nextEvent.value.event_date).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    })
    return `Next: ${label}`
  })

  // Positive means over budget -- same convention as BudgetTracking.vue's
  // own varianceDollar/.variance--over.
  const financeVariance = computed(() =>
    fieldValue(budgetTrackingStore.currentMonthRow, 'programs_actual') -
    fieldValue(budgetTrackingStore.currentMonthRow, 'programs_budgeted'),
  )
  const financeOverBudget = computed(() => financeVariance.value > 0)
  const financeSubtitle = computed(() => {
    if (!sectionsLoaded.value || budgetTrackingStore.error) return '—'
    return `${formatVarianceDollar(financeVariance.value)} program budget variance`
  })

  // Monthly amounts (confirmed against the synced data, not assumed -- see
  // the implementation report), so YTD has to be summed across this
  // calendar year's rows rather than read off a single already-cumulative
  // row.
  const fundingYtdTotal = computed(() => {
    const currentYear = fundraisingHealthStore.currentYear
    return fundraisingHealthStore.rows
      .filter((row) => row.period_year === currentYear)
      .reduce((sum, row) => sum + fundraisingHealthStore.sumRevenue(row), 0)
  })
  const fundingSubtitle = computed(() => {
    if (!sectionsLoaded.value || fundraisingHealthStore.error) return '—'
    return `${formatCompactCurrency(fundingYtdTotal.value)} raised YTD`
  })

  // program_plan_milestones has no start-date column (only a nullable
  // due_date, added later -- see 20260914120000's own migration comment),
  // so "in progress" can't be distinguished from "not yet started" at the
  // milestone level. The only real number is incomplete-for-this-plan-year,
  // labeled "remaining" rather than "in progress" to avoid implying a
  // distinction the data can't actually make.
  const programRemaining = computed(() => {
    const year = currentPlan.value?.plan_year
    if (year == null) return null
    return programPlanMilestonesStore.milestones.filter((m) => m.plan_year === year && !m.is_complete)
  })
  const programSubtitle = computed(() => {
    if (!sectionsLoaded.value || programPlanMilestonesStore.error || programPlanProgressStore.error) return '—'
    if (!programRemaining.value) return '—'
    const n = programRemaining.value.length
    return `${n} milestone${n === 1 ? '' : 's'} remaining`
  })

  const marketingOpenCount = computed(
    () => marketingTasksStore.tasks.filter((task) => ['Open', 'Overdue', 'Approved'].includes(task.status)).length,
  )
  const marketingSubtitle = computed(() => {
    if (!sectionsLoaded.value || marketingTasksStore.error) return '—'
    if (marketingOpenCount.value === 0) return 'No open tasks'
    return `${marketingOpenCount.value} open task${marketingOpenCount.value === 1 ? '' : 's'}`
  })

  return {
    canView,
    sectionsLoaded,
    heroLoading,
    heroError,
    overdueCount,
    oldestOverdue,
    oldestOverdueDays,
    dayLabel,
    alertSubtitle,
    runwayDisplay,
    goalPercentDisplay,
    milestonesDisplay,
    milestonesLabel,
    taskSubtitle,
    eventSubtitle,
    financeSubtitle,
    financeOverBudget,
    fundingSubtitle,
    programSubtitle,
    marketingSubtitle,
  }
}
