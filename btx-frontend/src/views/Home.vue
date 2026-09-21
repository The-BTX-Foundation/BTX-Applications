<script setup>
import { computed, reactive } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useHomeSummary } from '@/composables/useHomeSummary'
import HomeMissionHero from '@/components/HomeMissionHero.vue'
import HomeOverdueBanner from '@/components/HomeOverdueBanner.vue'
import HomeAtAGlance from '@/components/HomeAtAGlance.vue'
import HomeSectionCard from '@/components/HomeSectionCard.vue'

const authStore = useAuthStore()
const summary = useHomeSummary()

// Today's date line, e.g. "Thursday, September 18". Computed fresh on
// every render rather than once at module load, so a page left open
// across midnight still shows the right day.
const todayLabel = computed(() =>
  new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
)

// The 8 sections. Scholarship leads the list; the next three (Alert
// Center, Task & Approval, Event Calendar) are flat, single-destination
// rows (routeName); the rest -- including Scholarship -- expand to reveal
// subItems, same shape as the old card grid's own `cards` array. Icon/
// color pairing matches the mockup's icon-tile spec. This order is Home's
// own -- the desktop sidebar (HomeView.vue's navSections) is a separate
// array and keeps its own order.
const SECTIONS = [
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

// Per-section pill text/tone, keyed by id -- pulled from useHomeSummary
// rather than baked into SECTIONS above, since these are reactive and
// SECTIONS is static. Some of useHomeSummary's own pill pairs are plain
// (non-reactive) strings rather than computed refs -- see its own comment
// on scholarshipPillText/eventPillTone/etc. -- so `.value` is only read
// where the source is actually a computed.
const pillInfo = computed(() => ({
  scholarship: { text: summary.scholarshipPillText, tone: summary.scholarshipPillTone },
  'alert-center': { text: summary.alertPillText.value, tone: summary.alertPillTone.value },
  'task-approval': { text: summary.taskPillText.value, tone: summary.taskPillTone.value },
  'event-calendar': { text: summary.eventPillText.value, tone: summary.eventPillTone },
  finance: { text: summary.financePillText.value, tone: summary.financePillTone.value },
  funding: { text: summary.fundingPillText.value, tone: summary.fundingPillTone },
  program: { text: summary.programPillText.value, tone: summary.programPillTone },
  marketing: { text: summary.marketingPillText.value, tone: summary.marketingPillTone },
}))

// Scholarship is rendered separately as the full-width featured card above
// the grid -- looked up by id (not SECTIONS[0]) so this keeps working
// regardless of where Scholarship sits in SECTIONS. gridSections is
// everything else, in SECTIONS' own order.
const scholarshipSection = computed(() => SECTIONS.find((section) => section.id === 'scholarship'))
const gridSections = SECTIONS.filter((section) => section.id !== 'scholarship')

// Route name of the first Scholarship sub-item, for the mission card's CTA
// button -- read off SECTIONS rather than hardcoded, so the button always
// points at whichever sub-item is actually listed first there.
const scholarshipRouteName = computed(() => scholarshipSection.value.subItems[0].routeName)

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
    <p class="subtext">
      A quick read on where things stand across every team, before you dive into a section.
    </p>

    <HomeMissionHero
      :scholars-display="summary.missionScholarsDisplay"
      :direct-aid-display="summary.missionDirectAidDisplay"
      :applicants-display="summary.missionApplicantsDisplay"
      :students-display="summary.missionStudentsDisplay"
      :cta-route-name="scholarshipRouteName"
    />

    <HomeOverdueBanner
      :loading="summary.heroLoading.value"
      :error="summary.heroError.value"
      :count="summary.overdueCount.value"
      :oldest-days-label="summary.oldestOverdue.value ? summary.dayLabel(summary.oldestOverdueDays.value) : null"
    />

    <h2 class="section-heading heading-glance">At a glance</h2>
    <HomeAtAGlance
      :runway="summary.runwayDisplay.value"
      :goal-percent="summary.goalPercentDisplay.value"
      :milestones-value="summary.milestonesDisplay.value"
      :milestones-label="summary.milestonesLabel.value"
    />

    <h2 class="section-heading heading-sections">Sections</h2>

    <HomeSectionCard
      :icon="scholarshipSection.icon"
      :color="scholarshipSection.color"
      :title="scholarshipSection.title"
      :pill-text="pillInfo.scholarship.text"
      :pill-tone="pillInfo.scholarship.tone"
      featured
      tag="CORE PROGRAM"
      :expanded="expandedSectionIds.has(scholarshipSection.id)"
      @toggle="toggleSection(scholarshipSection.id)"
    >
      <li v-for="item in scholarshipSection.subItems" :key="item.routeName">
        <RouterLink :to="{ name: item.routeName }" class="sub-item-link">{{ item.label }}</RouterLink>
      </li>
    </HomeSectionCard>

    <div class="section-grid">
      <template v-for="section in gridSections" :key="section.id">
        <HomeSectionCard
          v-if="section.flat"
          :icon="section.icon"
          :color="section.color"
          :title="section.title"
          :pill-text="pillInfo[section.id].text"
          :pill-tone="pillInfo[section.id].tone"
          flat
          :route-name="section.routeName"
        />
        <HomeSectionCard
          v-else
          :icon="section.icon"
          :color="section.color"
          :title="section.title"
          :pill-text="pillInfo[section.id].text"
          :pill-tone="pillInfo[section.id].tone"
          :expanded="expandedSectionIds.has(section.id)"
          @toggle="toggleSection(section.id)"
        >
          <li v-for="item in section.subItems" :key="item.routeName">
            <RouterLink :to="{ name: item.routeName }" class="sub-item-link">{{ item.label }}</RouterLink>
          </li>
        </HomeSectionCard>
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
  margin: 0 0 6px;
  font-size: 12px;
  font-weight: 700;
  color: var(--color-header-muted);
}

