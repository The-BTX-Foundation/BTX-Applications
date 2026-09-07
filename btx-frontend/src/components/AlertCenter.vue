<script setup>
import { computed, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useMergedTasks } from '@/composables/useMergedTasks'

const authStore = useAuthStore()
const { allTasks, anyLoading, firstError } = useMergedTasks()

// Matches the donor_impact/DonorImpact.vue convention: admin, board, and
// reviewer can all view; applicant cannot. This page has no write actions
// at all, so there's no separate assignee-style gate beyond this.
const canView = computed(() => authStore.isAdmin || authStore.isBoard || authStore.isReviewer)

onMounted(() => {
  authStore.init()
})

// Overdue: date has passed and the row hasn't been resolved. `date` on
// every source table (tasks_alerts.due_date included, via the shared
// normalize() in useMergedTasks) has no time-of-day component, so this
// compares at day granularity — a row is overdue starting the moment
// today's calendar day begins, not 24h after its own due timestamp.
const overdueItems = computed(() => {
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  return allTasks.value.filter(
    (task) => new Date(task.date) < startOfToday && task.status !== 'Complete' && task.status !== 'Declined',
  )
})

// New Items: created within the last 48h, most recently created first.
// Rows without created_at (shouldn't happen post-migration, since every
// source table now has a NOT NULL created_at) are excluded rather than
// guessed at.
const NEW_ITEMS_WINDOW_MS = 48 * 60 * 60 * 1000

const newItems = computed(() =>
  allTasks.value
    .filter((task) => task.created_at && Date.now() - new Date(task.created_at).getTime() <= NEW_ITEMS_WINDOW_MS)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
)

// "{n}d overdue" / "{n}h overdue", matching the mockup's own phrasing
// rather than a generic "ago" label. Since `date` is day-granularity (see
// overdueItems above), every row reaching this component is already at
// least 24h past its due day, so the "{n}h overdue" branch is effectively
// unreachable today — kept anyway so this stays correct if a source table
// ever gains a real due-timestamp instead of a due-date.
function overdueLabel(date) {
  const due = new Date(date)
  due.setHours(0, 0, 0, 0)
  const elapsedHours = Math.floor((Date.now() - due.getTime()) / (60 * 60 * 1000))
  if (elapsedHours < 24) return `${elapsedHours}h overdue`
  return `${Math.floor(elapsedHours / 24)}d overdue`
}

// "{n}m ago" / "{n}h ago" / "{n}d ago" for New Items — capped at 48h by
// the newItems filter above, so the day branch here only ever reads "1d
// ago" or "2d ago" in practice.
function agoLabel(createdAt) {
  const elapsedMinutes = Math.floor((Date.now() - new Date(createdAt).getTime()) / (60 * 1000))
  if (elapsedMinutes < 1) return 'Just now'
  if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`
  const elapsedHours = Math.floor(elapsedMinutes / 60)
  if (elapsedHours < 24) return `${elapsedHours}h ago`
  return `${Math.floor(elapsedHours / 24)}d ago`
}
</script>

<template>
  <h2 v-if="!authStore.session">Sign in</h2>
  <p v-else-if="!canView" class="access-denied">Access Denied</p>

  <template v-else>
    <div class="header-row">
      <h2>Alert Center</h2>
      <span class="overdue-count-badge">{{ overdueItems.length }}</span>
    </div>

    <p v-if="anyLoading">Loading alerts…</p>
    <p v-else-if="firstError" class="error">{{ firstError }}</p>

    <template v-else>
      <section class="alert-section">
        <h3>Overdue</h3>
        <p v-if="overdueItems.length === 0" class="empty">Nothing overdue.</p>
        <ul v-else class="alert-list">
          <li v-for="task in overdueItems" :key="`${task.source}-${task.id}`" class="alert-card">
            <span class="badge badge--overdue">{{ overdueLabel(task.date) }}</span>
            <div class="alert-body">
              <p class="title">{{ task.title }}</p>
              <p class="assignee">Assigned to {{ task.profiles?.name ?? 'Unassigned' }}</p>
            </div>
          </li>
        </ul>
      </section>

      <section class="alert-section">
        <h3>New Items</h3>
        <p v-if="newItems.length === 0" class="empty">Nothing created in the last 48 hours.</p>
        <ul v-else class="alert-list">
          <li v-for="task in newItems" :key="`${task.source}-${task.id}`" class="alert-card">
            <span class="badge badge--new">{{ agoLabel(task.created_at) }}</span>
            <div class="alert-body">
              <p class="title">{{ task.title }}</p>
              <p class="assignee">Assigned to {{ task.profiles?.name ?? 'Unassigned' }}</p>
            </div>
          </li>
        </ul>
      </section>
    </template>
  </template>
</template>

<style scoped>
.header-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 1rem;
}

.header-row h2 {
  margin: 0;
}

.overdue-count-badge {
  background: #b3261e;
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  padding: 2px 10px;
  border-radius: 999px;
}

.alert-section {
  margin-bottom: 24px;
}

.alert-section h3 {
  margin: 0 0 10px;
  font-size: 15px;
  color: #2d3142;
}

.empty {
  color: #8a8a85;
  font-size: 13px;
}

.alert-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.alert-card {
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

.badge--overdue {
  background: #fbdede;
  color: #b3261e;
}

.badge--new {
  background: #faeeda;
  color: #854f0b;
}

.alert-body {
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

.error {
  color: #b3261e;
}

.access-denied {
  margin: 0;
  color: #b3261e;
  font-weight: 600;
}
</style>
