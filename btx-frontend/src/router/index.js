import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import PlaceholderView from '../views/PlaceholderView.vue'
import { useAuthStore } from '../stores/auth'

// Every sidebar item except Task & Approval has no real page yet, so they
// all share PlaceholderView with a route-specific title prop.
function placeholderRoute(path, name, title) {
  return { path, name, component: PlaceholderView, props: { title } }
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      // HomeView is the persistent app shell (sidebar + top bar); its
      // children render into the shell's <router-view> as sidebar nav
      // items are clicked.
      path: '/',
      component: HomeView,
      children: [
        {
          path: '',
          name: 'home',
          component: () => import('../views/Home.vue'),
        },
        {
          path: 'tasks',
          name: 'tasks',
          component: () => import('../views/TasksApprovalView.vue'),
        },
        placeholderRoute('alerts', 'alerts', 'Alert Center'),
        placeholderRoute('awardee-workflow', 'awardee-workflow', 'Awardee Workflow'),
        placeholderRoute('progress-to-goal', 'progress-to-goal', 'Progress-to-Goal'),
        {
          path: 'donor-impact',
          name: 'donor-impact',
          component: () => import('../views/DonorImpactView.vue'),
        },
        placeholderRoute('finance-funding', 'finance-funding', 'Finance & Funding'),
        // Finance & Funding's remaining planned tab. Headline Metrics moved
        // into Home.vue directly and no longer has its own route.
        {
          path: 'finance-budget-tracking',
          name: 'finance-budget-tracking',
          component: () => import('../views/BudgetTrackingView.vue'),
        },
        {
          path: 'finance-budgeting-tasks',
          name: 'finance-budgeting-tasks',
          component: () => import('../views/BudgetingTasksView.vue'),
        },
        {
          path: 'finance-fundraising-health',
          name: 'finance-fundraising-health',
          component: () => import('../views/FundraisingHealthView.vue'),
        },
        {
          path: 'finance-fundraising-tasks',
          name: 'finance-fundraising-tasks',
          component: () => import('../views/FundraisingTasksView.vue'),
        },
        {
          path: 'marketing-calendar',
          name: 'marketing-calendar',
          component: () => import('../views/MarketingCalendarView.vue'),
        },
        {
          path: 'marketing-tasks',
          name: 'marketing-tasks',
          component: () => import('../views/MarketingTasksView.vue'),
        },
        {
          path: 'event-calendar',
          name: 'event-calendar',
          component: () => import('../views/EventCalendarView.vue'),
        },
        placeholderRoute('scholarship', 'scholarship', 'Scholarship'),
        // Scholarship's 3 planned tabs, same treatment as Finance & Funding above.
        placeholderRoute('scholarship-scoring', 'scholarship-scoring', 'Scoring'),
        placeholderRoute('scholarship-interviews', 'scholarship-interviews', 'Interviews'),
        placeholderRoute('scholarship-applicant-records', 'scholarship-applicant-records', 'Applicant Records'),
      ],
    },
    {
      path: '/about',
      name: 'about',
      // route level code-splitting
      // this generates a separate chunk (About.[hash].js) for this route
      // which is lazy-loaded when the route is visited.
      component: () => import('../views/AboutView.vue'),
    },
    {
      // Standalone full-screen route, deliberately not a child of HomeView
      // so it renders without the sidebar/topbar shell.
      path: '/login',
      name: 'login',
      component: () => import('../views/Login.vue'),
    },
  ],
})

// Global auth gate: no session -> forced to /login (remembering where the
// user was headed via ?redirect); has a session -> /login bounces to /tasks.
router.beforeEach(async (to) => {
  const authStore = useAuthStore()
  // init() is idempotent (guarded by authStore.initialized), so this only
  // hits Supabase once across the app's lifetime — later navigations just
  // read the already-loaded session.
  await authStore.init()

  const isAuthenticated = !!authStore.session

  if (!isAuthenticated && to.name !== 'login') {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  if (isAuthenticated && to.name === 'login') {
    return { name: 'home' }
  }
})

export default router
