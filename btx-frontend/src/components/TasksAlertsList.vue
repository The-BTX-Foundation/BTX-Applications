<script setup>
import { computed, onMounted, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useMergedTasks } from '@/composables/useMergedTasks'
import NewTaskModal from './NewTaskModal.vue'

const authStore = useAuthStore()
const {
  tasksAlertsStore,
  marketingTasksStore,
  budgetingTasksStore,
  fundraisingTasksStore,
  allTasks,
  anyLoading,
  firstError,
} = useMergedTasks()

// Maps each row's `source` tag to the store that actually owns it, so
// status-changing actions call the correct table's methods instead of
// being hardcoded to tasksAlertsStore. All four stores expose identical
// approveTask/markComplete/declineTask method names and { success,
// message } return shapes, so this lookup is all the routing needs — no
// per-source special-casing beyond picking the right instance.
const storesBySource = {
  tasks_alerts: tasksAlertsStore,
  marketing_tasks: marketingTasksStore,
  budgeting_tasks: budgetingTasksStore,
  fundraising_tasks: fundraisingTasksStore,
}

// Display label per source, shown on every row (including native
// tasks_alerts ones) so the merged list never has a blank-looking row.
const SOURCE_LABELS = {
  tasks_alerts: 'Task & Approval',
  marketing_tasks: 'Marketing',
  budgeting_tasks: 'Budgeting',
  fundraising_tasks: 'Fundraising',
}

// Options for the domain filter row.
const SOURCE_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'tasks_alerts', label: 'Task & Approval' },
  { value: 'marketing_tasks', label: 'Marketing' },
  { value: 'budgeting_tasks', label: 'Budgeting' },
  { value: 'fundraising_tasks', label: 'Fundraising' },
]

// Tracks which row has a request in flight, so only that row's buttons
// show a disabled state rather than locking the whole list.
const pendingTaskId = ref(null)

// Tracks which row (if any) most recently failed a status-changing action,
// and the message to show beside it. Kept separate from any store's global
// `error` so a single failed action shows a scoped message on that row
// instead of replacing the entire list.
const actionErrorTaskId = ref(null)
const actionErrorMessage = ref('')

// Controls the New Task modal's visibility.
const showNewTaskModal = ref(false)

// Which of the three tabs is showing. Active is the default so in-progress
// work surfaces first.
const activeTab = ref('active')

// Which domain the list is filtered to — 'all' or one of the four source
// keys.
const selectedSource = ref('all')

onMounted(() => {
  authStore.init()
})

