<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useTasksAlertsStore } from '@/stores/tasksAlerts'
import { useDonorImpactStore } from '@/stores/donorImpact'

const authStore = useAuthStore()
const tasksAlertsStore = useTasksAlertsStore()
const donorImpactStore = useDonorImpactStore()

// The 5 landing-page cards. subItems map to real routes for Program and
// Task & Approval (which have built pages) and to placeholder routes for
// the other sections, which don't have real sub-pages yet. Alert Center is
// deliberately absent — it lives only in the sidebar, not on the homepage.
const cards = [
  {
    id: 'finance-funding',
    title: 'Finance & Funding',
    description: 'Budget tracking & fundraising totals',
    meta: '→ 4 tabs (2 built, 2 concept)',
    subItems: [
      { label: 'Budget Tracking', routeName: 'finance-budget-tracking' },
      { label: 'Budgeting Tasks', routeName: 'finance-budgeting-tasks' },
      { label: 'Fundraising Totals', routeName: 'finance-fundraising-totals' },
      { label: 'Fundraising Tasks', routeName: 'finance-fundraising-tasks' },
    ],
  },
  {
    id: 'program',
    title: 'Program',
    description: 'Awardee workflows, progress tracking & donor impact',
    meta: '→ 3 tabs',
    subItems: [
      { label: 'Awardee Workflow', routeName: 'awardee-workflow' },
      { label: 'Progress-to-Goal', routeName: 'progress-to-goal' },
      { label: 'Donor Impact', routeName: 'donor-impact' },
    ],
  },
  {
    id: 'marketing',
    title: 'Marketing',
    description: 'Outreach & campaign tracking',
    meta: '→ 2 tabs (1 built, 1 concept)',
    subItems: [
      { label: 'Calendar', routeName: 'marketing-calendar' },
      { label: 'Marketing Tasks', routeName: 'marketing-tasks' },
    ],
  },
  {
    id: 'scholarship',
    title: 'Scholarship',
    description: 'Scoring, interviews & applicant records',
    meta: '→ 3 tabs',
    subItems: [
      { label: 'Scoring', routeName: 'scholarship-scoring' },
      { label: 'Interviews', routeName: 'scholarship-interviews' },
      { label: 'Applicant Records', routeName: 'scholarship-applicant-records' },
    ],
  },
  {
    id: 'task-approval',
    title: 'Task & Approval',
    description: 'Review and act on tasks and approvals assigned to you',
    meta: '→ 1 tab (built)',
    subItems: [{ label: 'Task & Approval', routeName: 'tasks' }],
  },
]

// Tracks whether the Program card's assigned-open-items count has loaded
// yet, so the metric line doesn't flash "0" before the real value arrives.
const assignedCountLoaded = ref(false)

// Headline Metrics section, moved here from the deleted
// FinanceFundingHeadlineMetric view/component. Only admin, board, and
// reviewer can see it — matches donor_impact's and tasks_alerts' RLS SELECT
// policies, so this mirrors (rather than restricts beyond) what the backend
// already allows each role to read.
const canView = computed(() => authStore.isAdmin || authStore.isBoard || authStore.isReviewer)

// PLACEHOLDER — wire to the applications table once Scholarship Hub ships.
const applicationsThisCycle = 128

// PLACEHOLDER — wire to the interviews table once Scholarship Hub ships.
const upcomingInterviews = 12

// PLACEHOLDER — static bars matching the shape of DonorImpact.vue's
// hand-rolled bar chart, until a real applications-by-month query exists.
const applicationsByMonth = [
  { label: 'Apr', value: 18 },
  { label: 'May', value: 34 },
  { label: 'Jun', value: 47 },
  { label: 'Jul', value: 61 },
]
const maxMonthlyApplications = Math.max(...applicationsByMonth.map((m) => m.value))

// Bar height as a percentage of the highest placeholder month value.
function monthBarHeight(month) {
  return `${(month.value / maxMonthlyApplications) * 100}%`
}

// Tracks whether the Headline Metrics section's real data (Total Raised,
// Pending Tasks) has loaded yet, so those values don't flash "0" before the
// fetch resolves — same guard pattern as assignedCountLoaded above.
const metricsLoaded = ref(false)

