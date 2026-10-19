import { defineConfig } from '@playwright/test';

// End-to-end tests run against the app in mock mode (no Supabase values), so they need no credentials and never
// touch the live database. `npm run e2e` starts the dev server itself.
const PORT = process.env.PORT ?? '3210';

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  fullyParallel: false,
  reporter: 'list',
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure' },
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_AUTH_MODE: 'mock',
      NEXT_PUBLIC_SUPABASE_URL: '',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '',
      NEXT_PUBLIC_PORTAL_TEST_EMAILS: '',
      // the real GA4 id (lib/analytics.ts GA_ID), so e2e/analytics.spec.ts runs the property's real tag configuration
      // (its automatic events included) on the mapped production address; every hit it makes is answered locally and
      // Google's collect hosts don't resolve, so nothing reaches the property. At localhost the tag never loads.
      NEXT_PUBLIC_GA_ID: 'G-36BN7DJ7DN',
      // lets the dev server serve its scripts under the mapped production name (next.config.ts allowedDevOrigins)
      BTX_E2E_PROD_HOST: '1',
      // the stand-in reader (dev server only), so typed times can be read without an API key
      BTX_AI_FAKE: '1',
    },
  },
});