// Narrows the merged list to the selected domain filter.
const sourceFilteredTasks = computed(() =>
  selectedSource.value === 'all'
    ? allTasks.value
    : allTasks.value.filter((task) => task.source === selectedSource.value),
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

// Text for the top-left date pill -- reuses the exact same "Overdue"/"Due
// today"/"Due tomorrow"/short-date text this page always showed, just no
// longer color-coded by urgency (the pill is uniformly muted; see
// statusToneClass below for where tone now comes from instead).
function dateBadgeText(task) {
  if (task.status === 'Overdue') return 'Overdue'
  return dueLabel(task.date)
}

// Tone for the top-right status pill, driven by the row's real status value
// rather than which tab it's currently in -- Approved only ever appears in
// the Active tab and Complete/Declined only in Completed, so this alone
// already satisfies "Active gets its own tone, Completed = success, Pending
// = neutral" without needing tab context. Reuses this page's own pre-
// existing conventions verbatim: Approved was already amber (.outcome--
// approved), Complete/Declined were already success/neutral
// (.outcome-pill--complete/--declined) -- just applied to every row's
// status pill now, not only the ones that used to render those classes.
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

// Rows awaiting a decision, soonest date first (the merged list is already
// sorted). tasks_alerts rows need type === 'Approval' to count as
// "awaiting a decision" — its Task-type rows have no approval step and
// skip straight to Active on creation. Marketing/Budgeting/Fundraising
// rows have no such split: every Open/Overdue row there is awaiting a
// decision, since those tables have no type-driven workflow branch at all.
const pendingTasks = computed(() =>
  sourceFilteredTasks.value.filter((task) => {
    if (task.source === 'tasks_alerts') {
      return task.type === 'Approval' && (task.status === 'Open' || task.status === 'Overdue')
    }
    return task.status === 'Open' || task.status === 'Overdue'
  }),
)

// Rows genuinely in progress. tasks_alerts Task-type rows land here
// immediately (Open/Overdue, no approval step); tasks_alerts Approval-type
// rows land here only once Approved. Every other domain's Active rows are
// simply status === 'Approved', since they never had a Task/Approval split
// to begin with.
const activeTasks = computed(() =>
  sourceFilteredTasks.value.filter((task) => {
    if (task.source === 'tasks_alerts') {
      return (
        (task.type === 'Approval' && task.status === 'Approved') ||
        (task.type === 'Task' && (task.status === 'Open' || task.status === 'Overdue'))
      )
    }
    return task.status === 'Approved'
  }),
)

// Resolved rows only, most recently resolved first -- a flat list (no
// year/month drill-down or chart on this redesign; see the removal note in
// the accompanying report).
const completedTasks = computed(() =>
  sourceFilteredTasks.value
    .filter((task) => task.status === 'Complete' || task.status === 'Declined')
    .sort((a, b) => new Date(b.completed_at ?? 0) - new Date(a.completed_at ?? 0)),
)

// Switches tabs.
function selectTab(tab) {
  activeTab.value = tab
}

// Switches the domain filter.
function selectSource(source) {
  selectedSource.value = source
}

// Moves a row from Open/Overdue to 'Approved' (not Complete — the assignee
// still has to come back and Mark Complete to finalize it). Routes to
// whichever store actually owns the row's source table. Surfaces a scoped
// error on this row if Supabase rejects the update (e.g. the row was
// reassigned after the page loaded) instead of assuming success.
async function handleApprove(task) {
  pendingTaskId.value = task.id
  actionErrorTaskId.value = null
  const { success, message } = await storesBySource[task.source].approveTask(task.id)
  if (!success) {
    actionErrorTaskId.value = task.id
    actionErrorMessage.value = message ?? 'Could not approve this item.'
  }
  pendingTaskId.value = null
}

// Finalizes a row — only reachable once it's already 'Approved', or
// immediately for a tasks_alerts Task-type row that never needed approval.
// Routes to whichever store actually owns the row's source table. Surfaces
// a scoped error on this row on failure instead of assuming success.
async function handleMarkComplete(task) {
  pendingTaskId.value = task.id
  actionErrorTaskId.value = null
  const { success, message } = await storesBySource[task.source].markComplete(task.id)
  if (!success) {
    actionErrorTaskId.value = task.id
    actionErrorMessage.value = message ?? 'Could not mark this item complete.'
  }
  pendingTaskId.value = null
}

// Declines a row. Routes to whichever store actually owns the row's source
// table. Surfaces a scoped error on this row on failure instead of
// assuming success.
async function handleDecline(task) {
  pendingTaskId.value = task.id
  actionErrorTaskId.value = null
  const { success, message } = await storesBySource[task.source].declineTask(task.id)
  if (!success) {
    actionErrorTaskId.value = task.id
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
      <h1 class="page-title" data-page-heading>Tasks &amp; Approvals</h1>
      <button
        v-if="authStore.isBoard || authStore.isAdmin || authStore.isReviewer"
        type="button"
        class="new-task-btn"
        @click="showNewTaskModal = true"
      >
        + New Task
      </button>
    </div>

    <!-- Domain filter: always all four domains (never hidden just because a
         domain's current bucket is empty), narrowing the merged list before
         the status tabs slice it by Active/Pending/Completed. Alert
         Center's own selected/unselected pill treatment, reused verbatim. -->
    <div class="domain-filter-row">
      <button
        v-for="filter in SOURCE_FILTERS"
        :key="filter.value"
        type="button"
        class="domain-pill"
        :class="{ 'domain-pill--active': selectedSource === filter.value }"
        @click="selectSource(filter.value)"
      >
        {{ filter.label }}
      </button>
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

    <p v-if="anyLoading" class="empty">Loading tasks…</p>
    <p v-else-if="firstError" class="page-error">{{ firstError }}</p>

    <!-- Pending tab: Approval-eligible rows awaiting a decision, soonest
         date first. This is the only place in the file that renders
         "Awaiting ... review" text, so it can never leak into an Approved
         or Task row's action area again. -->
    <template v-else-if="activeTab === 'pending'">
      <p v-if="pendingTasks.length === 0" class="empty">No approvals awaiting a decision.</p>

      <ul v-else class="task-list">
        <li v-for="task in pendingTasks" :key="`${task.source}-${task.id}`" class="task-card">
          <div class="card-top">
            <span class="date-pill">{{ dateBadgeText(task) }}</span>
            <span class="status-pill" :class="statusToneClass(task)">{{ task.status }}</span>
          </div>
          <p class="title">{{ task.title }}</p>
          <p class="assignee">
            Assigned to {{ task.profiles?.name ?? 'Unassigned' }}
            <span class="domain-pill-inline">{{ SOURCE_LABELS[task.source] }}</span>
          </p>
          <p v-if="actionErrorTaskId === task.id" class="row-error">{{ actionErrorMessage }}</p>

          <div class="actions">
            <template v-if="isAssignee(task)">
              <button type="button" class="btn btn--gold" :disabled="pendingTaskId === task.id" @click="handleApprove(task)">
                Approve
              </button>
              <button type="button" class="btn btn--outline" :disabled="pendingTaskId === task.id" @click="handleDecline(task)">
                Decline
              </button>
            </template>
            <span v-else class="awaiting">Awaiting {{ task.profiles?.name ?? 'the assignee' }}'s review</span>
          </div>
        </li>
      </ul>
    </template>

    <!-- Active tab: rows genuinely in progress — an already-approved
         Approval (awaiting Mark Complete, not a decision), an unfinished
         tasks_alerts Task-type row, or any Approved row from another
         domain. This is the only place that renders "Task in progress
         by ..." text. -->
    <template v-else-if="activeTab === 'active'">
      <p v-if="activeTasks.length === 0" class="empty">No active tasks.</p>

      <ul v-else class="task-list">
        <li v-for="task in activeTasks" :key="`${task.source}-${task.id}`" class="task-card">
          <div class="card-top">
            <span class="date-pill">{{ dateBadgeText(task) }}</span>
            <span class="status-pill" :class="statusToneClass(task)">{{ task.status }}</span>
          </div>
          <p class="title">{{ task.title }}</p>
          <p class="assignee">
            Assigned to {{ task.profiles?.name ?? 'Unassigned' }}
            <span class="domain-pill-inline">{{ SOURCE_LABELS[task.source] }}</span>
          </p>
          <p v-if="actionErrorTaskId === task.id" class="row-error">{{ actionErrorMessage }}</p>

          <div class="actions">
            <button
              v-if="isAssignee(task)"
              type="button"
              class="btn btn--outline"
              :disabled="pendingTaskId === task.id"
              @click="handleMarkComplete(task)"
            >
              Mark complete
            </button>
            <span v-else class="awaiting">Task in progress by {{ task.profiles?.name ?? 'the assignee' }}</span>
          </div>
        </li>
      </ul>
    </template>

    <!-- Completed tab: resolved rows only, most recently resolved first. No
         actions -- these rows are terminal. -->
    <template v-else>
      <p v-if="completedTasks.length === 0" class="empty">No completed items yet.</p>

      <ul v-else class="task-list">
        <li v-for="task in completedTasks" :key="`${task.source}-${task.id}`" class="task-card">
          <div class="card-top">
            <span class="date-pill">{{ dateBadgeText(task) }}</span>
            <span class="status-pill" :class="statusToneClass(task)">{{ task.status }}</span>
          </div>
          <p class="title">{{ task.title }}</p>
          <p class="assignee">
            Assigned to {{ task.profiles?.name ?? 'Unassigned' }}
            <span class="domain-pill-inline">{{ SOURCE_LABELS[task.source] }}</span>
          </p>
        </li>
      </ul>
    </template>

    <p class="footer">BTX Ops Hub &middot; Tasks &amp; Approvals</p>

    <NewTaskModal v-if="showNewTaskModal" @close="showNewTaskModal = false" />
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

/* Solid dark pill, same treatment as Alert Center's selected domain filter
   pill -- reused here for the primary page action instead of the old
   .btn--gold outline-accent button. */
.new-task-btn {
  flex-shrink: 0;
  font-size: 13px;
  font-weight: 600;
  padding: 8px 16px;
  border-radius: 999px;
  border: none;
  background: var(--color-header-strong);
  color: var(--color-surface);
  cursor: pointer;
}

/* Hidden-scrollbar horizontal strip, same convention as Alert Center's own
   domain filter row. */
.domain-filter-row {
  margin-bottom: 14px;
  display: flex;
  gap: 8px;
  overflow-x: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.domain-filter-row::-webkit-scrollbar {
  display: none;
}

.domain-pill {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 600;
  padding: 6px 14px;
  border-radius: 999px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-header-muted);
  cursor: pointer;
  white-space: nowrap;
  font-family: inherit;
}

.domain-pill--active {
  border-color: var(--color-header-strong);
  background: var(--color-header-strong);
  color: var(--color-surface);
}

/* Segmented control: a rounded track with an inset white pill behind
   whichever tab is selected, rather than separate underline tabs -- radius
   is roughly half the track's own height so it reads as a capsule. */
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

.task-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* No left accent bar on this page (unlike Alert Center) -- a plain bordered
   surface, vertically stacked: pill row, title, assignee/domain line,
   actions. */
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
   status via the status pill, not date-driven color coding (unlike the
   per-domain Tasks pages' own badge()). */
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

.domain-pill-inline {
  margin-left: 6px;
  font-size: 11px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--color-neutral-badge-bg);
  color: var(--color-neutral-badge-text);
}

.row-error {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--color-danger-text);
}

/* Fixed min-height so a 1-button (Mark complete) row and a 2-button
   (Approve/Decline) row -- or the italic "awaiting"/"in progress" text
   shown to non-assignees instead -- all reserve the same vertical space,
   keeping card height consistent within a tab regardless of which of
   those three this particular row renders. */
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
