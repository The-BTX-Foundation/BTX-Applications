<script setup>
import { onMounted, ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useTasksAlertsStore } from '@/stores/tasksAlerts'

const authStore = useAuthStore()
const tasksAlertsStore = useTasksAlertsStore()

const completingTaskId = ref(null)

onMounted(() => {
  authStore.init()
})

// Refetch whenever the signed-in user changes (sign in, sign out, switch
// accounts) — not just on mount — so stale rows from a previous session
// don't linger. Keyed on user id rather than the whole session object so
// token refreshes (same user) don't trigger a redundant refetch.
watch(
  () => authStore.session?.user?.id ?? null,
  () => {
    tasksAlertsStore.fetchTasks()
  },
  { immediate: true },
)

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

async function handleMarkComplete(taskId) {
  completingTaskId.value = taskId
  await tasksAlertsStore.markComplete(taskId)
  completingTaskId.value = null
}
</script>

<template>
  <section class="tasks-alerts">
    <h2>Tasks &amp; Approvals</h2>

    <p v-if="tasksAlertsStore.loading">Loading tasks…</p>
    <p v-else-if="tasksAlertsStore.error" class="error">{{ tasksAlertsStore.error }}</p>
    <p v-else-if="tasksAlertsStore.tasks.length === 0">No tasks.</p>

    <ul v-else class="task-list">
      <li
        v-for="task in tasksAlertsStore.tasks"
        :key="task.task_id"
        class="task-row"
        :class="{ overdue: task.status === 'Overdue' }"
      >
        <span class="due-badge">{{ dueLabel(task.due_date) }}</span>

        <div class="task-body">
          <p class="title">{{ task.title }}</p>
          <p class="assignee">Assigned to {{ task.assigned_to?.name ?? 'Unassigned' }}</p>
        </div>

        <button
          v-if="authStore.isBoardOrAdmin && task.status !== 'Complete'"
          type="button"
          :disabled="completingTaskId === task.task_id"
          @click="handleMarkComplete(task.task_id)"
        >
          Mark Complete
        </button>
        <span v-else-if="task.status === 'Complete'" class="complete-label">Complete</span>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.task-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.task-row {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem 0;
  border-bottom: 1px solid var(--color-border);
}

.due-badge {
  flex-shrink: 0;
  font-size: 0.8rem;
  opacity: 0.7;
}

.task-row.overdue .due-badge {
  color: #b3261e;
  font-weight: bold;
  opacity: 1;
}

.task-body {
  flex: 1;
}

.title {
  margin: 0;
  font-weight: 600;
}

.assignee {
  margin: 0;
  font-size: 0.85rem;
  opacity: 0.7;
}

.complete-label {
  font-size: 0.85rem;
  opacity: 0.6;
}

.error {
  color: #b3261e;
}
</style>
