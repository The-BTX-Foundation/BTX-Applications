<script setup>
// APPLICANT RECORDS -- FRONT-END-ONLY PREVIEW.
//
// Everything rendered on this page comes from local, hand-authored sample
// data (see src/lib/applicantRecordsSampleData.js) -- there is no
// closed-cycle applicant table backing any of it yet, and this component
// makes ZERO Supabase calls (authStore.isAdmin/isBoard/isReviewer below
// reads the session the router's global guard already loaded, it doesn't
// fetch anything itself). The search box and cycle filter below are a
// REAL, working local filter over the sample array -- unlike Interviews'
// inert links, there's nothing to simulate here since filtering never
// needed a network round-trip in the first place.
import { computed, onMounted, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { APPLICANT_RECORDS, CYCLE_FILTERS, SUMMARY_TILES } from '@/lib/applicantRecordsSampleData'

const authStore = useAuthStore()
// Same admin/board/reviewer gate every other Program/Finance/Scholarship
// page uses -- display-only, RLS (once real tables exist) is the actual
// enforcement.
const canView = computed(() => authStore.isAdmin || authStore.isBoard || authStore.isReviewer)

onMounted(() => {
  authStore.init()
})

const searchQuery = ref('')
// null = "All Cycles"; otherwise one of CYCLE_FILTERS' year numbers.
const selectedCycle = ref(null)

// Case-insensitive substring match against the record's ID, its cycle
// year as a string, and its internal (never-displayed) name field --
// search and the cycle pill row narrow the same list together.
const filteredRecords = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  return APPLICANT_RECORDS.filter((record) => {
    if (selectedCycle.value !== null && record.cycleYear !== selectedCycle.value) return false
    if (!query) return true
    return (
      record.id.toLowerCase().includes(query) ||
      String(record.cycleYear).includes(query) ||
      record.name.toLowerCase().includes(query)
    )
  })
})

const isFiltered = computed(() => searchQuery.value.trim() !== '' || selectedCycle.value !== null)

const listHeading = computed(() =>
  isFiltered.value
    ? `${filteredRecords.value.length} matching record${filteredRecords.value.length === 1 ? '' : 's'}`
    : 'Recent closed-cycle records',
)

// Distinct wording for "a cycle pill with genuinely zero sample rows"
// (2023/2022) vs. "a search that happens to match nothing" -- both are
// still just the list's own empty state, not a broken blank gap.
const emptyMessage = computed(() => {
  if (searchQuery.value.trim() === '' && selectedCycle.value !== null) {
    return 'No records for this cycle.'
  }
  return 'No records match your search.'
})

// Status -> the exact pill classes AwardeeWorkflow.vue/Interviews.vue
// already use for these same three words -- reused verbatim, not a second
// set of pill styles.
const PILL_CLASS = {
  Awarded: 'pill--success',
  Waitlisted: 'pill--amber',
  Declined: 'pill--rust',
}
</script>

<template>
  <p v-if="!authStore.session">Sign in</p>
  <p v-else-if="!canView" class="access-denied">Access Denied</p>

  <section v-else class="applicant-records">
    <p class="page-crumb">Scholarship</p>
    <h1 class="page-title" data-page-heading>Applicant Records</h1>
    <p class="subline">Every applicant from closed cycles, searchable by name, ID, or year.</p>

    <!-- Same preview banner as the other two Scholarship pages -- same
         tokens, same prominence, wording adjusted for this page. -->
    <div class="preview-banner">
      <span class="preview-banner-dot" aria-hidden="true"></span>
      Preview — sample data only, not connected to real applicant records
    </div>

    <label class="search-field">
      <svg
        class="search-icon"
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        v-model="searchQuery"
        type="text"
        class="search-input"
        placeholder="Search applicant ID or cycle..."
      />
    </label>

    <div class="tiles">
      <div v-for="tile in SUMMARY_TILES" :key="tile.key" class="tile">
        <p class="tile-value tile-value--gold">{{ tile.value }}</p>
        <p class="tile-label">{{ tile.label }}</p>
      </div>
    </div>

    <div class="cycle-filter-row">
      <button
        type="button"
        class="cycle-filter-pill"
        :class="{ 'cycle-filter-pill--active': selectedCycle === null }"
        :aria-pressed="selectedCycle === null"
        @click="selectedCycle = null"
      >
        All Cycles
      </button>
      <button
        v-for="year in CYCLE_FILTERS"
        :key="year"
        type="button"
        class="cycle-filter-pill"
        :class="{ 'cycle-filter-pill--active': selectedCycle === year }"
        :aria-pressed="selectedCycle === year"
        @click="selectedCycle = year"
      >
        {{ year }}
      </button>
    </div>

    <h2 class="section-heading heading-records">{{ listHeading }}</h2>

    <p v-if="filteredRecords.length === 0" class="empty">{{ emptyMessage }}</p>

    <ul v-else class="record-list">
      <li v-for="record in filteredRecords" :key="record.id" class="record-card">
        <div class="record-info">
          <div class="record-top-line">
            <span class="app-id">{{ record.id }}</span>
            <span class="cycle-label">{{ record.cycleYear }} cycle</span>
          </div>
          <p class="score-text">Final score {{ record.finalScore }}</p>
        </div>
        <span class="pill" :class="PILL_CLASS[record.status]">{{ record.status }}</span>
      </li>
    </ul>

    <p class="footer">BTX Ops Hub · Applicant Records</p>
  </section>
