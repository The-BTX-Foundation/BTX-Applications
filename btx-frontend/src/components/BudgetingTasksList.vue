<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useBudgetingTasksStore } from '@/stores/budgetingTasks'

const authStore = useAuthStore()
const budgetingTasksStore = useBudgetingTasksStore()

// Tracks which row has a request in flight, so only that row's buttons
// show a disabled state rather than locking the whole list.
const pendingTaskId = ref(null)

// Tracks which row (if any) most recently failed a status-changing action,
// and the message to show beside it. Kept separate from the store's global
// `error` so a single failed action shows a scoped message on that row
// instead of replacing the entire list.
const actionErrorTaskId = ref(null)
const actionErrorMessage = ref('')

// Which of the three tabs is showing. Active is the default so in-progress
// work surfaces first.
const activeTab = ref('active')

// Completed-tab drill-down position: null/null shows the year list,
// year/null shows the month list for that year, year/month shows the
// resolved rows for that month.
const selectedYear = ref(null)
const selectedMonth = ref(null)

onMounted(() => {
  authStore.init()
})

// Refetch whenever the signed-in user changes (sign in, sign out, switch
// accounts) — same pattern as MarketingTasksList.vue.
watch(
  () => authStore.session?.user?.id ?? null,
  (userId) => {
    if (userId) {
      budgetingTasksStore.fetchTasks()
    }
  },
  { immediate: true },
)

// Formats a task's date as a relative label ("Due today"/"Due tomorrow")
// for near-term dates, falling back to a short calendar date otherwise.
function dueLabel(date) {
  const due = new Date(date)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  due.setHours(0, 0, 0, 0)

  const diffDays = Math.round((due - today) / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'Due today'
  if (diffDays === 1) return 'Due tomorrow'
  return due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// Builds the left-hand pill's text and color variant. Overdue rows get the
// red variant regardless of date math; near-term rows get the amber
// "Due today"/"Due tomorrow" treatment; everything else is a neutral date.
function badge(task) {
  if (task.status === 'Overdue') {
    return { text: 'Overdue', variant: 'overdue' }
  }

  const label = dueLabel(task.date)
  const variant = label === 'Due today' || label === 'Due tomorrow' ? 'amber' : 'default'
  return { text: label, variant }
}

// Returns whether the signed-in user is this row's assignee — the only
// person allowed to act on it, regardless of their role. Non-assignees
// (even admin/board/reviewer) get no action buttons at all, just a
// read-only note instead (wording depends on the tab: "Awaiting review" in
// Pending, "Task in progress by" in Active).
function isAssignee(task) {
  return task.assigned_to === authStore.session?.user?.id
}

// Rows awaiting a decision, soonest date first (the store already orders
// fetchTasks by date ascending).
const pendingTasks = computed(() =>
  budgetingTasksStore.tasks.filter((task) => task.status === 'Open' || task.status === 'Overdue'),
)

// Rows already approved, awaiting the assignee's Mark Complete.
const activeTasks = computed(() => budgetingTasksStore.tasks.filter((task) => task.status === 'Approved'))

// Resolved rows only — the source list for the Completed tab's year/month
// grouping.
const completedTasks = computed(() =>
  budgetingTasksStore.tasks.filter((task) => task.status === 'Complete' || task.status === 'Declined'),
)

// Groups resolved rows by the year and month of completed_at:
// { [year]: { [month]: Task[] } }. A row missing completed_at (shouldn't
// happen once every resolution path sets it) is skipped since it has
// nowhere to bucket.
const completedGroups = computed(() => {
  const groups = {}
  for (const task of completedTasks.value) {
    if (!task.completed_at) continue
    const date = new Date(task.completed_at)
    const year = date.getFullYear()
    const month = date.getMonth()
    if (!groups[year]) groups[year] = {}
    if (!groups[year][month]) groups[year][month] = []
    groups[year][month].push(task)
  }
  return groups
})

// Years with resolved items, most recent first.
const completedYears = computed(() =>
  Object.keys(completedGroups.value)
    .map(Number)
    .sort((a, b) => b - a),
)

// Formats a month index (0-11) as its full name, e.g. "March".
function monthLabel(monthIndex) {
  return new Date(2000, monthIndex, 1).toLocaleDateString(undefined, { month: 'long' })
}

// Total resolved rows in a given year, shown next to the year in the
// drill-down list.
function completedCountForYear(year) {
  return Object.values(completedGroups.value[year] ?? {}).reduce((sum, tasks) => sum + tasks.length, 0)
}

// Months with resolved items for the given year, most recent first, each
// with its display label and row count.
function completedMonthsForYear(year) {
  const months = completedGroups.value[year] ?? {}
  return Object.keys(months)
    .map(Number)
    .sort((a, b) => b - a)
    .map((index) => ({ index, label: monthLabel(index), count: months[index].length }))
}

// Resolved rows for a given year/month, most recently resolved first.
function completedTasksForYearMonth(year, month) {
  const tasks = completedGroups.value[year]?.[month] ?? []
  return [...tasks].sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at))
}

