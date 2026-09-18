<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useMarketingTasksStore } from '@/stores/marketingTasks'
import { MARKETING_TASK_TYPE_COLORS } from '@/lib/marketingTaskTypes'

const authStore = useAuthStore()
const marketingTasksStore = useMarketingTasksStore()

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Space left below the grid so it doesn't run flush to the bottom of the
// viewport — matches the page/panel's existing 32px padding rhythm.
const BOTTOM_MARGIN = 32

// Template ref for the grid element itself, needed to measure how far down
// the page it starts (title, nav row, weekday header, and their margins/
// padding all push this down by a different amount depending on viewport
// width, so it can't be hardcoded).
const gridRef = ref(null)

// Explicit pixel height applied to the grid so its 6 rows (via
// grid-auto-rows: 1fr in the template) fill almost all remaining vertical
// space instead of sizing themselves from a fixed aspect-ratio. Null until
// the first measurement runs, so the grid falls back to its natural height
// for the one frame before mount.
const gridHeight = ref(null)

// Recomputes gridHeight from the grid's current position — window height
// minus how far down the page the grid starts, minus the bottom margin,
// minus .panel's and .page's own bottom padding. Those two paddings sit
// structurally below the grid (inside .panel, then inside .page) and would
// otherwise push the whole page 64px taller than the viewport regardless
// of what height is set here, since neither ancestor clips or caps its own
// height — that's exactly what produced a genuine page-level scrollbar
// during testing. Measured at runtime via getComputedStyle rather than
// hardcoded, since this component doesn't own HomeView.vue's layout and
// shouldn't assume its padding values won't change. Called on mount and on
// resize, since the grid's start position shifts whenever the viewport
// width changes how the content above it wraps.
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
// load. Kept as separate year/month refs (rather than a single Date ref)
// so navigation can read/write them directly without reconstructing a Date
// each time a template expression touches them.
const today = new Date()
const viewedYear = ref(today.getFullYear())
const viewedMonth = ref(today.getMonth())

// Which day's modal is open, keyed by its 'YYYY-MM-DD' date string, or null
// if no modal is open. Only ever set for current-month days with at least
// one entry (see handleDayClick) — leading/trailing days and empty days
// never reach this state.
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
// finishes. fetchTasks() sets `loading` to true synchronously as soon as
// it's called — which, via the immediate watcher below, happens during
// setup, before the component's first render — so on a typical page load
// the grid doesn't exist yet when onMounted's updateGridHeight() call
// runs. nextTick waits for Vue to actually patch the DOM with the
// now-visible grid before measuring it.
watch(
  () => marketingTasksStore.loading,
  (isLoading) => {
    if (!isLoading) {
      nextTick(updateGridHeight)
    }
  },
)

// Refetch whenever the signed-in user changes (sign in, sign out, switch
// accounts) — same pattern as MarketingTasksList.vue. Calendar is read-only
// so it only ever needs fetchTasks(), never the write methods.
watch(
  () => authStore.session?.user?.id ?? null,
  (userId) => {
    if (userId) {
      marketingTasksStore.fetchTasks()
    }
  },
  { immediate: true },
)

// Zero-pads a number to 2 digits, e.g. 5 -> "05".
function pad(n) {
  return String(n).padStart(2, '0')
}

// Formats a Date as the 'YYYY-MM-DD' string Postgres' `date` type returns
// via PostgREST, so it can be used as a lookup key against task.date.
function dateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

// Declined items must never render anywhere on the calendar, not even
// muted — every other computed below derives only from this filtered list,
// so a Declined row structurally cannot reach the grid or the day modal.
const visibleTasks = computed(() => marketingTasksStore.tasks.filter((task) => task.status !== 'Declined'))

// Groups visible tasks by their date string for O(1) lookup per grid cell.
const entriesByDate = computed(() => {
  const map = {}
  for (const task of visibleTasks.value) {
    if (!map[task.date]) map[task.date] = []
    map[task.date].push(task)
  }
  return map
})

// Builds a fixed 6-row (42-day) grid for the viewed month, starting on the
// Sunday on/before the 1st so the weekday columns line up. A fixed row
// count (rather than however many weeks the month actually needs) keeps
// the grid the same height every month instead of jumping between 5 and 6
// rows as the user navigates.
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

// Distinct types present on a given day, in first-seen order — a day with
// three Marketing Event entries shows one dot, not three.
function distinctTypesForDay(day) {
  return [...new Set(day.entries.map((entry) => entry.type))]
}

// Moves the viewed month back one, letting the Date constructor handle
// year rollover (e.g. January -1 -> December of the previous year) rather
// than hand-rolled modulo math.
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

// Opens the day modal — but only for current-month days that actually have
// entries. Leading/trailing days are deliberately never interactive, even
// if they happen to have entries themselves: they're shown only for grid
// continuity, and the same day is properly clickable once the user
// navigates to its real month via Prev/Next.
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
</script>