</template>

<style scoped>
.applicant-records {
  max-width: 640px;
  margin: 0 auto;
}

/* Reused verbatim from AwardeeWorkflow.vue/Interviews.vue -- same crumb
   markup/approach, not a second implementation. */
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

.subline {
  margin: 8px 0 0;
  max-width: 420px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--color-header-muted);
}

/* Same amber/warning badge tokens and layout as the other two Scholarship
   pages' own .preview-banner -- only the copy differs. */
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

.search-field {
  margin-top: 20px;
  position: relative;
  display: block;
}

.search-icon {
  position: absolute;
  top: 50%;
  left: 14px;
  transform: translateY(-50%);
  color: var(--color-text-secondary);
  pointer-events: none;
}

.search-input {
  width: 100%;
  padding: 11px 14px 11px 38px;
  border: 1px solid var(--color-border-strong);
  border-radius: 10px;
  background: var(--color-surface);
  color: var(--color-text-primary);
  font-size: 13.5px;
  font-family: inherit;
}

.search-input::placeholder {
  color: var(--color-text-secondary);
}

/* Same tile styling as AwardeeWorkflow.vue/Interviews.vue's own .tiles --
   all three read gold here (no green/rust variant needed on this page). */
.tiles {
  margin-top: 18px;
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
  font-size: 22px;
  font-weight: 700;
  font-variant-numeric: lining-nums;
  font-feature-settings: 'lnum' 1;
}

.tile-value--gold {
  color: var(--color-gold-deep);
}

.tile-label {
  margin: 4px 0 0;
  font-size: 10.5px;
  line-height: 1.3;
  color: var(--color-header-muted);
}

/* Same active/inactive treatment as AlertCenter.vue's own
   .domain-pill/.domain-pill--active filter row -- solid dark for
   whichever pill (including "All Cycles") is currently selected. Wraps
   instead of scrolling: only 5 short pills, comfortably wraps to a second
   line at the narrowest supported width rather than needing the
   hidden-scrollbar treatment the longer cycle/day strips elsewhere use. */
.cycle-filter-row {
  margin-top: 18px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.cycle-filter-pill {
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

.cycle-filter-pill--active {
  border-color: var(--color-header-strong);
  background: var(--color-header-strong);
  color: var(--color-surface);
}

.section-heading {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  color: var(--color-header-strong);
}

.heading-records {
  margin-top: 26px;
}

.empty {
  margin: 12px 0 0;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.record-list {
  margin-top: 12px;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.record-card {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 14px;
}

.record-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.record-top-line {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}

.app-id {
  font-weight: 700;
  font-size: 13.5px;
  color: var(--color-header-strong);
}

.cycle-label {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.score-text {
  margin: 0;
  font-size: 12.5px;
  color: var(--color-header-muted);
}

/* Reused verbatim from AwardeeWorkflow.vue/Interviews.vue -- same pill
   base + success/amber/rust modifier classes for Awarded/Waitlisted/
   Declined, not a second set of pill styles. */
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

.pill--success {
  background: var(--color-success-badge-bg);
  color: var(--color-success-badge-text);
}

.pill--amber {
  background: var(--color-amber-badge-bg);
  color: var(--color-amber-badge-text);
}

.pill--rust {
  background: var(--color-rust-badge-bg);
  color: var(--color-rust-badge-text);
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
