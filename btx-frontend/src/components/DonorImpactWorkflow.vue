<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useDonorImpactStore } from '@/stores/donorImpact'

const authStore = useAuthStore()
const donorImpactStore = useDonorImpactStore()

// Metrics selectable via the chart's tab bar, in display order. `format`
// drives how bar-top values are rendered (currency vs. plain number).
const CHART_METRICS = [
  { key: 'funds_granted', label: 'Funds Granted', format: 'currency' },
  { key: 'students_reached', label: 'Students Reached', format: 'number' },
  { key: 'scholarships_awarded', label: 'Scholarships Awarded', format: 'number' },
]

// Only admin (edit) and board (view-only) can see this workflow at all,
// matching the donor_impact RLS policy — other roles never get a fetch
// attempt, just the same "Access Denied" treatment used elsewhere.
const canView = computed(() => authStore.isAdmin || authStore.isBoard)

const selectedMetricId = ref(null)
const draft = reactive({ funds_granted: 0, students_reached: 0, scholarships_awarded: 0 })
const saving = ref(false)
const showAddCycle = ref(false)
const newCycleYear = ref(null)
const addingCycle = ref(false)
const chartMetricKey = ref('funds_granted')

onMounted(() => {
  authStore.init()
})

// Refetch whenever the signed-in user changes (sign in, sign out, switch
// accounts). Skips the fetch entirely while signed out or for a role that
// can't view this workflow, since RLS would just reject it with a
// permission-denied error before the user ever gets a chance to act.
watch(
  () => authStore.session?.user?.id ?? null,
  (userId) => {
    if (userId && canView.value) {
      donorImpactStore.fetchCycles()
    }
  },
  { immediate: true },
)

// Auto-select the most recent cycle (cycles are fetched newest-year-first)
// once they load, if nothing is selected yet.
watch(
  () => donorImpactStore.cycles,
  (cycles) => {
    if (!selectedMetricId.value && cycles.length > 0) {
      selectedMetricId.value = cycles[0].metric_id
    }
  },
)

const selectedCycle = computed(() =>
  donorImpactStore.cycles.find((cycle) => cycle.metric_id === selectedMetricId.value),
)

// Resets the edit form whenever the selected cycle changes, so in-progress
// edits on one cycle never leak into another.
watch(selectedCycle, (cycle) => {
  if (!cycle) return
  draft.funds_granted = cycle.funds_granted
  draft.students_reached = cycle.students_reached
  draft.scholarships_awarded = cycle.scholarships_awarded
})

// The most recent published year — that card gets the "Live" badge, every
// other published card gets "Archived".
const liveYear = computed(() => {
  const publishedYears = donorImpactStore.cycles.filter((c) => c.published).map((c) => c.cycle_year)
  return publishedYears.length > 0 ? Math.max(...publishedYears) : null
})

// Builds a cycle card's badge text/variant. Unpublished (draft) cycles get
// no badge at all.
function badgeFor(cycle) {
  if (!cycle.published) return null
  return cycle.cycle_year === liveYear.value
    ? { text: 'Live', variant: 'live' }
    : { text: 'Archived', variant: 'default' }
}

// Published cycles, oldest first, for the bar chart's left-to-right timeline.
const publishedCycles = computed(() =>
  donorImpactStore.cycles.filter((c) => c.published).sort((a, b) => a.cycle_year - b.cycle_year),
)

// The metric definition backing the chart's currently selected tab.
const chartMetric = computed(() => CHART_METRICS.find((m) => m.key === chartMetricKey.value))

const maxChartValue = computed(() =>
  Math.max(...publishedCycles.value.map((c) => c[chartMetricKey.value]), 1),
)

// Bar height as a percentage of the highest published value for the
// selected metric.
function barHeight(cycle) {
  return `${(cycle[chartMetricKey.value] / maxChartValue.value) * 100}%`
}

// Formats a cycle's bar-top label for the selected metric — currency for
// Funds Granted, a plain thousands-separated number otherwise.
function formatBarValue(cycle) {
  const value = cycle[chartMetricKey.value]
  return chartMetric.value.format === 'currency' ? `$${value.toLocaleString()}` : value.toLocaleString()
}

// Saves the edit form's values to the selected cycle and publishes it.
async function handleSave() {
  if (!selectedCycle.value) return
  saving.value = true
  await donorImpactStore.saveAndPublish(selectedCycle.value.metric_id, {
    funds_granted: Number(draft.funds_granted),
    students_reached: Number(draft.students_reached),
    scholarships_awarded: Number(draft.scholarships_awarded),
  })
  saving.value = false
}

// Creates a new draft cycle for the given year and selects it for editing.
async function handleAddCycle() {
  if (!newCycleYear.value) return
  addingCycle.value = true
  const created = await donorImpactStore.createCycle(Number(newCycleYear.value))
  addingCycle.value = false

  if (created) {
    selectedMetricId.value = created.metric_id
    newCycleYear.value = null
    showAddCycle.value = false
  }
}
</script>

