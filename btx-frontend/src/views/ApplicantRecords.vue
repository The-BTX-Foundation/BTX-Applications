<script setup>
// APPLICANT RECORDS -- wired to real data via
// scholarship_applicant_directory (20261002140000_scholarship_applicant_
// directory.sql). That view exposes only applicant_id, applicant_code,
// cycle_year, initials, and submitted_at -- no name, email, phone,
// essay, or file names. It does NOT expose final score or decision
// status: that data lives in scholarship_decisions, which has no
// staff-facing view yet (only the applicant-facing
// my_application_status view and this directory view exist so far). See
// the card markup below and its own comment for how that gap is shown
// rather than hidden.
import { computed, onMounted, ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useScholarshipApplicantDirectoryStore } from '@/stores/scholarshipApplicantDirectory'

const authStore = useAuthStore()
const directoryStore = useScholarshipApplicantDirectoryStore()

// Same admin/board/reviewer gate every other Program/Finance/Scholarship
// page uses -- display-only, matching scholarship_applicant_directory's
// own role-gated WHERE clause, which is the actual enforcement.
const canView = computed(() => authStore.isAdmin || authStore.isBoard || authStore.isReviewer)

onMounted(() => {
  authStore.init()
})

// Refetch whenever the signed-in user changes (sign in, sign out, switch
// accounts) -- same watch-on-session-id pattern as ProgramPlanning.vue's
// own stores. Skipped entirely while signed out or for a role that can't
// view this page, since the view's own WHERE clause would just hand back
// zero rows before the user ever gets a chance to act.
watch(
  () => authStore.session?.user?.id ?? null,
  (userId) => {
    if (userId && canView.value) {
      directoryStore.fetchDirectory()
    }
  },
  { immediate: true },
)

const searchQuery = ref('')
// null = "All Cycles"; otherwise one of cycleFilters' year numbers.
const selectedCycle = ref(null)

const CURRENT_YEAR = new Date().getFullYear()

// Cycle filter pills, derived from the real distinct cycle_year values
// present in the fetched rows, newest first -- plus the current year is
// always included even if it has zero rows yet, so the filter row
// doesn't look broken (missing its own most-relevant pill) on a cycle
// that just opened and has no submissions yet.
const cycleFilters = computed(() => {
  const years = new Set(directoryStore.applicants.map((a) => a.cycle_year))
  years.add(CURRENT_YEAR)
  return [...years].sort((a, b) => b - a)
})

// Case-insensitive substring match against applicant_code and cycle_year
// only -- initials are too short/ambiguous (two letters) to search
// meaningfully, and the directory view exposes no name field to search
// against in the first place, so name search is dropped entirely rather
// than searching initials as a weak substitute.
const filteredRecords = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  return directoryStore.applicants.filter((record) => {
    if (selectedCycle.value !== null && record.cycle_year !== selectedCycle.value) return false
    if (!query) return true
    return record.applicant_code.toLowerCase().includes(query) || String(record.cycle_year).includes(query)
  })
})

const isFiltered = computed(() => searchQuery.value.trim() !== '' || selectedCycle.value !== null)

const listHeading = computed(() =>
  isFiltered.value
    ? `${filteredRecords.value.length} matching record${filteredRecords.value.length === 1 ? '' : 's'}`
    : 'Applicant records',
)

// Three distinct empty-list reasons, all calm (never an error -- a real
// fetch error is its own separate state, handled in the template below,
// before this list even renders). A role that isn't admin/board/
// reviewer would also produce zero rows here via the view's own WHERE
// clause rather than an error -- but canView's own page-level gate above
// (same "Access Denied" gate every Scholarship page uses) means this
// component's fetch never actually runs for that case, so there's
// nothing extra to distinguish here: by the time this list can render at
// all, the signed-in role already passed canView.
const emptyMessage = computed(() => {
  if (searchQuery.value.trim() !== '') return 'No records match your search.'
  if (selectedCycle.value !== null) return `No applicants yet for the ${selectedCycle.value} cycle.`
  return 'No applicants yet.'
})

