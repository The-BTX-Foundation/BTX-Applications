import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import PlaceholderView from '../views/PlaceholderView.vue'

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
        { path: '', redirect: { name: 'tasks' } },
        {
          path: 'tasks',
          name: 'tasks',
          component: () => import('../views/TasksApprovalView.vue'),
        },
        placeholderRoute('alerts', 'alerts', 'Alert Center'),
        placeholderRoute('awardee-workflow', 'awardee-workflow', 'Awardee Workflow'),
        placeholderRoute('progress-to-goal', 'progress-to-goal', 'Progress-to-Goal Workflow'),
        {
          path: 'donor-impact',
          name: 'donor-impact',
          component: () => import('../views/DonorImpactWorkflowView.vue'),
        },
        placeholderRoute('finance-funding', 'finance-funding', 'Finance & Funding'),
        placeholderRoute('marketing', 'marketing', 'Marketing'),
        placeholderRoute('scholarship', 'scholarship', 'Scholarship'),
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
  ],
})

export default router
