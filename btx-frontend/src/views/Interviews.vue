<script setup>
// INTERVIEWS -- FRONT-END-ONLY PREVIEW.
//
// Everything rendered on this page comes from local, hand-authored sample
// data (see src/lib/interviewsSampleData.js) -- there is no interview or
// availability table backing any of it yet, and this component makes ZERO
// Supabase calls (authStore.isAdmin/isBoard/isReviewer below reads the
// session the router's global guard already loaded, it doesn't fetch
// anything itself). Toggling an availability pill and clicking "Save
// availability" only mutate local component state -- see toggleSlot()/
// saveAvailability() below for the "simulated, nothing is saved" boundary.
import { computed, onMounted, reactive, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { AVAILABILITY_DAYS, SUMMARY_TILES, UPCOMING_GROUPS, RECENTLY_COMPLETED } from '@/lib/interviewsSampleData'

const authStore = useAuthStore()
// Same admin/board/reviewer gate every other Program/Finance/Scholarship
// page uses -- display-only, RLS (once real tables exist) is the actual
// enforcement.
const canView = computed(() => authStore.isAdmin || authStore.isBoard || authStore.isReviewer)

onMounted(() => {
  authStore.init()
})

// Deep-cloned once from the sample module so toggling a pill mutates a
// LOCAL copy only -- the imported sample data itself is never touched,
// same pattern as AwardeeWorkflow.vue's committeeReviewByCycle.
const availabilityDays = reactive(structuredClone(AVAILABILITY_DAYS))

// Toggles one availability slot's selected state for the given day.
function toggleSlot(day, slot) {
  slot.selected = !slot.selected
  // Touching any slot invalidates whatever "saved" confirmation is
  // showing -- it described a snapshot that no longer matches what's on
  // screen.
  clearSavedMessage()
}

// SIMULATED save -- shows a brief, clearly non-persistent confirmation.
// Nothing is written anywhere; there is no availability table yet, and
// this page makes no Supabase call at all.
const savedMessageVisible = ref(false)
let savedMessageTimer = null

// Hides the "saved" confirmation and cancels its pending auto-hide timer.
function clearSavedMessage() {
  savedMessageVisible.value = false
  if (savedMessageTimer) {
    clearTimeout(savedMessageTimer)
    savedMessageTimer = null
  }
}

// Shows the "saved" confirmation for 4 seconds, then auto-hides it.
function saveAvailability() {
  savedMessageVisible.value = true
  if (savedMessageTimer) clearTimeout(savedMessageTimer)
  savedMessageTimer = setTimeout(() => {
    savedMessageVisible.value = false
    savedMessageTimer = null
  }, 4000)
}

// "+Schedule" has no real scheduling flow to open yet -- this is a
// deliberate placeholder default (not from any spec) that just smooth-
// scrolls the page down to "Your availability", since that's the one
// place on this page an interviewer can actually act.
const availabilitySectionEl = ref(null)
// Smooth-scrolls the page down to the "Your availability" section.
function scrollToAvailability() {
  availabilitySectionEl.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// Tone -> existing color-token class suffix, used by both the summary
// tiles and (indirectly) nothing else -- kept as a tiny lookup rather than
// a template ternary chain.
const TILE_VALUE_CLASS = {
  gold: 'tile-value--gold',
  green: 'tile-value--green',
  rust: 'tile-value--rust',
}
</script>

<template>
  <p v-if="!authStore.session">Sign in</p>
  <p v-else-if="!canView" class="access-denied">Access Denied</p>

  <section v-else class="interviews">
    <div class="header-row">
      <div>
        <p class="page-crumb">Scholarship</p>
        <h1 class="page-title" data-page-heading>Interviews</h1>
      </div>
      <button type="button" class="schedule-btn" @click="scrollToAvailability">+Schedule</button>
    </div>

    <!-- Same preview banner as Awardee Workflow -- same tokens, same
         prominence, wording adjusted for this page. -->
    <div class="preview-banner">
      <span class="preview-banner-dot" aria-hidden="true"></span>
      Preview — sample data only, not connected to real interviews
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
            :key="slot.key"
            type="button"
            class="slot-pill"
            :class="{ 'slot-pill--selected': slot.selected }"
            :aria-pressed="slot.selected"
            @click="toggleSlot(day, slot)"
          >
            {{ slot.label }}
          </button>
        </div>
      </div>

      <button type="button" class="save-btn" @click="saveAvailability">Save availability</button>
      <p v-if="savedMessageVisible" class="saved-message">
        Saved locally — not yet connected to a real schedule.
      </p>
    </section>

    <div class="tiles">
      <div v-for="tile in SUMMARY_TILES" :key="tile.key" class="tile">
        <p class="tile-value" :class="TILE_VALUE_CLASS[tile.tone]">{{ tile.value }}</p>
        <p class="tile-label">{{ tile.label }}</p>
      </div>
    </div>

    <h2 class="section-heading heading-upcoming">Upcoming</h2>
    <div v-for="group in UPCOMING_GROUPS" :key="group.key" class="interview-group">
      <p class="day-group-label">{{ group.dayLabel }}</p>
      <ul class="interview-list">
        <li v-for="interview in group.interviews" :key="interview.id" class="interview-card">
          <div class="time-block">
            <span class="time-main">{{ interview.time }}</span>
            <span class="time-period">{{ interview.period }}</span>
          </div>
          <div class="time-divider" aria-hidden="true"></div>
          <div class="interview-main">
            <div class="interview-top">
              <span class="app-id">{{ interview.id }}</span>
              <span class="pill pill--amber">{{ interview.pill }}</span>
            </div>
            <p class="interview-meta">
              Co-interviewer: {{ interview.coInterviewer }}
              <span class="pill pill--neutral">{{ interview.tag }}</span>
            </p>
            <!-- Inert link -- no real Google Meet/calendar integration is
                 wired up yet, so this is a visual placeholder only
                 (href="#" + a no-op click handler), not a working action. -->
            <a href="#" class="interview-link" @click.prevent>
              <svg
                v-if="interview.tag === 'Video'"
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
              {{ interview.linkLabel }}
            </a>
          </div>
        </li>
      </ul>
    </div>

    <h2 class="section-heading heading-completed">Recently completed</h2>
    <ul class="interview-list">
      <li v-for="interview in RECENTLY_COMPLETED" :key="interview.id" class="interview-card">
        <div class="time-block">
          <span class="date-main">{{ interview.date }}</span>
        </div>
        <div class="time-divider" aria-hidden="true"></div>
        <div class="interview-main">
          <div class="interview-top">
            <span class="app-id">{{ interview.id }}</span>
            <span class="pill" :class="interview.pill === 'Completed' ? 'pill--success' : 'pill--rust'">
              {{ interview.pill }}
            </span>
          </div>
          <p class="interview-meta">
            Co-interviewer: {{ interview.coInterviewer }}
            <span class="pill pill--neutral">{{ interview.tag }}</span>
          </p>
        </div>
      </li>
    </ul>

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

/* Same amber/warning badge tokens and layout as AwardeeWorkflow.vue's own
   .preview-banner -- only the copy differs. */
.preview-banner {
  margin-top: 18px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 10px;
  background: var(--color-amber-badge-bg);
  color: var(--color-amber-badge-text);
  border: 1px solid color-mix(in srgb, var(--color-amber-badge-text) 30%, transparent);
  font-size: 12.5px;
  font-weight: 700;
}

.preview-banner-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
  flex-shrink: 0;
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

.save-btn:hover {
  opacity: 0.92;
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
