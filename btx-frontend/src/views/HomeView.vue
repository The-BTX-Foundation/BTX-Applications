<script setup>
import { reactive } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { supabase } from '@/lib/supabaseClient'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

// Signs the current user out and sends them to /login. The router guard
// only re-evaluates on navigation (not reactively when the session clears),
// so this explicit push is what actually moves the user off the page.
async function handleSignOut() {
  await supabase.auth.signOut()
  router.push({ name: 'login' })
}

// Nav sections shown in the sidebar, each an expandable group of links.
// Sub-items mirror the same routes surfaced on the Home.vue landing cards.
const navSections = [
  {
    label: 'Finance & Funding',
    children: [
      { label: 'Headline Metrics', routeName: 'finance-headline-metrics' },
      { label: 'Budget Tracking', routeName: 'finance-budget-tracking' },
      { label: 'Fundraising Totals', routeName: 'finance-fundraising-totals' },
    ],
  },
  {
    label: 'Program',
    children: [
      { label: 'Task & Approval', routeName: 'tasks' },
      { label: 'Alert Center', routeName: 'alerts' },
      { label: 'Awardee Workflow', routeName: 'awardee-workflow' },
      { label: 'Progress-to-Goal Workflow', routeName: 'progress-to-goal' },
      { label: 'Donor Impact Workflow', routeName: 'donor-impact' },
    ],
  },
  {
    label: 'Marketing',
    children: [{ label: 'Marketing', routeName: 'marketing' }],
  },
  {
    label: 'Scholarship',
    children: [
      { label: 'Scoring', routeName: 'scholarship-scoring' },
      { label: 'Interviews', routeName: 'scholarship-interviews' },
      { label: 'Applicant Records', routeName: 'scholarship-applicant-records' },
    ],
  },
]

// Which nav groups are expanded; Program starts open to match the mockup,
// the rest start collapsed.
const expandedSections = reactive(new Set(['Program']))

// Expands or collapses a sidebar nav group's sub-item list.
function toggleSection(label) {
  if (expandedSections.has(label)) {
    expandedSections.delete(label)
  } else {
    expandedSections.add(label)
  }
}
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar">
      <RouterLink :to="{ name: 'home' }" class="brand">BTX <span class="brand-accent">Ops Hub</span></RouterLink>

      <nav class="nav">
        <div v-for="section in navSections" :key="section.label" class="nav-section">
          <button type="button" class="nav-section-header" @click="toggleSection(section.label)">
            <span class="nav-label">{{ section.label }}</span>
            <svg
              class="nav-chevron"
              :class="{ 'nav-chevron--expanded': expandedSections.has(section.label) }"
              width="14"
              height="14"
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

          <div v-if="expandedSections.has(section.label)" class="nav-children">
            <RouterLink
              v-for="child in section.children"
              :key="child.label"
              :to="{ name: child.routeName }"
              class="nav-child"
              :class="{ 'nav-child--active': route.name === child.routeName }"
            >
              {{ child.label }}
            </RouterLink>
          </div>
        </div>
      </nav>

      <div class="sidebar-footer">
        <div class="sidebar-divider"></div>
        <p class="user-email">{{ authStore.session?.user?.email }}</p>
        <button type="button" class="sign-out-btn" @click="handleSignOut">Sign Out</button>
      </div>
    </aside>

    <main class="page">
      <div class="panel">
        <RouterView />
      </div>
    </main>
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  min-height: 100vh;
}

.sidebar {
  flex-shrink: 0;
  width: 260px;
  background: #1a1a1a;
  padding: 24px 20px;
  display: flex;
  flex-direction: column;
}

.brand {
  display: block;
  color: #fff;
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 32px;
  text-decoration: none;
  cursor: pointer;
}

.brand-accent {
  color: #d4a24e;
}

.nav {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.nav-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.nav-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  background: none;
  border: none;
  padding: 6px 10px;
  cursor: pointer;
}

.nav-label {
  color: #d4a24e;
  font-size: 14px;
  font-weight: 500;
}

.nav-chevron {
  flex-shrink: 0;
  color: rgba(255, 255, 255, 0.4);
  transition: transform 0.15s ease;
}

.nav-chevron--expanded {
  transform: rotate(180deg);
}

.nav-children {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-left: 12px;
}

.nav-child {
  display: block;
  color: #d4a24e;
  font-size: 13px;
  opacity: 0.75;
  padding: 6px 10px;
  border-radius: 6px;
  border-left: 3px solid transparent;
  text-decoration: none;
}

.nav-child--active {
  opacity: 1;
  background: rgba(212, 162, 78, 0.15);
  border-left: 3px solid #d4a24e;
  font-weight: 600;
}

.sidebar-footer {
  margin-top: auto;
  padding-top: 20px;
}

.sidebar-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.1);
  margin-bottom: 16px;
}

.user-email {
  color: rgba(255, 255, 255, 0.5);
  font-size: 12px;
  margin: 0 0 8px;
  word-break: break-all;
}

.sign-out-btn {
  background: none;
  border: none;
  padding: 0;
  color: #d4a24e;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  text-align: left;
}

.page {
  flex: 1;
  min-width: 0;
  background: #f7f6f3;
  padding: 32px;
}

.panel {
  background: #fff;
  /* Explicit dark text so nothing inside inherits var(--color-text), which
     flips to a light color under prefers-color-scheme: dark and becomes
     unreadable against this white panel. */
  color: #2d3142;
  border-radius: 12px;
  padding: 32px;
}
</style>