// Refetches the Program card's assigned count and, for roles that can view
// the Headline Metrics section, its real data sources — whenever the
// signed-in user changes (sign in, sign out, switch accounts). Skips all
// fetches while signed out; skips the metrics fetches for roles RLS
// wouldn't return donor_impact/tasks_alerts rows to anyway.
watch(
  () => authStore.session?.user?.id ?? null,
  async (userId) => {
    if (userId) {
      await tasksAlertsStore.fetchAssignedOpenCount(userId)
      assignedCountLoaded.value = true

      if (canView.value) {
        await Promise.all([donorImpactStore.fetchCycles(), tasksAlertsStore.fetchGlobalOpenCount()])
        metricsLoaded.value = true
      }
    } else {
      assignedCountLoaded.value = false
      metricsLoaded.value = false
    }
  },
  { immediate: true },
)

// Tracks which cards are expanded; multiple cards can be open at once.
const expandedCardIds = reactive(new Set())

// Expands or collapses a card's sub-item list.
function toggleCard(id) {
  if (expandedCardIds.has(id)) {
    expandedCardIds.delete(id)
  } else {
    expandedCardIds.add(id)
  }
}
</script>

<template>
  <div class="home">
    <!-- heading--with-metrics only applies when the metrics section below it
         renders, so it can resolve its own bottom margin (no subtext directly
         beneath it anymore) without changing the default heading spacing for
         roles that never see that section. -->
    <h1 class="heading" :class="{ 'heading--with-metrics': canView }">Welcome to BTX Ops Hub</h1>

    <!-- Headline Metrics: admin/board/reviewer only. Omitted entirely (no
         "Access Denied") for roles that can't view it, since this section
         sits on the general homepage everyone lands on. -->
    <section v-if="canView" class="headline-metric">
      <p v-if="donorImpactStore.loading || !metricsLoaded">Loading metrics…</p>
      <p v-else-if="donorImpactStore.error" class="error">{{ donorImpactStore.error }}</p>

      <template v-else>
        <h2 class="page-title">Headline Metrics</h2>

        <div class="metric-cards">
          <div class="metric-card">
            <span class="metric-label">Total Raised</span>
            <span class="metric-value">${{ donorImpactStore.totalRaised.toLocaleString() }}</span>
          </div>
          <div class="metric-card">
            <span class="metric-label">Applications This Cycle</span>
            <span class="metric-value">{{ applicationsThisCycle.toLocaleString() }}</span>
          </div>
          <div class="metric-card">
            <span class="metric-label">Pending Tasks</span>
            <span class="metric-value">{{ tasksAlertsStore.globalOpenCount.toLocaleString() }}</span>
          </div>
          <div class="metric-card">
            <span class="metric-label">Upcoming Interviews</span>
            <span class="metric-value">{{ upcomingInterviews.toLocaleString() }}</span>
          </div>
        </div>

        <div class="chart">
          <h3>Applications by Month</h3>
          <div class="bars">
            <div v-for="month in applicationsByMonth" :key="month.label" class="bar-col">
              <span class="bar-value">{{ month.value }}</span>
              <div class="bar" :style="{ height: monthBarHeight(month) }"></div>
              <span class="bar-label">{{ month.label }}</span>
            </div>
          </div>
        </div>
      </template>
    </section>

    <!-- Hairline separator between Headline Metrics and the cards grid;
         only rendered alongside the metrics section itself so non-privileged
         roles (which never see that section) get no orphan rule here. -->
    <div v-if="canView" class="section-divider"></div>

    <!-- Doubles as the intro line for the cards grid below (not just a
         generic page subtext), so it's kept unconditional and positioned
         directly above the grid rather than tied to canView. -->
    <p class="subtext">Select a section below, or from the sidebar, to get started.</p>

    <div class="card-grid">
      <div v-for="card in cards" :key="card.id" class="card" :class="{ 'card--expanded': expandedCardIds.has(card.id) }">
        <button type="button" class="card-header" @click="toggleCard(card.id)">
          <div class="card-header-text">
            <h2 class="card-title">{{ card.title }}</h2>
            <p class="card-description">{{ card.description }}</p>
            <p class="card-meta">{{ card.meta }}</p>
            <!-- Lives on the card face (outside the expandable sub-item
                 list below) so it's visible whether the card is expanded
                 or collapsed. Gated on assignedCountLoaded to avoid a "0"
                 flash before the real count arrives. -->
            <p v-if="card.id === 'task-approval' && assignedCountLoaded" class="card-counter">
              {{ tasksAlertsStore.assignedOpenCount }}
              open item{{ tasksAlertsStore.assignedOpenCount === 1 ? '' : 's' }} assigned to you
            </p>
          </div>
          <svg
            class="chevron"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        <ul v-if="expandedCardIds.has(card.id)" class="sub-item-list">
          <li v-for="item in card.subItems" :key="item.routeName">
            <RouterLink :to="{ name: item.routeName }" class="sub-item-link">{{ item.label }}</RouterLink>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<style scoped>
