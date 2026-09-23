<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useFundraisingTasksStore } from '@/stores/fundraisingTasks'

const authStore = useAuthStore()
const fundraisingTasksStore = useFundraisingTasksStore()

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
      fundraisingTasksStore.fetchTasks()
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

// Text for the top-left date pill -- same visual port as Tasks &
// Approvals' dateBadgeText: "Overdue"/"Due today"/"Due tomorrow"/short
// date, no longer color-coded by urgency (the pill is uniformly muted; see
// statusToneClass below for where tone now comes from instead).
function dateBadgeText(task) {
  if (task.status === 'Overdue') return 'Overdue'
  return dueLabel(task.date)
}

// Tone for the top-right status pill -- same mapping as Tasks &
// Approvals' statusToneClass: Complete is success, Approved is amber
// (matches this page's own former .outcome--approved treatment),
// everything else (Open/Overdue/Declined) is neutral.
function statusToneClass(task) {
  if (task.status === 'Complete') return 'status-pill--success'
  if (task.status === 'Approved') return 'status-pill--amber'
  return 'status-pill--neutral'
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
  fundraisingTasksStore.tasks.filter((task) => task.status === 'Open' || task.status === 'Overdue'),
)

// Rows already approved, awaiting the assignee's Mark Complete.
const activeTasks = computed(() => fundraisingTasksStore.tasks.filter((task) => task.status === 'Approved'))

// Resolved rows only — the source list for the Completed tab's year/month
// grouping.
const completedTasks = computed(() =>
  fundraisingTasksStore.tasks.filter((task) => task.status === 'Complete' || task.status === 'Declined'),
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
  const { success, message } = await fundraisingTasksStore.approveTask(id)
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
  const { success, message } = await fundraisingTasksStore.markComplete(id)
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
  const { success, message } = await fundraisingTasksStore.declineTask(id)
  if (!success) {
    actionErrorTaskId.value = id
    actionErrorMessage.value = message ?? 'Could not decline this item.'
  }
  pendingTaskId.value = null
}
</script>

<template>
  <h2 v-if="!authStore.session">Sign in</h2>
  <p v-else-if="authStore.role === 'applicant'" class="access-denied">Access Denied</p>

  <section v-else class="tasks-alerts">
    <div class="header-row">
      <h1 class="page-title" data-page-heading>Fundraising Tasks</h1>
    </div>

    <div class="tabs">
      <button type="button" class="tab" :class="{ 'tab--active': activeTab === 'active' }" @click="selectTab('active')">
        Active
      </button>
      <button type="button" class="tab" :class="{ 'tab--active': activeTab === 'pending' }" @click="selectTab('pending')">
        Pending
      </button>
      <button type="button" class="tab" :class="{ 'tab--active': activeTab === 'completed' }" @click="selectTab('completed')">
        Completed
      </button>
    </div>

    <p v-if="fundraisingTasksStore.loading" class="empty">Loading tasks…</p>
    <p v-else-if="fundraisingTasksStore.error" class="page-error">{{ fundraisingTasksStore.error }}</p>

    <!-- Pending tab: rows awaiting a decision (Open/Overdue), soonest date
         first. This is the only place in the file that renders
         "Awaiting ... review" text. -->
    <template v-else-if="activeTab === 'pending'">
      <p v-if="pendingTasks.length === 0" class="empty">No tasks awaiting a decision.</p>

      <ul v-else class="task-list">
        <li v-for="task in pendingTasks" :key="task.id" class="task-card">
          <div class="card-top">
            <span class="date-pill">{{ dateBadgeText(task) }}</span>
            <span class="status-pill" :class="statusToneClass(task)">{{ task.status }}</span>
          </div>
          <p class="title">{{ task.title }}</p>
          <p class="assignee">Assigned to {{ task.profiles?.name ?? 'Unassigned' }}</p>
          <p v-if="actionErrorTaskId === task.id" class="row-error">{{ actionErrorMessage }}</p>

          <div class="actions">
            <template v-if="isAssignee(task)">
              <button type="button" class="btn btn--gold" :disabled="pendingTaskId === task.id" @click="handleApprove(task.id)">
                Approve
              </button>
              <button type="button" class="btn btn--outline" :disabled="pendingTaskId === task.id" @click="handleDecline(task.id)">
                Decline
              </button>
            </template>
            <span v-else class="awaiting">Awaiting {{ task.profiles?.name ?? 'the assignee' }}'s review</span>
          </div>
        </li>
      </ul>
    </template>

    <!-- Active tab: rows already approved, awaiting the assignee's Mark
         Complete. This is the only place that renders "Task in progress
         by ..." text. -->
    <template v-else-if="activeTab === 'active'">
      <p v-if="activeTasks.length === 0" class="empty">No active tasks.</p>

      <ul v-else class="task-list">
        <li v-for="task in activeTasks" :key="task.id" class="task-card">
          <div class="card-top">
            <span class="date-pill">{{ dateBadgeText(task) }}</span>
            <span class="status-pill" :class="statusToneClass(task)">{{ task.status }}</span>
          </div>
          <p class="title">{{ task.title }}</p>
          <p class="assignee">Assigned to {{ task.profiles?.name ?? 'Unassigned' }}</p>
          <p v-if="actionErrorTaskId === task.id" class="row-error">{{ actionErrorMessage }}</p>

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
         month of completed_at (unchanged navigation) -- never shows action
         buttons, these rows are terminal. -->
    <template v-else>
      <div v-if="selectedYear === null" class="drill-list">
        <p v-if="completedYears.length === 0" class="empty">No completed items yet.</p>
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
            <div class="card-top">
              <span class="date-pill">{{ dateBadgeText(task) }}</span>
              <span class="status-pill" :class="statusToneClass(task)">{{ task.status }}</span>
            </div>
            <p class="title">{{ task.title }}</p>
            <p class="assignee">Assigned to {{ task.profiles?.name ?? 'Unassigned' }}</p>
          </li>
        </ul>
      </div>
    </template>

    <p class="footer">BTX Ops Hub &middot; Fundraising Tasks</p>
  </section>
