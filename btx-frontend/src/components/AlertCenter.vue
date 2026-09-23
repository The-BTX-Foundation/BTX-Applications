<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useMergedTasks } from '@/composables/useMergedTasks'

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

// Matches the donor_impact/ProgramImpact.vue convention: admin, board, and
// reviewer can all view; applicant cannot.
const canView = computed(() => authStore.isAdmin || authStore.isBoard || authStore.isReviewer)

onMounted(() => {
  authStore.init()
})

// Maps each row's `source` tag to the store that actually owns it, so the
// checkmark button calls the correct table's markComplete instead of being
// hardcoded to one store. Same routing pattern TasksAlertsList.vue already
// ships with, reused verbatim here against the same normalized id/source
// shape useMergedTasks produces.
const storesBySource = {
  tasks_alerts: tasksAlertsStore,
  marketing_tasks: marketingTasksStore,
  budgeting_tasks: budgetingTasksStore,
  fundraising_tasks: fundraisingTasksStore,
}

// Display label per source, used for both the domain filter pills and each
// card's domain pill.
const DOMAIN_LABELS = {
  tasks_alerts: 'Task & Approval',
  marketing_tasks: 'Marketing',
  budgeting_tasks: 'Budgeting',
  fundraising_tasks: 'Fundraising',
}

const DOMAIN_ORDER = ['tasks_alerts', 'marketing_tasks', 'budgeting_tasks', 'fundraising_tasks']

// Overdue: date has passed and the row hasn't been resolved. `date` on every
// source table has no time-of-day component (folded into a single field by
// useMergedTasks' normalize()), so this compares at day granularity -- a row
// is overdue starting the moment today's calendar day begins.
const overdueItems = computed(() => {
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  return allTasks.value.filter(
    (task) => new Date(task.date) < startOfToday && task.status !== 'Complete' && task.status !== 'Declined',
  )
})

// Whole calendar days between a due date and today, for both the "{n}d
// overdue" pill and the Critical/Needs Attention bucket split below.
function daysOverdue(date) {
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const due = new Date(date)
  due.setHours(0, 0, 0, 0)
  return Math.floor((startOfToday - due) / (24 * 60 * 60 * 1000))
}

function overdueLabel(date) {
  return `${daysOverdue(date)}d overdue`
}

// Domain filter: "All" plus one pill per domain that actually has an
// overdue item right now -- a domain with zero overdue items isn't offered
// as a filter at all.
const selectedDomain = ref('all')

const availableDomains = computed(() => {
  const present = new Set(overdueItems.value.map((task) => task.source))
  return DOMAIN_ORDER.filter((source) => present.has(source))
})

// Resets truncation whenever the domain filter changes, so switching
// filters always starts from the default collapsed view instead of keeping
// a stale "expanded" state from a different filter's longer list.
function selectDomain(domain) {
  selectedDomain.value = domain
  expanded.value = false
}

const domainFilteredOverdue = computed(() =>
  selectedDomain.value === 'all' ? overdueItems.value : overdueItems.value.filter((task) => task.source === selectedDomain.value),
)

// Critical = 30+ days overdue, Needs Attention = 1-29 days overdue. Both
// inherit oldest-first ordering from allTasks' own ascending date sort
// (carried through overdueItems/domainFilteredOverdue), so no extra sort is
// needed here.
const criticalItems = computed(() => domainFilteredOverdue.value.filter((task) => daysOverdue(task.date) >= 30))
const needsAttentionItems = computed(() => domainFilteredOverdue.value.filter((task) => daysOverdue(task.date) < 30))

// Default truncation: show every Critical item, then enough Needs Attention
// items to bring the combined visible total to 8 -- never truncates
// Critical itself, and clamps at 0 rather than going negative when Critical
// alone already exceeds 8.
const DEFAULT_VISIBLE_TOTAL = 8
const expanded = ref(false)

