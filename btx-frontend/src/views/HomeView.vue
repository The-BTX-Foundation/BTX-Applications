<script setup>
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

// Nav sections shown in the sidebar. A section is either a standalone
// clickable item (routeName set, e.g. Finance & Funding) or a group header
// (Program) whose children are the clickable items.
const navSections = [
  { label: 'Finance & Funding', routeName: 'finance-funding' },
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
  { label: 'Marketing', routeName: 'marketing' },
  { label: 'Scholarship', routeName: 'scholarship' },
]
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand">BTX <span class="brand-accent">Ops Hub</span></div>

      <nav class="nav">
        <div v-for="section in navSections" :key="section.label" class="nav-section">
          <RouterLink
            v-if="section.routeName"
            :to="{ name: section.routeName }"
            class="nav-link"
            :class="{ 'nav-link--active': route.name === section.routeName }"
          >
            {{ section.label }}
          </RouterLink>
          <span v-else class="nav-label">{{ section.label }}</span>

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

.nav-link {
  display: block;
  color: #d4a24e;
  font-size: 14px;
  font-weight: 500;
  padding: 6px 10px;
  border-radius: 6px;
  border-left: 3px solid transparent;
  text-decoration: none;
}

.nav-link--active {
  background: rgba(212, 162, 78, 0.15);
  border-left: 3px solid #d4a24e;
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
