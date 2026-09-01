<script setup>
import { computed, onMounted, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useFundraisingHealthDraft } from '@/stores/fundraisingHealthDraft'
import HistoryBrowser from '@/components/HistoryBrowser.vue'

const authStore = useAuthStore()
const draft = useFundraisingHealthDraft()

// Same page-access gate as BudgetTracking.vue -- no write-gating beyond
// this exists, since nothing on this page persists.
const canView = computed(() => authStore.isAdmin || authStore.isBoard || authStore.isReviewer)

onMounted(() => {
  authStore.init()
})

// Field definitions for direct rendering -- no tab bar on this page, so
// this is a flat list rather than grouped-by-category like BudgetTracking.
const FIELDS = [
  { key: 'individual_donors', label: 'Individual Donors', format: 'currency' },
  { key: 'corporate_partnerships', label: 'Corporate/Partnerships', format: 'currency' },
  { key: 'grants_revenue', label: 'Grants', format: 'currency' },
  { key: 'events_revenue', label: 'Events', format: 'currency' },
  { key: 'annual_goal', label: 'Annual Goal', format: 'currency' },
  { key: 'donor_retention_rate', label: 'Donor Retention Rate', format: 'percent' },
  { key: 'average_gift_size', label: 'Average Gift Size', format: 'currency' },
  { key: 'median_gift_size', label: 'Median Gift Size', format: 'currency' },
  { key: 'new_donors', label: 'New Donors', format: 'number' },
  { key: 'recurring_donors', label: 'Recurring Donors', format: 'number' },
]

// Reads only this page's own store -- fully self-contained, no dependency
// on Budget Tracking or any other page.
const fundraisingGoalProgress = computed(() =>
  draft.annual_goal > 0 ? (draft.totalRevenue / draft.annual_goal) * 100 : 0,
)

const showHistory = ref(false)
</script>

<template>
  <h2 v-if="!authStore.session">Sign in</h2>
  <p v-else-if="!canView" class="access-denied">Access Denied</p>

  <template v-else>
    <div class="page-header">
      <h2>Fundraising Health</h2>
      <button type="button" class="btn btn--outline" @click="showHistory = !showHistory">
        {{ showHistory ? '← Back to Today' : 'View Fundraising History' }}
      </button>
    </div>

    <template v-if="!showHistory">
      <p class="not-connected-note">Not yet connected to saved data — this won't persist.</p>

      <div class="metrics-group-fields">
        <label v-for="field in FIELDS" :key="field.key">
          {{ field.label }}
          <span class="input-with-suffix">
            <input v-model.number="draft[field.key]" type="number" min="0" />
            <span v-if="field.format === 'percent'" class="input-suffix">%</span>
          </span>
        </label>
      </div>

      <div class="computed-row">
        <div class="computed-display">
          <span class="computed-label">Fundraising Goal Progress</span>
          <span class="computed-value">{{ fundraisingGoalProgress.toFixed(1) }}%</span>
        </div>
      </div>
    </template>

    <HistoryBrowser v-else />
  </template>
</template>

<style scoped>
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 16px;
}

.page-header h2 {
  margin: 0;
  font-size: 18px;
}

.not-connected-note {
  margin: 0 0 20px;
  font-size: 12px;
  font-style: italic;
  color: #8a8a85;
}

.metrics-group-fields {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 16px;
  margin-bottom: 20px;
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

.input-with-suffix {
  display: flex;
  align-items: center;
  gap: 6px;
}

.input-suffix {
  font-size: 13px;
  color: #8a8a85;
}

.computed-row {
  display: flex;
  gap: 24px;
}

.computed-display {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.computed-label {
  font-size: 13px;
  color: #8a8a85;
}

.computed-value {
  font-size: 20px;
  font-weight: 600;
  color: #c9932a;
}

.btn {
  font-size: 13px;
  font-weight: 500;
  padding: 6px 14px;
  border-radius: 8px;
  cursor: pointer;
}

.btn--outline {
  background: #fff;
  color: #2d3142;
  border: 1px solid #d8d6cf;
}

.access-denied {
  margin: 0;
  color: #b3261e;
  font-weight: 600;
}
</style>