// Switches tabs. Always resets the Completed drill-down back to the year
// list so re-opening it later doesn't leave the user stuck deep in a stale
// month.
function selectTab(tab) {
  activeTab.value = tab
  selectedYear.value = null
  selectedMonth.value = null
}

// Drills into a year's month list.
function selectYear(year) {
  selectedYear.value = year
  selectedMonth.value = null
}

// Drills into a month's resolved task list.
function selectMonth(month) {
  selectedMonth.value = month
}

// Backs out of the month list to the year list.
function goBackToYears() {
  selectedYear.value = null
  selectedMonth.value = null
}

// Backs out of the task list to the month list.
function goBackToMonths() {
  selectedMonth.value = null
}

// Moves a row from Open/Overdue to 'Approved' (not Complete — the assignee
// still has to come back and Mark Complete to finalize it). Surfaces a
// scoped error on this row if Supabase rejects the update (e.g. the row was
// reassigned after the page loaded) instead of assuming success.
async function handleApprove(id) {
  pendingTaskId.value = id
  actionErrorTaskId.value = null
  const { success, message } = await budgetingTasksStore.approveTask(id)
  if (!success) {
    actionErrorTaskId.value = id
    actionErrorMessage.value = message ?? 'Could not approve this item.'
  }
  pendingTaskId.value = null
}

// Finalizes a row — only reachable once it's already 'Approved'. Surfaces a
// scoped error on this row on failure instead of assuming success.
async function handleMarkComplete(id) {
  pendingTaskId.value = id
  actionErrorTaskId.value = null
  const { success, message } = await budgetingTasksStore.markComplete(id)
  if (!success) {
    actionErrorTaskId.value = id
    actionErrorMessage.value = message ?? 'Could not mark this item complete.'
  }
  pendingTaskId.value = null
}

// Declines a row. Surfaces a scoped error on this row on failure instead of
// assuming success.
async function handleDecline(id) {
  pendingTaskId.value = id
  actionErrorTaskId.value = null
  const { success, message } = await budgetingTasksStore.declineTask(id)
  if (!success) {
    actionErrorTaskId.value = id
    actionErrorMessage.value = message ?? 'Could not decline this item.'
  }
  pendingTaskId.value = null
}
</script>

