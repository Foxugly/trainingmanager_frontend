import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright e2e config for the Training Manager Angular SPA.
 *
 * Servers are NOT started here. The frontend (default http://localhost:4200)
 * and the backend (http://localhost:8000) must already be running, and the
 * backend must have been seeded with the `create_e2e_data` management command
 * (see the seed-data contract referenced by the specs). In CI the workflow
 * starts both servers before invoking `playwright test`.
 *
 * Point the suite at any deployment with E2E_BASE_URL.
 */
export default defineConfig({
  testDir: './e2e',
  // Fail the build on a stray `test.only` left in a committed spec.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:4200',
    trace: 'on-first-retry',
  },
  projects: [
    // 1. Auth setup — logs in as the seeded manager + athlete and persists
    //    their storageState to e2e/.auth/*.json. Authed projects depend on it.
    { name: 'setup', testMatch: /auth\.setup\.ts$/ },

    // 2. Public/unauthenticated specs (login flow starts logged-out).
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /login\.spec\.ts$/,
    },

    // 3. Manager-authenticated specs (reuse the manager storageState).
    {
      name: 'chromium-manager',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/manager.json',
      },
      dependencies: ['setup'],
      testMatch: /(team|event)\.spec\.ts$/,
    },

    // 4. Athlete-authenticated specs (reuse the athlete storageState).
    {
      name: 'chromium-athlete',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/athlete.json',
      },
      dependencies: ['setup'],
      testMatch: /rsvp\.spec\.ts$/,
    },
  ],
  // No webServer: CI starts the frontend + backend; locally run `npm start`
  // (and the backend on :8000, seeded via create_e2e_data) before `npm run e2e`.
});
