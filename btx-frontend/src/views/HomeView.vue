<script setup>
import { computed, onUnmounted, reactive, ref, watch } from 'vue'
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

// Nav sections shown in the sidebar. Most are expandable groups of links
// (via `children`); Task & Approval and Alert Center are flat top-level
// links instead (see the template below). Sub-items mirror the routes on
// the Home.vue cards, except Alert Center, which only lives in the sidebar.
const navSections = [
  // Flat top-level links (no `children`) rather than expandable groups —
  // the template below checks for `children` to decide which to render.
  { label: 'Task & Approval', routeName: 'tasks' },
  { label: 'Alert Center', routeName: 'alerts' },
  { label: 'Event Calendar', routeName: 'event-calendar' },
  {
    label: 'Finance & Funding',
    children: [
      { label: 'Headline Metric Summary', routeName: 'finance-headline-metric-summary' },
      { label: 'Budget Tracking', routeName: 'finance-budget-tracking' },
      { label: 'Budgeting Tasks', routeName: 'finance-budgeting-tasks' },
      { label: 'Fundraising Health', routeName: 'finance-fundraising-health' },
      { label: 'Fundraising Tasks', routeName: 'finance-fundraising-tasks' },
    ],
  },
  {
    label: 'Program',
    children: [
      { label: 'Awardee Workflow', routeName: 'awardee-workflow' },
      { label: 'Program Planning', routeName: 'program-planning' },
      { label: 'Program Impact', routeName: 'program-impact' },
    ],
  },
  {
    label: 'Scholarship',
    children: [
      { label: 'Scoring', routeName: 'scholarship-scoring' },
      { label: 'Interviews', routeName: 'scholarship-interviews' },
      { label: 'Applicant Records', routeName: 'scholarship-applicant-records' },
    ],
  },
  {
    label: 'Marketing',
    children: [
      { label: 'Calendar', routeName: 'marketing-calendar' },
      { label: 'Marketing Tasks', routeName: 'marketing-tasks' },
    ],
  },
  // adminOnly is a new field only this entry uses today -- see
  // visibleNavSections below for how it's enforced.
  { label: 'Import', routeName: 'import', adminOnly: true },
]

// Sidebar sections filtered by role. Only Import needs this today, gated
// on isAdmin alone rather than the canView (admin/board/reviewer)
// convention used everywhere else in the app -- Import can write to tables
// board and reviewer have no INSERT/UPDATE access to at all (Phase 1 RLS
// audit), so showing them a working-looking nav entry whose writes RLS
// would silently reject is worse than not showing it at all.
const visibleNavSections = computed(() =>
  navSections.filter((section) => !section.adminOnly || authStore.isAdmin),
)

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

// Mobile drawer open/closed state. Only ever visually meaningful below the
// 850px breakpoint (see the `max-width: 850px` query in <style> below) --
// correctness deliberately doesn't depend on this ref agreeing with any
// JS-side width check. Every visual effect it drives (drawer transform,
// backdrop, body scroll lock) is itself gated by that same media query, so
// if a user opens the drawer on a narrow window and then widens the
// browser past the breakpoint without closing it, this staying true is
// harmless -- there's no CSS left above 850px for it to apply to.
const drawerOpen = ref(false)

function toggleDrawer() {
  drawerOpen.value = !drawerOpen.value
}

function closeDrawer() {
  drawerOpen.value = false
}

// Locks background scroll while the drawer is open by toggling a class on
// <body>. <body> lives outside this component's own template, so a scoped
// style rule could never match it -- Vue's `scoped` attribute works by
// rewriting selectors to only hit elements this component actually
// rendered. The `overflow: hidden` rule itself lives in the second,
// unscoped <style> block at the bottom of this file for that reason, still
// nested inside the same max-width: 850px query as everything else, for
// the same defensive reasoning as drawerOpen's own comment above.
watch(drawerOpen, (open) => {
  document.body.classList.toggle('drawer-open', open)
})

// Closes the drawer on every navigation, including browser back/forward --
// neither fires a nav link's own @click handler, so relying on that alone
// would leave the drawer open after a back-button navigation.
watch(
  () => route.fullPath,
  () => closeDrawer(),
)

// Belt-and-suspenders cleanup -- HomeView is the persistent app shell so
// this won't normally unmount mid-session, but leaving the class on <body>
// past this component's lifetime would be a real (if unlikely) bug.
onUnmounted(() => {
  document.body.classList.remove('drawer-open')
})
</script>

