<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useTasksAlertsStore } from '@/stores/tasksAlerts'

const authStore = useAuthStore()
const tasksAlertsStore = useTasksAlertsStore()

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Space left below the grid so it doesn't run flush to the bottom of the
// viewport — matches the page/panel's existing 32px padding rhythm. Same
// value and reasoning as Marketing Calendar.
const BOTTOM_MARGIN = 32

// Template ref for the grid element itself, needed to measure how far down
// the page it starts.
const gridRef = ref(null)

// Explicit pixel height applied to the grid so its 6 rows (via
// grid-auto-rows: 1fr in the template) fill almost all remaining vertical
// space instead of sizing themselves from a fixed aspect-ratio.
const gridHeight = ref(null)

// Recomputes gridHeight from the grid's current position — see
// MarketingCalendar.vue's identical function for why .panel's/.page's own
// bottom padding has to be subtracted too, not just this component's own
// margin: both sit structurally below the grid and would otherwise push
// the whole page taller than the viewport regardless of the grid's height.
function updateGridHeight() {
  if (!gridRef.value) return
  const top = gridRef.value.getBoundingClientRect().top
  const panelEl = gridRef.value.closest('.panel')
  const pageEl = panelEl?.closest('.page')
  const panelBottomPadding = panelEl ? parseFloat(getComputedStyle(panelEl).paddingBottom) : 0
  const pageBottomPadding = pageEl ? parseFloat(getComputedStyle(pageEl).paddingBottom) : 0
  gridHeight.value = window.innerHeight - top - panelBottomPadding - pageBottomPadding - BOTTOM_MARGIN
}

// Which month is being viewed, defaulting to the real current month on
// load.
const today = new Date()
const viewedYear = ref(today.getFullYear())
const viewedMonth = ref(today.getMonth())

// Which day's modal is open, keyed by its 'YYYY-MM-DD' date string, or null
// if no modal is open.
const selectedDayKey = ref(null)

onMounted(() => {
  authStore.init()
  updateGridHeight()
  window.addEventListener('resize', updateGridHeight)
})

onUnmounted(() => {
  window.removeEventListener('resize', updateGridHeight)
})

// Re-measures once the grid actually appears in the DOM after a load
// finishes — see MarketingCalendar.vue's identical watcher for why
// onMounted's own call isn't enough (fetchTasks sets loading synchronously
// during setup, before the grid's first real render).
watch(
  () => tasksAlertsStore.loading,
  (isLoading) => {
    if (!isLoading) {
      nextTick(updateGridHeight)
    }
  },
)

// Refetch whenever the signed-in user changes (sign in, sign out, switch
// accounts) — same pattern as Marketing Calendar. Calendar is read-only so
// it only ever needs fetchTasks(), never the write methods.
watch(
  () => authStore.session?.user?.id ?? null,
  (userId) => {
    if (userId) {
      tasksAlertsStore.fetchTasks()
    }
  },
  { immediate: true },
)

// Zero-pads a number to 2 digits, e.g. 5 -> "05".
function pad(n) {
  return String(n).padStart(2, '0')
}

// Formats a Date as the 'YYYY-MM-DD' string Postgres' `date` type returns
// via PostgREST, so it can be used as a lookup key against task.due_date.
function dateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

// Declined items must never render anywhere on the calendar, not even
// muted — every computed below derives only from this filtered list, same
// as Marketing Calendar's visibleTasks. Complete rows do show.
const visibleTasks = computed(() => tasksAlertsStore.tasks.filter((task) => task.status !== 'Declined'))

// Groups visible tasks by due date for O(1) lookup per grid cell.
// tasks_alerts uses due_date, not the `date` column name
// marketing_tasks/budgeting_tasks/fundraising_tasks all share.
const entriesByDate = computed(() => {
  const map = {}
  for (const task of visibleTasks.value) {
    if (!map[task.due_date]) map[task.due_date] = []
    map[task.due_date].push(task)
  }
  return map
})