const visibleNeedsAttentionItems = computed(() => {
  if (expanded.value) return needsAttentionItems.value
  const remainingSlots = Math.max(0, DEFAULT_VISIBLE_TOTAL - criticalItems.value.length)
  return needsAttentionItems.value.slice(0, remainingSlots)
})

const hiddenCount = computed(() => needsAttentionItems.value.length - visibleNeedsAttentionItems.value.length)

function showMore() {
  expanded.value = true
}

// Tracks which row has a mark-complete request in flight, so only that
// row's button shows a disabled/pending state rather than locking the whole
// list.
const pendingTaskKey = ref(null)

// Per-row error message, keyed the same way, so a failed update (e.g. RLS
// rejects it because the row was reassigned after the page loaded) shows
// beside that one card instead of blanking the list.
const actionErrors = ref({})

function taskKey(task) {
  return `${task.source}-${task.id}`
}

// Marks one row complete by routing to whichever store actually owns its
// source table -- see storesBySource above. The row disappears from
// overdueItems on success purely because its status leaves Open/Approved,
// no manual list splice needed.
async function handleMarkComplete(task) {
  const key = taskKey(task)
  pendingTaskKey.value = key
  const { success, message } = await storesBySource[task.source].markComplete(task.id)
  if (!success) {
    actionErrors.value = { ...actionErrors.value, [key]: message ?? 'Could not mark this item complete.' }
  } else if (actionErrors.value[key]) {
    const next = { ...actionErrors.value }
    delete next[key]
    actionErrors.value = next
  }
  pendingTaskKey.value = null
}

// Keeps the visible list well-formed after a domain filter change even if a
// mark-complete request from a since-hidden card was still in flight.
watch(selectedDomain, () => {
  actionErrors.value = {}
})
</script>

<template>
  <h2 v-if="!authStore.session">Sign in</h2>
  <p v-else-if="!canView" class="access-denied">Access Denied</p>

  <section v-else class="alert-center">
    <div class="header-row">
      <h1 class="page-title" data-page-heading>Alert Center</h1>
      <span class="overdue-count-badge">{{ overdueItems.length }}</span>
    </div>
    <p class="subline">Everything overdue, oldest first.</p>

    <p v-if="anyLoading" class="empty">Loading alerts…</p>
    <p v-else-if="firstError" class="page-error">{{ firstError }}</p>

    <template v-else>
      <!-- Domain filter row: hidden-scrollbar horizontal strip, same
           convention as other redesigned pages' pill/series rows. -->
      <div v-if="availableDomains.length > 0" class="domain-filter-row">
        <button
          type="button"
          class="domain-pill"
          :class="{ 'domain-pill--active': selectedDomain === 'all' }"
          @click="selectDomain('all')"
        >
          All
        </button>
        <button
          v-for="domain in availableDomains"
          :key="domain"
          type="button"
          class="domain-pill"
          :class="{ 'domain-pill--active': selectedDomain === domain }"
          @click="selectDomain(domain)"
        >
          {{ DOMAIN_LABELS[domain] }}
        </button>
      </div>

      <p v-if="overdueItems.length === 0" class="empty">Nothing overdue.</p>

      <template v-else>
        <div class="section-heading-row">
          <span class="section-dot"></span>
          <h2 class="section-heading">Critical &middot; 30+ days overdue</h2>
          <span class="section-count">{{ criticalItems.length }}</span>
        </div>
        <p v-if="criticalItems.length === 0" class="empty">Nothing critical right now.</p>
        <ul v-else class="alert-list">
          <li v-for="task in criticalItems" :key="taskKey(task)" class="alert-card">
            <div class="alert-card-body">
              <div class="alert-card-top">
                <span class="badge badge--overdue">{{ overdueLabel(task.date) }}</span>
                <span class="badge badge--domain">{{ DOMAIN_LABELS[task.source] }}</span>
              </div>
              <p class="title">{{ task.title }}</p>
              <p class="assignee">Assigned to {{ task.profiles?.name ?? 'Unassigned' }}</p>
              <p v-if="actionErrors[taskKey(task)]" class="row-error">{{ actionErrors[taskKey(task)] }}</p>
            </div>
            <button
              type="button"
              class="check-btn"
              :disabled="pendingTaskKey === taskKey(task)"
              title="Mark complete"
              aria-label="Mark complete"
              @click="handleMarkComplete(task)"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </button>
          </li>
        </ul>

        <div class="section-heading-row section-heading-row--spaced">
          <span class="section-dot"></span>
          <h2 class="section-heading">Needs attention &middot; under 30 days</h2>
          <span class="section-count">{{ needsAttentionItems.length }}</span>
        </div>
        <p v-if="needsAttentionItems.length === 0" class="empty">Nothing else needs attention.</p>
        <ul v-else class="alert-list">
          <li v-for="task in visibleNeedsAttentionItems" :key="taskKey(task)" class="alert-card">
            <div class="alert-card-body">
              <div class="alert-card-top">
                <span class="badge badge--overdue">{{ overdueLabel(task.date) }}</span>
                <span class="badge badge--domain">{{ DOMAIN_LABELS[task.source] }}</span>
              </div>
              <p class="title">{{ task.title }}</p>
              <p class="assignee">Assigned to {{ task.profiles?.name ?? 'Unassigned' }}</p>
              <p v-if="actionErrors[taskKey(task)]" class="row-error">{{ actionErrors[taskKey(task)] }}</p>
            </div>
            <button
              type="button"
              class="check-btn"
              :disabled="pendingTaskKey === taskKey(task)"
              title="Mark complete"
              aria-label="Mark complete"
              @click="handleMarkComplete(task)"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </button>
          </li>
        </ul>

        <button v-if="hiddenCount > 0" type="button" class="show-more-btn" @click="showMore">
          View {{ hiddenCount }} more overdue items &rarr;
        </button>
      </template>
    </template>

    <p class="footer">BTX Ops Hub &middot; Alert Center</p>
  </section>
