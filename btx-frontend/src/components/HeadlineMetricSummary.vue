<script setup>
import { computed, ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useTasksAlertsStore } from '@/stores/tasksAlerts'
import { useDonorImpactStore } from '@/stores/donorImpact'

const authStore = useAuthStore()
const tasksAlertsStore = useTasksAlertsStore()
const donorImpactStore = useDonorImpactStore()

// Page-access gate matching every other page in this app -- admin,
// board, and reviewer only, mirroring donor_impact's and tasks_alerts' RLS
// SELECT policies, so this reflects (rather than restricts beyond) what the
// backend already allows each role to read.
const canView = computed(() => authStore.isAdmin || authStore.isBoard || authStore.isReviewer)

// Tracks whether this page's real data (Total Raised, Pending Tasks) has
// loaded yet, so those values don't flash "0" before the fetch resolves.
const metricsLoaded = ref(false)

// Refetches this page's data sources whenever the signed-in user changes
// (sign in, sign out, switch accounts). Skips the fetch entirely for roles
// RLS wouldn't return donor_impact/tasks_alerts rows to anyway.
watch(
  () => authStore.session?.user?.id ?? null,
  async (userId) => {
    if (userId && canView.value) {
      await Promise.all([donorImpactStore.fetchCycles(), tasksAlertsStore.fetchGlobalOpenCount()])
      metricsLoaded.value = true
    } else {
      metricsLoaded.value = false
    }
  },
  { immediate: true },
)
</script>

<template>
  <h2 v-if="!authStore.session">Sign in</h2>
  <p v-else-if="!canView" class="access-denied">Access Denied</p>

  <section v-else class="headline-metric">
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
</template>

<style scoped>
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

/* Reuses Home.vue's .card-counter small-gray secondary-text convention
   (same size/color) rather than inventing a new subtext style. */
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

/* Matches FundraisingHealth.vue's/BudgetTracking.vue's access-denied styling. */
.access-denied {
  margin: 0;
  color: #b3261e;
  font-weight: 600;
}

/* Below 850px (matching HomeView.vue's sidebar-drawer breakpoint, so the
   whole app switches to its mobile layout at one consistent width), the
   metric cards drop to a single column instead of the desktop
   grid-template-columns count above. */
@media (max-width: 850px) {
  .metric-cards {
    grid-template-columns: repeat(1, 1fr);
  }
}
</style>
