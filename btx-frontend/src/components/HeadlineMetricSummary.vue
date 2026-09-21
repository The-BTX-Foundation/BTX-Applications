<script setup>
import { computed, ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useDonorImpactStore } from '@/stores/donorImpact'
import { MISSION_STATS } from '@/lib/missionStats'

const authStore = useAuthStore()
const donorImpactStore = useDonorImpactStore()

// Page-access gate matching every other page in this app -- admin,
// board, and reviewer only, mirroring donor_impact's RLS SELECT policy,
// so this reflects (rather than restricts beyond) what the backend
// already allows each role to read.
const canView = computed(() => authStore.isAdmin || authStore.isBoard || authStore.isReviewer)

// Refetches donor_impact whenever the signed-in user changes (sign in,
// sign out, switch accounts). Skips the fetch entirely for roles RLS
// wouldn't return rows to anyway. Unlike the old version of this page,
// nothing above the chart waits on this -- every other figure here is a
// static MISSION_STATS value (no loading state of its own, same
// convention as Home's mission card) -- only the "Since inception" pill's
// year range and the yearly-reach chart actually read donorImpactStore's
// cycles/loading/error below.
watch(
  () => authStore.session?.user?.id ?? null,
  (userId) => {
    if (userId && canView.value) {
      donorImpactStore.fetchCycles()
    }
  },
  { immediate: true },
)

