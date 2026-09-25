import { createRouter, createWebHistory } from 'vue-router'

// Two routes today: the static landing page, and a placeholder for the
// not-yet-built application form the landing page's CTA points to.
const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'landing',
      component: () => import('../views/Landing.vue'),
    },
    {
      path: '/apply',
      name: 'apply',
      component: () => import('../views/Apply.vue'),
    },
  ],
})

export default router
