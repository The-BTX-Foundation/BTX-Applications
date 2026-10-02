import { createRouter, createWebHistory } from 'vue-router'
import { getSavedStep, isSubmitted } from '../stores/application'

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
    {
      path: '/apply/confirmation',
      name: 'apply-confirmation',
      component: () => import('../views/apply/ConfirmationView.vue'),
      // Only reachable right after a real (simulated) submission this
      // session, or in test mode -- otherwise a direct link/bookmark to
      // this URL would show "Application submitted" for someone who never
      // submitted anything. Test mode is checked with the exact same
      // literal `import.meta.env.DEV || import.meta.env.VITE_ENABLE_TEST_NAV
      // === 'true'` expression App.vue uses for TestNavPanel -- written out
      // here rather than imported from App.vue, since App.vue's own
      // tree-shaking (dropping TestNavPanel from a production build without
      // the flag) depends on that check being a literal Vite can statically
      // replace at its own call site.
      beforeEnter: () => {
        const testMode = import.meta.env.DEV || import.meta.env.VITE_ENABLE_TEST_NAV === 'true'
        if (!isSubmitted() && !testMode) return '/'
      },
    },
    {
      path: '/sign-in',
      name: 'sign-in',
      component: () => import('../views/SignInView.vue'),
    },
  ],
})

export default router