// "$52,020.48" style -- this page's own to-the-cent convention (Home's
// mission card uses missionStats.js's whole-dollar helper instead).
function formatMoney(value) {
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// One decimal place, e.g. "96.5" -- every percentage on this page is
// derived from MISSION_STATS this way rather than hardcoded, so a future
// change to any shared figure can't silently leave a stale percentage
// behind.
function pct(part, whole) {
  return ((part / whole) * 100).toFixed(1)
}

// -- Funding portfolio (all-time) --
// Total funding disbursed is derived, not its own MISSION_STATS entry --
// direct academic aid + conference travel, confirmed to equal $53,907.23.
const totalFunding = computed(() => MISSION_STATS.directAcademicAidTotal + MISSION_STATS.conferenceTravelTotal)
const totalFundingDisplay = computed(() => formatMoney(totalFunding.value))
const directAcademicAidDisplay = computed(() => formatMoney(MISSION_STATS.directAcademicAidTotal))
const conferenceTravelDisplay = computed(() => formatMoney(MISSION_STATS.conferenceTravelTotal))
const directAcademicAidPct = computed(() => pct(MISSION_STATS.directAcademicAidTotal, totalFunding.value))
const conferenceTravelPct = computed(() => pct(MISSION_STATS.conferenceTravelTotal, totalFunding.value))

// -- Student reach portfolio (all-time) --
const campusOutreachPct = computed(() => pct(MISSION_STATS.campusOutreachAttendees, MISSION_STATS.studentsReachedTotal))
const scholarsPct = computed(() => pct(MISSION_STATS.scholarsFundedToDate, MISSION_STATS.studentsReachedTotal))
const travelAwardeesPct = computed(() => pct(MISSION_STATS.travelAwardees, MISSION_STATS.studentsReachedTotal))

// -- "Since inception" pill --
// Min/max cycle_year across every fetched cycle (not just published --
// same "to date" convention as useHomeSummary's own mission figures).
// Falls back to a bare "Since inception" while loading, on a failed
// fetch, or if somehow no cycles come back at all.
const cycleYears = computed(() => donorImpactStore.cycles.map((cycle) => cycle.cycle_year).filter((year) => year != null))
const inceptionLabel = computed(() => {
  if (!cycleYears.value.length) return 'Since inception'
  const min = Math.min(...cycleYears.value)
  const max = Math.max(...cycleYears.value)
  return min === max ? `Since inception · ${min}` : `Since inception · ${min}–${max}`
})

// -- Students reached by year (bar chart) --
// Ascending by cycle_year; students_reached passed through as-is (null
// stays null, rendered as "—" rather than a fake 0 -- see the template).
const yearlyReach = computed(() =>
  [...donorImpactStore.cycles]
    .filter((cycle) => cycle.cycle_year != null)
    .sort((a, b) => a.cycle_year - b.cycle_year)
    .map((cycle) => ({ year: cycle.cycle_year, value: cycle.students_reached ?? null })),
)

// At least 1 so a chart with every value at 0 doesn't divide by zero.
const maxYearlyReach = computed(() => Math.max(1, ...yearlyReach.value.map((c) => c.value ?? 0)))

// Height in px for a non-zero, non-null bar -- tallest bar lands at
// ~100px per the reference; zero/null values are handled directly in the
// template instead (a fixed 2px stub for zero, nothing for null).
function barHeightPx(value) {
  return Math.round((value / maxYearlyReach.value) * 100)
}

// Screen-reader summary for the whole chart, read once via role="img"
// rather than requiring per-bar navigation.
const chartAriaLabel = computed(() => {
  const parts = yearlyReach.value.map((c) => `${c.year}: ${c.value === null ? 'no data' : c.value}`)
  return `Students reached by year: ${parts.join(', ')}`
})
</script>

<template>
  <h2 v-if="!authStore.session">Sign in</h2>
  <p v-else-if="!canView" class="access-denied">Access Denied</p>

  <section v-else class="impact-page">
    <h1 class="page-title" data-page-heading>Impact to Date</h1>
    <p class="subline">
      Cumulative reach across every cohort since BTX began awarding — not just this program year.
    </p>
    <p class="inception-pill"><span class="dot" aria-hidden="true"></span>{{ inceptionLabel }}</p>

    <div class="card card--full">
      <p class="label">Total program funding disbursed</p>
      <p class="value value--28">{{ totalFundingDisplay }}</p>
      <p class="sub">{{ directAcademicAidPct }}% direct academic aid · {{ conferenceTravelPct }}% conference travel, all-time</p>
    </div>

    <div class="row-2">
      <div class="card">
        <p class="label">Scholars awarded</p>
        <p class="value value--24">{{ MISSION_STATS.scholarsFundedToDate }}</p>
        <p class="sub">Across {{ MISSION_STATS.scholarshipCycles }} cycles</p>
      </div>
      <div class="card">
        <p class="label">Applicants engaged</p>
        <p class="value value--24">{{ MISSION_STATS.applicantsEngagedTotal }}</p>
        <p class="sub">Lifetime applicant pool</p>
      </div>
    </div>

    <div class="card card--full">
      <p class="label">Total tracked student reach</p>
      <p class="value value--26">{{ MISSION_STATS.studentsReachedTotal }} students</p>
      <p class="sub">
        {{ MISSION_STATS.scholarsFundedToDate }} scholars + {{ MISSION_STATS.travelAwardees }} travel awardees +
        {{ MISSION_STATS.campusOutreachAttendees }} campus outreach attendees
      </p>
    </div>

    <h2 class="section-heading">Program allocation, all-time</h2>

    <p class="portfolio-label">FUNDING PORTFOLIO</p>
    <div class="card allocation-card">
      <div class="allocation-row">
        <div class="row-top">
          <span class="row-label">Direct academic aid</span>
          <span class="row-value"
            ><span class="row-value-serif">{{ directAcademicAidDisplay }}</span
            ><span class="row-value-pct"> · {{ directAcademicAidPct }}%</span></span
          >
        </div>
        <div class="bar-track"><div class="bar-fill bar-fill--gold" :style="{ width: `${directAcademicAidPct}%` }"></div></div>
      </div>
      <div class="allocation-row allocation-row--last">
        <div class="row-top">
          <span class="row-label">Conference travel</span>
          <span class="row-value"
            ><span class="row-value-serif">{{ conferenceTravelDisplay }}</span
            ><span class="row-value-pct"> · {{ conferenceTravelPct }}%</span></span
          >
        </div>
        <div class="bar-track"><div class="bar-fill bar-fill--gold" :style="{ width: `${conferenceTravelPct}%` }"></div></div>
      </div>
    </div>

    <p class="portfolio-label portfolio-label--second">STUDENT REACH PORTFOLIO</p>
    <div class="card allocation-card">
      <div class="allocation-row">
        <div class="row-top">
          <span class="row-label">Campus outreach</span>
          <span class="row-value"
            ><span class="row-value-serif">{{ MISSION_STATS.campusOutreachAttendees }} students</span
            ><span class="row-value-pct"> · {{ campusOutreachPct }}%</span></span
          >
        </div>
        <div class="bar-track"><div class="bar-fill bar-fill--green" :style="{ width: `${campusOutreachPct}%` }"></div></div>
      </div>
      <div class="allocation-row">
        <div class="row-top">
          <span class="row-label">Scholars awarded</span>
          <span class="row-value"
            ><span class="row-value-serif">{{ MISSION_STATS.scholarsFundedToDate }} scholars</span
            ><span class="row-value-pct"> · {{ scholarsPct }}%</span></span
          >
        </div>
        <div class="bar-track"><div class="bar-fill bar-fill--green" :style="{ width: `${scholarsPct}%` }"></div></div>
      </div>
      <div class="allocation-row allocation-row--last">
        <div class="row-top">
          <span class="row-label">Travel awardees</span>
          <span class="row-value"
            ><span class="row-value-serif">{{ MISSION_STATS.travelAwardees }} students</span
            ><span class="row-value-pct"> · {{ travelAwardeesPct }}%</span></span
          >
        </div>
        <div class="bar-track"><div class="bar-fill bar-fill--green" :style="{ width: `${travelAwardeesPct}%` }"></div></div>
      </div>
    </div>

    <h2 class="section-heading">Students reached by year</h2>
    <div class="card chart-card">
      <div v-if="donorImpactStore.loading" class="chart-skeleton" aria-hidden="true"></div>
      <p v-else-if="donorImpactStore.error" class="chart-error">Couldn't load yearly reach</p>
      <div v-else class="chart" role="img" :aria-label="chartAriaLabel">
        <div v-for="cycle in yearlyReach" :key="cycle.year" class="bar-col">
          <span class="bar-value-label">{{ cycle.value === null ? '—' : cycle.value }}</span>
          <div
            class="bar"
            :class="{ 'bar--zero': cycle.value === 0 }"
            :style="{ height: cycle.value ? `${barHeightPx(cycle.value)}px` : cycle.value === 0 ? '2px' : '0px' }"
          ></div>
          <span class="bar-year-label">{{ cycle.year }}</span>
        </div>
      </div>
    </div>

    <p class="footer">BTX Ops Hub · Impact to Date</p>
  </section>
</template>

<style scoped>
.impact-page {
  max-width: 640px;
  margin: 0 auto;
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
  max-width: 300px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--color-header-muted);
}

