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
  // Every spec authenticates itself: the public login spec logs in through the
  // UI, and the authed specs log in fresh per spec via a beforeEach (loginAs in
  // e2e/auth.ts). We deliberately do NOT share a saved storageState — the
  // backend rotates+blacklists refresh tokens, so replaying one frozen token
  // across specs/retries 401s on refresh and logs the app out. See e2e/auth.ts.
  projects: [
    // Public/unauthenticated: the login flow itself, starts logged-out.
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /login\.spec\.ts$/,
    },

    // Manager critical paths (team + event); each spec logs in as the manager.
    {
      name: 'chromium-manager',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /(team|event)\.spec\.ts$/,
    },

    // Athlete critical path (rsvp); each spec logs in as the athlete.
    {
      name: 'chromium-athlete',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /rsvp\.spec\.ts$/,
    },
  ],
  // No webServer: CI starts the frontend + backend; locally run `npm start`
  // (and the backend on :8000, seeded via create_e2e_data) before `npm run e2e`.
});
