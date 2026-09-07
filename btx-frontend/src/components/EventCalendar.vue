<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useTasksAlertsStore } from '@/stores/tasksAlerts'
import { useEventTrackerEventsStore } from '@/stores/eventTrackerEvents'

const authStore = useAuthStore()
const tasksAlertsStore = useTasksAlertsStore()
const eventTrackerEventsStore = useEventTrackerEventsStore()

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Max number of entries (events + tasks combined) shown directly in a day
// cell before the rest collapse into a "+N more" indicator -- matches
// Apple Calendar's own small-month-cell behavior, and fits this grid's
// tight cell padding better than trying to shrink text indefinitely.
const DAY_CELL_ENTRY_CAP = 3

// Curated pastel-background/dark-text pairs for event_tracker_events
// category chips, in the fixed order they're assigned (see categoryColors
// below) -- not random/hashed colors, so the same set of categories always
// renders the same way. Amber (#faeeda/#854f0b) and red (#fbdede/#b3261e)
// are deliberately left out of this palette even though they'd otherwise
// fit the same pastel-bg/dark-text formula as the rest: those two hues are
// reserved for task-urgency signaling elsewhere in this component (the
// due-today/due-tomorrow badge and the overdue badge, and the matching dot
// color on task entries in the grid -- see taskDotColor below). If a
// category chip could also render amber or red, it would visually collide
// with "this task is due soon/overdue," a meaning categories don't carry.
const CATEGORY_PALETTE = [
  { bg: '#e3edfb', text: '#1d4ed8' }, // blue
  { bg: '#e2f3e6', text: '#1e6b3a' }, // green
  { bg: '#f0e7fb', text: '#6b21a8' }, // purple
  { bg: '#e0f5f3', text: '#0f766e' }, // teal
  { bg: '#fce7f3', text: '#9d174d' }, // pink
  { bg: '#e6e9fc', text: '#3730a3' }, // indigo
  { bg: '#fde8d7', text: '#9a3412' }, // orange
  { bg: '#eef7d9', text: '#4d7c0f' }, // lime
  { bg: '#dff5fb', text: '#0e7490' }, // cyan
  { bg: '#eceef1', text: '#334155' }, // slate
  { bg: '#f0e6db', text: '#7c4a1e' }, // brown
  { bg: '#fdf6d8', text: '#92720a' }, // yellow
  { bg: '#ece4fb', text: '#5b21b6' }, // violet
  { bg: '#f7e2e6', text: '#8a2846' }, // maroon
  { bg: '#e4edf0', text: '#2b5566' }, // steel
  { bg: '#eef0d9', text: '#5c5f1f' }, // olive
]

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

// True while either source is still loading -- the grid waits for both
// tasks_alerts and event_tracker_events before rendering, same as
// AlertCenter's anyLoading over its four sources.
const anyLoading = computed(() => tasksAlertsStore.loading || eventTrackerEventsStore.loading)

// The first load error found across the two sources, or null if neither
// failed.
const firstError = computed(() => tasksAlertsStore.error ?? eventTrackerEventsStore.error)

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
watch(anyLoading, (isLoading) => {
  if (!isLoading) {
    nextTick(updateGridHeight)
  }
})

// Refetch both sources whenever the signed-in user changes (sign in, sign
// out, switch accounts) — same pattern as Marketing Calendar. Calendar is
// read-only so it only ever needs the two fetches, never any write method.
watch(
  () => authStore.session?.user?.id ?? null,
  (userId) => {
    if (userId) {
      tasksAlertsStore.fetchTasks()
      eventTrackerEventsStore.fetchEvents()
    }
  },
  { immediate: true },
)

// Zero-pads a number to 2 digits, e.g. 5 -> "05".
function pad(n) {
  return String(n).padStart(2, '0')
}

// Formats a Date as the 'YYYY-MM-DD' string Postgres' `date` type returns
// via PostgREST, so it can be used as a lookup key against task.due_date
// and event.event_date alike.
function dateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

// Declined items must never render anywhere on the calendar, not even
// muted — every computed below derives only from this filtered list, same
// as Marketing Calendar's visibleTasks. Complete rows do show.
const visibleTasks = computed(() => tasksAlertsStore.tasks.filter((task) => task.status !== 'Declined'))

// Groups both sources by date for O(1) lookup per grid cell. Events are
// pushed first and tasks second so that, wherever this merged array is
// consumed (cell cap slicing below, and the day modal), category chips —
// the actual point of this build — always sort ahead of task/alert rows on
// a busy day rather than getting pushed out by them. Each entry keeps its
// original columns (task_id/due_date/status/... or id/event_date/category/
// event_name) plus a `source` tag and a globally-unique `key` for v-for,
// since task_id and event id are drawn from different tables and could
// otherwise collide.
const entriesByDate = computed(() => {
  const map = {}
  for (const event of eventTrackerEventsStore.events) {
    if (!map[event.event_date]) map[event.event_date] = []
    map[event.event_date].push({ source: 'event', key: `event-${event.id}`, ...event })
  }
  for (const task of visibleTasks.value) {
    if (!map[task.due_date]) map[task.due_date] = []
    map[task.due_date].push({ source: 'task', key: `task-${task.task_id}`, ...task })
  }
  return map
})