<template>
  <section class="tasks-alerts">
    <!-- Signed-out visitors never reach the store fetch (see the watcher
         above), so show a plain sign-in prompt instead of the list/heading. -->
    <h2 v-if="!authStore.session">Sign in</h2>

    <!-- Applicants have no visibility into this list at all — hide the
         heading and every state (loading/error/empty/list) in favor of a
         single denial message. Admin, board, and reviewer all get full
         access below. -->
    <p v-else-if="authStore.role === 'applicant'" class="access-denied">Access Denied</p>

    <template v-else>
      <div class="header-row">
        <h2>Budgeting Tasks</h2>
      </div>

      <div class="tabs">
        <button
          type="button"
          class="tab"
          :class="{ 'tab--active': activeTab === 'active' }"
          @click="selectTab('active')"
        >
          Active
        </button>
        <button
          type="button"
          class="tab"
          :class="{ 'tab--active': activeTab === 'pending' }"
          @click="selectTab('pending')"
        >
          Pending
        </button>
        <button
          type="button"
          class="tab"
          :class="{ 'tab--active': activeTab === 'completed' }"
          @click="selectTab('completed')"
        >
          Completed
        </button>
      </div>

      <p v-if="budgetingTasksStore.loading">Loading tasks…</p>
      <p v-else-if="budgetingTasksStore.error" class="error">{{ budgetingTasksStore.error }}</p>

      <!-- Pending tab: rows awaiting a decision (Open/Overdue), soonest date
           first. This is the only place in the file that renders
           "Awaiting ... review" text. -->
      <template v-else-if="activeTab === 'pending'">
        <p v-if="pendingTasks.length === 0">No tasks awaiting a decision.</p>

        <ul v-else class="task-list">
          <li v-for="task in pendingTasks" :key="task.id" class="task-card">
            <span class="badge" :class="`badge--${badge(task).variant}`">{{ badge(task).text }}</span>

            <div class="task-body">
              <p class="title">{{ task.title }}</p>
              <p class="assignee">Assigned to {{ task.profiles?.name ?? 'Unassigned' }}</p>
              <p v-if="actionErrorTaskId === task.id" class="row-error">{{ actionErrorMessage }}</p>
            </div>

            <div class="actions">
              <template v-if="isAssignee(task)">
                <button
                  type="button"
                  class="btn btn--gold"
                  :disabled="pendingTaskId === task.id"
                  @click="handleApprove(task.id)"
                >
                  Approve
                </button>
                <button
                  type="button"
                  class="btn btn--outline"
                  :disabled="pendingTaskId === task.id"
                  @click="handleDecline(task.id)"
                >
                  Decline
                </button>
              </template>
              <span v-else class="awaiting">Awaiting {{ task.profiles?.name ?? 'the assignee' }}'s review</span>
            </div>
          </li>
        </ul>
      </template>

      <!-- Active tab: rows already approved, awaiting the assignee's Mark
           Complete. Every row here is Approved by definition, so no status
           label is needed to disambiguate it from anything else. This is
           the only place that renders "Task in progress by ..." text. -->
      <template v-else-if="activeTab === 'active'">
        <p v-if="activeTasks.length === 0">No active tasks.</p>

        <ul v-else class="task-list">
          <li v-for="task in activeTasks" :key="task.id" class="task-card">
            <span class="badge" :class="`badge--${badge(task).variant}`">{{ badge(task).text }}</span>

            <div class="task-body">
              <p class="title">{{ task.title }}</p>
              <p class="assignee">Assigned to {{ task.profiles?.name ?? 'Unassigned' }}</p>
              <p v-if="actionErrorTaskId === task.id" class="row-error">{{ actionErrorMessage }}</p>
            </div>

            <div class="actions">
              <button
                v-if="isAssignee(task)"
                type="button"
                class="btn btn--outline"
                :disabled="pendingTaskId === task.id"
                @click="handleMarkComplete(task.id)"
              >
                Mark complete
              </button>
              <span v-else class="awaiting">Task in progress by {{ task.profiles?.name ?? 'the assignee' }}</span>
            </div>
          </li>
        </ul>
      </template>

      <!-- Completed tab: resolved rows only, drilled down by year then
           month of completed_at. Never shows action buttons — these rows
           are terminal. -->
      <template v-else>
        <div v-if="selectedYear === null" class="drill-list">
          <p v-if="completedYears.length === 0">No completed items yet.</p>
          <button
            v-for="year in completedYears"
            :key="year"
            type="button"
            class="drill-row"
            @click="selectYear(year)"
          >
            <span>{{ year }}</span>
            <span class="drill-count">{{ completedCountForYear(year) }}</span>
          </button>
        </div>

        <div v-else-if="selectedMonth === null" class="drill-list">
          <button type="button" class="back-link" @click="goBackToYears">&larr; {{ selectedYear }}</button>
          <button
            v-for="month in completedMonthsForYear(selectedYear)"
            :key="month.index"
            type="button"
            class="drill-row"
            @click="selectMonth(month.index)"
          >
            <span>{{ month.label }}</span>
            <span class="drill-count">{{ month.count }}</span>
          </button>
        </div>

        <div v-else>
          <button type="button" class="back-link" @click="goBackToMonths">
            &larr; {{ monthLabel(selectedMonth) }} {{ selectedYear }}
          </button>
          <ul class="task-list">
            <li
              v-for="task in completedTasksForYearMonth(selectedYear, selectedMonth)"
              :key="task.id"
              class="task-card"
            >
              <span
                class="outcome-pill"
                :class="task.status === 'Complete' ? 'outcome-pill--complete' : 'outcome-pill--declined'"
              >
                {{ task.status }}
              </span>
              <div class="task-body">
                <p class="title">{{ task.title }}</p>
                <p class="assignee">Assigned to {{ task.profiles?.name ?? 'Unassigned' }}</p>
              </div>
            </li>
          </ul>
        </div>
      </template>
    </template>
  </section>
