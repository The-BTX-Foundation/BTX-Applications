import { defineConfig } from '@playwright/test';

// End-to-end tests run against the app in mock mode (no Supabase values), so they need no credentials and never
// touch the live database. `npm run e2e` starts the dev server itself.
export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  fullyParallel: false,
  reporter: 'list',
  use: { baseURL: 'http://localhost:3210', trace: 'retain-on-failure' },
  webServer: {
    command: 'npx next dev -p 3210',
    url: 'http://localhost:3210',
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_AUTH_MODE: 'mock',
      NEXT_PUBLIC_SUPABASE_URL: '',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '',
      NEXT_PUBLIC_PORTAL_TEST_EMAILS: '',
    },
  },
});