// Assigns each distinct category a color from CATEGORY_PALETTE in
// alphabetical order -- deterministic and not random/hashed, so a given
// set of categories always renders the same way. This is recomputed from
// whatever categories are actually present each time the underlying data
// changes, which has one honest tradeoff worth flagging: because the
// order is "alphabetical over the current set" rather than "permanently
// pinned per category," inserting a brand-new category that sorts earlier
// than existing ones shifts every category after it to the next palette
// slot, changing colors that were previously assigned. That's accepted
// here as the cost of a deterministic, human-predictable order instead of a
// hash (which would avoid the shift but risks two categories landing on
// the same or a visually clashing color). Category churn in this table is
// low (synced periodically from a spreadsheet, not live-edited), so the
// tradeoff favors predictability. Beyond CATEGORY_PALETTE.length distinct
// categories, colors cycle and repeat.
const categoryColors = computed(() => {
  const categories = [...new Set(eventTrackerEventsStore.events.map((event) => event.category))].sort((a, b) =>
    a.localeCompare(b),
  )
  const map = {}
  categories.forEach((category, index) => {
    map[category] = CATEGORY_PALETTE[index % CATEGORY_PALETTE.length]
  })
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
    const entries = entriesByDate.value[key] ?? []
    days.push({
      key,
      dayNumber: date.getDate(),
      isCurrentMonth: date.getMonth() === viewedMonth.value,
      entries,
      // Events-then-tasks order is already guaranteed by entriesByDate, so
      // slicing the first DAY_CELL_ENTRY_CAP here keeps chips visible ahead
      // of task rows on a busy day.
      visibleEntries: entries.slice(0, DAY_CELL_ENTRY_CAP),
      overflowCount: Math.max(entries.length - DAY_CELL_ENTRY_CAP, 0),
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

// Full (uncapped) entries for the currently open day modal, or an empty
// array if none is open -- unlike the grid cell, the modal has room to show
// every item for the day, not just the first DAY_CELL_ENTRY_CAP.
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
// event_tracker_events' event_date never runs through this function (there
// is no due-soon concept for a calendar event), but any future date math
// added for it must follow this same split-then-construct-local pattern
// rather than ever calling `new Date(dateStr)` directly.
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

// Picks the small status dot color shown next to a task/alert entry in the
// grid (never a category entry -- those get a solid palette chip instead).
// Reuses the exact same urgency colors as the modal's badge classes
// (.badge--overdue/.badge--amber/.badge--default) instead of introducing a
// separate color scale, so the dot and the badge always agree about a
// given task's urgency.
function taskDotColor(task) {
  const variant = badgeFor(task).variant
  if (variant === 'overdue') return '#b3261e'
  if (variant === 'amber') return '#c9932a'
  return '#8a8a85'
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

      <p v-if="anyLoading">Loading calendar…</p>
      <p v-else-if="firstError" class="error">{{ firstError }}</p>

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

              <!-- Apple-Calendar-style entries: category events render as
                   solid colored chips, tasks/alerts render as plain text
                   with a small urgency dot -- no separate legend, the chips
                   and text are the legend. -->
              <div v-if="day.visibleEntries.length > 0" class="day-entries">
                <span
                  v-for="entry in day.visibleEntries"
                  :key="entry.key"
                  class="day-entry"
                  :class="entry.source === 'event' ? 'day-entry--event' : 'day-entry--task'"
                  :style="
                    entry.source === 'event'
                      ? { background: categoryColors[entry.category]?.bg, color: categoryColors[entry.category]?.text }
                      : {}
                  "
                >
                  <span v-if="entry.source === 'task'" class="task-dot" :style="{ background: taskDotColor(entry) }" />
                  {{ entry.source === 'event' ? entry.category : entry.title }}
                </span>
                <span v-if="day.overflowCount > 0" class="day-entry day-entry--overflow"
                  >+{{ day.overflowCount }} more</span
                >
              </div>
            </button>
          </div>
        </div>
      </template>

      <!-- Day modal: full details for both sources, not the truncated grid
           chip text. Event rows show the full category chip plus the full
           event_name; task/alert rows keep the existing title + due-date
           badge pairing. Read-only, no action buttons — creation/status
           changes only happen via Task & Approval. -->
      <div v-if="selectedDayKey" class="overlay" @click.self="closeDayModal">
        <div class="modal">
          <h3 class="modal-heading">{{ selectedDayKey }}</h3>
          <ul class="entry-list">
            <li v-for="entry in selectedDayEntries" :key="entry.key" class="entry-row">
              <template v-if="entry.source === 'event'">
                <span
                  class="entry-chip"
                  :style="{ background: categoryColors[entry.category]?.bg, color: categoryColors[entry.category]?.text }"
                  >{{ entry.category }}</span
                >
                <span class="entry-title">{{ entry.event_name }}</span>
              </template>
              <template v-else>
                <span class="entry-title">{{ entry.title }}</span>
                <span class="badge" :class="`badge--${badgeFor(entry).variant}`">{{ badgeFor(entry).text }}</span>
              </template>
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
  overflow: hidden;
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
  flex-shrink: 0;
}

/* Holds the capped list of chip/text rows plus the optional overflow
   indicator, stacked below the day number. */
.day-entries {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  margin-top: 2px;
}

.day-entry {
  display: block;
  width: 100%;
  font-size: 10px;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Category events: solid pastel chip, the color coming from
   categoryColors via inline style. */
.day-entry--event {
  border-radius: 4px;
  padding: 1px 4px;
  font-weight: 600;
}

/* Tasks/alerts: plain text (no background), distinguished from category
   chips by shape rather than just color -- a small colored dot stands in
   for the badge's urgency color at this size. */
.day-entry--task {
  display: flex;
  align-items: center;
  gap: 4px;
  color: #4a4a46;
}

.task-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  flex-shrink: 0;
}

.day-entry--overflow {
  color: #8a8a85;
  font-weight: 500;
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
  gap: 12px;
}

.entry-title {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
}

.entry-chip {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 999px;
  white-space: nowrap;
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