/* 27px keeps this exact heading text on one line at both 390px and 428px
   with real margin to spare (measured against the actual rendered box:
   ~14px of slack at 390px, vs. 28px's own ~1px -- too tight to trust
   across different platforms' font hinting/anti-aliasing) -- against
   Home's own tightened side margins (see HomeView.vue's .page--home).
   Playfair Display runs noticeably wider than a generic serif at the same
   size, so this reads smaller than the 30px cap below might suggest.
   Below 360px it's expected to wrap onto two lines; from 600px up, where
   the extra width comfortably fits, it steps up to the full 30px. */
.heading {
  margin: 0 0 8px;
  font-family: var(--font-serif);
  font-size: 27px;
  font-weight: 700;
  line-height: 1.15;
  color: var(--color-header-strong);
}

@media (min-width: 600px) {
  .heading {
    font-size: 30px;
  }
}

.subtext {
  margin: 0 0 20px;
  color: var(--color-header-muted);
  font-size: 14px;
  line-height: 1.5;
}

/* Holds the 7 non-Scholarship cards (Scholarship itself is the full-width
   featured card rendered just above this, outside the grid). Marketing --
   the 7th, odd-one-out card -- lands alone in the last row at half width,
   left, purely from grid auto-placement; no extra rule needed for that.
   align-items: start (not the grid default stretch) is what lets an
   expanded card grow downward without stretching its row neighbor to
   match -- see HomeSectionCard.vue's own comment on why that neighbor's
   height is otherwise untouched. */
.section-grid {
  margin-top: 10px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  align-items: start;
}

/* Neither heading takes data-page-heading -- Home's own <h1> above is
   still the page's one real heading for the sticky mobile bar/scroll
   tracking (see HomeView.vue); these two are just section labels. Margins
   carry all the spacing between the banner/tiles/rows above and below
   each one, rather than gaps on the tiles/cards themselves, so
   HomeAtAGlance.vue's and .section-grid's own gaps stay untouched. The
   10px from this heading down to the Scholarship card underneath it is
   likewise just this heading's own margin-bottom -- Scholarship needs no
   margin-top of its own. */
.section-heading {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.heading-glance {
  margin: 22px 0 10px;
}

.heading-sections {
  margin: 24px 0 10px;
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
