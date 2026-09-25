import { createRouter, createWebHistory } from 'vue-router'
import { getSavedStep } from '../stores/application'

const TOTAL_STEPS = 7

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'landing',
      component: () => import('../views/Landing.vue'),
    },
    {
      // Resumes wherever the applicant left off, or starts at step 1 for a
      // fresh visit -- reads the persisted draft directly rather than going
      // through the Pinia store, since this runs during route resolution.
      path: '/apply',
      redirect: () => `/apply/${getSavedStep()}`,
    },
    {
      path: '/apply/:step(\\d+)',
      name: 'apply-step',
      component: () => import('../views/apply/ApplyStepView.vue'),
      // Sends out-of-range step numbers (typed directly into the URL) back
      // to step 1 instead of rendering an empty/placeholder shell for them.
      beforeEnter: (to) => {
        const step = Number(to.params.step)
        if (step < 1 || step > TOTAL_STEPS) return '/apply/1'
      },
    },
  ],
})

export default router
