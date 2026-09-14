<script setup>
import { reactive } from 'vue'

// The 7 landing-page tiles. Task & Approval, Alert Center, and Event
// Calendar are flat, single-destination tiles -- rendered as direct links
// (flat: true + routeName), no chevron/expand state, since each has only
// one real destination. Finance & Funding, Program, Scholarship, and
// Marketing keep the expand-to-reveal-sub-items behavior via subItems.
// Order mirrors the sidebar's flat-links-first, then-groups convention.
const cards = [
  { id: 'task-approval', title: 'Task & Approval', flat: true, routeName: 'tasks' },
  { id: 'alert-center', title: 'Alert Center', flat: true, routeName: 'alerts' },
  { id: 'event-calendar', title: 'Event Calendar', flat: true, routeName: 'event-calendar' },
  {
    id: 'finance-funding',
    title: 'Finance & Funding',
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
    subItems: [
      { label: 'Program Planning', routeName: 'program-planning' },
      { label: 'Program Impact', routeName: 'program-impact' },
    ],
  },
  {
    id: 'scholarship',
    title: 'Scholarship',
    subItems: [
      { label: 'Awardee Workflow', routeName: 'awardee-workflow' },
      { label: 'Scoring', routeName: 'scholarship-scoring' },
      { label: 'Interviews', routeName: 'scholarship-interviews' },
      { label: 'Applicant Records', routeName: 'scholarship-applicant-records' },
    ],
  },
  {
    id: 'marketing',
    title: 'Marketing',
    subItems: [
      { label: 'Calendar', routeName: 'marketing-calendar' },
      { label: 'Marketing Tasks', routeName: 'marketing-tasks' },
    ],
  },
]

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
      <template v-for="card in cards" :key="card.id">
        <RouterLink v-if="card.flat" :to="{ name: card.routeName }" class="card card-header">
          <h2 class="card-title">{{ card.title }}</h2>
        </RouterLink>

        <div v-else class="card" :class="{ 'card--expanded': expandedCardIds.has(card.id) }">
          <button type="button" class="card-header" @click="toggleCard(card.id)">
            <h2 class="card-title">{{ card.title }}</h2>
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
      </template>
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
  margin: 0 0 20px;
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
  border-radius: 14px;
  box-shadow:
    0 1px 2px rgba(45, 49, 66, 0.06),
    0 8px 24px rgba(45, 49, 66, 0.08);
  overflow: hidden;
}

.card-header {
  position: relative;
  width: 100%;
  min-height: 160px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  padding: 24px;
  text-align: center;
  text-decoration: none;
  cursor: pointer;
}

.card-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #1a1a1a;
}

.chevron {
  position: absolute;
  top: 12px;
  right: 12px;
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
  padding: 0 24px 16px;
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

/* Below 850px (matching HomeView.vue's sidebar-drawer breakpoint, so the
   whole app switches to its mobile layout at one consistent width), the
   grid drops to a single column instead of the desktop grid-template-columns
   count above -- full stacking rather than an intermediate multi-column
   layout, same as every other page's 850px query in this app. Nothing above
   this query is touched, so desktop layout is unaffected. */
@media (max-width: 850px) {
  .card-grid {
    grid-template-columns: repeat(1, 1fr);
  }
}
</style>
