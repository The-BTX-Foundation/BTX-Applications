<script setup>
import { computed, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useDonorImpactStore } from '@/stores/donorImpact'
import { useTasksAlertsStore } from '@/stores/tasksAlerts'

const authStore = useAuthStore()
const donorImpactStore = useDonorImpactStore()
const tasksAlertsStore = useTasksAlertsStore()

// Only admin (full access) and board (view-only) can see this page,
// matching the donor_impact RLS policy and the same gating pattern used by
// DonorImpactWorkflow.vue — reviewer/applicant get "Access Denied" instead
// of a fetch attempt.
const canView = computed(() => authStore.isAdmin || authStore.isBoard)

// PLACEHOLDER — wire to the applications table once Scholarship Hub ships.
const applicationsThisCycle = 128

// PLACEHOLDER — wire to the interviews table once Scholarship Hub ships.
const upcomingInterviews = 12

// PLACEHOLDER — static bars matching the shape of DonorImpactWorkflow.vue's
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

// Refetch the real metric sources whenever the signed-in user changes
// (sign in, sign out, switch accounts). Skips the fetch entirely while
// signed out or for a role that can't view this page, since RLS would just
// reject donor_impact reads before the user ever gets a chance to see them.
watch(
  () => authStore.session?.user?.id ?? null,
  (userId) => {
    if (userId && canView.value) {
      donorImpactStore.fetchCycles()
      tasksAlertsStore.fetchGlobalOpenCount()
    }
  },
  { immediate: true },
)
</script>

<template>
  <h2 v-if="!authStore.session">Sign in</h2>
  <p v-else-if="!canView" class="access-denied">Access Denied</p>

  <template v-else>
    <p v-if="donorImpactStore.loading">Loading metrics…</p>
    <p v-else-if="donorImpactStore.error" class="error">{{ donorImpactStore.error }}</p>

    <div v-else class="headline-metric">
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
    </div>
  </template>
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

.access-denied {
  margin: 0;
  color: #b3261e;
  font-weight: 600;
}
</style>
