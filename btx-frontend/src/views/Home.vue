<script setup>
import { computed, reactive } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useHomeSummary } from '@/composables/useHomeSummary'
import HomeMissionHero from '@/components/HomeMissionHero.vue'
import HomeOverdueBanner from '@/components/HomeOverdueBanner.vue'
import HomeAtAGlance from '@/components/HomeAtAGlance.vue'
import HomeSectionRow from '@/components/HomeSectionRow.vue'

const authStore = useAuthStore()
const summary = useHomeSummary()

// Today's date line, e.g. "Thursday, September 18". Computed fresh on
// every render rather than once at module load, so a page left open
// across midnight still shows the right day.
const todayLabel = computed(() =>
  new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
)

// The 8 sections, in the mockup's fixed order. The first three are flat,
// single-destination rows (routeName); the rest expand to reveal
// subItems, same shape as the old card grid's own `cards` array. Icon/
// color pairing matches the mockup's icon-tile spec.
const SECTIONS = [
  { id: 'alert-center', title: 'Alert Center', icon: 'warning', color: 'danger', flat: true, routeName: 'alerts' },
  { id: 'task-approval', title: 'Task & Approval', icon: 'checkbox', color: 'amber', flat: true, routeName: 'tasks' },
  {
    id: 'event-calendar',
    title: 'Event Calendar',
    icon: 'calendar',
    color: 'neutral',
    flat: true,
    routeName: 'event-calendar',
  },
  {
    id: 'finance',
    title: 'Finance',
    icon: 'dollar',
    color: 'success',
    subItems: [
      { label: 'Budget Tracking', routeName: 'finance-budget-tracking' },
      { label: 'Budgeting Tasks', routeName: 'finance-budgeting-tasks' },
    ],
  },
  {
    id: 'funding',
    title: 'Funding',
    icon: 'trending-up',
    color: 'amber',
    subItems: [
      { label: 'Fundraising Health', routeName: 'finance-fundraising-health' },
      { label: 'Fundraising Tasks', routeName: 'finance-fundraising-tasks' },
    ],
  },
  {
    id: 'program',
    title: 'Program',
    icon: 'folder',
    color: 'success',
    subItems: [
      { label: 'Headline Metric Summary', routeName: 'program-headline-metric-summary' },
      { label: 'Program Planning', routeName: 'program-planning' },
      { label: 'Program Impact', routeName: 'program-impact' },
    ],
  },
  {
    id: 'scholarship',
    title: 'Scholarship',
    icon: 'graduation-cap',
    color: 'amber',
    subItems: [
      { label: 'Awardee Workflow', routeName: 'awardee-workflow' },
      { label: 'Scoring', routeName: 'scholarship-scoring' },
      { label: 'Interviews', routeName: 'scholarship-interviews' },
      { label: 'Applicant Records', routeName: 'scholarship-applicant-records' },
    ],
  },
  {
    id: 'marketing',
    title: 'Marketing',
    icon: 'megaphone',
    color: 'neutral',
    subItems: [
      { label: 'Calendar', routeName: 'marketing-calendar' },
      { label: 'Marketing Tasks', routeName: 'marketing-tasks' },
    ],
  },
]

// Per-section subtitle/pill, keyed by id -- pulled from useHomeSummary
// rather than baked into SECTIONS above, since these are reactive and
// SECTIONS is static. Scholarship has no backing data (see
// useHomeSummary's own comment), so it's simply absent here rather than
// defaulted to an em-dash -- an em-dash would wrongly imply a failed
// fetch instead of "nothing to fetch".
const rowInfo = computed(() => ({
  'alert-center': { subtitle: summary.alertSubtitle.value, pillCount: summary.overdueCount.value },
  'task-approval': { subtitle: summary.taskSubtitle.value },
  'event-calendar': { subtitle: summary.eventSubtitle.value },
  finance: { subtitle: summary.financeSubtitle.value, variant: summary.financeOverBudget.value ? 'danger' : 'muted' },
  funding: { subtitle: summary.fundingSubtitle.value },
  program: { subtitle: summary.programSubtitle.value },
  scholarship: { subtitle: null },
  marketing: { subtitle: summary.marketingSubtitle.value },
}))