<template>
  <h2 v-if="!authStore.session">Sign in</h2>
  <p v-else-if="!canView" class="access-denied">Access Denied</p>

  <template v-else>
    <p v-if="donorImpactStore.loading">Loading cycles…</p>
    <p v-else-if="donorImpactStore.error" class="error">{{ donorImpactStore.error }}</p>

    <div v-else class="donor-impact">
      <div class="cycle-column">
        <div class="cycle-column-header">
          <h2>Reporting Cycles</h2>
          <button
            v-if="authStore.isAdmin"
            type="button"
            class="btn btn--outline"
            @click="showAddCycle = !showAddCycle"
          >
            + Add Cycle
          </button>
        </div>

        <form v-if="showAddCycle" class="add-cycle" @submit.prevent="handleAddCycle">
          <input v-model.number="newCycleYear" type="number" placeholder="Year" required />
          <button type="submit" class="btn btn--gold" :disabled="addingCycle">Create</button>
        </form>

        <ul class="cycle-list">
          <li v-for="cycle in donorImpactStore.cycles" :key="cycle.metric_id">
            <button
              type="button"
              class="cycle-card"
              :class="{ 'cycle-card--active': cycle.metric_id === selectedMetricId }"
              @click="selectedMetricId = cycle.metric_id"
            >
              <span class="cycle-year">{{ cycle.cycle_year }}</span>
              <span
                v-if="badgeFor(cycle)"
                class="badge"
                :class="`badge--${badgeFor(cycle).variant}`"
              >
                {{ badgeFor(cycle).text }}
              </span>
            </button>
          </li>
        </ul>
      </div>

      <div v-if="selectedCycle" class="detail-column">
        <h2>{{ selectedCycle.cycle_year }} Metrics</h2>

        <form class="metrics-form" @submit.prevent="handleSave">
          <label>
            Funds Granted
            <input
              v-model.number="draft.funds_granted"
              type="number"
              min="0"
              :disabled="!authStore.isAdmin"
            />
          </label>
          <label>
            Students Reached
            <input
              v-model.number="draft.students_reached"
              type="number"
              min="0"
              :disabled="!authStore.isAdmin"
            />
          </label>
          <label>
            Scholarships Awarded
            <input
              v-model.number="draft.scholarships_awarded"
              type="number"
              min="0"
              :disabled="!authStore.isAdmin"
            />
          </label>

          <button v-if="authStore.isAdmin" type="submit" class="btn btn--gold" :disabled="saving">
            Save & Publish
          </button>
        </form>

        <div class="chart">
          <h3>{{ chartMetric.label }} by Year</h3>

          <div class="chart-tabs">
            <button
              v-for="metric in CHART_METRICS"
              :key="metric.key"
              type="button"
              class="chart-tab"
              :class="{ 'chart-tab--active': metric.key === chartMetricKey }"
              @click="chartMetricKey = metric.key"
            >
              {{ metric.label }}
            </button>
          </div>

          <p v-if="publishedCycles.length === 0" class="chart-empty">
            No published cycles yet.
          </p>
          <div v-else class="bars">
            <div v-for="cycle in publishedCycles" :key="cycle.metric_id" class="bar-col">
              <span class="bar-value">{{ formatBarValue(cycle) }}</span>
              <div class="bar" :style="{ height: barHeight(cycle) }"></div>
              <span class="bar-label">{{ cycle.cycle_year }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </template>
</template>

<style scoped>
.donor-impact {
  display: flex;
  gap: 24px;
  align-items: flex-start;
}

.cycle-column {
  flex-shrink: 0;
  width: 220px;
}

.cycle-column-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;
}

.cycle-column-header h2 {
  margin: 0;
  font-size: 18px;
}

.add-cycle {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.add-cycle input {
  width: 0;
  flex: 1;
  padding: 6px 10px;
  border: 1px solid #d8d6cf;
  border-radius: 8px;
  font-size: 13px;
}

.cycle-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cycle-card {
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

.cycle-card--active {
  border: 1px solid #c9932a;
}

.cycle-year {
  font-size: 15px;
  font-weight: 500;
  color: #2d3142;
}

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

.metrics-form {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 16px;
  margin-bottom: 32px;
}

.metrics-form label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  color: #8a8a85;
}

.metrics-form input {
  padding: 6px 10px;
  border: 1px solid #d8d6cf;
  border-radius: 8px;
  font-size: 14px;
  color: #2d3142;
  width: 160px;
}

.metrics-form input:disabled {
  background: #f7f6f3;
  color: #8a8a85;
}

.btn {
  font-size: 13px;
  font-weight: 500;
  padding: 6px 14px;
  border-radius: 8px;
  cursor: pointer;
}

.btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.btn--outline {
  background: #fff;
  color: #2d3142;
  border: 1px solid #d8d6cf;
}

.btn--gold {
  background: #c9932a;
  color: #fff;
  border: 1px solid #c9932a;
}

.chart h3 {
  margin: 0 0 16px;
  font-size: 14px;
  font-weight: 500;
  color: #2d3142;
}

.chart-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.chart-tab {
  font-size: 13px;
  font-weight: 500;
  padding: 6px 14px;
  border-radius: 999px;
  border: none;
  background: transparent;
  color: #8a8a85;
  cursor: pointer;
}

.chart-tab--active {
  background: #faeeda;
  color: #854f0b;
  font-weight: 600;
}

.chart-empty {
  margin: 0;
  color: #8a8a85;
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
