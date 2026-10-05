<script setup>
// INTERVIEWS -- wired to real data.
//
// Availability grid reads/writes public.scholarship_board_availability via
// save-board-availability (real network write, see useScholarshipInterviewsStore's
// own comment on why the store needs this.session.access_token for that
// call). Upcoming/Recently completed read public.scholarship_interviews,
// joined to scholarship_applicant_directory for applicant_code the same
// way ApplicantRecords.vue already does -- no PII column this page didn't
// already show is exposed anywhere here.
//
// "Who am I": board_member_label / interviewer_one_label /
// interviewer_two_label are all free-text placeholders in this schema (no
// real per-reviewer accounts exist yet) -- this page asks the viewer to
// self-type the same label once per session (in-memory only, see the
// store) rather than inventing a new identity model of its own.
import { computed, onMounted, ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useScholarshipInterviewsStore } from '@/stores/scholarshipInterviews'
import { INTERVIEW_SLOTS } from '@/lib/interviewSlots'

const authStore = useAuthStore()
const interviewsStore = useScholarshipInterviewsStore()

// Same admin/board/reviewer gate every other Program/Finance/Scholarship
// page uses -- display-only, RLS on the underlying tables is the actual
// enforcement.
const canView = computed(() => authStore.isAdmin || authStore.isBoard || authStore.isReviewer)

onMounted(() => {
  authStore.init()
})

// Re-fetch whenever the signed-in user changes AND a label has already
// been entered this session -- same watch-on-session-id pattern as
// ApplicantRecords.vue's own store. Entering the label for the first time
// is handled separately by confirmLabel() below, since this watcher only
// reacts to session id changes, not to label being set.
watch(
  () => authStore.session?.user?.id ?? null,
  (userId) => {
    if (userId && canView.value && interviewsStore.label) {
      interviewsStore.fetchForLabel()
    }
  },
  { immediate: true },
)

const labelInput = ref('')

// Stores the self-typed label (session-only, see the store's own comment)
// and runs the first real fetch for it.
function confirmLabel() {
  const trimmed = labelInput.value.trim()
  if (!trimmed) return
  interviewsStore.label = trimmed
  interviewsStore.fetchForLabel()
}

// Locally toggled slot selection -- mutating this does NOT save anything;
// only clicking "Save availability" does. Seeded from the store's fetched
// rows whenever they change (initial load, and again after a successful
// save re-fetch), so a reload always restores the real persisted
// selection rather than whatever was toggled-but-unsaved before.
const pendingSlotIds = ref(new Set())
watch(
  () => interviewsStore.availabilitySlotIds,
  (ids) => {
    pendingSlotIds.value = new Set(ids)
  },
  { immediate: true },
)

// Groups the canonical slot list (src/lib/interviewSlots.js) by its own
// `date` string, in the list's own order -- same day-bucketed shape the
// old sample data rendered, now built from the real canonical list instead
// of a hand-authored one.
const availabilityDays = computed(() => {
  const groups = []
  const byDate = new Map()
  for (const slot of INTERVIEW_SLOTS) {
    let group = byDate.get(slot.date)
    if (!group) {
      group = { key: slot.date, label: slot.date, slots: [] }
      byDate.set(slot.date, group)
      groups.push(group)
    }
    group.slots.push({ id: slot.id, label: slot.time, selected: pendingSlotIds.value.has(slot.id) })
  }
  return groups
})

// Toggles one availability slot's selected state, local-only until Save.
function toggleSlot(slotId) {
  const next = new Set(pendingSlotIds.value)
  if (next.has(slotId)) next.delete(slotId)
  else next.add(slotId)
  pendingSlotIds.value = next
  clearSavedMessage()
}

// Real confirmation after a real write -- shown for 4 seconds, same timing
// as the old simulated confirmation, but only ever shown after
// save-board-availability actually returns success.
const savedMessageVisible = ref(false)
let savedMessageTimer = null

function clearSavedMessage() {
  savedMessageVisible.value = false
  if (savedMessageTimer) {
    clearTimeout(savedMessageTimer)
    savedMessageTimer = null
  }
}