<template>
  <div class="app-shell">
    <!-- Mobile-only top bar: hidden by default (see .mobile-topbar's own
         `display: none` default), so it renders nothing on desktop. -->
    <div class="mobile-topbar">
      <button type="button" class="hamburger-btn" aria-label="Toggle navigation menu" @click="toggleDrawer">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>
      <RouterLink :to="{ name: 'home' }" class="mobile-brand" @click="closeDrawer">
        BTX <span class="brand-accent">Ops Hub</span>
      </RouterLink>
    </div>

    <!-- Sits above the mobile topbar (not just the page content), so
         tapping anywhere outside the open sidebar -- including back over
         the hamburger's own screen position -- dismisses the drawer. The
         sidebar itself sits above this backdrop (see .sidebar's z-index in
         the mobile media query), so its own links/toggles stay interactive
         while open. -->
    <div v-if="drawerOpen" class="drawer-backdrop" @click="closeDrawer"></div>

    <aside class="sidebar" :class="{ 'sidebar--open': drawerOpen }">
      <RouterLink :to="{ name: 'home' }" class="brand" @click="closeDrawer">BTX <span class="brand-accent">Ops Hub</span></RouterLink>

      <nav class="nav">
        <div v-for="section in visibleNavSections" :key="section.label" class="nav-section">
          <!-- Sections with `children` render as an expand/collapse group;
               sections without (e.g. Task & Approval) render as a single
               top-level link with no chevron or toggle behavior. -->
          <template v-if="section.children">
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
                @click="closeDrawer"
              >
                {{ child.label }}
              </RouterLink>
            </div>
          </template>

          <RouterLink
            v-else
            :to="{ name: section.routeName }"
            class="nav-section-header nav-top-link"
            :class="{ 'nav-top-link--active': route.name === section.routeName }"
            @click="closeDrawer"
          >
            <span class="nav-label">{{ section.label }}</span>
          </RouterLink>
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

/* Flat top-level link (e.g. Task & Approval) — same header sizing as an
   expandable group, but styled/active like a leaf nav-child since it acts
   as a direct route link rather than a toggle. */
.nav-top-link {
  text-decoration: none;
  border-radius: 6px;
  border-left: 3px solid transparent;
}

.nav-top-link--active {
  background: rgba(212, 162, 78, 0.15);
  border-left: 3px solid #d4a24e;
}

.nav-top-link--active .nav-label {
  font-weight: 600;
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

/* Hidden by default -- the only place this is ever shown is inside the
   max-width: 850px query below, so it has zero effect above that width. */
.mobile-topbar {
  display: none;
  align-items: center;
  gap: 12px;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 56px;
  padding: 0 16px;
  background: #1a1a1a;
  z-index: 20;
}

.hamburger-btn {
  flex-shrink: 0;
  display: flex;
  background: none;
  border: none;
  padding: 4px;
  color: #fff;
  cursor: pointer;
}

.mobile-brand {
  color: #fff;
  font-size: 16px;
  font-weight: 600;
  text-decoration: none;
}

/* display: none by default, same reasoning as .mobile-topbar above --
   `v-if="drawerOpen"` already keeps this out of the DOM on desktop in
   practice, but this is the belt-and-suspenders half: even if drawerOpen
   were somehow true above 850px (see its own comment in <script>), there'd
   be no CSS left to make it visible. */
.drawer-backdrop {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 25;
}

/* Everything that actually repositions the sidebar into an off-canvas
   drawer, and reveals the hamburger/backdrop, lives in this one query --
   deliberately the only place any of it exists, so none of the default
   (desktop) rules above are touched by this feature at all. */
@media (max-width: 850px) {
  .mobile-topbar {
    display: flex;
  }

  .drawer-backdrop {
    display: block;
  }

  .sidebar {
    position: fixed;
    top: 0;
    left: 0;
    height: 100vh;
    z-index: 30;
    transform: translateX(-100%);
    transition: transform 0.2s ease;
    overflow-y: auto;
  }

  .sidebar--open {
    transform: translateX(0);
  }

  /* Clears the fixed 56px topbar; left/right/bottom stay at the 32px from
     .page's own base rule above -- this only overrides the top side. */
  .page {
    padding-top: calc(56px + 32px);
  }
}
</style>

<style>
/* Unscoped deliberately: Vue's `scoped` attribute rewrites selectors to
   only match elements this component's own template rendered, and <body>
   is never one of those, so a scoped rule targeting it would simply never
   match anything. This block exists solely for that one selector -- see
   the drawerOpen watcher in <script> that toggles this class. Still nested
   inside the same max-width: 850px query as the rest of the drawer CSS,
   for the same defensive reasoning as drawerOpen's own comment: if the
   class lingers on <body> after the window is widened past the breakpoint
   without closing the drawer, there's no rule here for it to match either. */
@media (max-width: 850px) {
  body.drawer-open {
    overflow: hidden;
  }
}
</style>