.heading {
  margin: 0 0 4px;
  font-size: 22px;
  font-weight: 700;
}

/* Applies only when the metrics section renders directly below (see
   :class binding in the template) — resolves the heading on its own now
   that the subtext no longer sits right beneath it for those roles. */
.heading--with-metrics {
  margin-bottom: 24px;
}

.subtext {
  margin: 0 0 20px;
  color: #6b6b6b;
  font-size: 14px;
}

.headline-metric {
  margin-bottom: 40px;
}

/* Hairline rule matching the app's existing light-hairline color (already
   used for .card's border and .sub-item-list's border-top below). */
.section-divider {
  height: 1px;
  background: #ececec;
  margin: 0 0 24px;
}

.page-title {
  margin: 0 0 20px;
  font-size: 18px;
}

.metric-cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 32px;
}

.metric-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: #fff;
  border: 0.5px solid #e5e3dd;
  border-radius: 12px;
  padding: 16px;
}

.metric-label {
  font-size: 13px;
  color: #8a8a85;
}

.metric-value {
  font-size: 24px;
  font-weight: 600;
  color: #c9932a;
}

.chart h3 {
  margin: 0 0 16px;
  font-size: 14px;
  font-weight: 500;
  color: #2d3142;
}

.bars {
  display: flex;
  align-items: flex-end;
  gap: 20px;
  height: 180px;
}

.bar-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  height: 100%;
  width: 48px;
}

.bar-value {
  font-size: 12px;
  color: #8a8a85;
  margin-bottom: 4px;
}

.bar {
  width: 100%;
  background: #c9932a;
  border-radius: 4px 4px 0 0;
}

.bar-label {
  margin-top: 8px;
  font-size: 13px;
  color: #2d3142;
}

.error {
  color: #b3261e;
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}

.card {
  background: #fff;
  border: 1px solid #ececec;
  border-radius: 12px;
  overflow: hidden;
}

.card-header {
  width: 100%;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  background: none;
  border: none;
  padding: 20px;
  text-align: left;
  cursor: pointer;
}

.card-header-text {
  min-width: 0;
}

.card-title {
  margin: 0 0 6px;
  font-size: 16px;
  font-weight: 600;
  color: #1a1a1a;
}

.card-description {
  margin: 0 0 8px;
  font-size: 13px;
  color: #6b6b6b;
}

.card-meta {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: #d4a24e;
}

.chevron {
  flex-shrink: 0;
  margin-top: 4px;
  color: #8a8a8a;
  opacity: 0;
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}

.card-header:hover .chevron,
.card--expanded .chevron {
  opacity: 1;
}

.card--expanded .chevron {
  transform: rotate(180deg);
}

.sub-item-list {
  list-style: none;
  margin: 0;
  padding: 0 20px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-top: 1px solid #ececec;
  padding-top: 12px;
}

.sub-item-link {
  color: #d4a24e;
  font-size: 14px;
  font-weight: 500;
  text-decoration: none;
}

.sub-item-link:hover {
  text-decoration: underline;
}

.card-counter {
  margin: 4px 0 0;
  font-size: 12px;
  color: #9a9a9a;
}
</style>
