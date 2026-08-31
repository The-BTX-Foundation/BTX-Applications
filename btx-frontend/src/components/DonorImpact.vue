<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { DONOR_IMPACT_METRICS, useDonorImpactStore } from '@/stores/donorImpact'

const authStore = useAuthStore()
const donorImpactStore = useDonorImpactStore()

// The subset of metrics that are real columns (editable in the form,
// selected/inserted by the store) as opposed to client-derived computed ones.
const editableMetrics = DONOR_IMPACT_METRICS.filter((m) => m.editable)

// Fixed category display order for the form's grouped sections — independent
// of the order metrics happen to appear in the source array.
const CATEGORY_ORDER = ['Reach', 'Investment']

// Editable metrics grouped into their category sections, in CATEGORY_ORDER,
// for the form's "Reach" / "Investment" headers.
const groupedMetrics = computed(() =>
  CATEGORY_ORDER.map((category) => ({
    category,
    metrics: editableMetrics.filter((m) => m.category === category),
  })).filter((group) => group.metrics.length > 0),
)

// Reads a metric's value off a cycle row — computed metrics derive their
// value from other columns instead of reading a column directly. Falls
// back to 0 for editable metrics: cycles created before a column existed
// hold real `null` there (never backfilled), and null.toLocaleString()
// throws in formatBarValue — coalescing here is the one place that needs
// to know about that, instead of every caller guarding separately.
function metricValue(cycle, metric) {
  return metric.computed ? metric.computed(cycle) : (cycle[metric.key] ?? 0)
}

// Includes reviewer alongside admin/board so viewing matches the donor_impact
// RLS SELECT policy (admin, board, and reviewer can all view) — the write
// actions below stay gated on authStore.isAdmin specifically, so this only
// widens who can see the page, not who can edit/add/publish.
const canView = computed(() => authStore.isAdmin || authStore.isBoard || authStore.isReviewer)

const selectedMetricId = ref(null)
// Built from editableMetrics so the draft always has an entry for every
// editable column, regardless of how many metrics exist.
const draft = reactive(Object.fromEntries(editableMetrics.map((m) => [m.key, 0])))
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
// can't view this page, since RLS would just reject it with a
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
  editableMetrics.forEach((metric) => {
    draft[metric.key] = cycle[metric.key]
  })
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

// The metric definition backing the chart's currently selected tab. Tabs
// are built from the full DONOR_IMPACT_METRICS array (not just editableMetrics)
// so computed metrics like Average Scholarship Size get their own tab too.
const chartMetric = computed(() => DONOR_IMPACT_METRICS.find((m) => m.key === chartMetricKey.value))

const maxChartValue = computed(() =>
  Math.max(...publishedCycles.value.map((c) => metricValue(c, chartMetric.value)), 1),
)

// Bar height as a percentage of the highest published value for the
// selected metric.
function barHeight(cycle) {
  return `${(metricValue(cycle, chartMetric.value) / maxChartValue.value) * 100}%`
}

// Formats a cycle's bar-top label for the selected metric — currency for
// currency-format metrics, a plain thousands-separated number otherwise.
function formatBarValue(cycle) {
  const value = metricValue(cycle, chartMetric.value)
  return chartMetric.value.format === 'currency' ? `$${value.toLocaleString()}` : value.toLocaleString()
}

// Saves the edit form's values to the selected cycle and publishes it.
async function handleSave() {
  if (!selectedCycle.value) return
  saving.value = true
  const metrics = Object.fromEntries(editableMetrics.map((m) => [m.key, Number(draft[m.key])]))
  await donorImpactStore.saveAndPublish(selectedCycle.value.metric_id, metrics)
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
          <div v-for="group in groupedMetrics" :key="group.category" class="metrics-group">
            <h4 class="metrics-group-header">{{ group.category }}</h4>
            <div class="metrics-group-fields">
              <label v-for="metric in group.metrics" :key="metric.key">
                {{ metric.label }}
                <input
                  v-model.number="draft[metric.key]"
                  type="number"
                  min="0"
                  :disabled="!authStore.isAdmin"
                />
              </label>
            </div>
          </div>

          <button v-if="authStore.isAdmin" type="submit" class="btn btn--gold" :disabled="saving">
            Save & Publish
          </button>
        </form>

        <div class="chart">
          <h3>{{ chartMetric.label }} by Year</h3>

          <div class="chart-tabs">
            <button
              v-for="metric in DONOR_IMPACT_METRICS"
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
  flex-direction: column;
  gap: 20px;
  margin-bottom: 32px;
}

.metrics-group-header {
  margin: 0 0 12px;
  font-size: 13px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #8a8a85;
}

.metrics-group-fields {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 16px;
}

.metrics-group-fields label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  color: #8a8a85;
}

.metrics-group-fields input {
  padding: 6px 10px;
  border: 1px solid #d8d6cf;
  border-radius: 8px;
  font-size: 14px;
  color: #2d3142;
  width: 160px;
}

.metrics-group-fields input:disabled {
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
  flex-wrap: wrap;
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
