<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useProgramPlanProgressStore } from '@/stores/programPlanProgress'

const authStore = useAuthStore()
const programPlanProgressStore = useProgramPlanProgressStore()

// Same page-access gate as DonorImpact.vue/FundraisingHealth.vue: admin,
// board, and reviewer can view; applicant is blocked. Matches
// program_plan_progress's own RLS SELECT policy exactly.
const canView = computed(() => authStore.isAdmin || authStore.isBoard || authStore.isReviewer)

onMounted(() => {
  authStore.init()
})

// Refetch whenever the signed-in user changes (sign in, sign out, switch
// accounts). Skips the fetch entirely while signed out or for a role that
// can't view this page, since RLS would just reject it with a
// permission-denied error before the user ever gets a chance to act.
watch(
  () => authStore.session?.user?.id ?? null,
  (userId) => {
    if (userId && canView.value) {
      programPlanProgressStore.fetchPlans()
    }
  },
  { immediate: true },
)

const selectedPlanYear = ref(null)

// Auto-select the most recent plan year (plans are fetched newest-year-
// first) once they load, if nothing is selected yet.
watch(
  () => programPlanProgressStore.plans,
  (plans) => {
    if (selectedPlanYear.value === null && plans.length > 0) {
      selectedPlanYear.value = plans[0].plan_year
    }
  },
)

const selectedPlan = computed(() =>
  programPlanProgressStore.plans.find((plan) => plan.plan_year === selectedPlanYear.value),
)

// program_plan_progress has no published/live-vs-archived column -- every
// row here is a real synced progress snapshot, not a draft/live state like
// donor_impact's `published` flag. Live is inferred the same way
// DonorImpact.vue infers its own Live badge for a column that doesn't
// exist: the single most recent plan year gets "Live", every other plan
// year gets "Archived".
const liveYear = computed(() => {
  const years = programPlanProgressStore.plans.map((plan) => plan.plan_year)
  return years.length > 0 ? Math.max(...years) : null
})

// Builds a plan card's badge text/variant from the inferred liveYear above.
function badgeFor(plan) {
  return plan.plan_year === liveYear.value
    ? { text: 'Live', variant: 'live' }
    : { text: 'Archived', variant: 'default' }
}
</script>

<template>
  <h2 v-if="!authStore.session">Sign in</h2>
  <p v-else-if="!canView" class="access-denied">Access Denied</p>

  <template v-else>
    <p v-if="programPlanProgressStore.loading">Loading plans…</p>
    <p v-else-if="programPlanProgressStore.error" class="error">{{ programPlanProgressStore.error }}</p>

    <div v-else class="progress-to-goal">
      <div class="plan-column">
        <div class="plan-column-header">
          <h2>Program Plans</h2>
          <p class="column-subtitle">Drives the homepage widget</p>
        </div>

        <p v-if="programPlanProgressStore.plans.length === 0" class="empty">No program plans yet.</p>

        <ul v-else class="plan-list">
          <li v-for="plan in programPlanProgressStore.plans" :key="plan.plan_year">
            <button
              type="button"
              class="plan-card"
              :class="{ 'plan-card--active': plan.plan_year === selectedPlanYear }"
              @click="selectedPlanYear = plan.plan_year"
            >
              <span class="plan-name">{{ plan.plan_year }} Program Plan</span>
              <span class="badge" :class="`badge--${badgeFor(plan).variant}`">
                {{ badgeFor(plan).text }}
              </span>
            </button>
          </li>
        </ul>
      </div>

      <div v-if="selectedPlan" class="detail-column">
        <h2>{{ selectedPlan.plan_year }} Program Plan</h2>

        <div class="stats-grid">
          <div class="stat">
            <span class="stat-label">Milestones Complete</span>
            <span class="stat-value">{{ selectedPlan.milestones_complete }} / {{ selectedPlan.milestones_total }}</span>
          </div>

          <div class="stat">
            <span class="stat-label">Tasks Complete</span>
            <span class="stat-value">{{ selectedPlan.tasks_complete }} / {{ selectedPlan.tasks_total }}</span>
          </div>

          <div class="stat">
            <span class="stat-label">In Progress</span>
            <span class="stat-value">{{ selectedPlan.tasks_in_progress }}</span>
          </div>

          <div class="stat">
            <span class="stat-label">Not Yet Started</span>
            <span class="stat-value">{{ selectedPlan.tasks_not_started }}</span>
          </div>
        </div>
      </div>
    </div>
  </template>
</template>

<style scoped>
.progress-to-goal {
  display: flex;
  gap: 24px;
  align-items: flex-start;
}

.plan-column {
  flex-shrink: 0;
  width: 240px;
}

.plan-column-header {
  margin-bottom: 12px;
}

.plan-column-header h2 {
  margin: 0;
  font-size: 18px;
}

.column-subtitle {
  margin: 4px 0 0;
  font-size: 12px;
  color: #8a8a85;
}

.empty {
  color: #8a8a85;
  font-size: 13px;
}

.plan-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.plan-card {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  background: #fff;
  border: 0.5px solid #e5e3dd;
  border-radius: 12px;
  padding: 12px 14px;
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.plan-card--active {
  border: 1px solid #c9932a;
}

.plan-name {
  font-size: 15px;
  font-weight: 500;
  color: #2d3142;
}

/* Same badge styling as DonorImpact.vue's Live/Archived cycle badges. */
.badge {
  flex-shrink: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 999px;
  white-space: nowrap;
}

.badge--live {
  background: #e3f1e1;
  color: #2e7d32;
}

.badge--default {
  background: #f1efe8;
  color: #5f5e5a;
}

.detail-column {
  flex: 1;
  min-width: 0;
}

.detail-column h2 {
  margin: 0 0 16px;
  font-size: 18px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20px;
}

.stat {
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: #fff;
  border: 0.5px solid #e5e3dd;
  border-radius: 12px;
  padding: 16px 18px;
}

.stat-label {
  font-size: 12px;
  font-weight: 600;
  color: #4a4a4a;
}

.stat-value {
  font-size: 22px;
  font-weight: 600;
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