.inception-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 12px 0 0;
  padding: 4px 12px;
  border-radius: 999px;
  background: var(--color-tint-green);
  color: var(--color-green-strong);
  font-size: 11px;
  font-weight: 700;
}

.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  flex-shrink: 0;
}

.card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 14px;
  padding: 14px 16px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}

/* 10px above every full-width card and the two-column row, regardless of
   what precedes it (the pill, another card, the row) -- simpler and less
   error-prone than chaining adjacent-sibling selectors across the mix of
   cards/labels/headings actually in the DOM. */
.card--full {
  margin-top: 10px;
}

.row-2 {
  margin-top: 10px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.label {
  margin: 0;
  font-size: 11.5px;
  color: var(--color-header-muted);
}

/* lining-nums -- see HomeMissionHero.vue's identical pair for why both
   properties are set (font-variant-numeric alone isn't always enough).
   Not applied to .page-title above -- it has no digits. */
.value {
  margin: 6px 0 0;
  font-family: var(--font-serif);
  font-weight: 700;
  color: var(--color-gold-strong);
  font-variant-numeric: lining-nums;
  font-feature-settings: 'lnum' 1;
}

.value--28 {
  font-size: 28px;
}

.value--26 {
  font-size: 26px;
}

.value--24 {
  font-size: 24px;
}

.sub {
  margin: 6px 0 0;
  font-size: 11.5px;
  color: var(--color-header-muted);
}

.section-heading {
  margin: 24px 0 0;
  font-size: 13px;
  font-weight: 700;
  color: var(--color-header-strong);
}

.portfolio-label {
  margin: 12px 0 0;
  font-size: 10.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-header-muted);
}

.portfolio-label--second {
  margin-top: 18px;
}

.allocation-card {
  margin-top: 8px;
  padding: 0 16px;
}

.allocation-row {
  padding: 12px 0;
  border-bottom: 1px solid var(--color-border);
}

.allocation-row--last {
  border-bottom: none;
}

.row-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: nowrap;
}

.row-label {
  font-size: 13px;
  font-weight: 400;
  color: var(--color-header-strong);
  white-space: nowrap;
}

.row-value {
  white-space: nowrap;
}

.row-value-serif {
  font-family: var(--font-serif);
  font-size: 13px;
  font-weight: 700;
  color: var(--color-header-strong);
  font-variant-numeric: lining-nums;
  font-feature-settings: 'lnum' 1;
}

.row-value-pct {
  font-size: 11px;
  color: var(--color-header-muted);
}

.bar-track {
  margin-top: 6px;
  height: 4px;
  border-radius: 999px;
  background: var(--color-track);
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  min-width: 3px;
  border-radius: 999px;
}

.bar-fill--gold {
  background: var(--color-gold-strong);
}

.bar-fill--green {
  background: var(--color-green-strong);
}

.chart-card {
  margin-top: 8px;
}

.chart {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  height: 150px;
}

.bar-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  height: 100%;
  flex: 1;
}

.bar-value-label {
  margin: 0 0 4px;
  font-size: 10px;
  color: var(--color-header-muted);
}

.bar {
  width: 32px;
  background: var(--color-gold-strong);
  border-radius: 4px 4px 0 0;
}

.bar--zero {
  opacity: 0.4;
}

.bar-year-label {
  margin-top: 6px;
  font-size: 10.5px;
  color: var(--color-header-muted);
}

/* Neutral pulsing placeholder -- same height as the real chart so the
   card doesn't visibly resize once data arrives. */
.chart-skeleton {
  height: 150px;
  border-radius: 8px;
  background: var(--color-track);
  animation: chart-skeleton-pulse 1.4s ease-in-out infinite;
}

@keyframes chart-skeleton-pulse {
  0%,
  100% {
    opacity: 0.5;
  }
  50% {
    opacity: 0.9;
  }
}

.chart-error {
  margin: 0;
  padding: 60px 0;
  text-align: center;
  font-size: 13px;
  color: var(--color-header-muted);
}

.footer {
  margin: 28px 0 24px;
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