// Builds a fixed 6-row (42-day) grid for the viewed month, starting on the
// Sunday on/before the 1st so the weekday columns line up. Same approach as
// Marketing Calendar, for the same reason: a fixed row count keeps the
// grid the same height every month.
const calendarDays = computed(() => {
  const firstOfMonth = new Date(viewedYear.value, viewedMonth.value, 1)
  const gridStart = new Date(viewedYear.value, viewedMonth.value, 1 - firstOfMonth.getDay())

  const days = []
  for (let i = 0; i < 42; i++) {
    const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i)
    const key = dateKey(date)
    days.push({
      key,
      dayNumber: date.getDate(),
      isCurrentMonth: date.getMonth() === viewedMonth.value,
      entries: entriesByDate.value[key] ?? [],
    })
  }
  return days
})

// Label for the month navigation header, e.g. "August 2026".
const monthLabel = computed(() =>
  new Date(viewedYear.value, viewedMonth.value, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  }),
)

// Moves the viewed month back one, letting the Date constructor handle
// year rollover rather than hand-rolled modulo math.
function goToPreviousMonth() {
  const previous = new Date(viewedYear.value, viewedMonth.value - 1, 1)
  viewedYear.value = previous.getFullYear()
  viewedMonth.value = previous.getMonth()
}

// Moves the viewed month forward one, same rollover handling as above.
function goToNextMonth() {
  const next = new Date(viewedYear.value, viewedMonth.value + 1, 1)
  viewedYear.value = next.getFullYear()
  viewedMonth.value = next.getMonth()
}

// Opens the day modal for current-month days with entries. Leading/
// trailing days are deliberately never interactive, even if they happen to
// have entries themselves: they're shown only for grid continuity, and the
// same day is properly clickable once the user navigates to its real month.
function handleDayClick(day) {
  if (day.isCurrentMonth && day.entries.length > 0) {
    selectedDayKey.value = day.key
  }
}

function closeDayModal() {
  selectedDayKey.value = null
}

// Entries for the currently open day modal, or an empty array if none is
// open.
const selectedDayEntries = computed(() => entriesByDate.value[selectedDayKey.value] ?? [])

// Formats a task's due date as a relative label ("Due today"/"Due
// tomorrow") for near-term dates, falling back to a short calendar date
// otherwise — same relative-date logic as TasksAlertsList.vue's dueLabel,
// adapted to read due_date directly since this page works with raw
// tasks_alerts rows, not that component's normalized/merged shape. Parses
// the Y/M/D components directly rather than `new Date(dateStr)`: the
// latter treats a bare 'YYYY-MM-DD' string as UTC midnight per the ISO
// 8601 spec, which then renders a day early in any timezone behind UTC —
// this modal's own heading (built from the same dateKey() used for grid
// placement) doesn't have that bug, so the badge disagreeing with the
// heading it sits next to would be a visible, confusing inconsistency.
function dueLabel(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number)
  const due = new Date(year, month - 1, day)
  const todayDate = new Date()
  todayDate.setHours(0, 0, 0, 0)

  const diffDays = Math.round((due - todayDate) / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'Due today'
  if (diffDays === 1) return 'Due tomorrow'
  return due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// Builds a task's due-date badge text/variant for the day modal — same
// logic as TasksAlertsList.vue's badge(). Overdue status always wins
// regardless of date math (a row can be marked Overdue without its
// due_date having actually passed), near-term dates get the amber
// treatment, everything else is a neutral date pill.
function badgeFor(task) {
  if (task.status === 'Overdue') {
    return { text: 'Overdue', variant: 'overdue' }
  }

  const label = dueLabel(task.due_date)
  const variant = label === 'Due today' || label === 'Due tomorrow' ? 'amber' : 'default'
  return { text: label, variant }
}
</script>

<template>
  <section class="event-calendar">
    <!-- Signed-out visitors never reach this page (see the router guard),
         but kept for parity with Marketing Calendar's structure. -->
    <h2 v-if="!authStore.session">Sign in</h2>

    <p v-else-if="authStore.role === 'applicant'" class="access-denied">Access Denied</p>

    <template v-else>
      <div class="header-row">
        <h2>Event Calendar</h2>
      </div>

      <div class="month-nav">
        <button type="button" class="nav-btn" @click="goToPreviousMonth">&larr; Prev</button>
        <span class="month-label">{{ monthLabel }}</span>
        <button type="button" class="nav-btn" @click="goToNextMonth">Next &rarr;</button>
      </div>

      <p v-if="tasksAlertsStore.loading">Loading calendar…</p>
      <p v-else-if="tasksAlertsStore.error" class="error">{{ tasksAlertsStore.error }}</p>

      <template v-else>
        <!-- Wraps the header row and grid together (no width cap of its
             own — fills whatever the panel gives it) so weekday labels stay
             column-aligned with the cells beneath them. -->
        <div class="calendar-frame">
          <div class="weekday-row">
            <span v-for="label in WEEKDAY_LABELS" :key="label" class="weekday-label">{{ label }}</span>
          </div>

          <div ref="gridRef" class="calendar-grid" :style="gridHeight ? { height: `${gridHeight}px` } : {}">
            <button
              v-for="day in calendarDays"
              :key="day.key"
              type="button"
              class="day-cell"
              :class="{
                'day-cell--muted': !day.isCurrentMonth,
                'day-cell--clickable': day.isCurrentMonth && day.entries.length > 0,
              }"
              :disabled="!day.isCurrentMonth || day.entries.length === 0"
              @click="handleDayClick(day)"
            >
              <span class="day-number">{{ day.dayNumber }}</span>
              <span v-if="day.entries.length > 0" class="day-count">{{ day.entries.length }}</span>
            </button>
          </div>
        </div>
      </template>

      <!-- Day modal: title + due-date badge (the same pill style
           TasksAlertsList.vue uses) — there's no type field on tasks_alerts
           to fill a second visual slot the way Marketing's colored type
           label does, so due-date urgency fills it instead. Read-only, no
           action buttons — creation/status changes only happen via
           Task & Approval. -->
      <div v-if="selectedDayKey" class="overlay" @click.self="closeDayModal">
        <div class="modal">
          <h3 class="modal-heading">{{ selectedDayKey }}</h3>
          <ul class="entry-list">
            <li v-for="entry in selectedDayEntries" :key="entry.task_id" class="entry-row">
              <span class="entry-title">{{ entry.title }}</span>
              <span class="badge" :class="`badge--${badgeFor(entry).variant}`">{{ badgeFor(entry).text }}</span>
            </li>
          </ul>
          <button type="button" class="btn btn--outline" @click="closeDayModal">Close</button>
        </div>
      </div>
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