<template>
  <section class="marketing-calendar">
    <!-- Signed-out visitors never reach the store fetch (see the watcher
         above), so show a plain sign-in prompt instead of the calendar. -->
    <h2 v-if="!authStore.session">Sign in</h2>

    <!-- Matches Marketing Tasks' Access Denied convention (a standalone
         routed page), not Home.vue's silent-omission pattern (which only
         makes sense on the shared landing page). -->
    <p v-else-if="authStore.role === 'applicant'" class="access-denied">Access Denied</p>

    <template v-else>
      <div class="header-row">
        <h2 data-page-heading>Marketing Calendar</h2>
      </div>

      <div class="month-nav">
        <button type="button" class="nav-btn" @click="goToPreviousMonth">&larr; Prev</button>
        <span class="month-label">{{ monthLabel }}</span>
        <button type="button" class="nav-btn" @click="goToNextMonth">Next &rarr;</button>
      </div>

      <p v-if="marketingTasksStore.loading">Loading calendar…</p>
      <p v-else-if="marketingTasksStore.error" class="error">{{ marketingTasksStore.error }}</p>

      <template v-else>
        <!-- Wraps the header row and grid together (no width cap of its
             own — fills whatever the panel gives it) so weekday labels
             stay column-aligned with the cells beneath them. -->
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

              <template v-if="day.entries.length > 0">
                <span class="day-count">{{ day.entries.length }}</span>
                <span class="day-dots">
                  <span
                    v-for="type in distinctTypesForDay(day)"
                    :key="type"
                    class="day-dot"
                    :style="{ backgroundColor: MARKETING_TASK_TYPE_COLORS[type] }"
                  ></span>
                </span>
              </template>
            </button>
          </div>
        </div>
      </template>

      <!-- Day modal: title + colored type label only, no status, no action
           buttons — Calendar is read-only, creation only happens via
           Marketing Tasks' "+ New task". -->
      <div v-if="selectedDayKey" class="overlay" @click.self="closeDayModal">
        <div class="modal">
          <h3 class="modal-heading">{{ selectedDayKey }}</h3>
          <ul class="entry-list">
            <li v-for="entry in selectedDayEntries" :key="entry.id" class="entry-row">
              <span class="entry-title">{{ entry.title }}</span>
              <span class="entry-type" :style="{ color: MARKETING_TASK_TYPE_COLORS[entry.type] }">
                {{ entry.type }}
              </span>
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
  color: var(--color-text-primary);
  min-width: 160px;
  text-align: center;
}

.nav-btn {
  background: var(--color-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: 8px;
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-primary);
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
  color: var(--color-text-secondary);
}

/* The grid's own background shows through the 1px gaps as a hairline
   between cells — the standard CSS technique for a gap that reads as a
   border, since a grid `gap` only ever reveals the container's
   background. Each .day-cell supplies its own opaque background so only
   the 1px seam shows the hairline color. grid-auto-rows: 1fr splits the
   JS-computed height (see gridHeight/:style above) evenly across the 6
   rows instead of each row sizing from the cells' own content.
   overflow: hidden is defensive — the grid is sized to exactly fit its
   allotted space, so nothing should overflow it, but this guarantees a
   future content change (e.g. unusually long badge text) clips instead
   of silently introducing a second scrollbar. */
/* Hairline-via-gap-background technique; border variable is the closest
   themed fit for a hairline (page/surface tokens would vanish or invert
   the gap in dark mode). */
.calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  grid-auto-rows: 1fr;
  gap: 1px;
  background: var(--color-border);
  overflow: hidden;
}

.day-cell {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  background: var(--color-surface);
  border-radius: 4px;
  padding: 4px 5px;
  font-family: inherit;
  cursor: default;
}

.day-cell--muted {
  background: var(--color-page-bg);
  /* Muted adjacent-month day number -- secondary-text variable. */
  color: var(--color-text-secondary);
}

.day-cell--clickable {
  cursor: pointer;
}

/* outline (not border) so the hover affordance doesn't add to the box's
   rendered size and perturb the tight 48px cell height. */
.day-cell--clickable:hover {
  outline: 1px solid var(--color-accent);
  outline-offset: -1px;
}

.day-number {
  font-size: 12px;
  font-weight: 500;
  color: inherit;
}

/* Pinned to the top-right corner regardless of day-number's normal flow
   position (top-left) — the two can never collide since they're anchored
   to opposite corners. */
.day-count {
  position: absolute;
  top: 3px;
  right: 3px;
  background: var(--color-accent);
  color: var(--color-surface);
  font-size: 9px;
  border-radius: 8px;
  padding: 1px 5px;
}

.day-dots {
  display: flex;
  margin-top: 5px;
}

.day-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  margin-right: 2px;
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
  background: var(--color-surface);
  border-radius: 12px;
  padding: 24px;
  color: var(--color-text-primary);
}

.modal-heading {
  margin: 0 0 16px;
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text-secondary);
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

.entry-type {
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.btn {
  font-size: 13px;
  font-weight: 500;
  padding: 8px 16px;
  border-radius: 8px;
  cursor: pointer;
}

.btn--outline {
  background: var(--color-surface);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border-strong);
}

.error {
  color: var(--color-danger-text);
}

.access-denied {
  margin: 0;
  color: var(--color-danger-text);
  font-weight: 600;
}
</style>
