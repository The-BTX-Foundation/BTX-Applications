<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useThemeStore } from '@/stores/theme'
import { supabase } from '@/lib/supabaseClient'

// The signed-in user's own display name, for the mobile topbar avatar's
// initials. A separate targeted query (not tasksAlerts.js's
// fetchAssignableUsers, which loads every board/admin/reviewer profile for
// an assignment dropdown -- this needs just one row, the caller's own).
// profiles' SELECT policy is board/admin/reviewer only, so this silently
// returns no row for an applicant rather than an error -- avatarInitials
// below already falls back to the email in that case, so nothing extra is
// needed to handle it here.
const avatarName = ref(null)

async function loadAvatarName(userId) {
  if (!userId) {
    avatarName.value = null
    return
  }
  const { data } = await supabase.from('profiles').select('name').eq('id', userId).maybeSingle()
  avatarName.value = data?.name ?? null
}

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const themeStore = useThemeStore()

// Refetches whenever the signed-in user changes, matching every store's own
// convention elsewhere in the app.
watch(() => authStore.session?.user?.id ?? null, loadAvatarName, { immediate: true })

// "MJ" from "Maria Jones" -- first letter of up to the first two words, so
// a single-word name still resolves to one letter rather than erroring.
// Falls back to the account email's first letter when there's no
// profiles.name at all (no row, or a null name column).
const avatarInitials = computed(() => {
  const name = avatarName.value
  if (name) {
    return name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase()
  }
  const email = authStore.session?.user?.email
  return email ? email[0].toUpperCase() : '?'
})

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
    label: 'Finance',
    children: [
      { label: 'Budget Tracking', routeName: 'finance-budget-tracking' },
      { label: 'Budgeting Tasks', routeName: 'finance-budgeting-tasks' },
    ],
  },
  {
    label: 'Funding',
    children: [
      { label: 'Fundraising Health', routeName: 'finance-fundraising-health' },
      { label: 'Fundraising Tasks', routeName: 'finance-fundraising-tasks' },
    ],
  },
  {
    label: 'Program',
    children: [
      { label: 'Headline Metric Summary', routeName: 'program-headline-metric-summary' },
      { label: 'Program Planning', routeName: 'program-planning' },
      { label: 'Program Impact', routeName: 'program-impact' },
    ],
  },
  {
    label: 'Scholarship',
    children: [
      { label: 'Awardee Workflow', routeName: 'awardee-workflow' },
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

// Flattens navSections into a routeName -> label lookup -- the sticky
// page-name bar's source of truth for what text to show, same labels the
// sidebar itself uses. Built once as a plain object (navSections is a
// static array, not reactive) rather than a computed with no real reactive
// dependency. 'home' gets an explicit fallback since it's the one real
// route navSections has no entry for at all (it's the dashboard root, not
// a sidebar link).
const ROUTE_LABELS = navSections.reduce(
  (labels, section) => {
    if (section.children) {
      for (const child of section.children) {
        labels[child.routeName] = child.label
      }
    } else {
      labels[section.routeName] = section.label
    }
    return labels
  },
  { home: 'Home' },
)

const currentPageLabel = computed(() => ROUTE_LABELS[route.name] ?? '')

// Template ref on .panel (RouterView's mount point), watched below for
// whichever [data-page-heading] element the current page rendered.
const panelEl = ref(null)

// Whether the sticky page-name bar is showing -- true once the current
// page's own data-page-heading element has scrolled out of view. Mobile-
// only in effect (see .sticky-page-bar's own `display: none` default,
// same pattern as drawerOpen above), but this logic runs regardless of
// viewport width; there's simply no CSS above 850px for it to show
// through.
const showStickyBar = ref(false)

// The element currently being watched, and the observer watching it —
// module-scope-ish closures (not refs) since neither needs to be
// reactive; only showStickyBar itself drives the template.
let watchedHeading = null
let headingObserver = null
let panelObserver = null

// (Re)points the IntersectionObserver at whichever [data-page-heading]
// element is currently rendered inside .panel, if any. Bails out early
// when it's the same element as last time -- .panel's subtree re-renders
// constantly for reasons that have nothing to do with the heading itself
// (task lists reloading, chart tab switches, drill-down state, etc.), and
// without this check every one of those would needlessly tear down and
// recreate the observer, risking a visible flicker even though the actual
// heading element never moved.
function syncHeadingObserver() {
  const heading = panelEl.value?.querySelector('[data-page-heading]') ?? null
  if (heading === watchedHeading) return

  headingObserver?.disconnect()
  watchedHeading = heading

  if (!heading) {
    // Nothing to watch yet -- either the route has no tagged heading at
    // all, or (ProgramPlanning.vue/ProgramImpact.vue) it's conditionally
    // rendered and hasn't appeared yet because its data hasn't loaded.
    // Fails safe: bar stays hidden until a later mutation finds one.
    showStickyBar.value = false
    return
  }

  headingObserver = new IntersectionObserver(
    ([entry]) => {
      showStickyBar.value = !entry.isIntersecting
    },
    // Shrinks the observed viewport by the fixed mobile topbar's own 56px
    // height, so a heading that's scrolled behind the topbar counts as
    // "out of view" as soon as it's covered -- not only once it's cleared
    // the entire viewport, which is what the unmodified default root
    // would otherwise require.
    { rootMargin: '-56px 0px 0px 0px' },
  )
  headingObserver.observe(heading)
}

// MutationObserver on .panel catches every case a plain "re-query once
// per route change" wouldn't: the route changing (old heading removed,
// new one added), a conditional heading appearing later once its page's
// data finishes loading, or (in principle) disappearing again -- all
// without any individual page needing to know this feature exists beyond
// the one data-page-heading attribute.
onMounted(() => {
  syncHeadingObserver() // catches whatever's already rendered on first load

  // panelEl.value is normally already bound by the time onMounted fires
  // (verified: HMR hot-swapping this file mid-session threw exactly this
  // null case in practice -- MutationObserver.observe() rejects a null
  // target outright). HMR doesn't exist in the production build, but the
  // guard is free and fails safe either way: without it, the sticky bar
  // just never activates for that mount instead of a crash.
  if (panelEl.value) {
    panelObserver = new MutationObserver(syncHeadingObserver)
    panelObserver.observe(panelEl.value, { childList: true, subtree: true })
  }
})

onUnmounted(() => {
  panelObserver?.disconnect()
  headingObserver?.disconnect()
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
      <span class="topbar-avatar" aria-hidden="true">{{ avatarInitials }}</span>
    </div>

    <!-- Mobile-only sticky bar showing the current page's name, shown once
         its own heading (data-page-heading, tagged on the one heading each
         page component considers its real title) scrolls out of view --
         see the MutationObserver/IntersectionObserver setup in <script>.
         Home has no single scrolling "page name" of its own the way every
         other route does (it's a mix of a hero/stats/rows, not one
         heading-topped view) and already repeats its own title in the
         topbar's "Ops Hub" brand text, so it's excluded here entirely
         rather than showing a redundant/confusing bar on scroll. -->
    <div
      v-if="route.name !== 'home'"
      class="sticky-page-bar"
      :class="{ 'sticky-page-bar--visible': showStickyBar }"
    >
      {{ currentPageLabel }}
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
        <!-- Grouped with the other session-utility controls (divider/email/
             sign-out) below rather than a new sidebar zone of its own. Label
             names the action the click performs (what theme you'll switch
             TO), not the current state -- same convention as a play/pause
             button, avoids the user having to mentally invert a status
             label to figure out what clicking it does. -->
        <button type="button" class="theme-toggle-btn" @click="themeStore.toggle()">
          <svg
            v-if="themeStore.theme === 'dark'"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1" x2="12" y2="3" />
            <line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" />
            <line x1="21" y1="12" x2="23" y2="12" />
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
          </svg>
          <svg
            v-else
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
          </svg>
          <span class="nav-label">{{ themeStore.theme === 'dark' ? 'Light Mode' : 'Dark Mode' }}</span>
        </button>

        <div class="sidebar-divider"></div>
        <p class="user-email">{{ authStore.session?.user?.email }}</p>
        <button type="button" class="sign-out-btn" @click="handleSignOut">Sign Out</button>
      </div>
    </aside>

    <main
      class="page"
      :class="{
        'page--home': route.name === 'home',
        'page--headline-metric': route.name === 'program-headline-metric-summary',
      }"
    >
      <div class="panel" ref="panelEl">
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

/* Same flat icon+label row shape as .nav-top-link, and the same
   background:none/border:none/cursor:pointer treatment as .sign-out-btn
   below -- reuses .nav-label's own gold for the text (applied via that
   class in the template) rather than a one-off color, and matches
   .nav-chevron's muted rgba(255,255,255,.4) for the icon so it reads as
   secondary next to the label, not competing with it. */
.theme-toggle-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  background: none;
  border: none;
  padding: 6px 10px;
  margin-bottom: 12px;
  color: rgba(255, 255, 255, 0.4);
  cursor: pointer;
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
  background: var(--color-page-bg);
  padding: 32px;
}

.panel {
  color: var(--color-text-primary);
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
  flex: 1;
  color: #fff;
  font-size: 16px;
  font-weight: 600;
  text-decoration: none;
}

/* Display-only -- same fixed-dark/gold brand pair as the rest of the
   topbar, not a themed surface (see base.css's header comment). */
.topbar-avatar {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #d4a24e;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Mobile-only sticky bar showing the current page's name -- same
   dark/gold palette as .mobile-topbar/.nav-label, no new colors. Hidden
   by default (same pattern as .mobile-topbar/.drawer-backdrop above),
   only switched on inside the max-width: 850px query below. Overlays
   scrolled content rather than pushing .page's own padding down further
   -- it only ever appears once the user has already scrolled past the
   real heading, so there's already content in that vertical region. */
.sticky-page-bar {
  display: none;
  position: fixed;
  top: 56px;
  left: 0;
  right: 0;
  height: 40px;
  align-items: center;
  padding: 0 16px;
  background: #1a1a1a;
  color: #d4a24e;
  font-size: 14px;
  font-weight: 600;
  z-index: 19;
  transform: translateY(-100%);
  transition: transform 0.2s ease;
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

  .sticky-page-bar {
    display: flex;
  }

  .sticky-page-bar--visible {
    transform: translateY(0);
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

  /* Clears the fixed 56px topbar on top; left/right/bottom drop from the
     desktop 32px to 16px -- half the desktop margin, matching the 16px
     spacing unit already used elsewhere in the app (Apple HIG/Material
     both default to a 16pt/dp screen margin too), freeing up real content
     width on narrow viewports without touching the desktop rule above. */
  .page {
    padding: calc(56px + 32px) var(--page-h-padding, 16px) 16px;
  }

  /* No mobile override existed for .panel before -- same 32px -> 16px halving
     as .page above, for the same reason (this is the second of the two
     nested 32px paddings that were eating width on mobile). */
  .panel {
    padding: 16px;
  }
}

/* Home only, and only below its own narrower 600px breakpoint (not the
   850px mobile-layout switch above): tightens Home's side margins to
   ~8px total, matching the reference design's near-edge-to-edge phone
   margins. Two nested paddings stack into that margin -- .page's own
   (read from --page-h-padding above) and .panel's separate 16px -- so
   both are addressed here: .page's contributes the full 8px via the
   variable (the one line to change to retune Home's margin), and
   .panel's horizontal padding is zeroed out for Home specifically so it
   doesn't add another 16px on top. Every other route/width keeps both
   defaults untouched. */
@media (max-width: 600px) {
  .page--home {
    --page-h-padding: 8px;
  }

  .page--home .panel {
    padding-left: 0;
    padding-right: 0;
  }
}

/* Impact to Date (Headline Metric Summary) only, same mechanism as
   .page--home above -- ~18px total side margin (the mockup's own 4.8% of
   a 390px viewport), split the same way: .page's var(--page-h-padding)
   carries the full 18px, .panel's horizontal padding is zeroed out so it
   doesn't stack another 16px on top. Every other route/width is
   untouched. */
@media (max-width: 600px) {
  .page--headline-metric {
    --page-h-padding: 18px;
  }

  .page--headline-metric .panel {
    padding-left: 0;
    padding-right: 0;
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