// Calls the store's real save action with this viewer's own session JWT --
// save-board-availability requires it (see that function's own comment on
// why, unlike submit-application's genuinely anonymous caller).
async function onSaveAvailability() {
  const accessToken = authStore.session?.access_token
  if (!accessToken) return
  const ok = await interviewsStore.saveAvailability([...pendingSlotIds.value], accessToken)
  if (ok) {
    savedMessageVisible.value = true
    if (savedMessageTimer) clearTimeout(savedMessageTimer)
    savedMessageTimer = setTimeout(() => {
      savedMessageVisible.value = false
      savedMessageTimer = null
    }, 4000)
  }
}

// "+Schedule" has no real scheduling flow to open yet -- this is a
// deliberate placeholder default (not from any spec) that just smooth-
// scrolls the page down to "Your availability", since that's the one
// place on this page an interviewer can actually act.
const availabilitySectionEl = ref(null)
function scrollToAvailability() {
  availabilitySectionEl.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// Real counts from this label's own already-fetched rows for the current
// cycle -- no separate aggregate query, same "don't re-fetch what's
// already in memory" reasoning as ApplicantRecords.vue's own tile. Scoped
// to "your" interviews, not every board member's, since there's no
// staff-wide aggregate view to read from yet.
const summaryTiles = computed(() => [
  { key: 'upcoming', label: 'Upcoming', value: interviewsStore.upcoming.length, tone: 'gold' },
  {
    key: 'completed',
    label: 'Completed',
    value: interviewsStore.recentlyCompleted.filter((i) => i.status === 'Completed').length,
    tone: 'green',
  },
  {
    key: 'no-shows',
    label: 'No-shows',
    value: interviewsStore.recentlyCompleted.filter((i) => i.status === 'No-show').length,
    tone: 'rust',
  },
])

const TILE_VALUE_CLASS = {
  gold: 'tile-value--gold',
  green: 'tile-value--green',
  rust: 'tile-value--rust',
}

// "Today · Oct 5" / "Monday · Oct 6" -- same two-part day-group label shape
// the old sample data used, derived from a real scheduled_at Date instead
// of hand-authored.
function formatDayGroupLabel(date) {
  const isToday = date.toDateString() === new Date().toDateString()
  const dayPart = isToday ? 'Today' : date.toLocaleDateString('en-US', { weekday: 'long' })
  const datePart = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${dayPart} · ${datePart}`
}

// interviewsStore.upcoming is already sorted ascending by scheduledAt, so
// grouping in iteration order keeps each day group chronological too.
const upcomingGroups = computed(() => {
  const groups = []
  const byDay = new Map()
  for (const interview of interviewsStore.upcoming) {
    const dayKey = interview.scheduledAt.toDateString()
    let group = byDay.get(dayKey)
    if (!group) {
      group = { key: dayKey, dayLabel: formatDayGroupLabel(interview.scheduledAt), interviews: [] }
      byDay.set(dayKey, group)
      groups.push(group)
    }
    group.interviews.push(interview)
  }
  return groups
})

// "2:00" + "PM" -- split from a single localized time string so the
// existing two-line time-block markup (time-main/time-period) keeps
// working unchanged.
function formatTimeParts(date) {
  const [main, period] = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).split(' ')
  return { main, period }
}

// "Sep 12" -- scheduled_at is nullable, so a row with no timestamp yet
// shows an em dash rather than "Invalid Date".
function formatCompletedDate(date) {
  return date ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'
}
</script>

<template>
  <p v-if="!authStore.session">Sign in</p>
  <p v-else-if="!canView" class="access-denied">Access Denied</p>

  <section v-else-if="!interviewsStore.label" class="interviews label-prompt">
    <p class="page-crumb">Scholarship</p>
    <h1 class="page-title" data-page-heading>Interviews</h1>
    <!-- Self-typed label -- the same free-text placeholder identity every
         other operational table in this schema already uses
         (board_member_label / interviewer_one_label / interviewer_two_label),
         not a new identity model. In-memory only (this Pinia store's own
         state), never localStorage/sessionStorage -- gone the moment this
         tab or store resets. -->
    <p class="label-prompt-help">Enter your name or initials to see your availability and interviews.</p>
    <form class="label-prompt-form" @submit.prevent="confirmLabel">
      <input v-model="labelInput" type="text" placeholder="e.g. J. Smith" class="label-input" />
      <button type="submit" class="label-submit-btn" :disabled="!labelInput.trim()">Continue</button>
    </form>
  </section>

  <section v-else class="interviews">
    <div class="header-row">
      <div>
        <p class="page-crumb">Scholarship</p>
        <h1 class="page-title" data-page-heading>Interviews</h1>
      </div>
      <button type="button" class="schedule-btn" @click="scrollToAvailability">+Schedule</button>
    </div>

    <section ref="availabilitySectionEl" class="availability-card">
      <h2 class="section-heading">Your availability</h2>
      <p class="availability-help">
        Mark the times you can interview this week. We automatically pair you with a
        co-interviewer and an applicant once your slots overlap with someone else's.
      </p>

      <div v-for="day in availabilityDays" :key="day.key" class="availability-day">
        <p class="day-label">{{ day.label }}</p>
        <div class="slot-row">
          <button
            v-for="slot in day.slots"
            :key="slot.id"
            type="button"
            class="slot-pill"
            :class="{ 'slot-pill--selected': slot.selected }"
            :aria-pressed="slot.selected"
            @click="toggleSlot(slot.id)"
          >
            {{ slot.label }}
          </button>
        </div>
      </div>

      <button type="button" class="save-btn" :disabled="interviewsStore.saving" @click="onSaveAvailability">
        {{ interviewsStore.saving ? 'Saving…' : 'Save availability' }}
      </button>
      <p v-if="savedMessageVisible" class="saved-message">Availability saved.</p>
      <p v-if="interviewsStore.saveError" class="save-error">{{ interviewsStore.saveError }}</p>
    </section>

    <div class="tiles">
      <div v-for="tile in summaryTiles" :key="tile.key" class="tile">
        <p class="tile-value" :class="TILE_VALUE_CLASS[tile.tone]">{{ tile.value }}</p>
        <p class="tile-label">{{ tile.label }}</p>
      </div>
    </div>

    <template v-if="interviewsStore.loading">
      <div class="skeleton skeleton--list"></div>
    </template>
    <p v-else-if="interviewsStore.error" class="page-error">Couldn't load your interviews.</p>
    <template v-else>
      <h2 class="section-heading heading-upcoming">Upcoming</h2>
      <p v-if="upcomingGroups.length === 0" class="empty">No interviews yet this cycle.</p>
      <div v-for="group in upcomingGroups" :key="group.key" class="interview-group">
        <p class="day-group-label">{{ group.dayLabel }}</p>
        <ul class="interview-list">
          <li v-for="interview in group.interviews" :key="interview.id" class="interview-card">
            <div class="time-block">
              <span class="time-main">{{ formatTimeParts(interview.scheduledAt).main }}</span>
              <span class="time-period">{{ formatTimeParts(interview.scheduledAt).period }}</span>
            </div>
            <div class="time-divider" aria-hidden="true"></div>
            <div class="interview-main">
              <div class="interview-top">
                <span class="app-id">{{ interview.applicantCode }}</span>
                <span class="pill pill--amber">{{ interview.status }}</span>
              </div>
              <p class="interview-meta">
                Co-interviewer: {{ interview.coInterviewerLabel }}
                <span class="pill pill--neutral">{{ interview.mode }}</span>
              </p>
              <!-- Inert link -- scholarship_interviews has a meeting_link
                   column, but no real Google Meet/calendar integration is
                   wired up to populate or launch it yet, so this stays a
                   visual placeholder only (href="#" + a no-op click
                   handler), deliberately not reading meeting_link. -->
              <a href="#" class="interview-link" @click.prevent>
                <svg
                  v-if="interview.mode === 'Video'"
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <polygon points="23 7 16 12 23 17 23 7" />
                  <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                </svg>
                <svg
                  v-else
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                {{ interview.mode === 'Video' ? 'Join Google Meet' : 'Calendar invite' }}
              </a>
            </div>
          </li>
        </ul>
      </div>

      <h2 class="section-heading heading-completed">Recently completed</h2>
      <p v-if="interviewsStore.recentlyCompleted.length === 0" class="empty">No interviews yet this cycle.</p>
      <ul v-else class="interview-list">
        <li v-for="interview in interviewsStore.recentlyCompleted" :key="interview.id" class="interview-card">
          <div class="time-block">
            <span class="date-main">{{ formatCompletedDate(interview.scheduledAt) }}</span>
          </div>
          <div class="time-divider" aria-hidden="true"></div>
          <div class="interview-main">
            <div class="interview-top">
              <span class="app-id">{{ interview.applicantCode }}</span>
              <span class="pill" :class="interview.status === 'Completed' ? 'pill--success' : 'pill--rust'">
                {{ interview.status }}
              </span>
            </div>
            <p class="interview-meta">
              Co-interviewer: {{ interview.coInterviewerLabel }}
              <span class="pill pill--neutral">{{ interview.mode }}</span>
            </p>
          </div>
        </li>
      </ul>
    </template>

    <p class="footer">BTX Ops Hub · Interviews</p>
  </section>
</template>

<style scoped>
.interviews {
  max-width: 640px;
  margin: 0 auto;
}

.header-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

/* Reused verbatim from AwardeeWorkflow.vue -- same crumb markup/approach,
   not a second implementation. */
.page-crumb {
  margin: 0 0 4px;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-accent);
}

.page-title {
  margin: 0;
  font-family: var(--font-serif);
  font-size: 28px;
  font-weight: 700;
  line-height: 1.15;
  color: var(--color-header-strong);
}

/* Solid dark pill, gold text -- deliberately the app's fixed-dark/gold
   brand pair (same #1c1a17/#d4a24e-ish family as Topbar's own wordmark),
   not a themed surface, since it's a small standalone brand-accent action
   button rather than page content. */
.schedule-btn {
  flex-shrink: 0;
  margin-top: 4px;
  padding: 10px 16px;
  border: none;
  border-radius: 999px;
  background: #1c1a17;
  color: var(--color-accent);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
}

.schedule-btn:hover {
  opacity: 0.9;
}

.label-prompt-help {
  margin: 10px 0 0;
  max-width: 420px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--color-header-muted);
}

.label-prompt-form {
  margin-top: 18px;
  display: flex;
  gap: 10px;
}

.label-input {
  flex: 1;
  min-width: 0;
  padding: 11px 14px;
  border: 1px solid var(--color-border-strong);
  border-radius: 10px;
  background: var(--color-surface);
  color: var(--color-text-primary);
  font-size: 13.5px;
  font-family: inherit;
}

.label-submit-btn {
  flex-shrink: 0;
  padding: 11px 18px;
  border: none;
  border-radius: 10px;
  background: var(--color-header-strong);
  color: var(--color-surface);
  font-size: 13.5px;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
}

.label-submit-btn:hover:not(:disabled) {
  opacity: 0.92;
}

.label-submit-btn:disabled {
  background: var(--color-border-strong);
  color: var(--color-text-secondary);
  cursor: not-allowed;
}

.section-heading {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  color: var(--color-header-strong);
}

.availability-card {
  margin-top: 20px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 16px;
  scroll-margin-top: 16px;
}

.availability-help {
  margin: 8px 0 0;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--color-text-secondary);
}

.availability-day {
  margin-top: 16px;
}

.day-label {
  margin: 0;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-header-muted);
}

.slot-row {
  margin-top: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

/* Unselected: pale/tan fill (gold-soft, already used elsewhere on
   Awardee Workflow's own avatar circles) -- selected: solid green fill,
   matching that page's vote-chip--agreed treatment exactly. No new
   tokens needed for either state. */
.slot-pill {
  padding: 8px 12px;
  border-radius: 999px;
  border: 1px solid var(--color-border);
  background: var(--color-gold-soft);
  color: var(--color-header-strong);
  font-size: 12.5px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  white-space: nowrap;
}

.slot-pill--selected {
  border-color: var(--color-green-strong);
  background: var(--color-green-strong);
  color: #fff;
}

.save-btn {
  margin-top: 20px;
  width: 100%;
  padding: 12px;
  border: none;
  border-radius: 10px;
  background: var(--color-header-strong);
  color: var(--color-surface);
  font-size: 13.5px;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
}

.save-btn:hover:not(:disabled) {
  opacity: 0.92;
}

.save-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.saved-message {
  margin: 10px 0 0;
  padding: 8px 12px;
  border-radius: 8px;
  background: var(--color-success-badge-bg);
  color: var(--color-success-badge-text);
  font-size: 12px;
  font-weight: 600;
}

.save-error {
  margin: 10px 0 0;
  padding: 8px 12px;
  border-radius: 8px;
  background: var(--color-rust-badge-bg);
  color: var(--color-rust-badge-text);
  font-size: 12px;
  font-weight: 600;
}

.tiles {
  margin-top: 22px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.tile {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 12px 6px;
  text-align: center;
}

.tile-value {
  margin: 0;
  font-family: var(--font-serif);
  font-size: 24px;
  font-weight: 700;
  font-variant-numeric: lining-nums;
  font-feature-settings: 'lnum' 1;
}

.tile-value--gold {
  color: var(--color-gold-deep);
}

.tile-value--green {
  color: var(--color-green-strong);
}

.tile-value--rust {
  color: var(--color-rust-badge-text);
}

.tile-label {
  margin: 2px 0 0;
  font-size: 11px;
  color: var(--color-header-muted);
}

.heading-upcoming {
  margin-top: 26px;
}

.heading-completed {
  margin-top: 30px;
}

.interview-group {
  margin-top: 14px;
}

.interview-group:first-of-type {
  margin-top: 12px;
}

.day-group-label {
  margin: 0 0 8px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-header-muted);
}

.interview-list {
  margin-top: 12px;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.interview-group .interview-list {
  margin-top: 0;
}

.interview-card {
  display: flex;
  align-items: stretch;
  gap: 12px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 14px;
}

.time-block {
  flex-shrink: 0;
  width: 44px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
}

.time-main {
  font-family: var(--font-serif);
  font-size: 15px;
  font-weight: 700;
  color: var(--color-header-strong);
  font-variant-numeric: lining-nums;
  font-feature-settings: 'lnum' 1;
}

.time-period {
  margin-top: 1px;
  font-size: 10px;
  font-weight: 700;
  color: var(--color-text-secondary);
}

.date-main {
  font-size: 12.5px;
  font-weight: 700;
  color: var(--color-header-strong);
}

.time-divider {
  flex-shrink: 0;
  width: 1px;
  background: var(--color-border);
}

.interview-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.interview-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.app-id {
  font-weight: 700;
  font-size: 13.5px;
  color: var(--color-header-strong);
}

.interview-meta {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--color-text-secondary);
}

.pill {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  font-size: 10px;
  font-weight: 700;
  padding: 3px 9px;
  border-radius: 999px;
  white-space: nowrap;
}

.pill--amber {
  background: var(--color-amber-badge-bg);
  color: var(--color-amber-badge-text);
}

.pill--success {
  background: var(--color-success-badge-bg);
  color: var(--color-success-badge-text);
}

.pill--rust {
  background: var(--color-rust-badge-bg);
  color: var(--color-rust-badge-text);
}

.pill--neutral {
  background: var(--color-neutral-badge-bg);
  color: var(--color-neutral-badge-text);
}

.interview-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  width: fit-content;
  font-size: 12px;
  font-weight: 700;
  color: var(--color-accent);
  text-decoration: underline;
}

.empty {
  margin: 12px 0 0;
  font-size: 13px;
  color: var(--color-text-secondary);
}

/* Same generic page-level error wording/style as ProgramPlanning.vue's
   own .page-error -- not the raw Supabase error text. */
.page-error {
  margin: 12px 0 0;
  font-size: 13px;
  color: var(--color-danger-text);
}

/* Neutral pulsing placeholder -- same footprint as the real list so
   nothing visibly resizes once data arrives. Same .skeleton base and
   animation as ApplicantRecords.vue's own skeletons. */
.skeleton {
  margin-top: 12px;
  border-radius: 12px;
  background: var(--color-track);
  animation: skeleton-pulse 1.4s ease-in-out infinite;
}

.skeleton--list {
  height: 220px;
}

@keyframes skeleton-pulse {
  0%,
  100% {
    opacity: 0.5;
  }
  50% {
    opacity: 0.9;
  }
}

.access-denied {
  margin: 0;
  color: var(--color-danger-text);
  font-weight: 600;
}

.footer {
  margin: 28px 0 0;
  text-align: center;
  font-size: 12px;
  color: var(--color-text-secondary);
}
</style>
