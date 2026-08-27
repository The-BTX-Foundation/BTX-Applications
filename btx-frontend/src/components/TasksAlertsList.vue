<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useTasksAlertsStore } from '@/stores/tasksAlerts'
import NewTaskModal from './NewTaskModal.vue'

const authStore = useAuthStore()
const tasksAlertsStore = useTasksAlertsStore()

// Tracks which row has a request in flight, so only that row's buttons
// show a disabled state rather than locking the whole list.
const pendingTaskId = ref(null)

// Tracks which row (if any) most recently failed a status-changing action,
// and the message to show beside it. Kept separate from the store's global
// `error` so a single failed action shows a scoped message on that row
// instead of replacing the entire list.
const actionErrorTaskId = ref(null)
const actionErrorMessage = ref('')

// Controls the New Task modal's visibility.
const showNewTaskModal = ref(false)

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
// accounts) — not just on mount — so stale rows from a previous session
// don't linger. Keyed on user id rather than the whole session object so
// token refreshes (same user) don't trigger a redundant refetch. Skips the
// fetch entirely while signed out, since RLS would just reject it with a
// permission-denied error before the user ever gets a chance to log in.
watch(
  () => authStore.session?.user?.id ?? null,
  (userId) => {
    if (userId) {
      tasksAlertsStore.fetchTasks()
    }
  },
  { immediate: true },
)

