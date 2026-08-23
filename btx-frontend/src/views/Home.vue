<script setup>
import { reactive, ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useTasksAlertsStore } from '@/stores/tasksAlerts'

const authStore = useAuthStore()
const tasksAlertsStore = useTasksAlertsStore()

// The 4 landing-page cards. subItems map to real routes for Program (which
// already has 5 built pages) and to new placeholder routes for the other
// three sections, which don't have real sub-pages yet.
const cards = [
  {
    id: 'finance-funding',
    title: 'Finance & Funding',
    description: 'Headline metrics, budget tracking & fundraising totals',
    meta: '→ 3 tabs (1 built, 2 concept)',
    subItems: [
      { label: 'Headline Metrics', routeName: 'finance-headline-metrics' },
      { label: 'Budget Tracking', routeName: 'finance-budget-tracking' },
      { label: 'Fundraising Totals', routeName: 'finance-fundraising-totals' },
    ],
  },
  {
    id: 'program',
    title: 'Program',
    description: 'Tasks, approvals, alerts & content publishing workflows',
    meta: '→ 5 tabs',
    subItems: [
      { label: 'Task & Approval', routeName: 'tasks' },
      { label: 'Alert Center', routeName: 'alerts' },
      { label: 'Awardee Workflow', routeName: 'awardee-workflow' },
      { label: 'Progress-to-Goal Workflow', routeName: 'progress-to-goal' },
      { label: 'Donor Impact Workflow', routeName: 'donor-impact' },
    ],
  },
  {
    id: 'marketing',
    title: 'Marketing',
    description: 'Outreach & campaign tracking',
    meta: '→ concept, not yet built out',
    subItems: [{ label: 'Marketing', routeName: 'marketing' }],
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
]

// Tracks whether the Program card's assigned-open-items count has loaded
// yet, so the metric line doesn't flash "0" before the real value arrives.
const assignedCountLoaded = ref(false)

// Refetches the Program card's assigned count whenever the signed-in user
// changes (sign in, sign out, switch accounts), mirroring the same pattern
// used in TasksAlertsList.vue. Skips the fetch while signed out.
watch(
  () => authStore.session?.user?.id ?? null,
  async (userId) => {
    if (userId) {
      await tasksAlertsStore.fetchAssignedOpenCount(userId)
      assignedCountLoaded.value = true
    } else {
      assignedCountLoaded.value = false
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
    <h1 class="heading">Welcome to BTX Ops Hub</h1>
    <p class="subtext">Select a section below, or from the sidebar, to get started.</p>

    <div class="card-grid">
      <div v-for="card in cards" :key="card.id" class="card" :class="{ 'card--expanded': expandedCardIds.has(card.id) }">
        <button type="button" class="card-header" @click="toggleCard(card.id)">
          <div class="card-header-text">
            <h2 class="card-title">{{ card.title }}</h2>
            <p class="card-description">{{ card.description }}</p>
            <p class="card-meta">{{ card.meta }}</p>
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
            <p v-if="item.routeName === 'tasks' && assignedCountLoaded" class="sub-item-metric">
              {{ tasksAlertsStore.assignedOpenCount }}
              open item{{ tasksAlertsStore.assignedOpenCount === 1 ? '' : 's' }} assigned to you
            </p>
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

.subtext {
  margin: 0 0 24px;
  color: #6b6b6b;
  font-size: 14px;
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

.sub-item-metric {
  margin: 2px 0 0;
  font-size: 12px;
  color: #9a9a9a;
}
</style>
