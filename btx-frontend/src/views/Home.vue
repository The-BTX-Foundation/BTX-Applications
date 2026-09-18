<script setup>
import { reactive } from 'vue'

// The 8 landing-page tiles. Task & Approval, Alert Center, and Event
// Calendar are flat, single-destination tiles -- rendered as direct links
// (flat: true + routeName), no chevron/expand state, since each has only
// one real destination. Finance, Funding, Program, Scholarship, and
// Marketing keep the expand-to-reveal-sub-items behavior via subItems.
// Order mirrors the sidebar's flat-links-first, then-groups convention.
const cards = [
  { id: 'task-approval', title: 'Task & Approval', flat: true, routeName: 'tasks' },
  { id: 'alert-center', title: 'Alert Center', flat: true, routeName: 'alerts' },
  { id: 'event-calendar', title: 'Event Calendar', flat: true, routeName: 'event-calendar' },
  {
    id: 'finance',
    title: 'Finance',
    subItems: [
      { label: 'Budget Tracking', routeName: 'finance-budget-tracking' },
      { label: 'Budgeting Tasks', routeName: 'finance-budgeting-tasks' },
    ],
  },
  {
    id: 'funding',
    title: 'Funding',
    subItems: [
      { label: 'Fundraising Health', routeName: 'finance-fundraising-health' },
      { label: 'Fundraising Tasks', routeName: 'finance-fundraising-tasks' },
    ],
  },
  {
    id: 'program',
    title: 'Program',
    subItems: [
      { label: 'Headline Metric Summary', routeName: 'program-headline-metric-summary' },
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
    <h1 class="heading" data-page-heading>Welcome to BTX Ops Hub</h1>

    <p class="subtext">Select a section below, or from the sidebar, to get started.</p>

    <div class="card-grid">
      <template v-for="card in cards" :key="card.id">
        <RouterLink v-if="card.flat" :to="{ name: card.routeName }" class="card card-header">
          <h2 class="card-title">{{ card.title }}</h2>
          <p class="card-meta">See details&nbsp;→</p>
        </RouterLink>

        <div v-else class="card" :class="{ 'card--expanded': expandedCardIds.has(card.id) }">
          <button type="button" class="card-header" @click="toggleCard(card.id)">
            <h2 class="card-title">{{ card.title }}</h2>
            <p class="card-meta">See details&nbsp;→</p>
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
  color: var(--color-text-secondary);
  font-size: 14px;
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}

.card {
  background: var(--color-surface);
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
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  padding: 24px;
  text-align: center;
  text-decoration: none;
  cursor: pointer;
}

/* Flat cards (see `cards` above) put .card and .card-header on the same
   RouterLink, so .card-header's `background: none` -- needed to strip the
   plain <button> case's native chrome -- would otherwise win the same-
   element tie and hide .card's white fill. Higher specificity here beats
   that regardless of declaration order, without touching the button case. */
.card.card-header {
  background: var(--color-surface);
}

.card-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.card-meta {
  margin: 6px 0 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-accent);
}

.chevron {
  position: absolute;
  top: 12px;
  right: 12px;
  color: var(--color-text-secondary);
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
  /* Hairline divider -- border variable, not a fixed light-mode gray. */
  border-top: 1px solid var(--color-border);
  padding-top: 12px;
}

.sub-item-link {
  color: var(--color-accent);
  font-size: 14px;
  font-weight: 500;
  text-decoration: none;
}

.sub-item-link:hover {
  text-decoration: underline;
}

/* Independent of HomeView.vue's 850px sidebar-drawer breakpoint -- the
   card grid stays 2 columns all the way down through phone widths now,
   instead of collapsing to a single column below 850px like every other
   page's breakpoint in this app. This rule is a deliberate, explicit
   reinforcement of the base grid-template-columns value above (it's a
   no-op at desktop widths) so the "never collapses" behavior reads as
   intentional rather than as a missing breakpoint. */
@media (max-width: 1000px) {
  .card-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