// Formats a due date as a relative label ("Due today"/"Due tomorrow") for
// near-term dates, falling back to a short calendar date otherwise.
function dueLabel(dueDate) {
  const due = new Date(dueDate)
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

  const label = dueLabel(task.due_date)
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

// Approval rows still awaiting a decision, soonest due date first (the
// store already orders fetchTasks by due_date ascending). Deliberately its
// own computed rather than a shared "active" filter — keeping the three
// tabs as independent, non-overlapping predicates is what makes it
// structurally impossible for one row to match more than one tab, or for a
// tab's non-assignee text to leak into a state it wasn't written for.
const pendingTasks = computed(() =>
  tasksAlertsStore.tasks.filter(
    (task) => task.type === 'Approval' && (task.status === 'Open' || task.status === 'Overdue'),
  ),
)

// Rows genuinely in progress: an Approval that's already been approved
// (awaiting the assignee's Mark Complete, not a decision) or a Task that
// hasn't been finalized yet. Approved-Approval rows leave Pending and land
// here the moment they're approved, so a row is always in exactly one of
// Pending/Active, never both and never neither.
const inProgressTasks = computed(() =>
  tasksAlertsStore.tasks.filter(
    (task) =>
      (task.type === 'Approval' && task.status === 'Approved') ||
      (task.type === 'Task' && (task.status === 'Open' || task.status === 'Overdue')),
  ),
)

// Resolved rows only — the source list for the Completed tab's year/month
// grouping.
const completedTasks = computed(() =>
  tasksAlertsStore.tasks.filter((task) => task.status === 'Complete' || task.status === 'Declined'),
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

// Moves an Approval row from Open/Overdue to 'Approved' (not Complete —
// the assignee still has to come back and Mark Complete to finalize it).
// Surfaces a scoped error on this row if Supabase rejects the update (e.g.
// the row was reassigned after the page loaded) instead of assuming
// success.
async function handleApprove(taskId) {
  pendingTaskId.value = taskId
  actionErrorTaskId.value = null
  const success = await tasksAlertsStore.approveTask(taskId)
  if (!success) {
    actionErrorTaskId.value = taskId
    actionErrorMessage.value = tasksAlertsStore.error ?? 'Could not approve this item.'
  }
  pendingTaskId.value = null
}

// Finalizes a row: Task rows go straight to Complete, Approval rows only
// reach this once they're already 'Approved'. Surfaces a scoped error on
// this row on failure instead of assuming success.
async function handleMarkComplete(taskId) {
  pendingTaskId.value = taskId
  actionErrorTaskId.value = null
  const success = await tasksAlertsStore.markComplete(taskId)
  if (!success) {
    actionErrorTaskId.value = taskId
    actionErrorMessage.value = tasksAlertsStore.error ?? 'Could not mark this item complete.'
  }
  pendingTaskId.value = null
}

// Declines an approval row. Surfaces a scoped error on this row on failure
// instead of assuming success.
async function handleDecline(taskId) {
  pendingTaskId.value = taskId
  actionErrorTaskId.value = null
  const success = await tasksAlertsStore.declineTask(taskId)
  if (!success) {
    actionErrorTaskId.value = taskId
    actionErrorMessage.value = tasksAlertsStore.error ?? 'Could not decline this item.'
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
        <h2>Tasks &amp; Approvals</h2>
        <button
          v-if="authStore.isBoard || authStore.isAdmin || authStore.isReviewer"
          type="button"
          class="btn btn--gold"
          @click="showNewTaskModal = true"
        >
          + New Task
        </button>
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

      <p v-if="tasksAlertsStore.loading">Loading tasks…</p>
      <p v-else-if="tasksAlertsStore.error" class="error">{{ tasksAlertsStore.error }}</p>

      <!-- Pending tab: Approval rows awaiting a decision (Open/Overdue),
           soonest due date first. This is the only place in the file that
           renders "Awaiting ... review" text, so it can never leak into an
           Approved or Task row's action area again. -->
      <template v-else-if="activeTab === 'pending'">
        <p v-if="pendingTasks.length === 0">No approvals awaiting a decision.</p>

        <ul v-else class="task-list">
          <li v-for="task in pendingTasks" :key="task.task_id" class="task-card">
            <span class="badge" :class="`badge--${badge(task).variant}`">{{ badge(task).text }}</span>

            <div class="task-body">
              <p class="title">{{ task.title }}</p>
              <p class="assignee">Assigned to {{ task.profiles?.name ?? 'Unassigned' }}</p>
              <p v-if="actionErrorTaskId === task.task_id" class="row-error">{{ actionErrorMessage }}</p>
            </div>

            <div class="actions">
              <template v-if="isAssignee(task)">
                <button
                  type="button"
                  class="btn btn--gold"
                  :disabled="pendingTaskId === task.task_id"
                  @click="handleApprove(task.task_id)"
                >
                  Approve
                </button>
                <button
                  type="button"
                  class="btn btn--outline"
                  :disabled="pendingTaskId === task.task_id"
                  @click="handleDecline(task.task_id)"
                >
                  Decline
                </button>
              </template>
              <span v-else class="awaiting">Awaiting {{ task.profiles?.name ?? 'the assignee' }}'s review</span>
            </div>
          </li>
        </ul>
      </template>

      <!-- Active tab: rows genuinely in progress — an already-approved
           Approval (awaiting Mark Complete, not a decision) or an
           unfinished Task. This is the only place that renders "Task in
           progress by ..." text, kept separate from Pending's "Awaiting
           review" text since the two tabs mean different things. -->
      <template v-else-if="activeTab === 'active'">
        <p v-if="inProgressTasks.length === 0">No active tasks.</p>

        <ul v-else class="task-list">
          <li v-for="task in inProgressTasks" :key="task.task_id" class="task-card">
            <span class="badge" :class="`badge--${badge(task).variant}`">{{ badge(task).text }}</span>

            <div class="task-body">
              <p class="title">{{ task.title }}</p>
              <p class="assignee">Assigned to {{ task.profiles?.name ?? 'Unassigned' }}</p>
              <p v-if="actionErrorTaskId === task.task_id" class="row-error">{{ actionErrorMessage }}</p>
            </div>

            <div class="actions">
              <!-- Approved is a status, not the hidden "type" label — shown
                   to everyone so an approved-Approval row reads differently
                   from a plain Task row, same as before this rework. -->
              <span v-if="task.status === 'Approved'" class="outcome outcome--approved">Approved</span>
              <button
                v-if="isAssignee(task)"
                type="button"
                class="btn btn--outline"
                :disabled="pendingTaskId === task.task_id"
                @click="handleMarkComplete(task.task_id)"
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
              :key="task.task_id"
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

    <NewTaskModal v-if="showNewTaskModal" @close="showNewTaskModal = false" />
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

.outcome {
  flex-shrink: 0;
  font-size: 13px;
}

.outcome--approved {
  color: #854f0b;
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
