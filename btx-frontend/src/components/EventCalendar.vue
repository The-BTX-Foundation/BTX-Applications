<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import AddEventModal from './AddEventModal.vue'

const authStore = useAuthStore()

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Stand-in for a real data source — no events table/store exists yet, so
// this stays a permanently empty local ref. Structured the same as
// Marketing Calendar's `tasks` (an array of rows with a `date` field) so
// swapping in a real store later is a drop-in change rather than a
// rewrite of the grid logic below.
const entries = ref([])

// Controls the Add Event modal's visibility.
const showAddEventModal = ref(false)

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
// if no modal is open. Unreachable today since entries is always empty
// (see handleDayClick), kept so this doesn't need rebuilding once a real
// data source exists.
const selectedDayKey = ref(null)

onMounted(() => {
  authStore.init()
  // No async data load to wait on (unlike Marketing Calendar), so a single
  // nextTick after the grid's first real render is enough to measure it.
  nextTick(updateGridHeight)
  window.addEventListener('resize', updateGridHeight)
})

onUnmounted(() => {
  window.removeEventListener('resize', updateGridHeight)
})

// Zero-pads a number to 2 digits, e.g. 5 -> "05".
function pad(n) {
  return String(n).padStart(2, '0')
}

// Formats a Date as a 'YYYY-MM-DD' string, matching the key shape a real
// events table's date column would return.
function dateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

// Groups entries by date string for O(1) lookup per grid cell. Always
// empty today since `entries` never gets populated, but keeps the same
// shape Marketing Calendar uses.
const entriesByDate = computed(() => {
  const map = {}
  for (const entry of entries.value) {
    if (!map[entry.date]) map[entry.date] = []
    map[entry.date].push(entry)
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

// Opens the day modal for current-month days with entries. Since `entries`
// is always empty today, day.entries.length is always 0, so no day is
// ever actually clickable — this mirrors Marketing Calendar's gating
// exactly so the behavior is already correct the moment real data exists.
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
  <section class="event-calendar">
    <!-- Signed-out visitors never reach this page (see the router guard),
         but kept for parity with Marketing Calendar's structure. -->
    <h2 v-if="!authStore.session">Sign in</h2>

    <!-- Inherited from Marketing Calendar/Marketing Tasks' convention as a
         placeholder decision — no real access requirement has been set for
         Event Calendar yet. -->
    <p v-else-if="authStore.role === 'applicant'" class="access-denied">Access Denied</p>

    <template v-else>
      <div class="header-row">
        <h2>Event Calendar</h2>
        <button
          v-if="authStore.isBoard || authStore.isAdmin || authStore.isReviewer"
          type="button"
          class="btn btn--gold"
          @click="showAddEventModal = true"
        >
          + Add Event
        </button>
      </div>

      <div class="month-nav">
        <button type="button" class="nav-btn" @click="goToPreviousMonth">&larr; Prev</button>
        <span class="month-label">{{ monthLabel }}</span>
        <button type="button" class="nav-btn" @click="goToNextMonth">Next &rarr;</button>
      </div>

      <!-- Wraps the header row and grid together (no width cap of its own
           — fills whatever the panel gives it) so weekday labels stay
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

            <!-- Never renders today since day.entries is always empty —
                 kept so the count badge/dots don't need to be rebuilt once
                 a real events source exists. -->
            <template v-if="day.entries.length > 0">
              <span class="day-count">{{ day.entries.length }}</span>
              <span class="day-dots">
                <span v-for="(entry, index) in day.entries" :key="index" class="day-dot"></span>
              </span>
            </template>
          </button>
        </div>
      </div>

      <!-- Day modal — unreachable today (see handleDayClick), kept for
           parity with Marketing Calendar's structure. -->
      <div v-if="selectedDayKey" class="overlay" @click.self="closeDayModal">
        <div class="modal">
          <h3 class="modal-heading">{{ selectedDayKey }}</h3>
          <ul class="entry-list">
            <li v-for="(entry, index) in selectedDayEntries" :key="index" class="entry-row">
              <span class="entry-title">{{ entry.title }}</span>
            </li>
          </ul>
          <button type="button" class="btn btn--outline" @click="closeDayModal">Close</button>
        </div>
      </div>

      <AddEventModal v-if="showAddEventModal" @close="showAddEventModal = false" />
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

.day-dots {
  display: flex;
  margin-top: 5px;
}

/* No color source exists yet (no event-type taxonomy defined) — defaults
   to a neutral gray until real types/colors are decided. */
.day-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  margin-right: 2px;
  background: #b5b3ac;
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

.btn {
  font-size: 13px;
  font-weight: 500;
  padding: 6px 14px;
  border-radius: 8px;
  cursor: pointer;
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

.access-denied {
  margin: 0;
  color: #b3261e;
  font-weight: 600;
}
</style>
