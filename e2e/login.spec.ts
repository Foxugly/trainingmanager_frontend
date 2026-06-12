import { test, expect } from '@playwright/test';
import { SEED } from './seed';

/**
 * Login critical path — runs logged-out (no storageState in this project).
 * Fills the manager credentials, submits, and asserts the authenticated
 * landing (dashboard) plus an authenticated chrome element.
 */
test('manager can log in and reach the dashboard', async ({ page }) => {
  await page.goto('/login');

  // Locale-independent stable ids from the login template.
  await page.locator('#email').fill(SEED.manager.email);
  await page.locator('#password').fill(SEED.manager.password);
  await page.locator('button[type="submit"]').click();

  // Post-login redirect: AuthService -> `/` -> /dashboard (auth guard).
  await page.waitForURL(/\/dashboard$/, { timeout: 15_000 });

  // The authenticated user-menu trigger (UserMenuComponent) renders a button
  // with aria-haspopup="menu" only when logged in; the public "Sign in" CTA
  // (a link) is gone. This is a robust, locale-independent authenticated marker.
  await expect(page.locator('button[aria-haspopup="menu"]').first()).toBeVisible();
});
