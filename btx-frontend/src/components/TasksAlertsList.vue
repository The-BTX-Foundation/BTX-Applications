<script setup>
import { onMounted, ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useTasksAlertsStore } from '@/stores/tasksAlerts'
import NewTaskModal from './NewTaskModal.vue'

const authStore = useAuthStore()
const tasksAlertsStore = useTasksAlertsStore()

// Tracks which row has a request in flight, so only that row's buttons
// show a disabled state rather than locking the whole list.
const pendingTaskId = ref(null)

// Controls the New Task modal's visibility.
const showNewTaskModal = ref(false)

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

// Marks a task/approval complete, tracking its id so only that row's
// buttons show a disabled/loading state while the request is in flight.
async function handleApprove(taskId) {
  pendingTaskId.value = taskId
  await tasksAlertsStore.markComplete(taskId)
  pendingTaskId.value = null
}

// Declines an approval row, tracking its id the same way as handleApprove.
async function handleDecline(taskId) {
  pendingTaskId.value = taskId
  await tasksAlertsStore.declineTask(taskId)
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

      <p v-if="tasksAlertsStore.loading">Loading tasks…</p>
      <p v-else-if="tasksAlertsStore.error" class="error">{{ tasksAlertsStore.error }}</p>
      <p v-else-if="tasksAlertsStore.tasks.length === 0">No tasks.</p>

      <ul v-else class="task-list">
        <li v-for="task in tasksAlertsStore.tasks" :key="task.task_id" class="task-card">
          <span class="badge" :class="`badge--${badge(task).variant}`">{{ badge(task).text }}</span>

          <div class="task-body">
            <p class="title">{{ task.title }}</p>
            <p class="assignee">Assigned to {{ task.assigned_to?.name ?? 'Unassigned' }}</p>
          </div>

          <!-- Action buttons are keyed purely on row type, not on which of
               the three roles is signed in — the underlying RLS policy
               already grants admin, board, and reviewer full access to
               tasks_alerts updates, so there's no permission split left to
               mirror here. -->
          <div v-if="task.status === 'Complete'" class="outcome outcome--complete">
            <span class="check">&#10003;</span> Complete
          </div>
          <div v-else-if="task.status === 'Declined'" class="outcome outcome--declined">Declined</div>
          <div
            v-else-if="task.type === 'Task' && (authStore.isBoard || authStore.isAdmin || authStore.isReviewer)"
            class="actions"
          >
            <button
              type="button"
              class="btn btn--outline"
              :disabled="pendingTaskId === task.task_id"
              @click="handleApprove(task.task_id)"
            >
              Mark complete
            </button>
          </div>
          <div
            v-else-if="task.type === 'Approval' && (authStore.isBoard || authStore.isAdmin || authStore.isReviewer)"
            class="actions"
          >
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
          </div>
        </li>
      </ul>
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

.actions {
  flex-shrink: 0;
  display: flex;
  gap: 8px;
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

.outcome--complete {
  color: #2e7d32;
  display: flex;
  align-items: center;
  gap: 4px;
}

.outcome--complete .check {
  color: #2e7d32;
}

.outcome--declined {
  color: #8a8a85;
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