// "Oct 2, 2026" -- same Month Day, Year shape as programRoadmap.js's own
// formatFullDate, but written locally rather than reused: that helper is
// built around a bare YYYY-MM-DD due_date string (string-split, no
// timezone), while submitted_at is a real timestamptz PostgREST returns
// as a full ISO string with timezone info already resolved -- a plain
// Date object is the correct, safe tool for that shape, not a reason to
// force-fit the date-only helper.
function formatSubmittedDate(submittedAt) {
  return new Date(submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
</script>

<template>
  <p v-if="!authStore.session">Sign in</p>
  <p v-else-if="!canView" class="access-denied">Access Denied</p>

  <section v-else class="applicant-records">
    <p class="page-crumb">Scholarship</p>
    <h1 class="page-title" data-page-heading>Applicant Records</h1>
    <p class="subline">Every applicant, searchable by ID or cycle year.</p>

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
      <div class="tile">
        <!-- Real count from the rows already fetched for the list below --
             no separate count query, same reasoning donorImpact.js's own
             totalRaised uses: PostgREST has no server-side aggregate
             without a DB-side RPC, and this store already has to fetch
             every visible row for the list itself, so a second round-trip
             just to count them would be redundant. -->
        <p class="tile-value tile-value--gold">{{ directoryStore.applicants.length }}</p>
        <p class="tile-label">Total historical applicants</p>
      </div>
      <div class="tile">
        <!-- No real source yet: scholarship_decisions (where award
             outcomes live) has no staff-facing view. Shown as a muted em
             dash, not an invented number or a bare 0 that would read as
             "zero awarded" rather than "unknown." -->
        <p class="tile-value tile-value--muted" title="Not yet available -- scholarship_decisions has no staff-facing view yet">—</p>
        <p class="tile-label">Awarded all-time</p>
      </div>
      <div class="tile">
        <p class="tile-value tile-value--muted" title="Not yet available -- scholarship_decisions has no staff-facing view yet">—</p>
        <p class="tile-label">Award rate</p>
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
        v-for="year in cycleFilters"
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

    <div v-if="directoryStore.loading" class="skeleton skeleton--list"></div>
    <p v-else-if="directoryStore.error" class="page-error">Couldn't load applicant records.</p>
    <p v-else-if="filteredRecords.length === 0" class="empty">{{ emptyMessage }}</p>

    <ul v-else class="record-list">
      <li v-for="record in filteredRecords" :key="record.applicant_id" class="record-card">
        <div class="record-info">
          <div class="record-top-line">
            <span class="app-id">{{ record.applicant_code }}</span>
            <span class="cycle-label">{{ record.cycle_year }} cycle</span>
          </div>
          <p class="score-text">Submitted {{ formatSubmittedDate(record.submitted_at) }}</p>
        </div>
        <!-- Status/score aren't silently dropped -- shown explicitly as
             "Not yet available" rather than omitted, so this doesn't read
             as a decision that just happens to be blank. Real status will
             need a staff-facing decisions view (parallel to
             scholarship_applicant_directory, reading scholarship_decisions)
             as a near-term follow-up, once this page's basic wiring is
             confirmed working. -->
        <span class="pill pill--neutral" title="scholarship_decisions has no staff-facing view yet">Not yet available</span>
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

/* Same tile styling as AwardeeWorkflow.vue/Interviews.vue's own .tiles. */
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

/* Visually distinct from a real stat -- muted/secondary text color
   rather than the gold used for a genuine number, so "—" reads as
   "not available" and not as a temporarily-zero real value. */
.tile-value--muted {
  color: var(--color-text-secondary);
}

.tile-label {
  margin: 4px 0 0;
  font-size: 10.5px;
  line-height: 1.3;
  color: var(--color-header-muted);
}

/* Same active/inactive treatment as AlertCenter.vue's own
   .domain-pill/.domain-pill--active filter row -- solid dark for
   whichever pill (including "All Cycles") is currently selected. */
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

/* Same generic page-level error wording/style as ProgramPlanning.vue's
   own .page-error -- not the raw Supabase error text. */
.page-error {
  margin: 12px 0 0;
  font-size: 13px;
  color: var(--color-danger-text);
}

/* Neutral pulsing placeholder -- same footprint as the real list so
   nothing visibly resizes once data arrives. Same .skeleton base and
   animation as ProgramPlanning.vue's own skeletons. */
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

/* Base pill shape reused verbatim from AwardeeWorkflow.vue/Interviews.vue.
   pill--neutral's own tokens are copied from Interviews.vue's identical
   class (same --color-neutral-badge-bg/text pair) for the same
   "not a success/warning/danger state" meaning. */
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

.pill--neutral {
  background: var(--color-neutral-badge-bg);
  color: var(--color-neutral-badge-text);
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
