import { test as setup, expect, type Page } from '@playwright/test';
import { SEED, STORAGE } from './seed';

/**
 * Auth setup project. Logs in as each seeded user via the real login form and
 * persists the resulting JWT/session storageState so the authed projects can
 * skip the login UI on every spec.
 *
 * Login form (src/app/features/auth/login): a single reactive form with
 *   - text input  id="username" (the backend accepts the email as username)
 *   - PrimeNG p-password rendering an input  id="password"
 *   - submit p-button (type="submit") rendering a native <button type=submit>
 * On success AuthService navigates to `returnUrl ?? '/'`, and `/` redirects an
 * authenticated user to /dashboard (redirectAuthenticatedToDashboard guard).
 */
async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');
  // Stable ids from the template (locale-independent). #username is a plain
  // pInputText; #password is the inner input rendered by <p-password inputId>.
  await page.locator('#username').fill(email);
  await page.locator('#password').fill(password);
  await page.locator('button[type="submit"]').click();

  // The authenticated landing is /dashboard (post-login redirect via `/`).
  await page.waitForURL(/\/dashboard$/, { timeout: 15_000 });
}

setup('authenticate as manager', async ({ page }) => {
  await login(page, SEED.manager.email, SEED.manager.password);
  await page.context().storageState({ path: STORAGE.manager });
});

setup('authenticate as athlete', async ({ page }) => {
  await login(page, SEED.athlete.email, SEED.athlete.password);
  await page.context().storageState({ path: STORAGE.athlete });
});