// Route name of the first Scholarship sub-item, for the mission card's CTA
// button -- read off SECTIONS rather than hardcoded, so the button always
// points at whichever sub-item is actually listed first there.
const scholarshipRouteName = computed(
  () => SECTIONS.find((section) => section.id === 'scholarship').subItems[0].routeName,
)

// Tracks which non-flat sections are expanded; multiple can be open at once.
const expandedSectionIds = reactive(new Set())

function toggleSection(id) {
  if (expandedSectionIds.has(id)) {
    expandedSectionIds.delete(id)
  } else {
    expandedSectionIds.add(id)
  }
}
</script>

<template>
  <p v-if="!summary.canView.value" class="access-denied">Access Denied</p>

  <div v-else class="home">
    <p class="date-line">{{ todayLabel }}</p>
    <h1 class="heading" data-page-heading>Here's what needs attention</h1>
    <p class="subtext">A quick look across every section before you dive in.</p>

    <HomeMissionHero
      :scholars-display="summary.missionScholarsDisplay.value"
      :direct-aid-display="summary.missionDirectAidDisplay.value"
      :applicants-display="summary.missionApplicantsDisplay.value"
      :students-display="summary.missionStudentsDisplay.value"
      :cta-route-name="scholarshipRouteName"
    />

    <HomeOverdueBanner
      :loading="summary.heroLoading.value"
      :error="summary.heroError.value"
      :count="summary.overdueCount.value"
      :oldest-days-label="summary.oldestOverdue.value ? summary.dayLabel(summary.oldestOverdueDays.value) : null"
    />

    <HomeAtAGlance
      :runway="summary.runwayDisplay.value"
      :goal-percent="summary.goalPercentDisplay.value"
      :milestones-value="summary.milestonesDisplay.value"
      :milestones-label="summary.milestonesLabel.value"
    />

    <div class="section-list">
      <template v-for="section in SECTIONS" :key="section.id">
        <HomeSectionRow
          v-if="section.flat"
          :icon="section.icon"
          :color="section.color"
          :title="section.title"
          :subtitle="rowInfo[section.id].subtitle"
          :subtitle-variant="rowInfo[section.id].variant ?? 'muted'"
          :pill-count="rowInfo[section.id].pillCount ?? null"
          flat
          :route-name="section.routeName"
        />
        <HomeSectionRow
          v-else
          :icon="section.icon"
          :color="section.color"
          :title="section.title"
          :subtitle="rowInfo[section.id].subtitle"
          :subtitle-variant="rowInfo[section.id].variant ?? 'muted'"
          :expanded="expandedSectionIds.has(section.id)"
          @toggle="toggleSection(section.id)"
        >
          <li v-for="item in section.subItems" :key="item.routeName">
            <RouterLink :to="{ name: item.routeName }" class="sub-item-link">{{ item.label }}</RouterLink>
          </li>
        </HomeSectionRow>
      </template>
    </div>

    <p class="footer">BTX Ops Hub</p>
  </div>
</template>

<style scoped>
.home {
  max-width: 560px;
  margin: 0 auto;
}

.date-line {
  margin: 0 0 4px;
  font-size: 12px;
  color: var(--color-text-secondary);
}

.heading {
  margin: 0 0 4px;
  font-size: 22px;
  font-weight: 700;
  color: var(--color-text-primary);
}

.subtext {
  margin: 0 0 20px;
  color: var(--color-text-secondary);
  font-size: 14px;
}

.section-list {
  margin-top: 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.sub-item-link {
  color: var(--color-accent);
  font-size: 14px;
  font-weight: 500;
  text-decoration: none;
}

.sub-item-link:hover {
  text-decoration: underline;
}

.footer {
  margin: 24px 0 0;
  text-align: center;
  font-size: 12px;
  color: var(--color-text-secondary);
}

.access-denied {
  margin: 0;
  color: var(--color-danger-text);
  font-weight: 600;
}
</style>
