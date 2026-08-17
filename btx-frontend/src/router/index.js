import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'

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
        {
          path: 'donor-impact',
          name: 'donor-impact',
          // Placeholder view — no page built yet, just wired up for nav.
          component: () => import('../views/DonorImpactView.vue'),
        },
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