</template>

<style scoped>
.tasks-alerts {
  max-width: 640px;
  margin: 0 auto;
}

.header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 1rem;
}

.page-title {
  margin: 0;
  font-size: 28px;
  font-weight: 700;
  line-height: 1.15;
  color: var(--color-header-strong);
}

/* Segmented control -- literal port of Tasks & Approvals' own .tabs/.tab
   treatment: a rounded track with an inset white pill behind whichever tab
   is selected, rather than separate underline tabs. */
.tabs {
  display: flex;
  margin-bottom: 16px;
  padding: 4px;
  background: var(--color-track);
  border-radius: 14px;
}

.tab {
  flex: 1;
  text-align: center;
  background: none;
  border: none;
  border-radius: 10px;
  padding: 8px 4px;
  font-size: 14px;
  font-weight: 400;
  color: var(--color-header-muted);
  cursor: pointer;
  font-family: inherit;
}

.tab--active {
  background: var(--color-surface);
  color: var(--color-header-strong);
  font-weight: 700;
}

.empty {
  margin: 16px 0 0;
  font-size: 13px;
  color: var(--color-header-muted);
}

.page-error {
  margin: 16px 0 0;
  font-size: 13px;
  color: var(--color-danger-text);
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
  background: var(--color-surface);
  border: 0.5px solid var(--color-border);
  border-radius: 12px;
  padding: 14px 18px;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-primary);
  cursor: pointer;
}

.drill-count {
  color: var(--color-text-secondary);
  font-size: 13px;
  font-weight: 400;
}

.back-link {
  align-self: flex-start;
  background: none;
  border: none;
  padding: 0 0 4px;
  margin-bottom: 4px;
  color: var(--color-text-secondary);
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

/* No left accent bar (unlike Alert Center) -- a plain bordered surface,
   vertically stacked: pill row, title, assignee line, actions. Literal
   port of Tasks & Approvals' own .task-card, minus its domain pill (this
   page is single-domain, so a domain label on every row is redundant). */
.task-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 12px 14px;
}

.card-top {
  display: flex;
  align-items: center;
  gap: 6px;
}

.date-pill,
.status-pill {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 600;
  padding: 3px 9px;
  border-radius: 999px;
  white-space: nowrap;
}

/* Uniformly muted regardless of urgency -- this page signals workflow
   status via the status pill, not date-driven color coding. */
.date-pill {
  background: var(--color-neutral-badge-bg);
  color: var(--color-neutral-badge-text);
}

.status-pill {
  margin-left: auto;
}

.status-pill--neutral {
  background: var(--color-neutral-badge-bg);
  color: var(--color-neutral-badge-text);
}

.status-pill--amber {
  background: var(--color-amber-badge-bg);
  color: var(--color-amber-badge-text);
}

.status-pill--success {
  background: var(--color-success-badge-bg);
  color: var(--color-success-badge-text);
}

.title {
  margin: 8px 0 0;
  font-size: 14px;
  font-weight: 700;
  color: var(--color-header-strong);
  overflow-wrap: anywhere;
}

.assignee {
  margin: 2px 0 0;
  font-size: 12.5px;
  color: var(--color-header-muted);
}

.row-error {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--color-danger-text);
}

/* Fixed min-height so a 1-button (Mark complete) row and a 2-button
   (Approve/Decline) row -- or the italic "awaiting"/"in progress" text
   shown to non-assignees instead -- all reserve the same vertical space. */
.actions {
  margin-top: 10px;
  min-height: 30px;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.awaiting {
  font-size: 13px;
  color: var(--color-header-muted);
  font-style: italic;
}

.btn {
  font-size: 13px;
  font-weight: 500;
  padding: 6px 14px;
  border-radius: 8px;
  cursor: pointer;
  font-family: inherit;
}

.btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.btn--outline {
  background: var(--color-surface);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border-strong);
}

.btn--gold {
  background: var(--color-accent);
  color: var(--color-surface);
  border: 1px solid var(--color-accent);
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