</template>

<style scoped>
.alert-center {
  max-width: 640px;
  margin: 0 auto;
  font-family: inherit;
}

.header-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.page-title {
  margin: 0;
  font-size: 28px;
  font-weight: 700;
  line-height: 1.15;
  color: var(--color-header-strong);
}

.overdue-count-badge {
  background: #b3261e;
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  padding: 2px 10px;
  border-radius: 999px;
}

.subline {
  margin: 8px 0 0;
  max-width: 300px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--color-header-muted);
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

/* Hidden-scrollbar horizontal strip, same convention as other redesigned
   pages' pill/series rows (e.g. FundraisingHealth.vue's series-picker). */
.domain-filter-row {
  margin-top: 18px;
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

.section-heading-row {
  margin-top: 22px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.section-heading-row--spaced {
  margin-top: 28px;
}

.section-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--color-danger-badge-text);
  flex-shrink: 0;
}

.section-heading {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  color: var(--color-header-strong);
}

.section-count {
  margin-left: auto;
  font-size: 13px;
  color: var(--color-header-muted);
}

.alert-list {
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.alert-card {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-left: 3px solid var(--color-danger-badge-text);
  border-radius: 14px;
  padding: 12px 14px;
}

.alert-card-body {
  flex: 1;
  min-width: 0;
}

.alert-card-top {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.badge {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 600;
  padding: 3px 9px;
  border-radius: 999px;
  white-space: nowrap;
}

.badge--overdue {
  background: var(--color-danger-badge-bg);
  color: var(--color-danger-badge-text);
}

.badge--domain {
  background: var(--color-neutral-badge-bg);
  color: var(--color-neutral-badge-text);
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

.check-btn {
  flex-shrink: 0;
  align-self: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  border: 1px solid var(--color-border);
  background: var(--color-success-badge-bg);
  color: var(--color-success-badge-text);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.check-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.show-more-btn {
  margin-top: 14px;
  width: 100%;
  background: none;
  border: none;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-accent);
  cursor: pointer;
  font-family: inherit;
  padding: 4px 0;
  text-align: center;
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
