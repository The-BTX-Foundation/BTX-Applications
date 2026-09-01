<script setup>
import { ref } from 'vue'

// Year->Month drill-down state machine (null/null = year list, year/null =
// month list, year/month = detail view). Fully self-contained: takes no
// props and reads no page-specific data, since there's no real historical
// dataset behind it yet -- the lists below are a fixed static range rather
// than anything data-derived. Shared by BudgetTracking.vue and
// FundraisingTotals.vue, each with its own independent instance/state.
const selectedYear = ref(null)
const selectedMonth = ref(null)

const CURRENT_YEAR = new Date().getFullYear()
const historyYears = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i)

// Formats a month index (0-11) as its full month name.
function monthLabel(monthIndex) {
  return new Date(2000, monthIndex, 1).toLocaleDateString(undefined, { month: 'long' })
}
const historyMonths = Array.from({ length: 12 }, (_, i) => ({ index: i, label: monthLabel(i) }))
</script>

<template>
  <div class="history-browser">
    <template v-if="selectedYear === null">
      <ul class="history-list">
        <li v-for="year in historyYears" :key="year">
          <button type="button" class="history-card" @click="selectedYear = year">
            <span class="history-label">{{ year }}</span>
          </button>
        </li>
      </ul>
    </template>

    <template v-else-if="selectedMonth === null">
      <button type="button" class="btn btn--outline back-btn" @click="selectedYear = null">← Back to Years</button>
      <ul class="history-list">
        <li v-for="month in historyMonths" :key="month.index">
          <button type="button" class="history-card" @click="selectedMonth = month.index">
            <span class="history-label">{{ month.label }}</span>
          </button>
        </li>
      </ul>
    </template>

    <template v-else>
      <button type="button" class="btn btn--outline back-btn" @click="selectedMonth = null">
        ← Back to Months
      </button>
      <h3 class="history-detail-heading">{{ monthLabel(selectedMonth) }} {{ selectedYear }}</h3>
      <p class="not-connected-note">Not yet connected to saved data — this won't persist.</p>
    </template>
  </div>
</template>

<style scoped>
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

.not-connected-note {
  margin: 0 0 20px;
  font-size: 12px;
  font-style: italic;
  color: #8a8a85;
}

.history-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 8px;
}

.history-card {
  width: 100%;
  background: #fff;
  border: 0.5px solid #e5e3dd;
  border-radius: 12px;
  padding: 14px;
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.history-label {
  font-size: 15px;
  font-weight: 500;
  color: #2d3142;
}

.back-btn {
  margin-bottom: 16px;
}

.history-detail-heading {
  margin: 0 0 8px;
  font-size: 16px;
  color: #2d3142;
}
</style>
