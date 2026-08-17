<script setup>
import { RouterLink, RouterView, useRoute } from 'vue-router'
import LoginForm from '../components/LoginForm.vue'

const route = useRoute()

// Nav sections shown in the sidebar. Only "Program" has children wired up
// to real routes so far — the rest are placeholders until their views
// exist, so they render as plain non-interactive labels.
const navSections = [
  { label: 'Finance & Funding' },
  {
    label: 'Program',
    children: [
      { label: 'Task & Approval', routeName: 'tasks' },
      { label: 'Donor Impact', routeName: 'donor-impact' },
    ],
  },
  { label: 'Marketing' },
  { label: 'Scholarship' },
]
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand">BTX <span class="brand-accent">Ops Hub</span></div>

      <nav class="nav">
        <div v-for="section in navSections" :key="section.label" class="nav-section">
          <span class="nav-label">{{ section.label }}</span>

          <div v-if="section.children" class="nav-children">
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
    </aside>

    <main class="page">
      <div class="topbar">
        <LoginForm />
      </div>

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
}

.brand {
  color: #fff;
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 32px;
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

.nav-label {
  color: #d4a24e;
  font-size: 14px;
  font-weight: 500;
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

.page {
  flex: 1;
  min-width: 0;
  background: #f7f6f3;
  padding: 32px;
}

.topbar {
  margin-bottom: 16px;
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