.month-nav {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
  margin-bottom: 20px;
}

.month-label {
  font-size: 16px;
  font-weight: 600;
  color: #2d3142;
  min-width: 160px;
  text-align: center;
}

.nav-btn {
  background: #fff;
  border: 1px solid #d8d6cf;
  border-radius: 8px;
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 500;
  color: #2d3142;
  cursor: pointer;
}

/* No width cap — fills the panel's actual available width instead of
   being capped at a fixed pixel value regardless of viewport size. */
.calendar-frame {
  width: 100%;
}

.weekday-row {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  margin-bottom: 8px;
}

.weekday-label {
  text-align: center;
  font-size: 12px;
  font-weight: 600;
  color: #8a8a85;
}

/* Same hairline-via-gap-background technique as Marketing Calendar. */
.calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  grid-auto-rows: 1fr;
  gap: 1px;
  background: #ececec;
  overflow: hidden;
}

.day-cell {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  background: #fff;
  border-radius: 4px;
  padding: 4px 5px;
  font-family: inherit;
  cursor: default;
}

.day-cell--muted {
  background: #f7f6f3;
  color: #b5b3ac;
}

.day-cell--clickable {
  cursor: pointer;
}

.day-cell--clickable:hover {
  outline: 1px solid #c9932a;
  outline-offset: -1px;
}

.day-number {
  font-size: 12px;
  font-weight: 500;
  color: inherit;
}

.day-count {
  position: absolute;
  top: 3px;
  right: 3px;
  background: #c9932a;
  color: #fff;
  font-size: 9px;
  border-radius: 8px;
  padding: 1px 5px;
}

.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.modal {
  width: 100%;
  max-width: 360px;
  background: #fff;
  border-radius: 12px;
  padding: 24px;
  color: #2d3142;
}

.modal-heading {
  margin: 0 0 16px;
  font-size: 15px;
  font-weight: 600;
  color: #8a8a85;
}

.entry-list {
  list-style: none;
  padding: 0;
  margin: 0 0 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.entry-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.entry-title {
  font-size: 14px;
  font-weight: 500;
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

.btn {
  font-size: 13px;
  font-weight: 500;
  padding: 8px 16px;
  border-radius: 8px;
  cursor: pointer;
}

.btn--outline {
  background: #fff;
  color: #2d3142;
  border: 1px solid #d8d6cf;
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
