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
    description: 'Budget tracking & fundraising health',
    meta: 'See details →',
    subItems: [
      { label: 'Budget Tracking', routeName: 'finance-budget-tracking' },
      { label: 'Budgeting Tasks', routeName: 'finance-budgeting-tasks' },
      { label: 'Fundraising Health', routeName: 'finance-fundraising-health' },
      { label: 'Fundraising Tasks', routeName: 'finance-fundraising-tasks' },
    ],
  },
  {
    id: 'program',
    title: 'Program',
    description: 'Awardee workflows, progress tracking & donor impact',
    meta: 'See details →',
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
    meta: 'See details →',
    subItems: [
      { label: 'Calendar', routeName: 'marketing-calendar' },
      { label: 'Marketing Tasks', routeName: 'marketing-tasks' },
    ],
  },
  {
    id: 'scholarship',
    title: 'Scholarship',
    description: 'Scoring, interviews & applicant records',
    meta: 'See details →',
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
    meta: 'See details →',
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

        <!-- PLACEHOLDER — static Scholarship rollup figures, not wired to any
             store or table. No Scholarship backing tables exist yet, so
             these are hand-entered values kept only until a real query can
             replace them (see the Program Allocation table below, which
             ties back to these same figures). -->
        <div class="metric-cards">
          <div class="metric-card">
            <span class="metric-label">Total Program Funding Disbursed</span>
            <span class="metric-value">$53,907.23</span>
            <span class="metric-subtext">96.5% Direct Academic Aid | 3.5% Conference Travel</span>
          </div>
          <div class="metric-card">
            <span class="metric-label">Total Scholars Awarded</span>
            <span class="metric-value">13 Scholars</span>
            <span class="metric-subtext">Across 7 active scholarship cycles ($4,000 average disbursement)</span>
          </div>
          <div class="metric-card">
            <span class="metric-label">Total Tracked Student Reach</span>
            <span class="metric-value">288 Students</span>
            <span class="metric-subtext">13 Scholars + 3 Travel Awardees + 272 Campus Outreach Attendees</span>
          </div>
          <div class="metric-card">
            <span class="metric-label">Total Applicants Engaged</span>
            <span class="metric-value">70 Applicants</span>
            <span class="metric-subtext">~10 applicants per active award cycle</span>
          </div>
        </div>

        <!-- PLACEHOLDER — static Program Allocation rollup, not wired to any
             store or table. No Scholarship backing tables exist yet, so
             these mirror metric-cards above: hand-entered values kept only
             until a real query can replace them. Split into two portfolios
             -- Funding and Student Reach -- each summing independently to
             ~100%, with a sub-header row above each group so "% of
             Portfolio" is never ambiguous about which total it's measured
             against. Every figure ties back to metric-cards above: the
             $53,907.23 funding total (96.5% / 3.5% split) and the 288
             Total Tracked Student Reach (13 + 3 + 272). -->
        <div class="allocation-panel">
          <h3>Program Allocation</h3>
          <!-- Horizontal-scroll wrapper at narrow widths -- same overflow-x
               pattern as .bars-scroll elsewhere in the app -- since the
               4-column table (especially Key Milestone Highlights) doesn't
               fit a mobile viewport without it. -->
          <div class="allocation-table-scroll">
            <table class="allocation-table">
              <thead>
                <tr>
                  <th>Metric Category</th>
                  <th>Disbursed/Tracked</th>
                  <th>% of Portfolio</th>
                  <th>Key Milestone Highlights</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colspan="4" class="allocation-group-label">Funding</td>
                </tr>
                <tr>
                  <td class="allocation-category">Direct Academic Aid</td>
                  <td>$52,020.48</td>
                  <td>96.5%</td>
                  <td>13 Scholars funded across 7 active scholarship cycles ($4,000 average disbursement)</td>
                </tr>
                <tr>
                  <td class="allocation-category">Conference Travel</td>
                  <td>$1,886.75</td>
                  <td>3.5%</td>
                  <td>3 Travel Awardees supported for academic conference attendance</td>
                </tr>
                <tr>
                  <td colspan="4" class="allocation-group-label">Student Reach</td>
                </tr>
                <tr>
                  <td class="allocation-category">Scholars Awarded</td>
                  <td>13 Scholars</td>
                  <td>4.5%</td>
                  <td>Core award cohort within the 288 Total Tracked Student Reach</td>
                </tr>
                <tr>
                  <td class="allocation-category">Travel Awardees</td>
                  <td>3 Students</td>
                  <td>1.0%</td>
                  <td>Conference travel recipients within the 288 Total Tracked Student Reach</td>
                </tr>
                <tr>
                  <td class="allocation-category">Campus Outreach</td>
                  <td>272 Students</td>
                  <td>94.4%</td>
                  <td>Largest share of the 288 Total Tracked Student Reach, via on-campus engagement events</td>
                </tr>
              </tbody>
            </table>
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

/* Reuses .card-counter's small-gray secondary-text convention below (same
   size/color) rather than inventing a new subtext style. */
.metric-subtext {
  font-size: 12px;
  color: #9a9a9a;
}

/* Program Allocation card+table: reuses the app's established card/table
   convention verbatim (same shape as FundraisingHealth.vue's
   .revenue-panel/.revenue-table and BudgetTracking.vue's .variance-panel/
   .variance-table) rather than inventing new styling. */
.allocation-panel {
  border: 0.5px solid #e5e3dd;
  border-radius: 12px;
  padding: 20px;
  background: #fff;
  margin-bottom: 20px;
}

.allocation-panel h3 {
  margin: 0 0 16px;
  font-size: 14px;
  font-weight: 500;
  color: #2d3142;
}

/* Matches .bars-scroll's convention (FundraisingHealth.vue) -- harmless at
   desktop widths since overflow-x: auto only activates once .allocation-table's
   own min-width genuinely exceeds the panel. */
.allocation-table-scroll {
  overflow-x: auto;
}

.allocation-table {
  width: 100%;
  min-width: 640px;
  border-collapse: collapse;
}

.allocation-table th {
  text-align: left;
  font-size: 12px;
  font-weight: 600;
  color: #8a8a85;
  padding: 0 8px 8px 0;
}

.allocation-table td {
  padding: 6px 8px 6px 0;
  font-size: 14px;
  color: #2d3142;
}

.allocation-category {
  font-weight: 500;
}

/* Sub-header row separating the two portfolios (Funding vs. Student Reach)
   so "% of Portfolio" is never ambiguous about which total it's measured
   against -- matches .metrics-group-header's uppercase small-caps
   convention (FundraisingHealth.vue's "REVENUE SOURCES" label). */
.allocation-group-label {
  padding: 12px 8px 6px 0;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #8a8a85;
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

/* Below 850px (matching HomeView.vue's sidebar-drawer breakpoint, so the
   whole app switches to its mobile layout at one consistent width), both
   grids drop to a single column instead of the desktop grid-template-columns
   counts above -- full stacking rather than an intermediate multi-column
   layout, same as every other page's 850px query in this app. Nothing above
   this query is touched, so desktop layout is unaffected. */
@media (max-width: 850px) {
  .metric-cards {
    grid-template-columns: repeat(1, 1fr);
  }

  .card-grid {
    grid-template-columns: repeat(1, 1fr);
  }
}
</style>