</template>

<style scoped>
.header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
}

.header-row h2 {
  margin: 0;
}

.tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 16px;
  border-bottom: 1px solid #e5e3dd;
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

.drill-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.drill-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #fff;
  border: 0.5px solid #e5e3dd;
  border-radius: 12px;
  padding: 14px 18px;
  font-size: 14px;
  font-weight: 500;
  color: #2d3142;
  cursor: pointer;
}

.drill-count {
  color: #8a8a85;
  font-size: 13px;
  font-weight: 400;
}

.back-link {
  align-self: flex-start;
  background: none;
  border: none;
  padding: 0 0 4px;
  margin-bottom: 4px;
  color: #8a8a85;
  font-size: 13px;
  cursor: pointer;
}

.task-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.task-card {
  display: flex;
  align-items: center;
  gap: 1rem;
  background: #fff;
  border: 0.5px solid #e5e3dd;
  border-radius: 12px;
  padding: 14px 18px;
}

.badge {
  flex-shrink: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 999px;
  white-space: nowrap;
}

.badge--amber {
  background: #faeeda;
  color: #854f0b;
}

.badge--default {
  background: #f1efe8;
  color: #5f5e5a;
}

.badge--overdue {
  background: #fbdede;
  color: #b3261e;
}

.outcome-pill {
  flex-shrink: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 999px;
  white-space: nowrap;
}

.outcome-pill--complete {
  background: #e3f1e4;
  color: #2e7d32;
}

.outcome-pill--declined {
  background: #f1efe8;
  color: #5f5e5a;
}

.task-body {
  flex: 1;
  min-width: 0;
}

.title {
  margin: 0;
  font-size: 15px;
  font-weight: 500;
  color: #2d3142;
}

.assignee {
  margin: 0;
  font-size: 13px;
  color: #8a8a85;
}

.row-error {
  margin: 4px 0 0;
  font-size: 12px;
  color: #b3261e;
}

.actions {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.awaiting {
  font-size: 13px;
  color: #8a8a85;
  font-style: italic;
}

.btn {
  font-size: 13px;
  font-weight: 500;
  padding: 6px 14px;
  border-radius: 8px;
  cursor: pointer;
}

.btn:disabled {
  opacity: 0.6;
  cursor: default;
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

.error {
  color: #b3261e;
}

.access-denied {
  margin: 0;
  color: #b3261e;
  font-weight: 600;
}

/* Below 850px (matching HomeView.vue's sidebar-drawer breakpoint), the
   badge/outcome-pill, task-body, and actions column no longer share one
   row -- at narrow widths their combined natural widths (badge/pill and
   actions are both flex-shrink: 0) left too little room for task-body,
   causing severe word-by-word wrapping and, in the worst cases, actions
   overflowing past the card edge. flex-wrap alone isn't enough to fix
   this deterministically: without a forced basis, the browser packs as
   much onto each line as fits, so a short assignee name might still
   share a line with the badge while a long one doesn't -- the exact
   per-content inconsistency this fix needs to avoid. Giving both
   task-body AND actions flex-basis: 100% forces each onto its own row
   unconditionally, regardless of how long the title, assignee name, or
   "awaiting ... review" text happens to be, so the stacked order (badge,
   then task-body, then actions) is always the same. Nothing above this
   query is touched, so desktop layout is unaffected. */
@media (max-width: 850px) {
  .task-card {
    flex-wrap: wrap;
    align-items: flex-start;
  }

  .task-body,
  .actions {
    flex-basis: 100%;
  }
}
</style>
