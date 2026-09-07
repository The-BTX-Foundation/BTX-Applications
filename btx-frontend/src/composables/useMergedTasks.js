import { computed, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useTasksAlertsStore } from '@/stores/tasksAlerts'
import { useMarketingTasksStore } from '@/stores/marketingTasks'
import { useBudgetingTasksStore } from '@/stores/budgetingTasks'
import { useFundraisingTasksStore } from '@/stores/fundraisingTasks'

// Normalizes one store's rows into the shape every consumer works with,
// tagging each with its source and folding the two column naming
// differences (task_id vs id, due_date vs date) into a single id/date pair.
// Everything else (status, assigned_to, profiles, type, completed_at,
// created_at) is already shaped the same across all four tables.
function normalize(tasks, source) {
  return tasks.map((task) => ({
    id: source === 'tasks_alerts' ? task.task_id : task.id,
    source,
    title: task.title,
    date: source === 'tasks_alerts' ? task.due_date : task.date,
    status: task.status,
    assigned_to: task.assigned_to,
    profiles: task.profiles,
    type: task.type ?? null,
    completed_at: task.completed_at,
    created_at: task.created_at,
  }))
}

// Fetches and merges tasks_alerts/marketing_tasks/budgeting_tasks/
// fundraising_tasks into one normalized, date-sorted list. Shared by
// TasksAlertsList.vue and AlertCenter.vue so the four-table aggregation
// query and its normalization only exist in one place — each caller then
// applies its own view-specific filtering (Active/Pending/Completed tabs,
// or Overdue/New Items) on top of the same `allTasks`.
export function useMergedTasks() {
  const authStore = useAuthStore()
  const tasksAlertsStore = useTasksAlertsStore()
  const marketingTasksStore = useMarketingTasksStore()
  const budgetingTasksStore = useBudgetingTasksStore()
  const fundraisingTasksStore = useFundraisingTasksStore()

  // Refetch all four sources whenever the signed-in user changes (sign in,
  // sign out, switch accounts). Each store's own RLS SELECT policy already
  // scopes its rows to what the signed-in user can see — this just fans the
  // same watcher out to four fetches instead of one.
  watch(
    () => authStore.session?.user?.id ?? null,
    (userId) => {
      if (userId) {
        Promise.all([
          tasksAlertsStore.fetchTasks(),
          marketingTasksStore.fetchTasks(),
          budgetingTasksStore.fetchTasks(),
          fundraisingTasksStore.fetchTasks(),
        ])
      }
    },
    { immediate: true },
  )

  // True while any of the four sources is still loading.
  const anyLoading = computed(() =>
    [tasksAlertsStore, marketingTasksStore, budgetingTasksStore, fundraisingTasksStore].some((store) => store.loading),
  )

  // The first load error found across the four sources, or null if none.
  const firstError = computed(
    () =>
      [tasksAlertsStore, marketingTasksStore, budgetingTasksStore, fundraisingTasksStore]
        .map((store) => store.error)
        .find(Boolean) ?? null,
  )

  // Merges all four stores' rows into one list, sorted by date ascending.
  // Each source array is already sorted individually (every store's
  // fetchTasks orders by its own date column), but interleaving four sorted
  // arrays by concatenation isn't itself sorted, so this still needs its own
  // sort after merging.
  const allTasks = computed(() =>
    [
      ...normalize(tasksAlertsStore.tasks, 'tasks_alerts'),
      ...normalize(marketingTasksStore.tasks, 'marketing_tasks'),
      ...normalize(budgetingTasksStore.tasks, 'budgeting_tasks'),
      ...normalize(fundraisingTasksStore.tasks, 'fundraising_tasks'),
    ].sort((a, b) => new Date(a.date) - new Date(b.date)),
  )

  return {
    tasksAlertsStore,
    marketingTasksStore,
    budgetingTasksStore,
    fundraisingTasksStore,
    allTasks,
    anyLoading,
    firstError,
  }
}
