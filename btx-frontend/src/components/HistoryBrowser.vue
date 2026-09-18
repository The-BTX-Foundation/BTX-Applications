<script setup>
import { ref } from 'vue'

// Year->Month drill-down state machine (null/null = year list, year/null =
// month list, year/month = detail view). The year/month lists themselves
// are still a fixed static range with no page-specific data awareness --
// this component owns navigation only. The detail view's actual content
// is supplied by each consumer via the "detail" scoped slot below, since
// Fundraising Health and Budget Tracking have completely different field
// shapes and neither should be baked into this shared shell. Shared by
// BudgetTracking.vue and FundraisingHealth.vue, each with its own
// independent instance/state.
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
      <!-- year/month passed to the consumer exactly as this component
           holds them: selectedYear is a real calendar year (e.g. 2026),
           but selectedMonth is the 0-based index historyMonths was built
           from (0 = January), NOT a 1-based reporting_month/period_month
           value. Consumers matching against a Supabase row's month column
           must add 1 -- forgetting this is an easy off-by-one that would
           silently look up the wrong month's row instead of erroring. -->
      <slot name="detail" :year="selectedYear" :month="selectedMonth">
        <p class="not-connected-note">Not yet connected to saved data — this won't persist.</p>
      </slot>
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
  background: var(--color-surface);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border-strong);
}

.not-connected-note {
  margin: 0 0 20px;
  font-size: 12px;
  font-style: italic;
  color: var(--color-text-secondary);
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
  background: var(--color-surface);
  border: 0.5px solid var(--color-border);
  border-radius: 12px;
  padding: 14px;
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.history-label {
  font-size: 15px;
  font-weight: 500;
  color: var(--color-text-primary);
}

.back-btn {
  margin-bottom: 16px;
}

.history-detail-heading {
  margin: 0 0 8px;
  font-size: 16px;
  color: var(--color-text-primary);
}
</style>
